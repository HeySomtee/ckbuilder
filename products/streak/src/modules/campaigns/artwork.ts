import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isAbsolute, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { CampaignArtworkAsset, CampaignArtworkSlot } from '../../../shared/campaign-wire';
import { DATA_DIR } from '../../config';
import { publicOrigin } from '../identity/http-policy';
import { CampaignError } from './domain';

export const ARTWORK_LIMITS = {
  icon: 3 * 1024 * 1024,
  banner: 5 * 1024 * 1024,
  pixels: 16_000_000,
  storedBytes: 64 * 1024 * 1024,
  storedFiles: 1024,
  outputBytes: 800 * 1024,
} as const;
const route = /^\/media\/competitions\/([a-f0-9]{64})\.webp$/;
const types = new Set(['image/png', 'image/jpeg', 'image/webp']);
const contentType = (req: IncomingMessage) =>
  req.headers['content-type']?.split(';')[0].trim().toLowerCase() ?? '';
const errorCode = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error ? error.code : undefined;

/** This exception is limited to this binary POST route; other APIs retain JSON CSRF rules. */
export function artworkMutationAllowed(req: IncomingMessage, url: URL): boolean {
  return (
    req.method === 'POST' &&
    url.pathname === '/api/campaigns' &&
    url.searchParams.get('action') === 'upload-artwork' &&
    req.headers.origin === publicOrigin(req) &&
    req.headers['sec-fetch-site'] !== 'cross-site' &&
    types.has(contentType(req))
  );
}
export function artworkSlot(value: unknown): CampaignArtworkSlot {
  if (value !== 'icon' && value !== 'banner') throw new CampaignError('Choose an icon or banner.');
  return value;
}
export function artworkRevision(value: string | null): number {
  if (!value || !/^[1-9][0-9]{0,8}$/.test(value))
    throw new CampaignError('Refresh this competition before changing its artwork.', 409);
  return Number(value);
}

/** One upload at a time, including its body, bounds peak memory on the small hosted instance. */
let uploading = false;
export async function withArtworkUpload<T>(action: () => Promise<T>): Promise<T> {
  if (uploading)
    throw new CampaignError('Another image is uploading. Please try again shortly.', 429);
  uploading = true;
  try {
    return await action();
  } finally {
    uploading = false;
  }
}

/** Body size/deadline are checked before decoding, including chunked requests. */
export async function readArtworkBody(
  req: IncomingMessage,
  slot: CampaignArtworkSlot,
): Promise<Buffer> {
  const max = ARTWORK_LIMITS[slot];
  const declared = req.headers['content-length'];
  if (!types.has(contentType(req)))
    throw new CampaignError('Choose a PNG, JPEG or WebP image.', 415);
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')
    throw new CampaignError('Compressed upload bodies are not supported.', 415);
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > max))
    throw new CampaignError(`Choose an image smaller than ${max / 1024 / 1024} MB.`, 413);
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const clean = () => {
      clearTimeout(timer);
      req.off('data', data);
      req.off('end', end);
      req.off('error', fail);
      req.off('aborted', aborted);
    };
    const fail = (error: unknown) => {
      clean();
      req.pause();
      reject(error);
    };
    const aborted = () => fail(new CampaignError('The upload was interrupted. Please retry.', 400));
    const data = (chunk: Buffer) => {
      size += chunk.length;
      if (size > max)
        return fail(
          new CampaignError(`Choose an image smaller than ${max / 1024 / 1024} MB.`, 413),
        );
      chunks.push(chunk);
    };
    const end = () => {
      clean();
      if (!size) reject(new CampaignError('Choose an image to upload.'));
      else resolveBody(Buffer.concat(chunks, size));
    };
    const timer = setTimeout(
      () => fail(new CampaignError('The image upload timed out. Please retry.', 408)),
      20_000,
    );
    timer.unref();
    req.on('data', data).once('end', end).once('error', fail).once('aborted', aborted);
  });
}

function rasterFormat(bytes: Buffer): 'png' | 'jpeg' | 'webp' {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    // APNG may decode as a static PNG; explicitly reject animation control chunks.
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = bytes.readUInt32BE(offset);
      if (length > bytes.length - offset - 12)
        throw new CampaignError('This PNG is incomplete. Choose another image.');
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL')
        throw new CampaignError('Choose a still image, not an animation.');
      offset += length + 12;
    }
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  throw new CampaignError(
    'Choose a PNG, JPEG or WebP image. SVG and animated images are not supported.',
    415,
  );
}

let decoder: Promise<(typeof import('sharp'))['default']> | undefined;
async function imageDecoder() {
  decoder ??= import('sharp').then((module) => {
    const sharp = module.default;
    sharp.cache(false);
    sharp.concurrency(1);
    return sharp;
  });
  return decoder;
}

/** Decode and re-encode trusted raster output. Input EXIF/ICC/XMP and filenames are never published. */
export async function optimizeArtwork(bytes: Buffer, slot: CampaignArtworkSlot, mime: string) {
  if (bytes.length > ARTWORK_LIMITS[slot]) throw new CampaignError('This image is too large.', 413);
  const format = rasterFormat(bytes);
  if (mime !== `image/${format}`)
    throw new CampaignError('The image contents do not match its file type.', 415);
  try {
    const sharp = await imageDecoder();
    const image = sharp(bytes, {
      failOn: 'warning',
      limitInputPixels: ARTWORK_LIMITS.pixels,
      limitInputChannels: 4,
      sequentialRead: true,
    }).timeout({ seconds: 10 });
    const meta = await image.metadata();
    if (
      !meta.width ||
      !meta.height ||
      meta.width * meta.height > ARTWORK_LIMITS.pixels ||
      (meta.pages ?? 1) > 1
    )
      throw new CampaignError('Choose a still image up to 16 megapixels.');
    const width = slot === 'icon' ? 128 : 1440;
    const height = slot === 'icon' ? 128 : 480;
    const result = await image
      .rotate()
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .toColourspace('srgb')
      .webp({ quality: 82, effort: 3 })
      .timeout({ seconds: 10 })
      .toBuffer({ resolveWithObject: true });
    if (result.data.length > ARTWORK_LIMITS.outputBytes)
      throw new CampaignError('This image is too detailed. Choose a simpler image.');
    return { bytes: result.data, width: result.info.width, height: result.info.height };
  } catch (error) {
    if (error instanceof CampaignError) throw error;
    throw new CampaignError(
      'This image could not be read. Choose a valid still PNG, JPEG or WebP up to 16 megapixels.',
    );
  }
}

export class CampaignArtworkStore {
  readonly directory: string;
  constructor(
    directory: string,
    private readonly quota = ARTWORK_LIMITS.storedBytes,
  ) {
    if (!isAbsolute(directory))
      throw new CampaignError('Competition image storage needs an absolute directory.', 503);
    this.directory = resolve(directory);
  }
  async put(image: Awaited<ReturnType<typeof optimizeArtwork>>): Promise<CampaignArtworkAsset> {
    await mkdir(this.directory, { recursive: true });
    const root = await lstat(this.directory);
    if (!root.isDirectory() || root.isSymbolicLink())
      throw new CampaignError('Competition image storage needs attention.', 503);
    const hash = createHash('sha256').update(image.bytes).digest('hex');
    const target = join(this.directory, `${hash}.webp`);
    const asset = {
      url: `/media/competitions/${hash}.webp`,
      width: image.width,
      height: image.height,
    };
    try {
      const existing = await lstat(target);
      if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== image.bytes.length)
        throw new CampaignError('Competition image storage needs attention.', 503);
      return asset;
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    let total = 0;
    const files = await readdir(this.directory, { withFileTypes: true });
    if (files.length >= ARTWORK_LIMITS.storedFiles)
      throw new CampaignError(
        'Competition image storage is full. Existing images are unchanged.',
        507,
      );
    for (const file of files) {
      if (!file.isFile() || file.isSymbolicLink())
        throw new CampaignError('Competition image storage needs attention.', 503);
      total += (await lstat(join(this.directory, file.name))).size;
    }
    if (total + image.bytes.length > this.quota)
      throw new CampaignError(
        'Competition image storage is full. Existing images are unchanged.',
        507,
      );
    const temporary = join(this.directory, `.${randomUUID()}.tmp`);
    try {
      const handle = await open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(image.bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (errorCode(error) !== 'ENOENT') throw error;
      });
    }
    return asset;
  }
  /** Stream immutable output directly; never add uploads to the static in-memory asset cache. */
  async serve(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const match = route.exec(pathname);
    if (!match || !['GET', 'HEAD'].includes(req.method ?? '')) {
      res.writeHead(404).end('Not found');
      return;
    }
    let handle;
    try {
      const target = join(this.directory, `${match[1]}.webp`);
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink() || info.size > ARTWORK_LIMITS.outputBytes)
        throw Error('Invalid artwork');
      handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      const etag = `"${match[1]}"`;
      res.setHeader('ETag', etag);
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304).end();
        return;
      }
      res.setHeader('Content-Length', info.size);
      if (req.method === 'HEAD') {
        res.writeHead(200).end();
        return;
      }
      await pipeline(handle.createReadStream({ autoClose: false }), res);
    } catch {
      if (!res.headersSent) res.writeHead(404).end('Image not found');
      else res.destroy();
    } finally {
      await handle?.close();
    }
  }
}

export function campaignArtworkStore(): CampaignArtworkStore {
  const configured = process.env.STREAK_CAMPAIGNS_ARTWORK_DIR;
  if (!configured && process.env.NODE_ENV === 'production')
    throw new CampaignError('Competition image storage is not configured yet.', 503);
  return new CampaignArtworkStore(configured || join(DATA_DIR, 'campaign-artwork'));
}

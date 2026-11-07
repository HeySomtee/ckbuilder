import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import sharp from 'sharp';
import {
  ARTWORK_LIMITS,
  CampaignArtworkStore,
  optimizeArtwork,
  withArtworkUpload,
} from './modules/campaigns/artwork';
import { CampaignService } from './modules/campaigns/service';
import {
  newCampaign,
  publishCampaign,
  type Actor,
  type Campaign,
} from './modules/campaigns/domain';
import type { CampaignStorage } from './modules/campaigns/storage';
import type { CampaignDraftInput, CampaignOptions } from '../shared/campaign-wire';

class MemoryArtworkCampaigns implements CampaignStorage {
  rows = new Map<string, Campaign>();
  async clock() {
    return Date.parse('2026-11-06T10:00:00Z');
  }
  async load(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async list() {
    return structuredClone([...this.rows.values()]);
  }
  async create(id: string, _creator: string, build: (now: number) => Campaign) {
    const c = build(await this.clock());
    this.rows.set(id, structuredClone(c));
    return c;
  }
  async change(id: string, mutate: (c: Campaign, now: number) => void) {
    // Serialize this synthetic repository exactly as the PostgreSQL row lock does.
    const c = structuredClone(this.rows.get(id)!);
    mutate(c, Date.parse('2026-11-06T10:00:00Z'));
    c.revision++;
    this.rows.set(id, structuredClone(c));
    return c;
  }
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'streak-artwork-'));
  try {
    const png = await sharp({
      create: { width: 500, height: 350, channels: 4, background: '#173b2e' },
    })
      .withMetadata()
      .png()
      .toBuffer();
    const optimized = await optimizeArtwork(png, 'icon', 'image/png');
    assert.equal(optimized.width, 128);
    assert.equal(optimized.height, 128);
    const output = await sharp(optimized.bytes).metadata();
    assert.equal(output.format, 'webp');
    assert.equal(output.exif, undefined);
    assert.equal(output.icc, undefined);
    assert.equal(output.xmp, undefined);
    const banner = await optimizeArtwork(png, 'banner', 'image/png');
    assert.deepEqual([banner.width, banner.height], [1440, 480]);
    for (const format of ['jpeg', 'webp'] as const) {
      const alternate = await sharp(png)[format]().toBuffer();
      const converted = await optimizeArtwork(alternate, 'icon', `image/${format}`);
      assert.equal((await sharp(converted.bytes).metadata()).format, 'webp');
    }
    await assert.rejects(
      optimizeArtwork(Buffer.from('<svg onload="alert(1)"/>'), 'icon', 'image/png'),
      /PNG, JPEG/,
    );
    await assert.rejects(optimizeArtwork(png, 'icon', 'image/jpeg'), /match its file type/);
    await assert.rejects(optimizeArtwork(png.subarray(0, 30), 'icon', 'image/png'), /incomplete/);
    await assert.rejects(
      optimizeArtwork(Buffer.alloc(ARTWORK_LIMITS.icon + 1), 'icon', 'image/png'),
      /too large/,
    );
    const animation = Buffer.concat([
      png.subarray(0, 8),
      Buffer.from('000000086163544c000000010000000000000000', 'hex'),
      png.subarray(8),
    ]);
    await assert.rejects(optimizeArtwork(animation, 'icon', 'image/png'), /still image/);
    const oversized = await sharp({
      create: { width: 5000, height: 4000, channels: 3, background: '#000000' },
    })
      .png()
      .toBuffer();
    await assert.rejects(optimizeArtwork(oversized, 'icon', 'image/png'), /16 megapixels/);
    console.log(
      'ok - bounded raster decode, type sniffing, animation denial, crop and metadata removal',
    );

    const store = new CampaignArtworkStore(join(dir, 'art'));
    const icon = await store.put(optimized);
    assert.match(icon.url, /^\/media\/competitions\/[a-f0-9]{64}\.webp$/);
    assert.deepEqual(await store.put(optimized), icon);
    assert.equal((await readdir(store.directory)).length, 1, 'duplicate content is reused');
    await assert.rejects(
      new CampaignArtworkStore(join(dir, 'quota'), 1).put(optimized),
      /storage is full/,
    );
    assert.throws(() => new CampaignArtworkStore('../relative'), /absolute/);
    let release = () => {};
    const hold = withArtworkUpload(
      () =>
        new Promise<void>((resolveHold) => {
          release = resolveHold;
        }),
    );
    await assert.rejects(
      withArtworkUpload(async () => {}),
      /Another image/,
    );
    release();
    await hold;
    await withArtworkUpload(async () => {});

    const server = createServer((req, res) => {
      void store.serve(req, res, req.url ?? '');
    });
    await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const response = await fetch(base + icon.url);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type'), 'image/webp');
      assert.match(response.headers.get('cache-control') ?? '', /immutable/);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), optimized.bytes);
      const cache = await fetch(base + icon.url, {
        headers: { 'if-none-match': response.headers.get('etag')! },
      });
      assert.equal(cache.status, 304);
      assert.equal((await fetch(base + icon.url, { method: 'HEAD' })).status, 200);
      assert.equal((await fetch(base + '/media/competitions/%2e%2e%2fprivate')).status, 404);
      assert.equal((await fetch(base + '/media/competitions/unknown.webp')).status, 404);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
    console.log(
      'ok - immutable streamed serving, dedupe, traversal denial and storage/concurrency bounds',
    );

    const repository = new MemoryArtworkCampaigns();
    const actor: Actor = {
      id: 'admin',
      name: 'Admin',
      wallet: 'synthetic-admin',
      ownerHash: 'hash-admin',
    };
    const draft: CampaignDraftInput = {
      name: 'Existing rehearsal',
      description: 'Synthetic terms',
      kind: 'predictions',
      registrationClosesAt: '2026-11-06T11:00:00Z',
      fixtureIds: ['fixture-1'],
      fiveRoundId: null,
      rehearsal: true,
      prizes: [{ place: 1, amountShannons: '10000000000', usdReference: '10' }],
    };
    const options: CampaignOptions = {
      gameweeks: [],
      fixtures: [
        {
          fixtureId: 'fixture-1',
          marketId: 'market-1',
          marketKey: 'key-1',
          home: 'A',
          away: 'B',
          league: 'Synthetic',
          kickoffAt: '2026-11-06T12:00:00Z',
          cutoffAt: '2026-11-06T12:00:00Z',
          capacity: 32,
          occupied: 0,
          updatedAt: null,
        },
      ],
    };
    const c = newCampaign('existing', actor, draft, await repository.clock());
    repository.rows.set(c.id, c);
    const service = new CampaignService(repository, [actor.id], {
      options: async () => options,
      observe: async () => {
        throw Error('Artwork cannot trigger source reads');
      },
    });
    assert.deepEqual((await service.get(c.id, actor)).detail!.artwork, {
      icon: null,
      banner: null,
    });
    assert.equal(
      repository.rows.get(c.id)!.artwork,
      undefined,
      'read does not backfill existing or rehearsal data',
    );
    await assert.rejects(service.setArtwork(c.id, 'icon', icon, 1, null), /Sign in/);
    await assert.rejects(
      service.setArtwork(c.id, 'icon', icon, 1, {
        ...actor,
        id: 'entrant',
        wallet: 'entrant-wallet',
      }),
      /Administrator/,
    );
    await service.setArtwork(c.id, 'icon', icon, 1, actor);
    const published = repository.rows.get(c.id)!;
    publishCampaign(published, options, await repository.clock());
    published.state = 'finished';
    published.finalAt = '2026-11-06T13:00:00Z';
    published.awards = [
      {
        place: 1,
        publicId: null,
        name: null,
        amountShannons: '10000000000',
        usdReference: '10',
        status: 'unawarded',
        transactionHash: null,
      },
    ];
    const financialSnapshot = structuredClone({
      draft: published.draft,
      termsHash: published.termsHash,
      entries: published.entries,
      awards: published.awards,
      finalAt: published.finalAt,
      payouts: published.payouts,
    });
    const saved = await service.setArtwork(c.id, 'banner', await store.put(banner), 2, actor);
    assert.equal(saved.detail!.state, 'finished');
    const after = repository.rows.get(c.id)!;
    assert.deepEqual(
      {
        draft: after.draft,
        termsHash: after.termsHash,
        entries: after.entries,
        awards: after.awards,
        finalAt: after.finalAt,
        payouts: after.payouts,
      },
      financialSnapshot,
    );
    await assert.rejects(service.setArtwork(c.id, 'icon', null, 2, actor), /changed/);
    const race = await Promise.allSettled([
      service.setArtwork(c.id, 'icon', null, 3, actor),
      service.setArtwork(c.id, 'banner', null, 3, actor),
    ]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await service.get(c.id, actor)).detail!.artwork!.icon, null);
    assert.ok((await service.get(c.id, actor)).detail!.artwork!.banner);
    repository.rows.get(c.id)!.deletedAt = '2026-11-06T14:00:00Z';
    await assert.rejects(service.setArtwork(c.id, 'banner', null, 4, actor), /Deleted/);
    console.log(
      'ok - no implicit artwork, admin authorization, frozen terms/awards, stale/racing edit rejection and deleted-state denial',
    );
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('streak-artwork-'));
    await rm(dir, { recursive: true, force: true });
  }
}
void main();

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import * as ccc from '@ckb-ccc/core';
import { SponsorService, parseSponsorRequest, type SponsorSubmitRequest } from './sponsor';
import { BatchService, parseBatchRequest } from './batch';
import { sponsorId } from './sponsor-journal';
import {
  DirectRegistry,
  V3_DIRECT_CONFIG,
  V4_DIRECT_CONFIG,
  PUBLIC_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
  object,
  hash32,
} from './registry';
import { OperatorJournal } from './journal';
import { boundedJson } from './cli';
import { validateScheduledFixture } from './oracle';
import { parseProvisionCatalogue, provisioningCatalogueUrl } from './provision';

function secret(value: string | undefined): string {
  if (!value || !/^[0-9a-f]{64}$/.test(value))
    throw Error('Configure a separate 32-byte sponsor IPC secret');
  return value;
}
export function sponsorServiceUrl(value: string | undefined): string {
  if (!value) throw Error('Sponsor service is not configured');
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw Error('Sponsor service must use an explicit loopback HTTP port');
  return url.origin;
}
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 220_000) throw Error('Sponsor request exceeds its byte limit');
    chunks.push(Buffer.from(chunk));
  }
  return object(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'sponsor request');
}
function reply(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(value));
}
/** Bound to loopback by the launcher. The API process has only this IPC credential. */
export function createSponsorServer(
  legacy: SponsorService,
  ipcSecret: string,
  batch?: BatchService,
) {
  const expected = Buffer.from(`Bearer ${secret(ipcSecret)}`);
  let active = 0;
  return createServer(async (req, res) => {
    const actual = Buffer.from(req.headers.authorization ?? '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return reply(res, 401, { error: 'Sponsor IPC authentication required.' });
    if (active >= 4)
      return reply(res, 429, {
        error: 'Sponsor queue is busy. Retry with the same request identity.',
      });
    active++;
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const atomic = url.pathname.startsWith('/batch/');
      const service = atomic ? batch : legacy;
      if (!service)
        return reply(res, 409, {
          error: 'Atomic payment is awaiting its verified deployment and operator activation.',
        });
      if (atomic) url.pathname = url.pathname.slice(6);
      if (req.method === 'GET' && url.pathname === '/configuration')
        return reply(res, 200, await service.configuration());
      if (req.method === 'GET' && url.pathname === '/fixture') {
        const id = url.searchParams.get('fixtureId');
        if (!id || !/^api-football-[1-9][0-9]{0,14}$/.test(id)) throw Error('Invalid fixture');
        return reply(res, 200, await service.describe(id));
      }
      if (req.method === 'GET' && url.pathname === '/status')
        return reply(
          res,
          200,
          await service.status(
            {
              offerId: sponsorId(url.searchParams.get('offerId')),
              rawHash: hash32(url.searchParams.get('rawHash'), 'transaction hash'),
            },
            false,
          ),
        );
      if (
        req.method !== 'POST' ||
        !['/offer', '/submit', '/resolve', '/resume'].includes(url.pathname)
      )
        return reply(res, 404, { error: 'Unknown sponsor operation.' });
      const payload = await body(req);
      const authenticated = payload.authenticatedOwnerAddress;
      if (typeof authenticated !== 'string' || authenticated.length > 300)
        throw Error('Authenticated wallet address required');
      if (url.pathname === '/offer') {
        if (!atomic && batch)
          return reply(res, 409, {
            error:
              'New predictions use the atomic slip. Refresh checkout; existing signatures remain recoverable.',
          });
        const request = atomic
          ? parseBatchRequest(payload.request)
          : parseSponsorRequest(payload.request);
        if (request.ownerAddress !== authenticated)
          return reply(res, 403, { error: 'Use the wallet linked to the signed-in account.' });
        return reply(res, 200, await service.prepareOffer(request));
      }
      const request = object(payload.request, 'owner submission');
      const offerId = sponsorId(request.offerId),
        rawHash = hash32(request.rawHash, 'transaction hash');
      const entry = service.store.load(offerId);
      if (!entry || entry.ownerAddress !== authenticated || entry.offer.rawHash !== rawHash)
        return reply(res, 403, { error: 'This proposal belongs to another wallet.' });
      if (url.pathname === '/resume')
        return reply(res, 200, await service.status({ offerId, rawHash }, true));
      if (url.pathname === '/resolve')
        return reply(
          res,
          200,
          await service.resolveConflict({
            offerId,
            rawHash,
            conflictingTxHash: hash32(request.conflictingTxHash, 'conflicting transaction hash'),
          }),
        );
      if (typeof request.userSignedBytes !== 'string') throw Error('Owner signature required');
      return reply(
        res,
        200,
        await service.submit({
          offerId,
          rawHash,
          userSignedBytes: request.userSignedBytes,
        } satisfies SponsorSubmitRequest),
      );
    } catch (error) {
      // Do not return provider payloads, RPC errors, file paths or signing context.
      const message = error instanceof Error ? error.message : '';
      const safe =
        /^(Sponsor is completing|Streak needs additional|Streak is at|Unsigned sponsor offer expired|Invalid owner transaction signature|Fixture terms changed|This fixture already has|Sponsored contract deployment|Sponsor funding is awaiting|Owner needs principal|Owner input must be live|This fixture has reached|This fixture has positions|This fixture has no available|This fixture is closed)/.test(
          message,
        );
      reply(res, 409, {
        error: safe
          ? message
          : 'Sponsor request could not complete. Preserve any signed transaction and check its status before retrying.',
      });
    } finally {
      active--;
    }
  });
}

export async function runSponsorService(): Promise<void> {
  if (process.env.NODE_ENV === 'test')
    throw Error('Live sponsor launcher is forbidden in routine tests');
  const directory = process.env.STREAK_DIRECT_OPERATOR_DIR,
    registryDirectory = process.env.STREAK_DIRECT_REGISTRY_DIR;
  if (
    !directory ||
    !registryDirectory ||
    !isAbsolute(directory) ||
    !isAbsolute(registryDirectory) ||
    resolve(directory) === resolve(registryDirectory)
  )
    throw Error('Configure separate absolute durable operator and registry directories');
  if (process.env.NODE_ENV === 'production' && process.env.STREAK_DIRECT_DURABLE_STATE_ACK !== '1')
    throw Error('Sponsor service needs acknowledged durable operator storage');
  const key = process.env.STREAK_DIRECT_PRIVATE_KEY,
    providerKey = process.env.API_SPORTS_KEY;
  if (!key || !providerKey)
    throw Error(
      'Sponsor launcher needs explicit signing and provider environment; it never loads key files',
    );
  const endpoint = new URL(sponsorServiceUrl(process.env.STREAK_SPONSOR_URL));
  const ipc = secret(process.env.STREAK_SPONSOR_IPC_SECRET);
  if (V3_DIRECT_CONFIG.codeDeps.length !== 2)
    throw Error('Sponsored contract deployment is not ready');
  const client = new ccc.ClientPublicTestnet({
    url: PUBLIC_DIRECT_CONFIG.rpc,
    fallbacks: [],
    timeout: 15_000,
    maxConcurrent: 2,
  });
  const service = new SponsorService({
    client,
    signer: new ccc.SignerCkbPrivateKey(client, key),
    journal: new OperatorJournal(directory),
    registry: new DirectRegistry(registryDirectory, V3_DIRECT_CONFIG),
    config: V3_DIRECT_CONFIG,
    fixture: async (id) => {
      if (!/^api-football-[1-9][0-9]{0,14}$/.test(id)) throw Error('Invalid football fixture');
      const catalogue = parseProvisionCatalogue(
        await boundedJson(provisioningCatalogueUrl(process.env.STREAK_DIRECT_CATALOGUE_URL ?? ''), {
          headers: { accept: 'application/json' },
        }),
        Date.now(),
      );
      const owned = catalogue.fixtures.find((fixture) => fixture.fixtureId === id);
      if (!owned) throw Error('Fixture is outside the active real API catalogue');
      const match = validateScheduledFixture(
        await boundedJson(`${PROVIDER_ORIGIN}/fixtures?id=${id.slice(13)}`, {
          headers: { 'x-apisports-key': providerKey },
        }),
        id.slice(13),
        Date.now(),
      );
      if (
        Date.parse(match.kickoff) !== owned.kickoffMs ||
        match.home.id !== owned.homeId ||
        match.away.id !== owned.awayId
      )
        throw Error('Football catalogue changed');
      return match;
    },
  });
  const batchDirectory = process.env.STREAK_DIRECT_BATCH_REGISTRY_DIR;
  if (
    batchDirectory &&
    (!isAbsolute(batchDirectory) ||
      [resolve(directory), resolve(registryDirectory)].includes(resolve(batchDirectory)))
  )
    throw Error('Atomic registry requires a separate absolute directory');
  const batch = batchDirectory
    ? new BatchService({
        ...service.options,
        config: V4_DIRECT_CONFIG,
        registry: new DirectRegistry(batchDirectory, V4_DIRECT_CONFIG),
        existingRegistry: [
          service.options.registry,
          ...(process.env.STREAK_DIRECT_LEGACY_REGISTRY_DIR
            ? [new DirectRegistry(process.env.STREAK_DIRECT_LEGACY_REGISTRY_DIR)]
            : []),
        ],
      })
    : undefined;
  const server = createSponsorServer(service, ipc, batch);
  server.requestTimeout = 65_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(endpoint.port), '127.0.0.1', () => resolve());
  });
  let recovering = false;
  const recovery = setInterval(async () => {
    if (recovering) return;
    recovering = true;
    try {
      const results = [
        ...(await service.recoverPending()),
        ...(batch ? await batch.recoverPending() : []),
      ];
      if (results.some((result) => result.needsReview))
        console.error(
          'A sponsored transaction needs bounded-history reconciliation. Its durable bytes remain reserved.',
        );
    } catch {
      console.error(
        'Sponsor recovery is unavailable. Keep durable state and reconcile before new funding.',
      );
    } finally {
      recovering = false;
    }
  }, 15_000);
  server.once('close', () => clearInterval(recovery));
  console.log(
    JSON.stringify({
      service: 'streak-sponsor',
      listen: endpoint.origin,
      network: 'testnet',
      automaticBulkCreation: false,
    }),
  );
}

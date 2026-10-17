import { isRecord, request } from '../../lib/http';
import { BATCH_PROTOCOL_HASH, parseManifest, integer, text } from './protocol';
import type { Manifest } from './protocol';
import { parseBatchFixture, parseBatchOffer, parseBatchStatus } from './batch-protocol';
import type { BatchFixture, BatchTransport } from './batch-protocol';

export interface BatchConfig {
  manifest: Manifest;
  fixtures: BatchFixture[];
  serverTime: number;
  enabled: boolean;
  unavailableReason?: string;
}
export async function getBatchConfig(signal?: AbortSignal): Promise<BatchConfig> {
  const [rawManifest, value] = await Promise.all([
    request('/direct/batch/config', signal),
    request('/direct/batch/demand', signal),
  ]);
  const manifest = parseManifest(rawManifest);
  if (
    manifest.protocolHash !== BATCH_PROTOCOL_HASH ||
    !isRecord(value) ||
    !Array.isArray(value.fixtures) ||
    value.fixtures.length > 512 ||
    typeof value.enabled !== 'boolean'
  )
    throw Error('Combined prediction availability could not be verified.');
  const fixtures = await Promise.all(value.fixtures.map(parseBatchFixture));
  if (new Set(fixtures.map((fixture) => fixture.fixtureId)).size !== fixtures.length)
    throw Error('Duplicate fixtures in combined prediction catalogue.');
  return {
    manifest,
    fixtures,
    serverTime: integer(value.serverTime, 1, Number.MAX_SAFE_INTEGER),
    enabled: value.enabled,
    ...(value.unavailableReason === undefined
      ? {}
      : { unavailableReason: text(value.unavailableReason, 400) }),
  };
}
export const batchTransport: BatchTransport = {
  offer: async (body) =>
    parseBatchOffer(await request('/direct/batch/offer', undefined, body, 60_000)),
  submit: async (body) =>
    parseBatchStatus(await request('/direct/batch/submit', undefined, body, 60_000)),
  status: async ({ offerId, rawHash }) =>
    parseBatchStatus(
      await request(
        `/direct/batch/status?offerId=${encodeURIComponent(offerId)}&rawHash=${encodeURIComponent(rawHash)}`,
        undefined,
        undefined,
        60_000,
      ),
    ),
  resume: async (body) =>
    parseBatchStatus(await request('/direct/batch/resume', undefined, body, 60_000)),
  resolve: async (body) =>
    parseBatchStatus(await request('/direct/batch/resolve', undefined, body, 60_000)),
};

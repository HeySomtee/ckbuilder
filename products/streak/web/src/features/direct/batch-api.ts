import { isRecord, request } from '../../lib/http';
import { BATCH_PROTOCOL_HASH, parseManifest, integer, text } from './protocol';
import type { Manifest } from './protocol';
import { parseBatchFixture, parseBatchOffer, parseBatchStatus } from './batch-protocol';
import type { BatchFixture, BatchTransport } from './batch-protocol';
import { waitForReview } from './review-wait';

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
  cancelReview: async (requestId) => {
    const value = await request('/direct/batch/cancel-review', undefined, { requestId });
    if (!isRecord(value) || value.cancelled !== true)
      throw Error('Review cancellation could not be confirmed.');
  },
  release: async (body) => {
    const value = await request('/direct/batch/release', undefined, body);
    if (!isRecord(value) || typeof value.released !== 'boolean')
      throw Error('Payment review could not be released. Please retry.');
    return value.released;
  },
  offer: async (body, waiting) => {
    // Keep the same request identity while waiting. Do not abort an in-flight offer:
    // observe its response so a late-created unsigned reservation can be released.
    let value: unknown;
    try {
      value = await waitForReview(
        () => request('/direct/batch/offer', undefined, body, 60_000),
        waiting,
      );
    } catch (error) {
      if (waiting) {
        try {
          await batchTransport.cancelReview?.(body.requestId);
        } catch {
          console.warn('Waiting review cleanup is unavailable; its unsigned lease will expire.');
        }
      }
      throw error;
    }
    try {
      return await parseBatchOffer(value);
    } catch (error) {
      if (
        isRecord(value) &&
        typeof value.offerId === 'string' &&
        /^[0-9a-f-]{36}$/.test(value.offerId) &&
        typeof value.rawHash === 'string' &&
        /^0x[0-9a-f]{64}$/.test(value.rawHash)
      ) {
        try {
          await batchTransport.release?.({ offerId: value.offerId, rawHash: value.rawHash });
          await batchTransport.cancelReview?.(body.requestId);
        } catch {
          console.warn('Unsigned review release is unavailable; its reservation expires safely.');
        }
      }
      throw error;
    }
  },
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

import type { CampaignAbsenceRequest, CampaignAbsenceSnapshot } from '../direct/campaign-absence';
import { V4_DIRECT_CONFIG } from '../direct/registry';

export type CampaignAbsenceFixtures = CampaignAbsenceRequest['fixtures'];
const hash = /^0x[0-9a-f]{64}$/;
const decimal = /^(?:0|[1-9]\d*)$/;
const invalid = () => Error('Campaign sponsor history verification is unavailable.');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
}
function integer(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

/**
 * Validate the authenticated operator's fresh attestation, never infer absence
 * from an empty Activity table. The signer verifies the canonical checkpoint;
 * this is retained operator evidence, not a cryptographic proof of chain absence.
 */
export function parseCampaignAbsenceSnapshot(
  raw: unknown,
  requested: CampaignAbsenceFixtures,
  now: number,
): CampaignAbsenceSnapshot {
  const value = record(raw);
  const checkpoint = record(value.checkpoint);
  if (
    !integer(now) ||
    !requested.length ||
    requested.length > 64 ||
    new Set(requested.map((f) => f.fixtureId)).size !== requested.length ||
    requested.some(
      (f) =>
        !/^api-football-[1-9][0-9]{0,14}$/.test(f.fixtureId) ||
        !integer(f.cutoffMs) ||
        f.protocolHash !== V4_DIRECT_CONFIG.protocolHash,
    ) ||
    value.version !== 1 ||
    value.basis !== 'operator-attested-empty' ||
    value.network !== 'testnet' ||
    value.protocolHash !== V4_DIRECT_CONFIG.protocolHash ||
    !integer(value.checkedAt) ||
    value.checkedAt < now - 60_000 ||
    value.checkedAt > now + 5_000 ||
    typeof value.historyDigest !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.historyDigest) ||
    typeof checkpoint.blockHash !== 'string' ||
    !hash.test(checkpoint.blockHash) ||
    typeof checkpoint.blockNumber !== 'string' ||
    !decimal.test(checkpoint.blockNumber) ||
    !integer(checkpoint.timestamp) ||
    !Array.isArray(value.fixtures) ||
    value.fixtures.length !== requested.length
  )
    throw invalid();
  const seen = new Set<string>();
  const fixtures: CampaignAbsenceSnapshot['fixtures'] = value.fixtures.map((item) => {
    const row = record(item);
    const pin = requested.find((f) => f.fixtureId === row.fixtureId);
    if (
      !pin ||
      seen.has(pin.fixtureId) ||
      row.cutoffMs !== pin.cutoffMs ||
      (row.status !== 'absent' && row.status !== 'unresolved') ||
      (row.status === 'absent' &&
        (now < pin.cutoffMs + 120_000 ||
          (value.checkedAt as number) < pin.cutoffMs + 120_000 ||
          (checkpoint.timestamp as number) < pin.cutoffMs + 120_000))
    )
      throw invalid();
    seen.add(pin.fixtureId);
    return { fixtureId: pin.fixtureId, cutoffMs: pin.cutoffMs, status: row.status };
  });
  return {
    version: 1,
    basis: 'operator-attested-empty',
    network: 'testnet',
    protocolHash: V4_DIRECT_CONFIG.protocolHash,
    checkedAt: value.checkedAt,
    checkpoint: {
      blockHash: checkpoint.blockHash,
      blockNumber: checkpoint.blockNumber,
      timestamp: checkpoint.timestamp,
    },
    historyDigest: value.historyDigest,
    fixtures,
  };
}

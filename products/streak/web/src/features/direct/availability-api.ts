import { isRecord, request } from '../../lib/http';

export interface MarketAvailability {
  id: string;
  fixtureId: string;
  label: string;
  cutoffMs: number;
  entryEnabled: boolean;
  funding?: 'funded' | 'sponsored';
}

// Discovery is an operator claim, not an entitlement or transaction descriptor.
// Full pinned-script/terms validation belongs to the wallet checkout API.
export async function getMarketAvailability(signal?: AbortSignal): Promise<MarketAvailability[]> {
  const data = await request('/direct/markets', signal);
  const invalid = () => Error('Payment availability could not be verified.');
  if (!isRecord(data) || !Array.isArray(data.markets) || data.markets.length > 512) throw invalid();
  const rows = data.markets.map((row): MarketAvailability => {
    if (
      !isRecord(row) ||
      typeof row.id !== 'string' ||
      !/^[a-zA-Z0-9:_-]{1,120}$/.test(row.id) ||
      typeof row.fixtureId !== 'string' ||
      !/^[a-zA-Z0-9:_-]{1,118}$/.test(row.fixtureId) ||
      typeof row.label !== 'string' ||
      !row.label.trim() ||
      row.label.length > 240 ||
      typeof row.cutoffMs !== 'number' ||
      !Number.isSafeInteger(row.cutoffMs) ||
      row.cutoffMs <= 0 ||
      typeof row.entryEnabled !== 'boolean'
    )
      throw invalid();
    return {
      id: row.id,
      fixtureId: row.fixtureId,
      label: row.label,
      cutoffMs: row.cutoffMs,
      entryEnabled: row.entryEnabled,
    };
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length) throw invalid();
  return rows;
}

export async function getDemandAvailability(
  fixtureIds: readonly string[],
  signal?: AbortSignal,
): Promise<MarketAvailability[]> {
  const ids = [...new Set(fixtureIds)].filter((id) => /^api-football-[1-9]\d{0,14}$/.test(id));
  if (ids.length > 8) throw Error('Too many fixture sponsorship requests.');
  const values = await Promise.all(
    ids.map((id) => request('/direct/demand?matchId=' + encodeURIComponent(id), signal)),
  );
  return values.flatMap((value, index) => {
    if (!isRecord(value) || !Array.isArray(value.fixtures) || value.fixtures.length > 1)
      throw Error('Fixture sponsorship availability could not be verified.');
    return value.fixtures.map((raw): MarketAvailability => {
      if (
        !isRecord(raw) ||
        raw.fixtureId !== ids[index] ||
        typeof raw.label !== 'string' ||
        !raw.label.trim() ||
        raw.label.length > 240 ||
        typeof raw.cutoffMs !== 'number' ||
        !Number.isSafeInteger(raw.cutoffMs) ||
        !['available', 'reserved', 'confirming', 'funded', 'unavailable'].includes(
          String(raw.state),
        )
      )
        throw Error('Fixture sponsorship availability could not be verified.');
      return {
        id: 'sponsored-' + ids[index],
        fixtureId: ids[index],
        label: raw.label,
        cutoffMs: raw.cutoffMs,
        entryEnabled: raw.state === 'available',
        funding: 'sponsored',
      };
    });
  });
}

export function acceptsPayment(row: MarketAvailability, now: number): boolean {
  // Match the client's minimum preparation margin; the chain is rechecked at review.
  return row.entryEnabled && now + (row.funding === 'sponsored' ? 120_000 : 30_000) < row.cutoffMs;
}

export type ProvisioningState =
  | 'queued'
  | 'confirming'
  | 'funded'
  | 'blocked-capacity'
  | 'blocked-registry-limit'
  | 'blocked-review'
  | 'expired'
  | 'withdrawn';
export interface ProvisioningAvailability {
  updatedAtMs: number;
  fixtures: { fixtureId: string; status: ProvisioningState }[];
}
export async function getProvisioningAvailability(
  signal?: AbortSignal,
): Promise<ProvisioningAvailability | null> {
  const data = await request('/direct/provisioning', signal);
  if (!isRecord(data)) throw Error('Market preparation status is unavailable.');
  if (data.progress === null) return null;
  const progress = data.progress;
  const statuses = [
    'queued',
    'confirming',
    'funded',
    'blocked-capacity',
    'blocked-registry-limit',
    'blocked-review',
    'expired',
    'withdrawn',
  ];
  if (
    !isRecord(progress) ||
    progress.format !== 'streak-direct-provisioning-v1' ||
    typeof progress.updatedAtMs !== 'number' ||
    !Number.isSafeInteger(progress.updatedAtMs) ||
    progress.updatedAtMs <= 0 ||
    progress.updatedAtMs > Date.now() + 30_000 ||
    !Array.isArray(progress.fixtures) ||
    progress.fixtures.length > 4096
  )
    throw Error('Market preparation status could not be verified.');
  const seen = new Set<string>();
  const fixtures = progress.fixtures.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.fixtureId !== 'string' ||
      !/^api-football-[1-9][0-9]{0,14}$/.test(row.fixtureId) ||
      seen.has(row.fixtureId) ||
      typeof row.status !== 'string' ||
      !statuses.includes(row.status)
    )
      throw Error('Market preparation status could not be verified.');
    seen.add(row.fixtureId);
    return { fixtureId: row.fixtureId, status: row.status as ProvisioningState };
  });
  return { updatedAtMs: progress.updatedAtMs, fixtures };
}

export function preparationMessage(
  progress: ProvisioningAvailability | null | undefined,
  fixtureId: string,
  now: number,
): string {
  if (!progress || now - progress.updatedAtMs > 180_000)
    return 'Payment is unavailable for this fixture. Your pick stays saved while market preparation is checked.';
  switch (progress.fixtures.find((row) => row.fixtureId === fixtureId)?.status) {
    case 'queued':
      return 'This market is queued for automatic setup. Your pick stays saved.';
    case 'confirming':
      return 'Market setup is confirming on CKB. Payment will open once confirmed.';
    case 'blocked-capacity':
      return 'Market setup is waiting for operator testnet funds. Your pick stays saved.';
    case 'blocked-review':
      return 'Market setup needs an operator check. Your pick stays saved.';
    case 'blocked-registry-limit':
      return 'Market setup has reached its current capacity. Your pick stays saved.';
    case 'expired':
    case 'withdrawn':
      return 'This fixture is no longer available for new predictions.';
    default:
      return 'Payment is unavailable for this fixture. Refresh availability before paying.';
  }
}

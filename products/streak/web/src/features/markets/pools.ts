import { isRecord, request } from '../../lib/http';
import type { Outcome } from '../predictions/draft';

export type PoolTotals = [string, string, string];
export interface PoolPoint {
  t: number;
  totals: PoolTotals;
}
export interface DirectPool {
  fixtureId: string;
  state: 'uninitialized' | 'loading' | 'unavailable' | 'ready' | 'stale';
  observedAtMs?: number;
  totals?: PoolTotals;
  history: PoolPoint[];
}
function totals(value: unknown): PoolTotals {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((v) => typeof v !== 'string' || !/^\d{1,24}$/.test(v))
  )
    throw Error('Pool totals could not be verified.');
  return value as PoolTotals;
}
export async function getPublicPools(ids: string[], signal?: AbortSignal): Promise<DirectPool[]> {
  const selected = [...new Set(ids.filter((id) => /^api-football-[1-9]\d{0,14}$/.test(id)))];
  if (!selected.length) return [];
  const value = await request(
    '/direct/pools?fixtures=' + selected.map(encodeURIComponent).join(','),
    signal,
  );
  if (!isRecord(value) || !Array.isArray(value.pools) || value.pools.length !== selected.length)
    throw Error('Pool shares could not be loaded.');
  const result = value.pools.map((row) => {
    if (
      !isRecord(row) ||
      typeof row.fixtureId !== 'string' ||
      !selected.includes(row.fixtureId) ||
      !['uninitialized', 'loading', 'unavailable', 'ready', 'stale'].includes(String(row.state))
    )
      throw Error('Pool shares do not match these fixtures.');
    const present = row.state === 'ready' || row.state === 'stale';
    if (
      present &&
      (typeof row.observedAtMs !== 'number' ||
        !Number.isSafeInteger(row.observedAtMs) ||
        row.observedAtMs <= 0 ||
        row.observedAtMs > Date.now() + 30_000 ||
        !Array.isArray(row.history) ||
        row.history.length > 180)
    )
      throw Error('Pool observations could not be verified.');
    const history: PoolPoint[] =
      present && Array.isArray(row.history)
        ? row.history.map((point) => {
            if (
              !isRecord(point) ||
              typeof point.t !== 'number' ||
              !Number.isSafeInteger(point.t) ||
              point.t <= 0
            )
              throw Error('Invalid pool observation.');
            return { t: point.t, totals: totals(point.totals) };
          })
        : [];
    if (history.some((point, i) => i > 0 && point.t < history[i - 1].t))
      throw Error('Pool observations are out of order.');
    return {
      fixtureId: row.fixtureId,
      state: row.state as DirectPool['state'],
      history,
      ...(present ? { totals: totals(row.totals), observedAtMs: row.observedAtMs as number } : {}),
    };
  });
  if (new Set(result.map((row) => row.fixtureId)).size !== selected.length)
    throw Error('Duplicate pool observations.');
  return result;
}
export function poolShares(value?: PoolTotals): Record<Outcome, number> | null {
  if (!value) return null;
  const values = value.map(BigInt),
    total = values.reduce((a, b) => a + b, 0n);
  if (!total) return null;
  const parts = values.map((n) => Number((n * 10_000n) / total) / 100);
  return { home: parts[0], draw: parts[1], away: parts[2] };
}
export function poolLabel(pool: DirectPool | undefined, side: Outcome, fallback: string): string {
  pool = currentPool(pool);
  if (!pool || pool.state === 'loading' || pool.state === 'unavailable') return '-';
  if (pool.state === 'stale') return '-';
  const shares = poolShares(pool.totals);
  return shares ? `${Number(shares[side].toFixed(1))}%` : fallback;
}

export function currentPool(
  pool: DirectPool | undefined,
  now = Date.now(),
): DirectPool | undefined {
  if (
    pool?.state === 'ready' &&
    (!pool.observedAtMs || now - pool.observedAtMs > 60_000 || pool.observedAtMs > now + 30_000)
  )
    return { ...pool, state: 'stale' };
  return pool;
}

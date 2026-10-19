import * as ccc from '@ckb-ccc/core';
import { loadOperatorMarket, parseShard, type OperatorMarket } from './operator';
import { PUBLIC_DIRECT_CONFIG, protocolConfigFor, type DirectMarketRecord } from './registry';

type Totals = [string, string, string];
/** Display only the pool this entry flow can fund, never a previous generation. */
export function activePoolRecord(
  atomic: boolean,
  batch: DirectMarketRecord | undefined,
  historical: DirectMarketRecord | undefined,
) {
  return atomic ? batch : historical;
}
export interface PoolPoint {
  t: number;
  totals: Totals;
}
export interface PublicPool {
  fixtureId: string;
  state: 'uninitialized' | 'loading' | 'unavailable' | 'ready' | 'stale';
  phase?: 'open' | 'reported' | 'settled' | 'voided';
  observedAtMs?: number;
  totals?: Totals;
  history?: PoolPoint[];
}

/** Principal only. Pending entries count only when their creation block meets cutoff. */
export function poolPrincipal(market: OperatorMarket, cutoffMs: number): Totals {
  if (market.closed) {
    if (!market.closedReserve) throw Error('Settlement totals are unavailable');
    const data = Buffer.from(market.closedReserve.cell.outputData.slice(2), 'hex');
    if (
      data.length !== 34 ||
      data[0] !== 2 ||
      (data[1] > 2 && data[1] !== 255) ||
      data.readBigUInt64LE(26) !== 0n
    )
      throw Error('Invalid settlement totals');
    return [2, 10, 18].map((offset) => data.readBigUInt64LE(offset).toString()) as Totals;
  }
  if (!market.market || [0, 1, 2, 3].some((id) => !market.shards[id]))
    throw Error('Market is not fully initialized');
  const totals = [0n, 0n, 0n];
  for (const entry of market.shards) {
    const shard = parseShard(Buffer.from(entry.cell.outputData.slice(2), 'hex'));
    for (const ticket of shard.accepted) totals[ticket.outcome] += ticket.principal;
    if (shard.pending && entry.header.timestamp < BigInt(cutoffMs))
      totals[shard.pending.outcome] += shard.pending.principal;
  }
  return totals.map(String) as Totals;
}

interface Entry {
  phase?: PublicPool['phase'];
  at: number;
  retryAt: number;
  points: PoolPoint[];
  pending: boolean;
  failed: boolean;
}
/** Optional read model: no signing, no entitlement, no latency on the fixture response. */
export class PublicPoolCache {
  private entries = new Map<string, Entry>();
  private active = 0;
  private queue: (() => Promise<void>)[] = [];
  constructor(
    private readonly inspect: (record: DirectMarketRecord) => Promise<OperatorMarket> = async (
      record,
    ) => {
      const config = protocolConfigFor(record);
      return loadOperatorMarket(
        new ccc.ClientPublicTestnet({ url: PUBLIC_DIRECT_CONFIG.rpc, timeout: 8_000 }),
        record,
        config,
      );
    },
    private readonly now: () => number = Date.now,
  ) {}

  private drain(): void {
    while (this.active < 4 && this.queue.length) {
      const job = this.queue.shift()!;
      this.active++;
      void job().finally(() => {
        this.active--;
        this.drain();
      });
    }
  }

  read(fixtureId: string, record?: DirectMarketRecord): PublicPool {
    if (!record) return { fixtureId, state: 'uninitialized' };
    const key = `${record.type.codeHash}:${record.type.args}:${record.creationTxHash}`;
    let entry = this.entries.get(key);
    if (!entry) {
      if (this.entries.size >= 512) {
        const oldest = [...this.entries].find(([, value]) => !value.pending);
        if (!oldest) return { fixtureId, state: 'loading' };
        this.entries.delete(oldest[0]);
      }
      entry = { at: 0, retryAt: 0, points: [], pending: false, failed: false };
      this.entries.set(key, entry);
    }
    const current = entry;
    if (
      !current.pending &&
      this.now() >= current.retryAt &&
      (!current.at || this.now() - current.at >= 20_000)
    ) {
      current.pending = true;
      this.queue.push(() =>
        this.inspect(record)
          .then((market) => {
            const totals = poolPrincipal(market, record.cutoffMs);
            current.phase = market.closed
              ? Buffer.from(market.closedReserve!.cell.outputData.slice(2), 'hex')[1] === 255
                ? 'voided'
                : 'settled'
              : Buffer.from(market.market!.cell.outputData.slice(2), 'hex')[1] === 1
                ? 'reported'
                : 'open';
            const t = this.now();
            current.points.push({ t, totals });
            current.points = current.points.slice(-180);
            current.at = t;
            current.failed = false;
          })
          .catch(() => {
            current.failed = true;
            current.retryAt = this.now() + 10_000;
          })
          .finally(() => {
            current.pending = false;
          }),
      );
      this.drain();
    }
    const last = current.points.at(-1);
    return {
      fixtureId,
      state: last
        ? current.failed || this.now() - current.at > 60_000
          ? 'stale'
          : 'ready'
        : current.failed
          ? 'unavailable'
          : 'loading',
      ...(last
        ? {
            observedAtMs: current.at,
            totals: last.totals,
            history: current.points,
            phase: current.phase,
          }
        : {}),
    };
  }
}

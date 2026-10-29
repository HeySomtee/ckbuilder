import { infiniteQueryOptions } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type {
  ActivityPage,
  ActivitySnapshot,
  ActivityPosition,
} from '../../../../shared/activity-wire';
import { request } from '../../lib/http.ts';
import { hex, integer, object, parseDescriptor, text, U64_MAX } from './protocol.ts';
import type { Descriptor } from './protocol.ts';
import { descriptorKey } from './activity-model.ts';

export type ActivityAccount = { id: string; walletAddress: string };
export type IndexedActivityGroup = {
  descriptor: Descriptor;
  snapshot: ActivitySnapshot;
  stale: boolean;
};
export type IndexedActivityPage = Omit<ActivityPage, 'groups'> & { groups: IndexedActivityGroup[] };
const positions = new Set([
  'submitted',
  'accepted',
  'pending-validation',
  'refund-required',
  'claimable',
  'claimed',
  'refunded',
]);
const phases = new Set(['open', 'reported', 'settled', 'voided', 'unknown']);
const error = () =>
  Error('Your activity record could not be verified. Your saved payments are unchanged.');
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw error();
  return value;
}
function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,30})$/.test(value)) throw error();
  return value;
}
function position(value: unknown): ActivityPosition {
  const p = object(value),
    out = object(p.outPoint);
  if (typeof p.status !== 'string' || !positions.has(p.status)) throw error();
  const principalShannons = amount(p.principalShannons),
    storageShannons = amount(p.storageShannons);
  const entitlementShannons = p.entitlementShannons === null ? null : amount(p.entitlementShannons);
  if (
    [principalShannons, storageShannons, entitlementShannons ?? '0'].some(
      (n) => BigInt(n) > U64_MAX,
    )
  )
    throw error();
  if (['claimable', 'claimed', 'refunded'].includes(p.status) && entitlementShannons === null)
    throw error();
  return {
    id: text(p.id, 240),
    status: p.status as ActivityPosition['status'],
    outcome: integer(p.outcome, 0, 2) as 0 | 1 | 2,
    principalShannons,
    storageShannons,
    entitlementShannons,
    outPoint: { txHash: hex(out.txHash, 32), index: integer(out.index, 0, 0xffffffff) },
    transactionHash: hex(p.transactionHash, 32),
    ...(p.claimTransactionHash === undefined
      ? {}
      : { claimTransactionHash: hex(p.claimTransactionHash, 32) }),
  };
}
function snapshot(value: unknown): ActivitySnapshot {
  const s = object(value);
  if (
    typeof s.phase !== 'string' ||
    !phases.has(s.phase) ||
    !Array.isArray(s.positions) ||
    s.positions.length > 512
  )
    throw error();
  const parsed = s.positions.map(position);
  if (new Set(parsed.map((p) => p.id)).size !== parsed.length) throw error();
  const settlement = s.settlement === undefined ? undefined : object(s.settlement);
  const report = s.report === undefined ? undefined : object(s.report);
  return {
    phase: s.phase as ActivitySnapshot['phase'],
    positions: parsed,
    checkedAt: integer(s.checkedAt, 0, Number.MAX_SAFE_INTEGER),
    ...(s.uncertainty === undefined ? {} : { uncertainty: text(s.uncertainty, 500) }),
    ...(s.historyComplete === undefined ? {} : { historyComplete: bool(s.historyComplete) }),
    ...(settlement
      ? {
          settlement: {
            outcome:
              settlement.outcome === null ? null : (integer(settlement.outcome, 0, 2) as 0 | 1 | 2),
            emptyWinner: bool(settlement.emptyWinner),
          },
        }
      : {}),
    ...(report
      ? {
          report: {
            outcome: integer(report.outcome, 0, 2) as 0 | 1 | 2,
            eligible: bool(report.eligible),
            committedAt: integer(report.committedAt, 0, Number.MAX_SAFE_INTEGER),
            transactionHash: hex(report.transactionHash, 32),
          },
        }
      : {}),
  };
}

export async function parseActivityPage(
  value: unknown,
  address: string,
): Promise<IndexedActivityPage> {
  const p = object(value),
    summary = object(p.summary);
  if (
    p.version !== 1 ||
    p.network !== 'testnet' ||
    p.address !== address ||
    !Array.isArray(p.groups) ||
    p.groups.length > 100 ||
    !['complete', 'indexing', 'unavailable'].includes(String(p.coverage))
  )
    throw error();
  const groups = await Promise.all(
    p.groups.map(async (value) => {
      const g = object(value);
      return {
        descriptor: await parseDescriptor(g.descriptor),
        snapshot: snapshot(g.snapshot),
        stale: bool(g.stale),
      };
    }),
  );
  if (new Set(groups.map((g) => descriptorKey(g.descriptor))).size !== groups.length) throw error();
  return {
    version: 1,
    network: 'testnet',
    available: bool(p.available),
    address,
    ownerHash: hex(p.ownerHash, 32),
    groups,
    nextCursor: p.nextCursor === null ? null : text(p.nextCursor, 2048),
    coverage: p.coverage as ActivityPage['coverage'],
    updating: bool(p.updating),
    updatedAt: p.updatedAt === null ? null : integer(p.updatedAt, 0, Number.MAX_SAFE_INTEGER),
    summary: {
      open: integer(summary.open, 0, Number.MAX_SAFE_INTEGER),
      completed: integer(summary.completed, 0, Number.MAX_SAFE_INTEGER),
      claimable: integer(summary.claimable, 0, Number.MAX_SAFE_INTEGER),
      collectibleShannons: amount(summary.collectibleShannons),
    },
  };
}

export function activityIndexKey(account: ActivityAccount) {
  return ['private', 'activity-index', 'testnet', account.id, account.walletAddress] as const;
}

/** A read cache belongs to the authenticated account, not an active wallet provider. */
export function activityIndexQuery(
  cache: QueryClient,
  account: ActivityAccount | null,
  current: () => boolean = () => true,
  lifetime?: AbortSignal,
) {
  const queryKey = account ? activityIndexKey(account) : ['private', 'activity-index', 'guest'];
  return infiniteQueryOptions({
    queryKey,
    enabled: !!account,
    initialPageParam: null as string | null,
    queryFn: async ({ signal, pageParam }) => {
      if (!account) throw error();
      const combined = lifetime ? AbortSignal.any([signal, lifetime]) : signal;
      const entry = cache.getQueryCache().find({ queryKey, exact: true });
      const check = () => {
        combined.throwIfAborted();
        if (!current() || cache.getQueryCache().find({ queryKey, exact: true }) !== entry)
          throw new DOMException('Activity account changed.', 'AbortError');
      };
      check();
      const data = await parseActivityPage(
        await request(
          `/activity${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
          combined,
        ),
        account.walletAddress,
      );
      check();
      return data;
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 15_000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => (query.state.data?.pages[0]?.updating ? 5_000 : 30_000),
    refetchIntervalInBackground: false,
  });
}

export function activityGroups(
  pages: readonly IndexedActivityPage[] | undefined,
): IndexedActivityGroup[] {
  const groups = new Map<string, IndexedActivityGroup>();
  for (const group of (pages ?? []).flatMap((p) => p.groups)) {
    const key = descriptorKey(group.descriptor),
      previous = groups.get(key);
    if (!previous || group.snapshot.checkedAt >= previous.snapshot.checkedAt)
      groups.set(key, group);
  }
  return [...groups.values()];
}

export async function refreshActivityIndex(signal?: AbortSignal): Promise<void> {
  await request('/activity/refresh', signal, {});
}

/** A display refresh must never turn a successful wallet transfer into a payment error. */
export async function hintActivityIndex(
  transactionHash: string,
  marketId?: string,
): Promise<boolean> {
  if (!/^0x[0-9a-f]{64}$/.test(transactionHash)) return false;
  try {
    await request('/activity/hint', undefined, {
      transactionHash,
      ...(marketId ? { marketId } : {}),
    });
    return true;
  } catch {
    // Durable operator events and recovery deliver missed hints independently.
    return false;
  }
}

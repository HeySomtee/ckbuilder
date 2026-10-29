import type { QueryClient } from '@tanstack/react-query';
import { descriptorKey } from './activity-model.ts';
import type { Descriptor } from './protocol.ts';
import type { MarketSnapshot } from './discovery.ts';

export type ActivityReader = {
  discover(
    descriptor: Descriptor,
    onProgress: (snapshot: MarketSnapshot) => void,
    signal: AbortSignal,
  ): Promise<MarketSnapshot>;
};

/** Foreground and startup reads share a key, freshness and cancellation boundary. */
export function activityQuery(
  cache: QueryClient,
  reader: ActivityReader | undefined,
  ownerHash: string | undefined,
  descriptor: Descriptor,
  current: () => boolean = () => true,
  lifetime?: AbortSignal,
) {
  const queryKey = ['direct-private', ownerHash, 'activity', descriptorKey(descriptor)];
  return {
    queryKey,
    enabled: !!reader,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const combined = lifetime ? AbortSignal.any([signal, lifetime]) : signal;
      const entry = cache.getQueryCache().find({ queryKey, exact: true });
      const active = () =>
        !combined.aborted &&
        current() &&
        cache.getQueryCache().find({ queryKey, exact: true }) === entry;
      const check = () => {
        combined.throwIfAborted();
        if (!active()) throw new DOMException('Activity read is no longer current.', 'AbortError');
      };
      check();
      if (!reader) throw Error('Connect your wallet to refresh activity.');
      const snapshot = await reader.discover(
        descriptor,
        (partial) => {
          // A late RPC callback must never recreate private data after sign-out.
          if (!active()) return;
          cache.setQueryData<MarketSnapshot>(queryKey, (previous) => ({
            ...partial,
            positions: [
              ...partial.positions,
              ...(previous?.positions ?? []).filter(
                (p) =>
                  ['claimed', 'refunded'].includes(p.status) &&
                  !partial.positions.some((n) => n.id === p.id),
              ),
            ],
          }));
        },
        combined,
      );
      check();
      return snapshot;
    },
    staleTime: 60_000,
    retry: false as const,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  };
}

/** At most two known markets, sequentially. No global scan or background timer. */
export async function warmActivity(
  cache: QueryClient,
  reader: ActivityReader,
  ownerHash: string,
  descriptors: readonly Descriptor[],
  signal: AbortSignal,
  current: () => boolean,
) {
  const unique = [...new Map(descriptors.map((d) => [descriptorKey(d), d])).values()].slice(0, 2);
  for (const descriptor of unique) {
    if (signal.aborted || !current()) return;
    try {
      await cache.fetchQuery(activityQuery(cache, reader, ownerHash, descriptor, current, signal));
    } catch {
      // Optional warmup does not hide failures: foreground Activity owns retry/status.
      if (signal.aborted || !current()) return;
    }
  }
}

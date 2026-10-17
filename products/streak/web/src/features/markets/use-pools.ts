import { useQueries } from '@tanstack/react-query';
import { useNow } from '../../lib/use-now';
import { currentPool, getPublicPools } from './pools';
import type { DirectPool } from './pools';

/** Statistics load independently, so an unavailable RPC never blocks fixture cards. */
export function usePools(ids: string[]) {
  const selected = [...new Set(ids.filter((id) => /^api-football-[1-9]\d{0,14}$/.test(id)))].slice(
    0,
    512,
  );
  const now = useNow(selected.length > 0);
  const groups: string[][] = [];
  for (let i = 0; i < selected.length; i += 24) groups.push(selected.slice(i, i + 24));
  const queries = useQueries({
    queries: groups.map((fixtures) => ({
      queryKey: ['public-pools', fixtures.join(',')],
      queryFn: ({ signal }: { signal: AbortSignal }) => getPublicPools(fixtures, signal),
      staleTime: 10_000,
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      retry: false,
    })),
  });
  const pools = new Map<string, DirectPool>();
  for (const query of queries)
    for (const row of query.data ?? []) {
      const current = currentPool(row, now);
      if (current)
        pools.set(
          row.fixtureId,
          query.isError && current.state === 'ready' ? { ...current, state: 'stale' } : current,
        );
    }
  return pools;
}

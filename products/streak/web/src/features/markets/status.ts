import type { Market } from './api';
import { currentPool } from './pools';
import type { DirectPool } from './pools';

/** Fixture lifecycle is independent of the retired ledger's settlement status. */
export function fixtureLabel(market: Pick<Market, 'fixtureStatus' | 'kickoff'>, now = Date.now()) {
  const labels: Record<string, string> = {
    final: 'Finished',
    cancelled: 'Cancelled',
    postponed: 'Postponed',
    suspended: 'Suspended',
    live: 'Live',
  };
  return (
    labels[market.fixtureStatus] ??
    (Date.parse(market.kickoff) > now ? 'Open' : 'Predictions closed')
  );
}

export function settlementLabel(pool: DirectPool | undefined, now = Date.now()) {
  const observed = currentPool(pool, now);
  if (observed?.state !== 'ready') return 'Settlement not verified';
  if (observed.phase === 'voided') return 'Voided on-chain';
  if (observed.phase === 'settled') return 'Settled on-chain';
  if (observed.phase === 'reported') return 'Result reported';
  return 'Awaiting settlement';
}

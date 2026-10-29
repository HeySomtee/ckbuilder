import type { Descriptor } from './protocol.ts';
import type {
  ActivitySnapshot as MarketSnapshot,
  ActivityPosition as Position,
} from '../../../../shared/activity-wire';
import type { JournalRecord } from './journal.ts';

export const descriptorKey = (d: Descriptor) =>
  `${d.type.codeHash}:${d.type.args}:${d.creationTxHash}`;
/** Admission replaces the pending label, not the birth identity of the displayed pick. */
export function activityPositionKey(descriptor: Descriptor, position: Position): string {
  const birth =
    position.status === 'submitted' && position.id.startsWith('submitted:')
      ? position.id.slice('submitted:'.length)
      : position.id;
  return `${descriptorKey(descriptor)}:${birth}`;
}
export type ActivityState =
  | 'upcoming'
  | 'live'
  | 'settling'
  | 'verifying'
  | 'submitted'
  | 'refund-pending'
  | 'won'
  | 'lost'
  | 'refund'
  | 'settled'
  | 'unknown';
export function activityState(
  position: Position,
  snapshot: MarketSnapshot,
  fixtureStatus?: string,
  kickoff = 0,
  now = Date.now(),
): ActivityState {
  if (position.status === 'submitted') return 'submitted';
  if (position.status === 'refunded') return 'refund';
  if (position.status === 'claimable' || position.status === 'claimed') {
    if (!snapshot.settlement) return 'settled';
    if (snapshot.settlement.outcome === null || snapshot.settlement.emptyWinner) return 'refund';
    return snapshot.settlement.outcome === position.outcome ? 'won' : 'lost';
  }
  if (position.status === 'pending-validation') return 'verifying';
  if (position.status === 'refund-required') return 'refund-pending';
  if (snapshot.phase === 'unknown') return 'unknown';
  if (
    snapshot.phase !== 'open' ||
    ['final', 'cancelled', 'postponed', 'suspended'].includes(fixtureStatus ?? '')
  )
    return 'settling';
  if (fixtureStatus === 'live') return 'live';
  return kickoff > now ? 'upcoming' : 'settling';
}
export const isHistory = (p: Position) => ['claimable', 'claimed', 'refunded'].includes(p.status);
export const isCollected = (p: Position) => p.status === 'claimed' || p.status === 'refunded';
export function returnParts(p: Position) {
  if (p.entitlementShannons === null) return null;
  const total = BigInt(p.entitlementShannons),
    storage = BigInt(p.storageShannons);
  if (total < storage) return null;
  return { total, storage, prediction: total - storage };
}
export function pendingClaim(
  p: Position,
  descriptor: Descriptor,
  records: readonly JournalRecord[],
) {
  if (isCollected(p)) return undefined;
  return records.find(
    (r) =>
      r.kind === 'claim' &&
      r.status !== 'resolved' &&
      descriptorKey(r.descriptor) === descriptorKey(descriptor) &&
      r.inputs.some(
        (input) => input.txHash === p.outPoint.txHash && input.index === p.outPoint.index,
      ),
  );
}
export const stateLabels: Record<ActivityState, string> = {
  upcoming: 'Upcoming',
  live: 'In play',
  settling: 'Awaiting settlement',
  verifying: 'Verifying entry',
  submitted: 'Confirming payment',
  'refund-pending': 'Refund pending',
  won: 'Won',
  lost: 'Lost',
  refund: 'Refund',
  settled: 'Settled',
  unknown: 'Checking status',
};
export function collectionLabel(state: ActivityState) {
  return state === 'lost'
    ? 'Collect storage'
    : state === 'refund'
      ? 'Collect refund'
      : 'Collect return';
}

import { createHash } from 'node:crypto';
import type { ActivityPosition } from '../../../shared/activity-wire';
import { hash32, object, validateRecord, type DirectMarketDescriptor } from '../direct/registry';

/** Public observations request verification. They never establish a chain entitlement. */
export interface ActivityPublicEvent {
  version: 1;
  id: string;
  kind: 'operator' | 'payment';
  transactionHash: string;
  state: string;
  observedAt: number;
  descriptors: DirectMarketDescriptor[];
  action?: 'create' | 'report' | 'close' | 'batch';
  /** Distinguishes a later reorg back to a previously observed block. */
  sourceRevision?: string;
  blockHash?: string;
  confirmations?: number;
  ownerHash?: string;
  positions?: Array<{
    descriptor: DirectMarketDescriptor;
    ownerHash: string;
    position: ActivityPosition;
  }>;
}
export interface ActivityEventBatch {
  events: ActivityPublicEvent[];
  hasMore: boolean;
  /** A preserved relay/source record needs operator review; healthy events still flow. */
  degraded?: boolean;
}
export const ACTIVITY_EVENT_BATCH_LIMIT = 64;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function activityEventId(event: Omit<ActivityPublicEvent, 'id'>): string {
  const { observedAt: _observedAt, ...identity } = event;
  return `0x${createHash('sha256')
    .update(JSON.stringify(canonical(identity)))
    .digest('hex')}`;
}
export function activityDescriptor(value: unknown): DirectMarketDescriptor {
  return { ...validateRecord(value), entryEnabled: false };
}
export function parseActivityEvent(value: unknown): ActivityPublicEvent {
  const row = object(value, 'activity event');
  if (
    row.version !== 1 ||
    !['operator', 'payment'].includes(String(row.kind)) ||
    ![
      'signed',
      'owner-signed',
      'confirming',
      'funded',
      'blocked',
      'cancelled',
      'expired',
      'pending',
      'committed',
      'rejected',
      'ready-to-rebroadcast',
      'uncertain',
      'broadcast',
      'broadcast-unknown',
    ].includes(String(row.state)) ||
    typeof row.observedAt !== 'number' ||
    !Number.isSafeInteger(row.observedAt) ||
    row.observedAt <= 0 ||
    !Array.isArray(row.descriptors) ||
    row.descriptors.length < 1 ||
    row.descriptors.length > 8
  )
    throw Error('Invalid activity event');
  const event: Omit<ActivityPublicEvent, 'id'> = {
    version: 1,
    kind: row.kind as 'operator' | 'payment',
    transactionHash: hash32(row.transactionHash, 'activity transaction hash'),
    state: String(row.state),
    observedAt: row.observedAt,
    descriptors: row.descriptors.map(activityDescriptor),
  };
  if (row.action !== undefined) {
    if (!['create', 'report', 'close', 'batch'].includes(String(row.action)))
      throw Error('Invalid activity action');
    event.action = row.action as ActivityPublicEvent['action'];
  }
  if (row.blockHash !== undefined) event.blockHash = hash32(row.blockHash, 'activity block');
  if (row.confirmations !== undefined) {
    if (
      typeof row.confirmations !== 'number' ||
      !Number.isSafeInteger(row.confirmations) ||
      row.confirmations < 0 ||
      row.confirmations > 4
    )
      throw Error('Invalid activity depth');
    event.confirmations = row.confirmations;
  }
  if (row.sourceRevision !== undefined)
    event.sourceRevision = hash32(row.sourceRevision, 'activity source revision');
  if (row.ownerHash !== undefined) event.ownerHash = hash32(row.ownerHash, 'activity owner');
  if (row.positions !== undefined) {
    if (!Array.isArray(row.positions) || row.positions.length < 1 || row.positions.length > 8)
      throw Error('Invalid submitted activity positions');
    event.positions = row.positions.map((value) => {
      const item = object(value, 'activity position'),
        position = object(item.position, 'submitted position'),
        outPoint = object(position.outPoint, 'submitted outpoint');
      if (
        position.status !== 'submitted' ||
        ![0, 1, 2].includes(Number(position.outcome)) ||
        typeof position.outcome !== 'number' ||
        typeof outPoint.index !== 'number' ||
        !Number.isSafeInteger(outPoint.index) ||
        outPoint.index < 0 ||
        outPoint.index > 63 ||
        typeof position.principalShannons !== 'string' ||
        !/^[1-9][0-9]{9,19}$/.test(position.principalShannons) ||
        BigInt(position.principalShannons) < 10_000_000_000n ||
        position.storageShannons !== '32100000000' ||
        position.entitlementShannons !== null ||
        position.transactionHash !== event.transactionHash ||
        outPoint.txHash !== event.transactionHash ||
        position.id !== `submitted:${event.transactionHash}:${outPoint.index}`
      )
        throw Error('Invalid submitted activity position');
      const descriptor = activityDescriptor(item.descriptor);
      if (
        !event.descriptors.some(
          (candidate) => JSON.stringify(candidate) === JSON.stringify(descriptor),
        )
      )
        throw Error('Submitted position is outside event markets');
      const ownerHash = hash32(item.ownerHash, 'submitted owner');
      if (ownerHash !== event.ownerHash) throw Error('Submitted owner differs');
      return {
        descriptor,
        ownerHash,
        position: {
          id: String(position.id),
          status: 'submitted' as const,
          outcome: position.outcome as 0 | 1 | 2,
          principalShannons: position.principalShannons,
          storageShannons: '32100000000',
          entitlementShannons: null,
          outPoint: { txHash: event.transactionHash, index: outPoint.index },
          transactionHash: event.transactionHash,
        },
      };
    });
  }
  const id = hash32(row.id, 'activity event identity');
  if (id !== activityEventId(event)) throw Error('Activity event identity differs');
  return { ...event, id };
}
export function parseActivityEventBatch(value: unknown): ActivityEventBatch {
  const row = object(value, 'activity event batch');
  if (
    !Array.isArray(row.events) ||
    row.events.length > ACTIVITY_EVENT_BATCH_LIMIT ||
    typeof row.hasMore !== 'boolean' ||
    (row.degraded !== undefined && typeof row.degraded !== 'boolean')
  )
    throw Error('Invalid activity event batch');
  return {
    events: row.events.map(parseActivityEvent),
    hasMore: row.hasMore,
    degraded: row.degraded ?? false,
  };
}

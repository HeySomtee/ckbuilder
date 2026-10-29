import type { BatchDescriptor, BatchPoint } from './batch-wire';

/** Public display records only. These never authorize a transaction. */
export interface ActivityPosition {
  id: string;
  status:
    | 'submitted'
    | 'accepted'
    | 'pending-validation'
    | 'refund-required'
    | 'claimable'
    | 'claimed'
    | 'refunded';
  outcome: 0 | 1 | 2;
  principalShannons: string;
  storageShannons: string;
  entitlementShannons: string | null;
  outPoint: BatchPoint;
  transactionHash: string;
  claimTransactionHash?: string;
}
export interface ActivitySnapshot {
  phase: 'open' | 'reported' | 'settled' | 'voided' | 'unknown';
  settlement?: { outcome: 0 | 1 | 2 | null; emptyWinner: boolean };
  positions: readonly ActivityPosition[];
  report?: { outcome: 0 | 1 | 2; eligible: boolean; committedAt: number; transactionHash: string };
  checkedAt: number;
  uncertainty?: string;
  historyComplete?: boolean;
}
export interface ActivityGroup {
  descriptor: BatchDescriptor;
  snapshot: ActivitySnapshot;
  stale: boolean;
}
export interface ActivityPage {
  version: 1;
  network: 'testnet';
  available: boolean;
  ownerHash: string;
  address: string;
  groups: ActivityGroup[];
  nextCursor: string | null;
  coverage: 'complete' | 'indexing' | 'unavailable';
  updating: boolean;
  updatedAt: number | null;
  summary: { open: number; completed: number; collectibleShannons: string; claimable: number };
}

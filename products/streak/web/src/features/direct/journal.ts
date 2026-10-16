import { ccc } from '@ckb-ccc/core';
import { hex, integer, object, parseDescriptor, text, VERSION } from './protocol.ts';
import type { Descriptor, Point } from './protocol.ts';
import { DIRECT_STORE, SPONSORED_STORE, storedRecords, putStored } from './journal-db.ts';
import { parseReservation, type Reservation } from './reservations.ts';

export type JournalStatus =
  'signed' | 'submitted' | 'unknown' | 'committed' | 'rejected' | 'conflict' | 'resolved';
export type JournalRecord = Readonly<{
  version: typeof VERSION;
  scope: string;
  ownerHash: string;
  kind: 'deposit' | 'claim';
  descriptor: Descriptor;
  hash: string;
  signedBytes: string;
  inputs: readonly Point[];
  createdAt: number;
  status: JournalStatus;
  principalShannons: string;
  storageShannons: string;
  feeShannons: string;
  payoutShannons: string;
  shard: number | null;
  outcome: number | null;
  blockHash?: string;
  blockNumber?: string;
  conflictProof?: Readonly<{ hash: string; blockHash: string; blockNumber: string }>;
}>;
export interface Journal {
  list(scope: string): Promise<JournalRecord[]>;
  put(record: JournalRecord): Promise<void>;
  otherReservations?(scope: string): Promise<Reservation[]>;
}
export const MAX_TX_BYTES = 100_000;
function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,19})$/.test(value))
    throw Error('Invalid saved transaction amount.');
  return value;
}
export async function parseRecord(value: unknown): Promise<JournalRecord> {
  const r = object(value);
  if (
    r.version !== VERSION ||
    (r.kind !== 'deposit' && r.kind !== 'claim') ||
    !['signed', 'submitted', 'unknown', 'committed', 'rejected', 'conflict', 'resolved'].includes(
      String(r.status),
    ) ||
    typeof r.signedBytes !== 'string' ||
    !/^0x(?:[0-9a-f]{2})+$/.test(r.signedBytes) ||
    r.signedBytes.length > MAX_TX_BYTES * 2 + 2
  )
    throw Error(
      'Saved transaction is invalid. Preserve your transaction history and contact support.',
    );
  const tx = ccc.Transaction.fromBytes(r.signedBytes),
    hash = hex(r.hash, 32);
  if (
    tx.hash() !== hash ||
    tx.inputs.length > 64 ||
    !Array.isArray(r.inputs) ||
    r.inputs.length !== tx.inputs.length
  )
    throw Error('Saved transaction integrity check failed.');
  const inputs = r.inputs.map((value, index) => {
    const p = object(value),
      result = { txHash: hex(p.txHash, 32), index: integer(p.index, 0, 0xffffffff) };
    if (!tx.inputs[index].previousOutput.eq(result))
      throw Error('Saved transaction inputs changed.');
    return Object.freeze(result);
  });
  return Object.freeze({
    version: VERSION,
    scope: text(r.scope, 300),
    ownerHash: hex(r.ownerHash, 32),
    kind: r.kind,
    descriptor: await parseDescriptor(r.descriptor),
    hash,
    signedBytes: r.signedBytes,
    inputs: Object.freeze(inputs),
    createdAt: integer(r.createdAt, 1, Number.MAX_SAFE_INTEGER),
    status: r.status as JournalStatus,
    principalShannons: amount(r.principalShannons),
    storageShannons: amount(r.storageShannons),
    feeShannons: amount(r.feeShannons),
    payoutShannons: amount(r.payoutShannons),
    shard: r.shard === null ? null : integer(r.shard, 0, 3),
    outcome: r.outcome === null ? null : integer(r.outcome, 0, 2),
    ...(r.blockHash === undefined ? {} : { blockHash: hex(r.blockHash, 32) }),
    ...(r.blockNumber === undefined ? {} : { blockNumber: amount(r.blockNumber) }),
    ...(r.conflictProof === undefined
      ? {}
      : {
          conflictProof: Object.freeze({
            hash: hex(object(r.conflictProof).hash, 32),
            blockHash: hex(object(r.conflictProof).blockHash, 32),
            blockNumber: amount(object(r.conflictProof).blockNumber),
          }),
        }),
  });
}

/** Public signed bytes only. Both stores reserve inputs atomically. */
export class IndexedJournal implements Journal {
  async list(scope: string): Promise<JournalRecord[]> {
    return Promise.all((await storedRecords(DIRECT_STORE, scope)).map(parseRecord));
  }
  async otherReservations(scope: string): Promise<Reservation[]> {
    return (await storedRecords(SPONSORED_STORE, scope)).map(parseReservation);
  }
  async put(record: JournalRecord): Promise<void> {
    await putStored(DIRECT_STORE, await parseRecord(record));
  }
}

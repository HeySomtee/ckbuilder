import { ccc } from '@ckb-ccc/core';
import { hex, integer, object, parseDescriptor, text, VERSION } from './protocol.ts';
import type { Descriptor, Point } from './protocol.ts';

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
}
const DB = 'streak-direct-transactions-v1',
  STORE = 'transactions',
  MAX_RECORDS = 128;
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

/** Public signed bytes only. A storage failure blocks broadcast instead of losing recovery. */
export class IndexedJournal implements Journal {
  private async open(): Promise<IDBDatabase> {
    if (!globalThis.indexedDB)
      throw Error(
        'Transaction recovery storage is unavailable. Enable browser storage before signing.',
      );
    return new Promise((resolve, reject) => {
      let finished = false;
      const fail = (message: string) => {
        if (!finished) {
          finished = true;
          reject(Error(message));
        }
      };
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
      request.onsuccess = () => {
        if (finished) request.result.close();
        else {
          finished = true;
          resolve(request.result);
        }
      };
      request.onerror = () => fail('Transaction recovery storage could not be opened.');
      request.onblocked = () =>
        fail('Close older Streak tabs before opening transaction recovery.');
    });
  }
  async list(scope: string): Promise<JournalRecord[]> {
    const db = await this.open();
    try {
      const values = await new Promise<unknown[]>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly'),
          request = tx.objectStore(STORE).getAll(undefined, MAX_RECORDS + 1);
        request.onsuccess = () => resolve(request.result as unknown[]);
        request.onerror = () =>
          reject(Error('Saved transactions could not be read. Do not submit another payment.'));
      });
      if (values.length > MAX_RECORDS)
        throw Error('Transaction recovery storage is full. Export your history before continuing.');
      return await Promise.all(values.filter((v) => object(v).scope === scope).map(parseRecord));
    } finally {
      db.close();
    }
  }
  async put(record: JournalRecord): Promise<void> {
    const checked = await parseRecord(record),
      db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'),
          store = tx.objectStore(STORE),
          key = `${checked.scope}:${checked.hash}`;
        let failure = 'Transaction could not be saved. No new broadcast was started.';
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(Error(failure));
        tx.onabort = () => reject(Error(failure));
        const all = store.getAll(undefined, MAX_RECORDS + 1);
        all.onsuccess = () => {
          const values: unknown[] = all.result;
          const exists = values.some((value) => object(value).key === key);
          if (!exists && values.length >= MAX_RECORDS) {
            failure = 'Transaction history is full. Signing is paused until history is exported.';
            tx.abort();
            return;
          }
          if (!exists) {
            const reserved = new Set(checked.inputs.map((p) => `${p.txHash}:${p.index}`));
            for (const value of values) {
              const previous = object(value);
              if (previous.hash === checked.hash) continue;
              // The client rechecks the proof against uncached canonical chain
              // data before preparing and again inside the signing lock.
              if (previous.status === 'resolved' && previous.conflictProof) continue;
              const overlaps =
                Array.isArray(previous.inputs) &&
                previous.inputs.some((value) => {
                  const p = object(value);
                  return reserved.has(`${String(p.txHash)}:${String(p.index)}`);
                });
              if (overlaps) {
                failure =
                  'Another saved transaction already reserves an input. No broadcast was started.';
                tx.abort();
                return;
              }
            }
          }
          store.put({ ...checked, key });
        };
      });
    } finally {
      db.close();
    }
  }
}

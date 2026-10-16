import * as ccc from '@ckb-ccc/core';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import {
  exactTimestamp,
  hash32,
  object,
  type DirectMarketRecord,
  validateRecord,
  writeExclusiveJson,
  type DirectProtocolConfig,
  PUBLIC_DIRECT_CONFIG,
} from './registry';

export type OperatorAction = 'create' | 'report' | 'close';
export interface SignedOperation {
  version: 1;
  operationId: string;
  action: OperatorAction;
  fixtureId: string;
  createdAtMs: number;
  transactionHash: string;
  signedTransaction: string;
  descriptor: DirectMarketRecord;
}
export type Reconciliation = {
  transactionHash: string;
  status: 'pending' | 'committed' | 'rejected' | 'ready-to-rebroadcast' | 'uncertain';
  blockHash?: string;
  confirmations?: number;
};

/** One durable directory, one operator process. No API service key or database dependency. */
export class OperatorJournal {
  readonly directory: string;
  constructor(
    directory: string,
    readonly config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
  ) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }
  private path(operationId: string): string {
    if (!/^(create|report|close)-api-football-[1-9][0-9]{0,14}$/.test(operationId))
      throw Error('Invalid operator operation ID');
    return join(this.directory, `${operationId}.json`);
  }
  load(operationId: string): SignedOperation | undefined {
    const file = this.path(operationId);
    if (!existsSync(file)) return undefined;
    if (statSync(file).size > 300_000) throw Error('Operator journal entry exceeds its size bound');
    const row = object(JSON.parse(readFileSync(file, 'utf8')), 'signed operation');
    if (
      row.version !== 1 ||
      row.operationId !== operationId ||
      !['create', 'report', 'close'].includes(String(row.action)) ||
      row.operationId !== `${String(row.action)}-${String(row.fixtureId)}` ||
      typeof row.signedTransaction !== 'string' ||
      !/^0x(?:[0-9a-f]{2})+$/.test(row.signedTransaction)
    )
      throw Error('Invalid operator journal entry');
    const descriptor = validateRecord(row.descriptor, this.config);
    if (descriptor.fixtureId !== row.fixtureId)
      throw Error('Journal fixture and descriptor differ');
    const transactionHash = hash32(row.transactionHash, 'journal transaction hash');
    const tx = ccc.Transaction.fromBytes(row.signedTransaction);
    if (
      tx.hash() !== transactionHash ||
      tx.inputs.length > 64 ||
      tx.outputs.length > 64 ||
      tx.toBytes().length > 100_000 ||
      tx.witnesses.length === 0
    )
      throw Error('Journal transaction is inconsistent or unbounded');
    return {
      version: 1,
      operationId,
      action: row.action as OperatorAction,
      fixtureId: descriptor.fixtureId,
      createdAtMs: exactTimestamp(row.createdAtMs, 'operation time'),
      transactionHash,
      signedTransaction: row.signedTransaction,
      descriptor,
    };
  }
  persist(
    action: OperatorAction,
    descriptor: DirectMarketRecord,
    signed: ccc.Transaction,
    now = Date.now(),
  ): SignedOperation {
    const operationId = `${action}-${descriptor.fixtureId}`;
    const existing = this.load(operationId);
    if (existing) {
      if (existing.signedTransaction !== ccc.hexFrom(signed.toBytes()))
        throw Error(
          'An operation is already journaled. Reconcile its exact hash before any rebuild.',
        );
      return existing;
    }
    if (
      readdirSync(this.directory).filter((file) =>
        /^(create|report|close)-api-football-\d+\.json$/.test(file),
      ).length >= 768
    )
      throw Error('Operator journal reached the bounded pilot limit');
    const operation: SignedOperation = {
      version: 1,
      operationId,
      action,
      fixtureId: descriptor.fixtureId,
      createdAtMs: now,
      transactionHash: signed.hash(),
      signedTransaction: ccc.hexFrom(signed.toBytes()),
      descriptor,
    };
    // Validate before exposing a signed transaction on disk or the network.
    validateRecord(descriptor, this.config);
    if (
      signed.inputs.length > 64 ||
      signed.outputs.length > 64 ||
      signed.toBytes().length > 100_000 ||
      signed.witnesses.length === 0
    )
      throw Error('Signed operator transaction exceeds bounds');
    writeExclusiveJson(this.path(operationId), operation);
    return this.load(operationId)!;
  }
  record(
    operationId: string,
    status: Reconciliation | { status: 'broadcast-unknown' | 'broadcast'; transactionHash: string },
  ): void {
    const operation = this.load(operationId);
    if (!operation || operation.transactionHash !== status.transactionHash)
      throw Error('Cannot record another transaction against this operation');
    const folder = join(this.directory, `${operationId}.events`);
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const files = readdirSync(folder).sort();
    if (files.length >= 256)
      throw Error(
        'Operation event limit reached; archive reviewed observation logs before retrying',
      );
    const last = files.at(-1);
    if (last) {
      const previous = object(
        JSON.parse(readFileSync(join(folder, last), 'utf8')),
        'operator observation',
      );
      if (
        previous.status === status.status &&
        previous.blockHash === ('blockHash' in status ? status.blockHash : undefined)
      )
        return;
    }
    writeExclusiveJson(
      join(folder, `${String(files.length).padStart(3, '0')}-${randomUUID()}.json`),
      { observedAt: new Date().toISOString(), ...status },
    );
  }
  async exclusive<T>(task: () => Promise<T>): Promise<T> {
    const lockFile = join(this.directory, 'operator.lock');
    const token = randomUUID();
    const acquire = () => {
      const fd = openSync(lockFile, 'wx', 0o600);
      try {
        writeFileSync(
          fd,
          JSON.stringify({ pid: process.pid, hostname: hostname(), token }),
          'utf8',
        );
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
    };
    try {
      acquire();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const prior = object(JSON.parse(readFileSync(lockFile, 'utf8')), 'operator lock');
      if (
        prior.hostname !== hostname() ||
        typeof prior.pid !== 'number' ||
        !Number.isSafeInteger(prior.pid) ||
        prior.pid <= 0
      )
        throw Error(
          'Operator directory is locked by another host. Resolve ownership before proceeding.',
        );
      try {
        process.kill(prior.pid, 0);
        throw Error('Another operator process owns this journal');
      } catch (check) {
        if ((check as NodeJS.ErrnoException).code !== 'ESRCH') throw check;
      }
      // Do not race another recovery process by deleting and reacquiring its lock.
      // Read-only reconciliation remains available without this mutation lease.
      throw Error(
        'Previous operator process has stopped. Run reconcile, then remove the stale operator.lock only after confirming no other operator is running.',
      );
    }
    try {
      return await task();
    } finally {
      const current = object(JSON.parse(readFileSync(lockFile, 'utf8')), 'operator lock');
      if (current.token !== token) throw Error('Operator journal ownership changed unexpectedly');
      unlinkSync(lockFile);
    }
  }
}

/** Always refresh actual chain state, even when a prior observation said committed. */
export async function reconcileOperation(
  client: ccc.Client,
  operation: SignedOperation,
): Promise<Reconciliation> {
  const base = { transactionHash: operation.transactionHash };
  const response = await client.getTransactionNoCache(operation.transactionHash);
  if (response && response.transaction.hash() !== operation.transactionHash)
    throw Error('RPC returned another transaction for the persisted hash');
  if (response?.status === 'committed') {
    if (!response.blockHash || response.blockNumber === undefined)
      throw Error('Committed transaction lacks a block checkpoint');
    const canonical = await client.getHeaderByNumberNoCache(response.blockNumber);
    if (!canonical || canonical.hash !== response.blockHash)
      return { ...base, status: 'uncertain' };
    const tip = await client.getTipHeader();
    const depth = tip.number >= response.blockNumber ? tip.number - response.blockNumber + 1n : 0n;
    return {
      ...base,
      status: 'committed',
      blockHash: response.blockHash,
      confirmations: Number(depth > 1_000_000n ? 1_000_000n : depth),
    };
  }
  if (response?.status === 'rejected') return { ...base, status: 'rejected' };
  if (response && ['pending', 'proposed', 'sent'].includes(response.status))
    return { ...base, status: 'pending' };
  const tx = ccc.Transaction.fromBytes(operation.signedTransaction);
  for (const input of tx.inputs) {
    if (!(await client.getCellLiveNoCache(input.previousOutput, false, true)))
      return { ...base, status: 'uncertain' };
  }
  return { ...base, status: 'ready-to-rebroadcast' };
}

export async function broadcastOperation(
  client: ccc.Client,
  journal: OperatorJournal,
  operation: SignedOperation,
  now = Date.now(),
): Promise<Reconciliation> {
  const persisted = journal.load(operation.operationId);
  if (!persisted || persisted.signedTransaction !== operation.signedTransaction)
    throw Error('Signed transaction must be durably journaled before broadcast');
  const state = await reconcileOperation(client, persisted);
  journal.record(operation.operationId, state);
  if (state.status !== 'ready-to-rebroadcast') return state;
  if (operation.action === 'create' && now >= operation.descriptor.cutoffMs)
    throw Error('Do not broadcast a new market after its pinned kickoff');
  if (
    operation.action === 'report' &&
    (now < operation.descriptor.cutoffMs || now >= operation.descriptor.terms.deadlineMs)
  )
    throw Error('Do not broadcast a result outside the immutable reporting window');
  try {
    const hash = await client.sendTransactionNoCache(
      ccc.Transaction.fromBytes(operation.signedTransaction),
      'passthrough',
    );
    if (hash !== operation.transactionHash)
      throw Error('RPC returned another hash for the signed transaction');
    journal.record(operation.operationId, { transactionHash: hash, status: 'broadcast' });
    return { transactionHash: hash, status: 'pending' };
  } catch (error) {
    journal.record(operation.operationId, {
      transactionHash: operation.transactionHash,
      status: 'broadcast-unknown',
    });
    throw error;
  }
}

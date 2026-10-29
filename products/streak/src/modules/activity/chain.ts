import * as ccc from '@ckb-ccc/core';
import type { ActivityPosition, ActivitySnapshot } from '../../../shared/activity-wire';
import {
  protocolConfigFor,
  validateRecord,
  V3_DIRECT_CONFIG,
  V4_DIRECT_CONFIG,
  type DirectMarketDescriptor,
} from '../direct/registry';
import { fundedPayout } from '../direct/operator';

const CKB = 100_000_000n;
const STORAGE = 321n * CKB;
const RESERVE = 610n * CKB;
const MAX_TRANSACTIONS = 512;
const MAX_CELLS = 128;
type Outcome = 0 | 1 | 2;
type Ticket = { owner: string; outcome: Outcome; principal: bigint };
type State =
  | { kind: 'market'; phase: 0 | 1; outcome: Outcome | 255 }
  | { kind: 'shard'; id: number; accepted: Ticket[]; pending: Ticket | null }
  | { kind: 'reserve'; outcome: Outcome | 255; totals: bigint[] }
  | { kind: 'claim'; id: number; ticket: Ticket };
type Observed = { transaction: ccc.Transaction; header: ccc.ClientBlockHeader };
type Entry = {
  cell: ccc.Cell;
  state: State;
  header: ccc.ClientBlockHeader;
  accepted: string[];
  pending?: string;
  position?: string;
};
type OwnedPosition = { owner: string; value: ActivityPosition };

/** Internal persisted evidence, never a permission to spend a claim cell. */
export interface ActivityMarketProjection {
  descriptor: DirectMarketDescriptor;
  phase: ActivitySnapshot['phase'];
  owners: Record<string, ActivitySnapshot>;
  checkedAt: number;
  checkpoint: { blockNumber: string; blockHash: string };
  transactionHashes: string[];
}

const key = (point: ccc.OutPointLike): string => {
  const value = ccc.OutPoint.from(point);
  return `${value.txHash}:${value.index}`;
};
const point = (value: ccc.OutPointLike) => {
  const parsed = ccc.OutPoint.from(value);
  return { txHash: parsed.txHash, index: Number(parsed.index) };
};
const raw = (value: string): Buffer => Buffer.from(value.slice(2), 'hex');
function requireEvidence(condition: unknown, message: string): asserts condition {
  if (!condition) throw Error(`Activity evidence incomplete: ${message}`);
}
function ticket(data: Buffer, offset: number): Ticket {
  const principal = data.readBigUInt64LE(offset + 33),
    outcome = data[offset + 32];
  requireEvidence(
    outcome < 3 && principal >= 100n * CKB && principal <= (1n << 64n) - 1n - STORAGE,
    'invalid ticket',
  );
  return {
    owner: `0x${data.subarray(offset, offset + 32).toString('hex')}`,
    outcome: outcome as Outcome,
    principal,
  };
}
function decode(cell: ccc.Cell, descriptor: DirectMarketDescriptor): State {
  const type = ccc.Script.from(descriptor.type),
    config = protocolConfigFor(descriptor),
    lock = cell.cellOutput.lock;
  requireEvidence(
    cell.cellOutput.type?.eq(type) &&
      lock.codeHash === config.guardHash &&
      lock.hashType === 'data2' &&
      lock.args === type.hash(),
    'unexpected market script',
  );
  requireEvidence(/^0x(?:[0-9a-f]{2}){1,332}$/.test(cell.outputData), 'invalid cell bytes');
  const data = raw(cell.outputData);
  if (
    data[0] === 0 &&
    data.length === 3 &&
    ((data[1] === 0 && data[2] === 255) || (data[1] === 1 && data[2] < 3))
  )
    return { kind: 'market', phase: data[1] as 0 | 1, outcome: data[2] as Outcome | 255 };
  if (
    data[0] === 1 &&
    data.length >= 4 &&
    data[1] < 4 &&
    data[3] < 2 &&
    data[2] + data[3] <= 8 &&
    data.length === 4 + 41 * (data[2] + data[3])
  ) {
    const accepted = Array.from({ length: data[2] }, (_, index) => ticket(data, 4 + index * 41));
    const pending = data[3] ? ticket(data, 4 + data[2] * 41) : null;
    requireEvidence(
      cell.cellOutput.capacity ===
        [...accepted, ...(pending ? [pending] : [])].reduce(
          (sum, value) => sum + STORAGE + value.principal,
          RESERVE,
        ),
      'shard capacity mismatch',
    );
    return { kind: 'shard', id: data[1], accepted, pending };
  }
  if (
    data[0] === 2 &&
    data.length === 34 &&
    (data[1] < 3 || data[1] === 255) &&
    data.readBigUInt64LE(26) === 0n
  )
    return {
      kind: 'reserve',
      outcome: data[1] as Outcome | 255,
      totals: [2, 10, 18].map((offset) => data.readBigUInt64LE(offset)),
    };
  if (data[0] === 3 && data.length === 43 && data[1] < 32) {
    requireEvidence(cell.cellOutput.capacity >= STORAGE, 'claim storage mismatch');
    return { kind: 'claim', id: data[1], ticket: ticket(data, 2) };
  }
  throw Error('Activity evidence incomplete: unknown market cell');
}
function sameTicket(left: Ticket, right: Ticket): boolean {
  return (
    left.owner === right.owner &&
    left.outcome === right.outcome &&
    left.principal === right.principal
  );
}

async function concurrent<T, R>(
  values: readonly T[],
  operation: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(4, values.length) }, async () => {
      while (!failed && next < values.length) {
        const index = next++;
        try {
          results[index] = await operation(values[index]);
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }),
  );
  // Drain already-started reads before the caller can lease a retry. A failing
  // reader must not leave background workers consuming the rest of its history.
  if (failed) throw failure;
  return results;
}

/**
 * Replays one bounded market, for every owner, only when an event/recovery job asks.
 * It checks canonical headers and the final live set. Missing indexer history,
 * changing state or a reorg throws; callers retain and label the prior snapshot.
 */
export async function readActivityMarket(
  client: ccc.Client,
  descriptor: DirectMarketDescriptor,
  _previous?: ActivityMarketProjection,
): Promise<ActivityMarketProjection> {
  validateRecord(descriptor);
  const tip = await client.getTipHeader();
  const hashes = new Set<string>([descriptor.creationTxHash]);
  let records = 0;
  for await (const record of client.findTransactionsByType(descriptor.type, true, 'asc', 64)) {
    requireEvidence(
      ++records <= MAX_TRANSACTIONS * 2,
      'transaction index exceeded its bounded history',
    );
    hashes.add(record.txHash);
    requireEvidence(hashes.size <= MAX_TRANSACTIONS, 'market history needs a larger recovery pass');
  }
  const headers = new Map<string, Promise<ccc.ClientBlockHeader | undefined>>();
  const canonical = (number: bigint) => {
    const identity = number.toString();
    let pending = headers.get(identity);
    if (!pending) {
      pending = client.getHeaderByNumberNoCache(number);
      headers.set(identity, pending);
    }
    return pending;
  };
  const observations = await concurrent([...hashes], async (hash): Promise<Observed> => {
    const response = await client.getTransactionNoCache(hash);
    requireEvidence(
      response?.status === 'committed' &&
        response.blockNumber !== undefined &&
        response.blockHash &&
        response.transaction.hash() === hash,
      'transaction is not canonically committed',
    );
    requireEvidence(
      response.blockNumber <= tip.number,
      'chain advanced while collecting market history',
    );
    const header = await canonical(response.blockNumber);
    requireEvidence(
      header && header.hash === response.blockHash,
      'transaction header is no longer canonical',
    );
    requireEvidence(
      response.transaction.inputs.length <= MAX_CELLS &&
        response.transaction.outputs.length <= MAX_CELLS,
      'transaction cell bound exceeded',
    );
    return { transaction: response.transaction, header };
  });
  const genesis = observations.find((row) => row.transaction.hash() === descriptor.creationTxHash);
  requireEvidence(genesis, 'market creation is missing');
  const args = raw(descriptor.type.args),
    batch = descriptor.type.codeHash === V4_DIRECT_CONFIG.protocolHash;
  const base = batch ? args.readUInt32LE(32) : 0;
  const firstInput = genesis.transaction.inputs[0];
  requireEvidence(
    firstInput &&
      (batch
        ? ccc.hashCkb(firstInput.previousOutput.toBytes()) === ccc.hexFrom(args.subarray(0, 32))
        : firstInput.previousOutput.toHex() === ccc.hexFrom(args.subarray(0, 36))),
    'creation does not bind the full market identity',
  );

  const unspent = new Map<string, Entry>(),
    all = new Map<string, Entry>();
  const positions = new Map<string, OwnedPosition>();
  let phase: ActivitySnapshot['phase'] = 'open';
  let report: ActivitySnapshot['report'];
  let settlement: ActivitySnapshot['settlement'];
  const outputEntries = (observed: Observed): Entry[] => {
    const result: Entry[] = [];
    observed.transaction.outputs.forEach((output, index) => {
      if (!output.type?.eq(descriptor.type)) return;
      const cell = ccc.Cell.from({
        cellOutput: output,
        outputData: observed.transaction.outputsData[index],
        outPoint: { txHash: observed.transaction.hash(), index },
      });
      result.push({ cell, state: decode(cell, descriptor), header: observed.header, accepted: [] });
    });
    return result;
  };
  const add = (entry: Entry) => {
    const identity = key(entry.cell.outPoint);
    requireEvidence(!all.has(identity), 'duplicate output');
    all.set(identity, entry);
    unspent.set(identity, entry);
  };
  const createPosition = (entry: Entry, value: Ticket): string => {
    // A deposit output is immutable, unlike the shard outpoint carrying it later.
    const identity = key(entry.cell.outPoint);
    requireEvidence(!positions.has(identity), 'duplicate deposit identity');
    positions.set(identity, {
      owner: value.owner,
      value: {
        id: identity,
        status:
          entry.header.timestamp < BigInt(descriptor.cutoffMs)
            ? 'pending-validation'
            : 'refund-required',
        outcome: value.outcome,
        principalShannons: value.principal.toString(),
        storageShannons: STORAGE.toString(),
        entitlementShannons: null,
        outPoint: point(entry.cell.outPoint),
        transactionHash: entry.cell.outPoint.txHash,
      },
    });
    return identity;
  };
  const update = (identity: string, changes: Partial<ActivityPosition>) => {
    const previous = positions.get(identity);
    requireEvidence(previous, 'position lineage is missing');
    previous.value = { ...previous.value, ...changes };
  };
  const plain = (tx: ccc.Transaction, index: number, value: Ticket, capacity: bigint) => {
    const output = tx.getOutput(index);
    requireEvidence(
      output &&
        !output.cellOutput.type &&
        output.outputData === '0x' &&
        output.cellOutput.lock.hash() === value.owner &&
        output.cellOutput.capacity === capacity,
      'owner payment output is inconsistent',
    );
  };
  const refund = (tx: ccc.Transaction, index: number, entry: Entry) => {
    requireEvidence(
      entry.state.kind === 'shard' && entry.state.pending && entry.pending,
      'refund ticket lineage is missing',
    );
    const value = entry.state.pending,
      capacity = value.principal + STORAGE;
    plain(tx, index, value, capacity);
    update(entry.pending, {
      status: 'refunded',
      entitlementShannons: capacity.toString(),
      outPoint: { txHash: tx.hash(), index },
      claimTransactionHash: tx.hash(),
    });
  };
  const initial = outputEntries(genesis);
  requireEvidence(initial.length === 5, 'genesis must contain exactly five market cells');
  initial.forEach((entry, index) => {
    requireEvidence(
      entry.cell.outPoint.index === BigInt(base + index),
      'genesis output offsets are inconsistent',
    );
    const sponsored =
      index === 1 && (batch || descriptor.type.codeHash === V3_DIRECT_CONFIG.protocolHash);
    if (index === 0)
      requireEvidence(
        entry.state.kind === 'market' &&
          entry.state.phase === 0 &&
          entry.cell.cellOutput.capacity === RESERVE,
        'invalid genesis control',
      );
    else {
      requireEvidence(
        entry.state.kind === 'shard' &&
          entry.state.id === index - 1 &&
          entry.state.accepted.length === 0 &&
          Boolean(entry.state.pending) === sponsored,
        'invalid genesis shard',
      );
      if (entry.state.pending) entry.pending = createPosition(entry, entry.state.pending);
    }
    add(entry);
  });

  const waiting = observations.filter((row) => row !== genesis);
  const processed = new Set<string>([descriptor.creationTxHash]);
  // Topological processing avoids trusting the indexer's ordering within a block.
  while (waiting.length) {
    const index = waiting.findIndex(
      (row) =>
        row.transaction.inputs.every(
          (input) =>
            !hashes.has(input.previousOutput.txHash) || processed.has(input.previousOutput.txHash),
        ) && row.transaction.inputs.some((input) => unspent.has(key(input.previousOutput))),
    );
    requireEvidence(index >= 0, 'transaction ancestry is missing or belongs to another market');
    const observed = waiting.splice(index, 1)[0],
      tx = observed.transaction;
    const inputs = tx.inputs
      .map((input) => all.get(key(input.previousOutput)))
      .filter((entry): entry is Entry => !!entry);
    requireEvidence(
      inputs.every(
        (entry) =>
          unspent.has(key(entry.cell.outPoint)) && entry.header.number <= observed.header.number,
      ),
      'duplicate spend or reversed chain ancestry',
    );
    const outputs = outputEntries(observed),
      first = inputs[0];
    requireEvidence(first, 'transaction input lineage is missing');
    if (first.state.kind === 'shard') {
      requireEvidence(
        inputs.length === 1 && outputs.length === 1,
        'shard replacement shape is inconsistent',
      );
      const next = outputs[0];
      requireEvidence(
        next.state.kind === 'shard' && next.state.id === first.state.id && next.state.pending,
        'shard replacement is inconsistent',
      );
      const accepted = [...first.state.accepted],
        identities = [...first.accepted];
      if (first.state.pending) {
        requireEvidence(first.pending, 'pending position lineage is missing');
        if (first.header.timestamp < BigInt(descriptor.cutoffMs)) {
          accepted.push(first.state.pending);
          identities.push(first.pending);
        } else refund(tx, Number(next.cell.outPoint.index) + 1, first);
      }
      requireEvidence(
        next.state.accepted.length === accepted.length &&
          next.state.accepted.every((value, offset) => sameTicket(value, accepted[offset])),
        'accepted records changed during replacement',
      );
      next.accepted = identities;
      for (const identity of identities)
        update(identity, { status: 'accepted', outPoint: point(next.cell.outPoint) });
      next.pending = createPosition(next, next.state.pending);
    } else if (first.state.kind === 'market') {
      requireEvidence(
        Number(first.cell.outPoint.index) >= 0 &&
          tx.inputs[0].previousOutput.eq(first.cell.outPoint),
        'market control input order is inconsistent',
      );
      if (inputs.length === 1) {
        const next = outputs[0];
        requireEvidence(
          first.state.phase === 0 &&
            outputs.length === 1 &&
            next.state.kind === 'market' &&
            next.state.phase === 1 &&
            next.state.outcome !== 255 &&
            next.cell.outPoint.index === 0n &&
            next.cell.cellOutput.capacity === first.cell.cellOutput.capacity,
          'report transition is inconsistent',
        );
        phase = 'reported';
        report = {
          outcome: next.state.outcome,
          eligible:
            observed.header.timestamp >= BigInt(descriptor.cutoffMs) &&
            observed.header.timestamp < BigInt(descriptor.terms.deadlineMs),
          committedAt: Number(observed.header.timestamp),
          transactionHash: tx.hash(),
        };
      } else {
        requireEvidence(
          inputs.length === 5 &&
            inputs
              .slice(1)
              .every(
                (entry, id) =>
                  entry.state.kind === 'shard' &&
                  entry.state.id === id &&
                  tx.inputs[id + 1].previousOutput.eq(entry.cell.outPoint),
              ),
          'closure requires all four shards in order',
        );
        const reserve = outputs[0];
        requireEvidence(
          reserve?.state.kind === 'reserve' && reserve.cell.outPoint.index === 0n,
          'closure reserve is missing',
        );
        const eligible =
          first.state.phase === 1 &&
          first.header.timestamp >= BigInt(descriptor.cutoffMs) &&
          first.header.timestamp < BigInt(descriptor.terms.deadlineMs);
        const outcome = eligible ? first.state.outcome : 255;
        requireEvidence(
          reserve.state.outcome === outcome &&
            (outcome !== 255 || observed.header.timestamp >= BigInt(descriptor.terms.deadlineMs)),
          'closure result does not match its committed report',
        );
        const tickets: Ticket[] = [],
          identities: string[] = [],
          late: Entry[] = [];
        for (const shard of inputs.slice(1)) {
          requireEvidence(shard.state.kind === 'shard', 'closure shard is missing');
          tickets.push(...shard.state.accepted);
          identities.push(...shard.accepted);
          if (shard.state.pending) {
            requireEvidence(shard.pending, 'closure ticket lineage is missing');
            if (shard.header.timestamp < BigInt(descriptor.cutoffMs)) {
              tickets.push(shard.state.pending);
              identities.push(shard.pending);
            } else late.push(shard);
          }
        }
        const totals = [0n, 0n, 0n];
        tickets.forEach((value) => {
          totals[value.outcome] += value.principal;
        });
        requireEvidence(
          outputs.length === tickets.length + 1 &&
            reserve.state.totals.every((value, offset) => value === totals[offset]),
          'closure pool totals are inconsistent',
        );
        tickets.forEach((value, id) => {
          const claim = outputs[id + 1],
            capacity = fundedPayout(value.principal, value.outcome, outcome, totals);
          requireEvidence(
            claim.state.kind === 'claim' &&
              claim.state.id === id &&
              sameTicket(claim.state.ticket, value) &&
              claim.cell.outPoint.index === BigInt(id + 1) &&
              claim.cell.cellOutput.capacity === capacity,
            'funded claim differs from admitted ticket',
          );
          claim.position = identities[id];
          update(identities[id], {
            status: 'claimable',
            outPoint: point(claim.cell.outPoint),
            entitlementShannons: capacity.toString(),
          });
        });
        late.forEach((entry, offset) => refund(tx, outputs.length + offset, entry));
        phase = outcome === 255 ? 'voided' : 'settled';
        settlement = {
          outcome: outcome === 255 ? null : outcome,
          emptyWinner: outcome !== 255 && totals[outcome] === 0n,
        };
      }
    } else if (first.state.kind === 'claim') {
      requireEvidence(
        inputs.length === 1 && outputs.length === 0 && first.position,
        'claim spend shape is inconsistent',
      );
      plain(tx, 0, first.state.ticket, first.cell.cellOutput.capacity);
      update(first.position, { status: 'claimed', claimTransactionHash: tx.hash() });
    } else {
      requireEvidence(
        inputs.length === 1 && outputs.length === 0,
        'reserve recovery shape is inconsistent',
      );
      const output = tx.getOutput(0);
      requireEvidence(
        output &&
          !output.cellOutput.type &&
          output.outputData === '0x' &&
          output.cellOutput.capacity === first.cell.cellOutput.capacity &&
          output.cellOutput.lock.hash() === ccc.hexFrom(args.subarray(36, 68)),
        'reserve recovery payment is inconsistent',
      );
    }
    inputs.forEach((entry) => unspent.delete(key(entry.cell.outPoint)));
    outputs.forEach(add);
    processed.add(tx.hash());
  }

  const livePage = await client.findCellsPagedNoCache(
    { script: descriptor.type, scriptType: 'type', scriptSearchMode: 'exact', withData: true },
    'asc',
    40,
  );
  requireEvidence(
    livePage.cells.length < 40 &&
      livePage.cells.length === unspent.size &&
      new Set(livePage.cells.map((cell) => key(cell.outPoint))).size === unspent.size &&
      livePage.cells.every((cell) => unspent.has(key(cell.outPoint))),
    'live market set differs from replayed history',
  );
  await concurrent([...unspent.values()], async (entry) => {
    const current = await client.getCellLiveNoCache(entry.cell.outPoint, true, true);
    requireEvidence(
      current &&
        current.cellOutput.toHex() === entry.cell.cellOutput.toHex() &&
        current.outputData === entry.cell.outputData,
      'market changed before projection completed',
    );
  });
  const finalHeader = await client.getHeaderByNumberNoCache(tip.number);
  requireEvidence(finalHeader?.hash === tip.hash, 'canonical chain changed during projection');
  const checkedAt = Date.now(),
    owners: Record<string, ActivitySnapshot> = {};
  for (const position of positions.values()) {
    const previous = owners[position.owner];
    owners[position.owner] = {
      phase,
      positions: [...(previous?.positions ?? []), position.value],
      checkedAt,
      historyComplete: true,
      ...(report ? { report } : {}),
      ...(settlement ? { settlement } : {}),
    };
  }
  const checkpoint = observations.reduce(
    (latest, row) => (row.header.number > latest.number ? row.header : latest),
    genesis.header,
  );
  return {
    descriptor,
    phase,
    owners,
    checkedAt,
    checkpoint: { blockNumber: checkpoint.number.toString(), blockHash: checkpoint.hash },
    transactionHashes: [...hashes],
  };
}

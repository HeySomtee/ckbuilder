import * as ccc from '@ckb-ccc/core';
import type { Match } from '../../types';
import {
  createRecord,
  PUBLIC_DIRECT_CONFIG,
  type DirectMarketRecord,
  type DirectProtocolConfig,
  validateRecord,
} from './registry';
import {
  confirmFootballEvidence,
  parseFootballObservation,
  type ConfirmedFootballEvidence,
} from './oracle';

const CKB = 100_000_000n;
const STORAGE = 321n * CKB;
const RESERVE = 610n * CKB;
const MAX_INPUTS = 64;
const hex = (bytes: Uint8Array): string => `0x${Buffer.from(bytes).toString('hex')}`;
const raw = (value: string): Buffer => Buffer.from(value.slice(2), 'hex');
const le = (value: bigint): Buffer => {
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(value);
  return data;
};

export interface OperatorCell {
  cell: ccc.Cell;
  header: ccc.ClientBlockHeader;
}
export interface OperatorMarket {
  market?: OperatorCell;
  shards: OperatorCell[];
  closed: boolean;
}

/** One bounded indexer page plus authoritative live-cell and canonical-header checks. */
export async function loadOperatorMarket(
  client: ccc.Client,
  descriptor: DirectMarketRecord,
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
): Promise<OperatorMarket> {
  validateRecord(descriptor, config);
  const type = ccc.Script.from(descriptor.type);
  const page = await client.findCellsPagedNoCache(
    { script: type, scriptType: 'type', scriptSearchMode: 'exact', withData: true },
    'asc',
    64,
  );
  if (page.cells.length >= 64) throw Error('Market indexer result exceeds protocol bounds');
  const result: OperatorMarket = { shards: [], closed: false };
  for (const indexed of page.cells) {
    const cell = await client.getCellLiveNoCache(indexed.outPoint, true, false);
    if (!cell) throw Error('Market changed during lookup; reconcile before building');
    const creation = await client.getTransactionNoCache(cell.outPoint.txHash);
    if (
      creation?.status !== 'committed' ||
      !creation.blockHash ||
      creation.blockNumber === undefined
    )
      throw Error('Market cell is not confirmed');
    const outputIndex = Number(cell.outPoint.index);
    if (
      creation.transaction.hash() !== cell.outPoint.txHash ||
      creation.transaction.outputs[outputIndex]?.toHex() !== cell.cellOutput.toHex() ||
      creation.transaction.outputsData[outputIndex] !== cell.outputData
    )
      throw Error('Market creation transaction does not match its live cell');
    const header = await client.getHeaderByNumberNoCache(creation.blockNumber);
    if (!header || header.hash !== creation.blockHash)
      throw Error('Market header is no longer canonical');
    if (
      !cell.cellOutput.type?.eq(type) ||
      cell.cellOutput.lock.codeHash !== config.guardHash ||
      cell.cellOutput.lock.hashType !== 'data2' ||
      cell.cellOutput.lock.args !== type.hash()
    )
      throw Error('Market contains a cell with an unexpected script');
    const data = raw(cell.outputData);
    const entry = { cell, header };
    if (data[0] === 0 && data.length === 3) {
      if (result.market) throw Error('Market has duplicate control cells');
      result.market = entry;
    } else if (data[0] === 1) {
      parseShard(data);
      if (result.shards[data[1]]) throw Error('Market has duplicate shards');
      result.shards[data[1]] = entry;
    } else if ((data[0] === 2 && data.length === 34) || (data[0] === 3 && data.length === 43))
      result.closed = true;
    else throw Error('Unknown deployed contract cell layout');
  }
  if (result.closed && (result.market || result.shards.length))
    throw Error('Indexer returned inconsistent market phases');
  return result;
}

async function funding(client: ccc.Client, lock: ccc.Script, minimum: bigint): Promise<ccc.Cell> {
  const page = await client.findCellsPagedNoCache(
    {
      script: lock,
      scriptType: 'lock',
      scriptSearchMode: 'exact',
      withData: true,
      filter: { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] },
    },
    'desc',
    MAX_INPUTS,
  );
  const candidates = page.cells
    .filter(
      (cell) =>
        !cell.cellOutput.type && cell.outputData === '0x' && cell.cellOutput.capacity >= minimum,
    )
    .sort((left, right) => (left.cellOutput.capacity > right.cellOutput.capacity ? -1 : 1));
  for (const candidate of candidates.slice(0, 4)) {
    const live = await client.getCellLiveNoCache(candidate.outPoint, true, true);
    if (
      live &&
      !live.cellOutput.type &&
      live.outputData === '0x' &&
      live.cellOutput.lock.eq(lock) &&
      live.cellOutput.capacity >= minimum
    )
      return live;
  }
  throw Error(
    'No eligible untyped operator funding cell in the bounded 64-cell page. Consolidate testnet funding separately.',
  );
}

async function signerLock(signer: ccc.Signer): Promise<ccc.Script> {
  const lock = (await signer.getRecommendedAddressObj()).script;
  if (ccc.bytesFrom(lock.args).length > 20)
    throw Error('Operator lock exceeds the deployed contract limit');
  return lock;
}

async function fundedTransaction(
  client: ccc.Client,
  signer: ccc.Signer,
  inputs: OperatorCell[],
  outputs: ccc.CellOutputLike[],
  outputsData: string[],
  config: DirectProtocolConfig,
  options: { fund?: ccc.Cell; since?: bigint } = {},
): Promise<ccc.Transaction> {
  const lock = await signerLock(signer);
  const used = outputs.reduce((total, output) => total + ccc.numFrom(output.capacity ?? 0), 0n);
  const received = inputs.reduce((total, input) => total + input.cell.cellOutput.capacity, 0n);
  const reserveForChangeAndFee = 62n * CKB;
  const fund =
    options.fund ??
    (await funding(
      client,
      lock,
      (used > received ? used - received : 0n) + reserveForChangeAndFee,
    ));
  const change = fund.cellOutput.capacity + received - used;
  if (change < reserveForChangeAndFee)
    throw Error('Operator needs separate fee capacity and a valid change cell');
  const allInputs = [...inputs.map((input) => input.cell), fund];
  if (
    new Set(allInputs.map((cell) => `${cell.outPoint.txHash}:${cell.outPoint.index}`)).size !==
    allInputs.length
  )
    throw Error('Duplicate operator inputs');
  const tx = ccc.Transaction.from({
    inputs: allInputs.map((cell, index) => ({
      previousOutput: cell.outPoint,
      since: index === 0 ? (options.since ?? 0n) : 0n,
    })),
    outputs: [...outputs, { capacity: change, lock }],
    outputsData: [...outputsData, '0x'],
    cellDeps: config.codeDeps,
    headerDeps: [...new Set(inputs.map((input) => input.header.hash))],
  });
  const prepared = await signer.prepareTransaction(tx);
  const fee = prepared.estimateFee(1000n);
  prepared.outputs[prepared.outputs.length - 1].capacity -= fee;
  if (
    prepared.outputs[prepared.outputs.length - 1].capacity < 61n * CKB ||
    prepared.toBytes().length > 100_000
  )
    throw Error('Operator transaction exceeds fee or size bounds');
  return prepared;
}

function guarded(
  type: ccc.Script,
  capacity: bigint,
  config: DirectProtocolConfig,
): ccc.CellOutputLike {
  return {
    capacity,
    type,
    lock: { codeHash: config.guardHash, hashType: 'data2', args: type.hash() },
  };
}

export async function buildCreate(
  client: ccc.Client,
  signer: ccc.Signer,
  fixture: Match,
  now = Date.now(),
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
): Promise<{ tx: ccc.Transaction; record: DirectMarketRecord }> {
  const cutoff = Date.parse(fixture.kickoff);
  if (!Number.isSafeInteger(cutoff) || cutoff <= now + 120_000 || fixture.status !== 'scheduled')
    throw Error('Create only a scheduled API fixture at least two minutes before kickoff');
  const lock = await signerLock(signer);
  const fund = await funding(client, lock, 5n * RESERVE + 62n * CKB);
  const args = hex(
    Buffer.concat([
      Buffer.from(fund.outPoint.toBytes()),
      raw(lock.hash()),
      le(BigInt(cutoff)),
      raw(config.guardHash),
      raw(lock.hash()),
      raw(lock.hash()),
    ]),
  );
  const type = ccc.Script.from({ codeHash: config.protocolHash, hashType: 'data2', args });
  const tx = await fundedTransaction(
    client,
    signer,
    [],
    Array.from({ length: 5 }, () => guarded(type, RESERVE, config)),
    ['0x0000ff', ...Array.from({ length: 4 }, (_, index) => hex(Buffer.from([1, index, 0, 0])))],
    config,
    { fund },
  );
  return {
    tx,
    record: createRecord(
      fixture,
      { codeHash: type.codeHash, hashType: 'data2', args: type.args },
      tx.hash(),
      config,
    ),
  };
}

export async function buildReport(
  client: ccc.Client,
  signer: ccc.Signer,
  descriptor: DirectMarketRecord,
  evidence: ConfirmedFootballEvidence,
  now = Date.now(),
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
): Promise<ccc.Transaction> {
  validateRecord(descriptor, config);
  confirmFootballEvidence(
    parseFootballObservation(descriptor, evidence.previousObservation),
    parseFootballObservation(descriptor, evidence),
    now,
  );
  if (
    now < descriptor.cutoffMs ||
    now >= descriptor.terms.deadlineMs ||
    evidence.kickoffMs !== descriptor.cutoffMs ||
    evidence.providerFixtureId !== descriptor.terms.providerFixtureId ||
    now - evidence.observedAtMs > 60_000 ||
    evidence.observedAtMs > now ||
    ![0, 1, 2].includes(evidence.outcome)
  )
    throw Error('Cannot report stale, mismatched or out-of-window football evidence');
  const lock = await signerLock(signer);
  if (`0x${raw(descriptor.type.args).subarray(36, 68).toString('hex')}` !== lock.hash())
    throw Error('This signer is not the configured result reporter');
  const state = await loadOperatorMarket(client, descriptor, config);
  if (!state.market || state.market.cell.outputData !== '0x0000ff' || state.closed)
    throw Error('Market already reported or closed');
  return fundedTransaction(
    client,
    signer,
    [state.market],
    [guarded(ccc.Script.from(descriptor.type), state.market.cell.cellOutput.capacity, config)],
    [hex(Buffer.from([0, 1, evidence.outcome]))],
    config,
  );
}

interface Ticket {
  owner: string;
  outcome: number;
  principal: bigint;
  bytes: Buffer;
}
function parseShard(data: Buffer): { accepted: Ticket[]; pending?: Ticket } {
  if (
    data.length < 4 ||
    data[0] !== 1 ||
    data[1] > 3 ||
    data[3] > 1 ||
    data[2] + data[3] > 8 ||
    data.length !== 4 + 41 * (data[2] + data[3])
  )
    throw Error('Invalid deployed shard');
  const tickets: Ticket[] = [];
  for (let index = 0; index < data[2] + data[3]; index++) {
    const bytes = data.subarray(4 + index * 41, 45 + index * 41);
    const principal = bytes.readBigUInt64LE(33);
    if (bytes[32] > 2 || principal < 100n * CKB) throw Error('Invalid deployed ticket');
    tickets.push({ owner: hex(bytes.subarray(0, 32)), outcome: bytes[32], principal, bytes });
  }
  return {
    accepted: tickets.slice(0, data[2]),
    ...(data[3] ? { pending: tickets[tickets.length - 1] } : {}),
  };
}

export function fundedPayout(
  principal: bigint,
  selection: number,
  outcome: number,
  totals: bigint[],
): bigint {
  if (outcome === 255 || totals[outcome] === 0n) return STORAGE + principal;
  if (selection !== outcome) return STORAGE;
  const losing = totals.reduce((sum, value) => sum + value, 0n) - totals[outcome];
  return (
    STORAGE + principal + (principal * (losing - losing / 50n - losing / 100n)) / totals[outcome]
  );
}

async function recoverLock(
  client: ccc.Client,
  ownerHash: string,
  creationHash: string,
): Promise<ccc.Script> {
  const creation = await client.getTransactionNoCache(creationHash);
  if (
    creation?.status !== 'committed' ||
    creation.transaction.hash() !== creationHash ||
    creation.transaction.inputs.length > MAX_INPUTS
  )
    throw Error('Cannot recover owner lock from bounded committed transaction history');
  for (const input of creation.transaction.inputs) {
    const parent = await client.getTransactionNoCache(input.previousOutput.txHash);
    const output = parent?.transaction.outputs[Number(input.previousOutput.index)];
    if (
      parent?.status === 'committed' &&
      parent.transaction.hash() === input.previousOutput.txHash &&
      output?.lock.hash() === ownerHash
    )
      return output.lock;
  }
  throw Error('Owner lock preimage was not present in the authorized funding inputs');
}

export async function buildClose(
  client: ccc.Client,
  signer: ccc.Signer,
  descriptor: DirectMarketRecord,
  mode: 'settle' | 'void',
  now = Date.now(),
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
): Promise<ccc.Transaction> {
  const state = await loadOperatorMarket(client, descriptor, config);
  if (!state.market || state.closed || [0, 1, 2, 3].some((id) => !state.shards[id]))
    throw Error('Market is closed or its complete four-shard state is unavailable');
  const market = state.market;
  const marketBytes = raw(market.cell.outputData);
  const reportedAt = Number(market.header.timestamp);
  const eligibleReport =
    marketBytes[1] === 1 &&
    marketBytes[2] < 3 &&
    reportedAt >= descriptor.cutoffMs &&
    reportedAt < descriptor.terms.deadlineMs;
  if (mode === 'void' && eligibleReport)
    throw Error('A timely committed report must settle, even after the deadline');
  if (mode === 'settle' && !eligibleReport)
    throw Error('No eligible committed report. Wait for the six-hour timeout and use void.');
  if (!eligibleReport && now < descriptor.terms.deadlineMs)
    throw Error('The six-hour timeout has not elapsed');
  const outcome = eligibleReport ? marketBytes[2] : 255;
  const type = ccc.Script.from(descriptor.type);
  const tickets: Ticket[] = [],
    late: { ticket: Ticket; entry: OperatorCell }[] = [];
  const totals = [0n, 0n, 0n];
  let capacity = market.cell.cellOutput.capacity;
  for (const entry of state.shards) {
    capacity += entry.cell.cellOutput.capacity;
    const shard = parseShard(raw(entry.cell.outputData));
    tickets.push(...shard.accepted);
    if (shard.pending) {
      if (Number(entry.header.timestamp) < descriptor.cutoffMs) tickets.push(shard.pending);
      else late.push({ ticket: shard.pending, entry });
    }
  }
  for (const ticket of tickets) totals[ticket.outcome] += ticket.principal;
  const outputs: ccc.CellOutputLike[] = [guarded(type, 0n, config)];
  const data = [hex(Buffer.concat([Buffer.from([2, outcome]), ...totals.map(le), le(0n)]))];
  for (const [id, ticket] of tickets.entries()) {
    const value = fundedPayout(ticket.principal, ticket.outcome, outcome, totals);
    outputs.push(guarded(type, value, config));
    data.push(hex(Buffer.concat([Buffer.from([3, id]), ticket.bytes])));
    capacity -= value;
  }
  for (const { ticket, entry } of late) {
    const value = ticket.principal + STORAGE;
    outputs.push({
      capacity: value,
      lock: await recoverLock(client, ticket.owner, entry.cell.outPoint.txHash),
    });
    data.push('0x');
    capacity -= value;
  }
  const args = raw(descriptor.type.args);
  const losing =
    outcome === 255 || totals[outcome] === 0n
      ? 0n
      : totals.reduce((sum, value) => sum + value, 0n) - totals[outcome];
  if (losing > 0n) {
    for (const [offset, fee] of [
      [108, losing / 50n],
      [140, losing / 100n],
    ] as const) {
      const lock = await recoverLock(
        client,
        hex(args.subarray(offset, offset + 32)),
        descriptor.creationTxHash,
      );
      const value = 100n * CKB + fee;
      outputs.push({ capacity: value, lock });
      data.push('0x');
      capacity -= value;
    }
  }
  if (outcome === 255) {
    outputs.push({ capacity: 100n * CKB, lock: await signerLock(signer) });
    data.push('0x');
    capacity -= 100n * CKB;
  }
  if (capacity < RESERVE) throw Error('Closure would underfund the operator reserve');
  outputs[0].capacity = capacity;
  const since =
    outcome === 255
      ? 0x4000000000000000n | BigInt(Math.ceil(descriptor.terms.deadlineMs / 1000))
      : 0n;
  return fundedTransaction(client, signer, [market, ...state.shards], outputs, data, config, {
    since,
  });
}

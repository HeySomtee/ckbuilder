import assert from 'node:assert/strict';
import * as ccc from '@ckb-ccc/core';
import { readActivityMarket } from './modules/activity/chain';
import { fundedPayout } from './modules/direct/operator';
import {
  createRecord,
  LEGACY_DIRECT_CONFIG,
  PUBLIC_DIRECT_CONFIG,
  V3_DIRECT_CONFIG,
  V4_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
  type DirectMarketDescriptor,
  type DirectProtocolConfig,
} from './modules/direct/registry';
import type { Match } from './types';

// Entirely synthetic canonical chain. No network, keys, store or environment file.
const CKB = 100_000_000n,
  STORAGE = 321n * CKB,
  RESERVE = 610n * CKB;
const CUTOFF = 1_800_000_000_000;
const H = (digit: string) => `0x${digit.repeat(64)}`;
type Ticket = { owner: ccc.Script; principal: bigint; outcome: 0 | 1 | 2 };
const lock = (digit: string) =>
  ccc.Script.from({ codeHash: H('a'), hashType: 'type', args: `0x${digit.repeat(40)}` });
const operator = lock('1'),
  alice = lock('2'),
  bob = lock('3');
const hex = (bytes: Uint8Array) => ccc.hexFrom(bytes);
const pointKey = (value: ccc.OutPointLike) => ccc.OutPoint.from(value).toHex();
function encodedTicket(ticket: Ticket): Buffer {
  const principal = Buffer.alloc(8);
  principal.writeBigUInt64LE(ticket.principal);
  return Buffer.concat([
    Buffer.from(ticket.owner.hash().slice(2), 'hex'),
    Buffer.from([ticket.outcome]),
    principal,
  ]);
}
function shard(id: number, accepted: Ticket[] = [], pending?: Ticket): string {
  return hex(
    Buffer.concat([
      Buffer.from([1, id, accepted.length, pending ? 1 : 0]),
      ...accepted.map(encodedTicket),
      ...(pending ? [encodedTicket(pending)] : []),
    ]),
  );
}
function header(
  number: number,
  timestamp: number,
  hash: string = ccc.hashCkb(Buffer.from(`block-${number}`)),
) {
  return ccc.ClientBlockHeader.from({
    compactTarget: 0,
    dao: { c: 0, ar: 0, s: 0, u: 0 },
    epoch: [0, 0, 1],
    extraHash: H('0'),
    hash,
    nonce: 0,
    number,
    parentHash: H('0'),
    proposalsHash: H('0'),
    timestamp,
    transactionsRoot: H('0'),
    version: 0,
  });
}
function fixture(): Match {
  return {
    id: 'api-football-123',
    sport: 'football',
    date: '2027-01-15',
    kickoff: new Date(CUTOFF).toISOString(),
    status: 'scheduled',
    stage: 'Synthetic Activity evidence',
    home: { id: '1', name: 'Synthetic Home', code: 'H', flag: '' },
    away: { id: '2', name: 'Synthetic Away', code: 'A', flag: '' },
    oracle: { provider: 'api-football', fixtureId: '123', source: PROVIDER_ORIGIN },
  };
}
class Chain {
  readonly client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  readonly history = new Map<string, ccc.ClientTransactionResponse>();
  readonly headers = new Map<number, ccc.ClientBlockHeader>();
  readonly live = new Map<string, ccc.Cell>();
  hidden = new Set<string>();
  historyCalls = 0;
  reversed = false;
  private number = 0;
  constructor() {
    this.client.getTipHeader = async () => this.headers.get(this.number)!;
    this.client.getTransactionNoCache = async (hash) => {
      this.historyCalls++;
      return this.history.get(ccc.hexFrom(hash));
    };
    this.client.getHeaderByNumberNoCache = async (number) => {
      return this.headers.get(Number(ccc.numFrom(number)));
    };
    this.client.findCellsPagedNoCache = async (key) => ({
      cells: [...this.live.values()].filter((cell) => cell.cellOutput.type?.eq(key.script)),
      lastCursor: '0x',
    });
    this.client.getCellLiveNoCache = async (point) => this.live.get(pointKey(point));
    Object.defineProperty(this.client, 'findTransactionsByType', {
      value: async function* (this: Chain, type: ccc.ScriptLike) {
        const records = [...this.history].filter(
          ([hash, response]) =>
            !this.hidden.has(hash) &&
            (response.transaction.outputs.some((output) => output.type?.eq(type)) ||
              response.transaction.inputs.some((input) =>
                this.history
                  .get(input.previousOutput.txHash)
                  ?.transaction.outputs[Number(input.previousOutput.index)]?.type?.eq(type),
              )),
        );
        if (this.reversed) records.reverse();
        for (const [txHash, response] of records)
          yield { txHash, blockNumber: response.blockNumber, txIndex: 0n, cells: [] };
      }.bind(this),
    });
  }
  commit(tx: ccc.Transaction, timestamp: number) {
    const block = header(++this.number, timestamp);
    this.headers.set(this.number, block);
    this.history.set(
      tx.hash(),
      ccc.ClientTransactionResponse.from({
        transaction: tx,
        status: 'committed',
        blockHash: block.hash,
        blockNumber: block.number,
      }),
    );
    for (const input of tx.inputs) this.live.delete(pointKey(input.previousOutput));
    tx.outputs.forEach((output, index) => {
      const cell = ccc.Cell.from({
        cellOutput: output,
        outputData: tx.outputsData[index],
        outPoint: { txHash: tx.hash(), index },
      });
      this.live.set(pointKey(cell.outPoint), cell);
    });
    return tx;
  }
  cell(tx: ccc.Transaction, index: number) {
    return ccc.Cell.from({ ...tx.getOutput(index)!, outPoint: { txHash: tx.hash(), index } });
  }
  rollbackFrom(number: number) {
    for (const [hash, response] of this.history)
      if (Number(response.blockNumber) >= number) this.history.delete(hash);
    for (const height of this.headers.keys()) if (height >= number) this.headers.delete(height);
    this.number = number - 1;
    this.live.clear();
    for (const response of this.history.values()) {
      for (const input of response.transaction.inputs)
        this.live.delete(pointKey(input.previousOutput));
      response.transaction.outputs.forEach((_output, index) => {
        const cell = this.cell(response.transaction, index);
        this.live.set(pointKey(cell.outPoint), cell);
      });
    }
  }
}
function market(
  chain: Chain,
  config: DirectProtocolConfig = PUBLIC_DIRECT_CONFIG,
  first?: Ticket,
  timestamp = CUTOFF - 60_000,
  base = 0,
) {
  const input = ccc.OutPoint.from({ txHash: H('7'), index: 3 });
  const args = Buffer.alloc(172);
  if (config.protocolHash === V4_DIRECT_CONFIG.protocolHash) {
    Buffer.from(ccc.hashCkb(input.toBytes()).slice(2), 'hex').copy(args, 0);
    args.writeUInt32LE(base, 32);
  } else Buffer.from(input.toBytes()).copy(args, 0);
  Buffer.from(operator.hash().slice(2), 'hex').copy(args, 36);
  args.writeBigUInt64LE(BigInt(CUTOFF), 68);
  Buffer.from(config.guardHash.slice(2), 'hex').copy(args, 76);
  Buffer.from(operator.hash().slice(2), 'hex').copy(args, 108);
  Buffer.from(operator.hash().slice(2), 'hex').copy(args, 140);
  const type = { codeHash: config.protocolHash, hashType: 'data2' as const, args: hex(args) };
  const guarded = (capacity: bigint) => ({
    capacity,
    type,
    lock: {
      codeHash: config.guardHash,
      hashType: 'data2' as const,
      args: ccc.Script.from(type).hash(),
    },
  });
  const transaction = ccc.Transaction.from({
    inputs: [{ previousOutput: input }],
    outputs: [
      ...Array.from({ length: base }, () => ({ capacity: 100n * CKB, lock: operator })),
      guarded(RESERVE),
      ...Array.from({ length: 4 }, (_, id) =>
        guarded(RESERVE + (id === 0 && first ? first.principal + STORAGE : 0n)),
      ),
    ],
    outputsData: [
      ...Array.from({ length: base }, () => '0x'),
      '0x0000ff',
      ...Array.from({ length: 4 }, (_, id) => shard(id, [], id === 0 ? first : undefined)),
    ],
  });
  chain.commit(transaction, timestamp);
  const descriptor: DirectMarketDescriptor = {
    ...createRecord(fixture(), type, transaction.hash(), config),
    entryEnabled: true,
  };
  return { descriptor, transaction, guarded, base };
}
function deposit(
  chain: Chain,
  existing: ccc.Cell,
  item: Ticket,
  accepted: Ticket[],
  guarded: (capacity: bigint) => ccc.CellOutputLike,
  timestamp: number,
  late?: Ticket,
  offset = 0,
) {
  const tx = ccc.Transaction.from({
    inputs: [
      { previousOutput: existing.outPoint },
      { previousOutput: { txHash: H('8'), index: chain.history.size } },
    ],
    outputs: [
      ...Array.from({ length: offset }, () => ({ capacity: 100n * CKB, lock: operator })),
      guarded(
        RESERVE + [...accepted, item].reduce((sum, value) => sum + value.principal + STORAGE, 0n),
      ),
      ...(late ? [{ capacity: late.principal + STORAGE, lock: late.owner }] : []),
    ],
    outputsData: [
      ...Array.from({ length: offset }, () => '0x'),
      shard(0, accepted, item),
      ...(late ? ['0x'] : []),
    ],
  });
  return chain.commit(tx, timestamp);
}
function report(
  chain: Chain,
  existing: ccc.Cell,
  outcome: 0 | 1 | 2,
  guarded: (capacity: bigint) => ccc.CellOutputLike,
  timestamp = CUTOFF + 5000,
) {
  return chain.commit(
    ccc.Transaction.from({
      inputs: [{ previousOutput: existing.outPoint }],
      outputs: [guarded(RESERVE)],
      outputsData: [`0x0001${outcome.toString(16).padStart(2, '0')}`],
    }),
    timestamp,
  );
}
function close(
  chain: Chain,
  control: ccc.Cell,
  shards: ccc.Cell[],
  tickets: Ticket[],
  outcome: 0 | 1 | 2 | 255,
  guarded: (capacity: bigint) => ccc.CellOutputLike,
  late: Ticket[] = [],
  timestamp = CUTOFF + 10_000,
) {
  const totals = [0n, 0n, 0n];
  tickets.forEach((ticket) => {
    totals[ticket.outcome] += ticket.principal;
  });
  const reserve = Buffer.alloc(34);
  reserve[0] = 2;
  reserve[1] = outcome;
  totals.forEach((value, index) => reserve.writeBigUInt64LE(value, 2 + index * 8));
  const claims = tickets.map((ticket) =>
    fundedPayout(ticket.principal, ticket.outcome, outcome, totals),
  );
  const losing =
    outcome === 255 || totals[outcome] === 0n
      ? 0n
      : totals.reduce((sum, value) => sum + value, 0n) - totals[outcome];
  const feeOutputs = losing
    ? [100n * CKB + losing / 50n, 100n * CKB + losing / 100n]
    : outcome === 255
      ? [100n * CKB]
      : [];
  const reserveCapacity =
    [control, ...shards].reduce((sum, cell) => sum + cell.cellOutput.capacity, 0n) -
    claims.reduce((sum, value) => sum + value, 0n) -
    late.reduce((sum, ticket) => sum + ticket.principal + STORAGE, 0n) -
    feeOutputs.reduce((sum, value) => sum + value, 0n);
  const tx = ccc.Transaction.from({
    inputs: [control, ...shards].map((cell) => ({ previousOutput: cell.outPoint })),
    outputs: [
      guarded(reserveCapacity),
      ...claims.map(guarded),
      ...late.map((ticket) => ({ capacity: ticket.principal + STORAGE, lock: ticket.owner })),
      ...feeOutputs.map((capacity) => ({ capacity, lock: operator })),
    ],
    outputsData: [
      hex(reserve),
      ...tickets.map((ticket, index) =>
        hex(Buffer.concat([Buffer.from([3, index]), encodedTicket(ticket)])),
      ),
      ...late.map(() => '0x'),
      ...feeOutputs.map(() => '0x'),
    ],
  });
  return chain.commit(tx, timestamp);
}
function collect(chain: Chain, claim: ccc.Cell, owner: ccc.Script, timestamp: number) {
  return chain.commit(
    ccc.Transaction.from({
      inputs: [{ previousOutput: claim.outPoint }],
      outputs: [{ capacity: claim.cellOutput.capacity, lock: owner }],
      outputsData: ['0x'],
    }),
    timestamp,
  );
}
const home: Ticket = { owner: alice, outcome: 0, principal: 100n * CKB },
  away: Ticket = { owner: bob, outcome: 2, principal: 200n * CKB };
async function main() {
  for (const config of [
    LEGACY_DIRECT_CONFIG,
    PUBLIC_DIRECT_CONFIG,
    V3_DIRECT_CONFIG,
    V4_DIRECT_CONFIG,
  ]) {
    const chain = new Chain(),
      sponsored = config === V3_DIRECT_CONFIG || config === V4_DIRECT_CONFIG;
    const m = market(
      chain,
      config,
      sponsored ? home : undefined,
      CUTOFF - 60_000,
      config === V4_DIRECT_CONFIG ? 4 : 0,
    );
    const initial = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(Object.keys(initial.owners).length, sponsored ? 1 : 0);
    const depositTx = deposit(
      chain,
      chain.cell(m.transaction, m.base + 1),
      home,
      sponsored ? [home] : [],
      m.guarded,
      CUTOFF - 40_000,
      undefined,
      config === V4_DIRECT_CONFIG ? 2 : 0,
    );
    chain.reversed = true;
    const second = await readActivityMarket(chain.client, m.descriptor, initial);
    assert.equal(second.owners[alice.hash()].positions.length, sponsored ? 2 : 1);
    const stable = second.owners[alice.hash()].positions[0].id;
    const shardIndex = config === V4_DIRECT_CONFIG ? 2 : 0;
    const thirdTx = deposit(
      chain,
      chain.cell(depositTx, shardIndex),
      away,
      sponsored ? [home, home] : [home],
      m.guarded,
      CUTOFF - 20_000,
    );
    chain.historyCalls = 0;
    const third = await readActivityMarket(chain.client, m.descriptor, second);
    assert.equal(
      chain.historyCalls,
      chain.history.size,
      'all owners share one canonical transaction read per market',
    );
    assert.equal(third.owners[alice.hash()].positions[0].id, stable);
    assert.equal(third.owners[alice.hash()].positions[0].outPoint.txHash, thirdTx.hash());
    assert.equal(third.owners[alice.hash()].positions[0].status, 'accepted');
    assert.equal(third.owners[bob.hash()].positions[0].status, 'pending-validation');
    assert.equal(
      new Set(third.owners[alice.hash()].positions.map((position) => position.id)).size,
      sponsored ? 2 : 1,
    );
    const reported = report(chain, chain.cell(m.transaction, m.base), 0, m.guarded);
    const reporting = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(reporting.owners[alice.hash()].phase, 'reported');
    assert.equal(reporting.owners[alice.hash()].positions[0].status, 'accepted');
    const closed = close(
      chain,
      chain.cell(reported, 0),
      [
        chain.cell(thirdTx, 0),
        ...[2, 3, 4].map((index) => chain.cell(m.transaction, m.base + index)),
      ],
      sponsored ? [home, home, away] : [home, away],
      0,
      m.guarded,
    );
    const settled = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(settled.owners[alice.hash()].phase, 'settled');
    assert.equal(settled.owners[alice.hash()].positions[0].id, stable);
    assert.equal(settled.owners[alice.hash()].positions[0].status, 'claimable');
    assert.equal(settled.owners[bob.hash()].positions[0].entitlementShannons, STORAGE.toString());
    const claimed = collect(chain, chain.cell(closed, 1), alice, CUTOFF + 20_000);
    const collected = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(collected.owners[alice.hash()].positions[0].status, 'claimed');
    assert.equal(collected.owners[alice.hash()].positions[0].claimTransactionHash, claimed.hash());
    assert.equal(collected.owners[bob.hash()].positions[0].status, 'claimable');
    collect(chain, chain.cell(closed, 0), operator, CUTOFF + 30_000);
    const cleanup = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(cleanup.owners[alice.hash()].phase, 'settled');
    assert.equal(cleanup.owners[alice.hash()].positions[0].id, stable);
    console.log(
      `PASS ${config.protocolHash.slice(0, 10)} all-owner lineage, duplicate stakes, report, settlement, external claim and reserve cleanup`,
    );
  }
  {
    const chain = new Chain(),
      m = market(chain, V4_DIRECT_CONFIG, home, CUTOFF, 3);
    const first = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(first.owners[alice.hash()].positions[0].status, 'refund-required');
    const late = deposit(
      chain,
      chain.cell(m.transaction, 4),
      away,
      [],
      m.guarded,
      CUTOFF + 1000,
      home,
      2,
    );
    const refunded = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(refunded.owners[alice.hash()].positions[0].status, 'refunded');
    assert.equal(
      refunded.owners[alice.hash()].positions[0].id,
      first.owners[alice.hash()].positions[0].id,
    );
    assert.deepEqual(refunded.owners[alice.hash()].positions[0].outPoint, {
      txHash: late.hash(),
      index: 3,
    });
    assert.equal(refunded.owners[bob.hash()].positions[0].status, 'refund-required');
    close(
      chain,
      chain.cell(m.transaction, 3),
      [chain.cell(late, 2), ...[5, 6, 7].map((index) => chain.cell(m.transaction, index))],
      [],
      255,
      m.guarded,
      [away],
      CUTOFF + 21_600_001,
    );
    const final = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(final.owners[bob.hash()].positions[0].status, 'refunded');
    assert.equal(final.owners[bob.hash()].phase, 'voided');
    console.log(
      'PASS cutoff equality, atomic offset refund, late closure refund and retained stable deposit IDs',
    );
  }
  {
    const chain = new Chain(),
      m = market(chain, V3_DIRECT_CONFIG, home);
    const initial = await readActivityMarket(chain.client, m.descriptor);
    const late = deposit(
      chain,
      chain.cell(m.transaction, 1),
      away,
      [home],
      m.guarded,
      CUTOFF - 1000,
    );
    chain.hidden.add(late.hash());
    await assert.rejects(
      () => readActivityMarket(chain.client, m.descriptor, initial),
      /live market set differs/,
    );
    assert.equal(initial.owners[alice.hash()].positions[0].status, 'pending-validation');
    chain.hidden.clear();
    const block = chain.headers.get(1)!;
    chain.headers.set(1, header(1, Number(block.timestamp), H('e')));
    await assert.rejects(
      () => readActivityMarket(chain.client, m.descriptor, initial),
      /no longer canonical/,
    );
    console.log(
      'PASS missed indexer updates and canonical reorg preserve caller-owned prior evidence by failing closed',
    );
  }
  {
    const chain = new Chain(),
      m = market(chain, V3_DIRECT_CONFIG, home);
    const reported = report(chain, chain.cell(m.transaction, 0), 1, m.guarded);
    const closed = close(
      chain,
      chain.cell(reported, 0),
      [1, 2, 3, 4].map((index) => chain.cell(m.transaction, index)),
      [home],
      1,
      m.guarded,
    );
    const empty = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(empty.owners[alice.hash()].settlement?.emptyWinner, true);
    assert.equal(
      empty.owners[alice.hash()].positions[0].entitlementShannons,
      (STORAGE + home.principal).toString(),
    );
    collect(chain, chain.cell(closed, 1), bob, CUTOFF + 30_000);
    await assert.rejects(
      () => readActivityMarket(chain.client, m.descriptor),
      /owner payment output/,
    );
    console.log(
      'PASS empty winning pool refund calculation and rejection of redirected claim evidence',
    );
  }
  {
    const chain = new Chain(),
      m = market(chain, V3_DIRECT_CONFIG, home);
    const initial = await readActivityMarket(chain.client, m.descriptor);
    const reported = report(chain, chain.cell(m.transaction, 0), 0, m.guarded);
    close(
      chain,
      chain.cell(reported, 0),
      [1, 2, 3, 4].map((index) => chain.cell(m.transaction, index)),
      [home],
      2,
      m.guarded,
    );
    await assert.rejects(
      () => readActivityMarket(chain.client, m.descriptor, initial),
      /closure result/,
    );
    console.log('PASS mismatched settlement evidence cannot become claimable');
  }
  {
    const chain = new Chain(),
      m = market(chain);
    deposit(chain, chain.cell(m.transaction, 1), home, [], m.guarded, CUTOFF - 1000);
    const before = await readActivityMarket(chain.client, m.descriptor);
    assert.equal(before.owners[alice.hash()].positions.length, 1);
    chain.rollbackFrom(2);
    const after = await readActivityMarket(chain.client, m.descriptor, before);
    assert.deepEqual(after.owners, {});
    assert.equal(
      before.owners[alice.hash()].positions.length,
      1,
      'successful replay does not mutate a retained previous snapshot',
    );
    const old = chain.headers.get(1)!;
    chain.client.getCellLiveNoCache = async (point) => {
      chain.headers.set(1, header(1, Number(old.timestamp), H('f')));
      return chain.live.get(pointKey(point));
    };
    await assert.rejects(
      () => readActivityMarket(chain.client, m.descriptor, after),
      /canonical chain changed during projection/,
    );
    console.log(
      'PASS canonical rollback removes orphaned owner rows and a mid-read reorg cannot publish a mixed snapshot',
    );
  }
  {
    const chain = new Chain(),
      m = market(chain);
    let current = chain.cell(m.transaction, 1);
    const accepted: Ticket[] = [];
    for (let index = 0; index < 6; index++) {
      const tx = deposit(chain, current, home, [...accepted], m.guarded, CUTOFF - 10_000 + index);
      current = chain.cell(tx, 0);
      accepted.push(home);
    }
    let active = 0,
      calls = 0,
      maximum = 0;
    chain.client.getTransactionNoCache = async (hash) => {
      const index = ++calls;
      active++;
      maximum = Math.max(maximum, active);
      try {
        if (index === 1) throw Error('Synthetic interrupted RPC');
        await new Promise((done) => setTimeout(done, 20));
        return chain.history.get(ccc.hexFrom(hash));
      } finally {
        active--;
      }
    };
    await assert.rejects(
      () => readActivityMarket(chain.client, m.descriptor),
      /Synthetic interrupted RPC/,
    );
    assert.equal(active, 0, 'all already-started reads drain before a retry can begin');
    assert.ok(calls <= 4, 'a failed worker stops scheduling the remaining history');
    assert.ok(maximum <= 4, 'RPC concurrency stays bounded');
    console.log(
      'PASS failed concurrent reads drain in-flight work and never continue scanning the remaining history',
    );
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

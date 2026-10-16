import assert from 'node:assert/strict';
import test from 'node:test';
import { ccc } from '@ckb-ccc/core';
import {
  CKB,
  STORAGE,
  MANIFEST,
  GUARD_HASH,
  PROTOCOL_HASH,
  parseManifest,
  parseDescriptor,
  descriptorTermsHash,
  decode,
  checkCell,
  assertSameTerms,
} from './src/features/direct/protocol.ts';
import { parseRecord } from './src/features/direct/journal.ts';
import {
  DirectClient,
  assertSignedIntent,
  createDevnetDirectClient,
} from './src/features/direct/client.ts';
import { confirmedHeader, loadMarket, discoverMarket } from './src/features/direct/discovery.ts';

const hash = (c) => `0x${c.repeat(64)}`;
const owner = ccc.Script.from({
  codeHash: hash('1'),
  hashType: 'type',
  args: `0x${'23'.repeat(20)}`,
});
const address = ccc.Address.fromScript(owner, new ccc.ClientPublicTestnet()).toString();
async function descriptor() {
  const args = new Uint8Array(172),
    cutoffMs = 1_800_000_000_000;
  args.set(ccc.bytesFrom(GUARD_HASH), 76);
  new DataView(args.buffer).setBigUint64(68, BigInt(cutoffMs), true);
  const d = {
    id: 'direct-fixture-1',
    fixtureId: 'fixture-1',
    label: 'Home v Away',
    cutoffMs,
    creationTxHash: hash('2'),
    type: { codeHash: PROTOCOL_HASH, hashType: 'data2', args: ccc.hexFrom(args) },
    terms: {
      provider: 'football',
      providerFixtureId: '123',
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + 21_600_000,
    },
    entryEnabled: true,
  };
  return parseDescriptor({ ...d, termsHash: await descriptorTermsHash(d) });
}
function ticketData(tag = 3) {
  const data = new Uint8Array(tag === 3 ? 43 : 45),
    at = tag === 3 ? 2 : 4;
  if (tag === 3) data.set([3, 0]);
  else data.set([1, 0, 0, 1]);
  data.set(ccc.bytesFrom(owner.hash()), at);
  data[at + 32] = 1;
  new DataView(data.buffer).setBigUint64(at + 33, 100n * CKB, true);
  return ccc.hexFrom(data);
}
function transaction() {
  return ccc.Transaction.from({
    inputs: [
      { previousOutput: { txHash: hash('3'), index: 0 } },
      { previousOutput: { txHash: hash('4'), index: 0 } },
    ],
    outputs: [{ capacity: 421n * CKB, lock: owner }],
    outputsData: ['0x'],
    witnesses: ['0x01', '0x'],
  });
}
async function setup() {
  const d = await descriptor(),
    tx = transaction(),
    records = new Map(),
    calls = [];
  const rpc = {
    url: 'https://testnet.ckb.dev/',
    addressPrefix: 'ckt',
    getTransactionNoCache: async () => undefined,
    getHeaderByNumberNoCache: async () => undefined,
    getTipHeader: async () => ({ number: 5n }),
    getCellLiveNoCache: async () => ({ live: true }),
    getBalanceSingle: async (script) => {
      assert.ok(script.eq(owner));
      return 999n * CKB;
    },
    sendTransaction: async (signed) => {
      calls.push(signed.toHex());
      return signed.hash();
    },
  };
  const signer = { client: rpc, getRecommendedAddress: async () => address };
  const journal = {
    list: async (scope) => [...records.values()].filter((r) => r.scope === scope),
    put: async (record) => {
      records.set(record.hash, await parseRecord(record));
    },
  };
  const client = new DirectClient(signer, MANIFEST, 'wallet', journal),
    identity = await client.identity();
  const record = await parseRecord({
    version: 'testnet-v1',
    scope: identity.scope,
    ownerHash: owner.hash(),
    kind: 'claim',
    descriptor: d,
    hash: tx.hash(),
    signedBytes: tx.toHex(),
    inputs: tx.inputs.map((i) => ({
      txHash: i.previousOutput.txHash,
      index: Number(i.previousOutput.index),
    })),
    createdAt: 1_700_000_000_000,
    status: 'signed',
    principalShannons: (100n * CKB).toString(),
    storageShannons: STORAGE.toString(),
    feeShannons: '1000',
    payoutShannons: (421n * CKB).toString(),
    shard: null,
    outcome: 1,
  });
  return { d, tx, rpc, signer, client, journal, records, record, calls };
}

test('Pinned deployment, cutoff bytes and exact catalogue identity reject replacement data', async () => {
  assert.equal(parseManifest(structuredClone(MANIFEST)), MANIFEST);
  assert.throws(() => parseManifest({ ...MANIFEST, rpc: 'https://attacker.invalid' }));
  assert.throws(() => parseManifest({ ...MANIFEST, codeDeps: MANIFEST.codeDeps.toReversed() }));
  const d = await descriptor();
  await assert.rejects(parseDescriptor({ ...d, label: 'Different match' }), /integrity/);
  await assert.rejects(parseDescriptor({ ...d, cutoffMs: d.cutoffMs + 1 }), /cutoff/);
  await assert.rejects(
    parseDescriptor({ ...d, terms: { ...d.terms, rules: 'extra-time' } }),
    /settlement terms/,
  );
  assert.throws(() => assertSameTerms(d, { ...d, fixtureId: 'different' }), /terms changed/);
  assert.ok(Object.isFrozen(d) && Object.isFrozen(d.terms));
});
test('Strict cell decoding bounds positions and conserves exact recoverable storage', async () => {
  const d = await descriptor(),
    type = ccc.Script.from(d.type),
    lock = { codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() };
  assert.equal(decode(ticketData()).ticket.principal, 100n * CKB);
  assert.equal(decode(ticketData(1)).pending.outcome, 1);
  for (const malformed of ['0x0000ff00', '0x0001ff', '0x01000900', '0x01000002', '0x03'])
    assert.throws(() => decode(malformed));
  const cell = ccc.Cell.from({
    outPoint: { txHash: hash('a'), index: 0 },
    cellOutput: { capacity: (610n + 421n) * CKB, lock, type },
    outputData: ticketData(1),
  });
  assert.equal(checkCell(cell, d).kind, 'shard');
  cell.cellOutput.capacity -= 1n;
  assert.throws(() => checkCell(cell, d), /capacity/);
});
test('Wallet signing may add witnesses but cannot change amounts, recipients, inputs or dependencies', () => {
  const tx = transaction(),
    signed = tx.clone();
  signed.witnesses[0] = '0x123456';
  assert.doesNotThrow(() => assertSignedIntent(tx, signed));
  for (const mutate of [
    (t) => {
      t.outputs[0].capacity -= 1n;
    },
    (t) => {
      t.outputs[0].lock.args = '0x';
    },
    (t) => {
      t.inputs[1].previousOutput.index = 1n;
    },
    (t) => {
      t.cellDeps.push(
        ccc.CellDep.from({ outPoint: { txHash: hash('5'), index: 0 }, depType: 'code' }),
      );
    },
  ]) {
    const altered = tx.clone();
    mutate(altered);
    assert.throws(() => assertSignedIntent(tx, altered), /changed/);
  }
});
test('Saved signed bytes and outpoints are integrity checked before recovery', async () => {
  const { record } = await setup();
  await assert.rejects(parseRecord({ ...record, hash: hash('a') }), /integrity/);
  await assert.rejects(
    parseRecord({ ...record, inputs: record.inputs.toReversed() }),
    /inputs changed/,
  );
  await assert.rejects(
    parseRecord({ ...record, signedBytes: '0x' + '00'.repeat(100001) }),
    /invalid/,
  );
});
test('Available balance reads only plain empty owner cells, and wallet changes invalidate the client', async () => {
  const { client, signer } = await setup();
  assert.equal(await client.balance(), 999n * CKB);
  const transport = new ccc.ClientPublicTestnet();
  transport.getCellsCapacity = async (key) => {
    assert.equal(key.scriptSearchMode, 'exact');
    assert.equal(key.scriptType, 'lock');
    assert.ok(ccc.Script.from(key.script).eq(owner));
    assert.deepEqual(key.filter, { scriptLenRange: [0, 1], outputDataLenRange: [0, 1] });
    return 9n;
  };
  assert.equal(await transport.getBalanceSingle(owner), 9n);
  signer.getRecommendedAddress = async () =>
    ccc.Address.fromScript(
      { ...owner, args: `0x${'24'.repeat(20)}` },
      new ccc.ClientPublicTestnet(),
    ).toString();
  await assert.rejects(client.identity(), /wallet changed/);
});
test('An absent transaction stays unknown even with live inputs and exact retries require durable bytes', async () => {
  const { client, record, journal, calls, rpc } = await setup();
  await assert.rejects(client.broadcast(record), /saved before broadcast/);
  await journal.put(record);
  assert.equal((await client.recover(record)).status, 'unknown');
  rpc.sendTransaction = async (tx) => {
    calls.push(tx.toHex());
    throw Error('Response lost after send');
  };
  const result = await client.broadcast(record);
  assert.equal(result.status, 'unknown');
  assert.equal(calls.length, 1);
  assert.equal(calls[0], record.signedBytes);
  await client.broadcast(result.record);
  assert.equal(calls[1], record.signedBytes);
});
test('Recovery never converts spent unknown inputs or stale cached confirmations into success', async () => {
  const { client, record, rpc, tx } = await setup();
  rpc.getCellLiveNoCache = async () => undefined;
  assert.equal((await client.recover(record)).status, 'conflict');
  rpc.getTransactionNoCache = async () => ({
    transaction: tx,
    status: 'committed',
    blockHash: hash('a'),
    blockNumber: 3n,
  });
  rpc.getHeaderByNumberNoCache = async () => ({ hash: hash('b'), number: 3n });
  assert.equal(await confirmedHeader(rpc, record.hash), undefined);
  assert.equal((await client.recover(record)).status, 'reorg');
  rpc.getHeaderByNumberNoCache = async () => ({ hash: hash('a'), number: 3n });
  const confirmed = await client.recover(record);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.confirmations, 3);
  rpc.getTransactionNoCache = async () => undefined;
  assert.equal((await client.recover(confirmed.record)).status, 'reorg');
});
test('A reorg can retry only the same signed transaction when every original input is live', async () => {
  const { client, record, journal, rpc, calls } = await setup();
  const orphan = { ...record, blockHash: hash('a'), blockNumber: '2', status: 'committed' };
  await journal.put(orphan);
  await client.broadcast(orphan);
  assert.equal(calls.length, 1);
  assert.equal(calls[0], record.signedBytes);
  rpc.getCellLiveNoCache = async () => undefined;
  await client.broadcast(orphan);
  assert.equal(calls.length, 1);
});
test('Recovery storage failure prevents broadcast and devnet replacement is never accepted remotely', async () => {
  const { signer, record, calls } = await setup();
  const client = new DirectClient(signer, MANIFEST, 'wallet', {
    list: async () => {
      throw Error('Disk unavailable');
    },
    put: async () => {},
  });
  await assert.rejects(client.broadcast(record), /Disk unavailable/);
  assert.equal(calls.length, 0);
  await assert.rejects(
    createDevnetDirectClient(signer, [], 'wallet', { list: async () => [], put: async () => {} }),
    /isolated loopback/,
  );
});

test('External operator settlement discovery bypasses stale CCC cells and uses actual creation headers', async () => {
  const d = await descriptor(),
    type = ccc.Script.from(d.type),
    lock = ccc.Script.from({ codeHash: GUARD_HASH, hashType: 'data2', args: type.hash() });
  const creation = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: hash('0'), index: 0 } }],
    outputs: Array.from({ length: 5 }, () => ({ capacity: 610n * CKB, lock, type })),
    outputsData: ['0x0000ff', '0x01000000', '0x01010000', '0x01020000', '0x01030000'],
  });
  const fixture = await parseDescriptor({ ...d, creationTxHash: creation.hash() });
  const pendingTx = ccc.Transaction.from({
    inputs: [{ previousOutput: { txHash: creation.hash(), index: 1 } }],
    outputs: [{ capacity: 1031n * CKB, lock, type }],
    outputsData: [ticketData(1)],
  });
  let live = creation.outputs.map((_, index) =>
    ccc.Cell.from({ ...creation.getOutput(index), outPoint: { txHash: creation.hash(), index } }),
  );
  live[1] = ccc.Cell.from({
    ...pendingTx.getOutput(0),
    outPoint: { txHash: pendingTx.hash(), index: 0 },
  });
  const blockHash = hash('f');
  let timestamp = BigInt(d.cutoffMs - 1),
    pages = 0;
  const rpc = {
    getTransactionNoCache: async (txHash) => ({
      transaction: txHash === creation.hash() ? creation : pendingTx,
      status: 'committed',
      blockHash,
      blockNumber: 2n,
    }),
    getHeaderByNumberNoCache: async () => ({ hash: blockHash, number: 2n, timestamp }),
    findCellsPagedNoCache: async (key) => {
      assert.equal(key.scriptSearchMode, 'exact');
      pages++;
      return { cells: live, lastCursor: '0x' };
    },
    getCellLiveNoCache: async (p) => live.find((c) => c.outPoint.eq(p)),
    findCellsByType: () => {
      throw Error('Stale cached generator must not be used');
    },
    findTransactionsByType: async function* () {},
  };
  assert.equal((await loadMarket(rpc, fixture)).length, 5);
  assert.equal(
    (await discoverMarket(rpc, fixture, owner.hash())).positions[0].status,
    'pending-validation',
  );
  timestamp = BigInt(d.cutoffMs);
  assert.equal(
    (await discoverMarket(rpc, fixture, owner.hash())).positions[0].status,
    'refund-required',
  );
  const claim = ccc.Cell.from({
    outPoint: { txHash: hash('b'), index: 1 },
    cellOutput: { capacity: STORAGE, lock, type },
    outputData: ticketData(),
  });
  live = [claim];
  const discovered = await discoverMarket(rpc, fixture, owner.hash());
  assert.equal(discovered.positions[0].status, 'claimable');
  assert.equal(discovered.positions[0].entitlementShannons, STORAGE.toString());
  assert.equal(discovered.phase, 'unknown');
  assert.match(discovered.uncertainty, /history/);
  assert.equal(pages, 4);
  let inspected = 0;
  rpc.findTransactionsByType = async function* () {
    for (let i = 0; i < 1000; i++) {
      inspected++;
      yield { txHash: hash('c') };
    }
  };
  const bounded = await discoverMarket(rpc, fixture, owner.hash());
  assert.equal(inspected, 97);
  assert.match(bounded.uncertainty, /bounded index/);
});

test('An explicit canonical conflicting spend releases a claim reservation only while its proof remains confirmed', async () => {
  const { client, journal, record, rpc } = await setup();
  await journal.put(record);
  const spender = transaction();
  spender.inputs[0].previousOutput.txHash = hash('d');
  spender.outputs[0].capacity = 100n * CKB;
  rpc.getTransactionNoCache = async (hashValue) =>
    hashValue === spender.hash()
      ? { transaction: spender, status: 'committed', blockHash: hash('a'), blockNumber: 3n }
      : undefined;
  rpc.getHeaderByNumberNoCache = async () => ({ hash: hash('a'), number: 3n });
  rpc.getTipHeader = async () => ({ number: 4n });
  await assert.rejects(client.resolveConflict(record, spender.hash()), /three canonical/);
  rpc.getTipHeader = async () => ({ number: 5n });
  const resolved = await client.resolveConflict(record, spender.hash());
  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.record.signedBytes, record.signedBytes);
  assert.equal(resolved.record.conflictProof.hash, spender.hash());
  // A polling callback holding the pre-resolution object must use the newer proof.
  assert.equal((await client.recover(record)).status, 'resolved');
  rpc.getHeaderByNumberNoCache = async () => ({ hash: hash('b'), number: 3n });
  assert.equal((await client.recover(record)).status, 'reorg');
  await assert.rejects(client.resolveConflict(record, hash('c')), /three canonical/);
});

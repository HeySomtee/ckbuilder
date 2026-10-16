'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const ccc = require('@ckb-ccc/core');
const { FileClaimJournal, readRecovery, runClaim } = require('../scripts/direct-claim.cjs');

const hash = (value) => `0x${value.repeat(64)}`;
async function fixture() {
  const protocol = await import('../web/src/features/direct/protocol.ts');
  const { parseRecord } = await import('../web/src/features/direct/journal.ts');
  const lock = ccc.Script.from({
    codeHash: hash('1'),
    hashType: 'type',
    args: `0x${'23'.repeat(20)}`,
  });
  const bytes = Buffer.alloc(172),
    cutoffMs = 1_800_000_000_000;
  bytes.writeBigUInt64LE(BigInt(cutoffMs), 68);
  Buffer.from(protocol.GUARD_HASH.slice(2), 'hex').copy(bytes, 76);
  const row = {
    id: 'direct-123',
    fixtureId: 'api-football-123',
    label: 'Isolated recovery test',
    cutoffMs,
    creationTxHash: hash('2'),
    type: {
      codeHash: protocol.PROTOCOL_HASH,
      hashType: 'data2',
      args: `0x${bytes.toString('hex')}`,
    },
    terms: {
      provider: 'football',
      providerFixtureId: '123',
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + 21_600_000,
    },
    entryEnabled: false,
  };
  const descriptor = await protocol.parseDescriptor({
    ...row,
    termsHash: await protocol.descriptorTermsHash(row),
  });
  const tx = ccc.Transaction.from({
    inputs: [
      { previousOutput: { txHash: hash('3'), index: 0 } },
      { previousOutput: { txHash: hash('4'), index: 0 } },
    ],
    outputs: [{ capacity: 421n * protocol.CKB, lock }],
    outputsData: ['0x'],
    witnesses: ['0x01', '0x'],
  });
  const record = await parseRecord({
    version: 'testnet-v1',
    scope: `testnet-v1:${lock.hash()}:test`,
    ownerHash: lock.hash(),
    kind: 'claim',
    descriptor,
    hash: tx.hash(),
    signedBytes: tx.toHex(),
    inputs: tx.inputs.map((input) => ({
      txHash: input.previousOutput.txHash,
      index: Number(input.previousOutput.index),
    })),
    createdAt: 1_700_000_000_000,
    status: 'signed',
    principalShannons: (100n * protocol.CKB).toString(),
    storageShannons: protocol.STORAGE.toString(),
    feeShannons: '1000',
    payoutShannons: (421n * protocol.CKB).toString(),
    shard: null,
    outcome: 1,
  });
  const bundle = {
    format: 'streak-direct-recovery-v1',
    network: 'testnet',
    manifest: protocol.MANIFEST,
    ownerHash: lock.hash(),
    markets: [descriptor],
    records: [record],
  };
  return { protocol, parseRecord, descriptor, tx, record, bundle };
}
function temporary() {
  const directory = fs.mkdtempSync(path.join(tmpdir(), 'streak-claim-'));
  return {
    directory,
    cleanup() {
      const target = path.resolve(directory);
      assert.equal(path.dirname(target), path.resolve(tmpdir()));
      assert(path.basename(target).startsWith('streak-claim-'));
      fs.rmSync(target, { recursive: true, force: true });
    },
  };
}

test('standalone recovery journal keeps immutable signed data and restores observations after restart', async () => {
  const temp = temporary();
  try {
    const { record, parseRecord } = await fixture();
    const journal = new FileClaimJournal(temp.directory, parseRecord);
    await journal.put(record);
    const initial = fs.readFileSync(
      path.join(temp.directory, `${record.hash.slice(2)}.signed.json`),
      'utf8',
    );
    await journal.put({ ...record, status: 'unknown' });
    assert.equal(
      (await new FileClaimJournal(temp.directory, parseRecord).list(record.scope))[0].status,
      'unknown',
    );
    assert.equal(
      fs.readFileSync(path.join(temp.directory, `${record.hash.slice(2)}.signed.json`), 'utf8'),
      initial,
    );
    assert.deepEqual(await journal.list('another-scope'), []);
    await assert.rejects(journal.put({ ...record, scope: 'another-scope' }), /Cannot replace/);
    await assert.rejects(journal.put({ ...record, principalShannons: '999' }), /Cannot replace/);
    let release;
    const held = journal.exclusive(
      () =>
        new Promise((done) => {
          release = done;
        }),
    );
    await assert.rejects(
      new FileClaimJournal(temp.directory, parseRecord).exclusive(async () => {}),
      /locked/,
    );
    release();
    await held;
    await journal.exclusive(async () => {});
    const current = path.join(temp.directory, `${record.hash.slice(2)}.state.json`);
    fs.writeFileSync(current, JSON.stringify({ ...record, ownerHash: hash('9') }));
    await assert.rejects(journal.list(record.scope), /immutable/);
  } finally {
    temp.cleanup();
  }
});

test('recovery import pins deployment, owner, immutable fixture mapping and transaction identity', async () => {
  const temp = temporary();
  try {
    const { bundle, record, descriptor } = await fixture();
    const filename = path.join(temp.directory, 'recovery.json');
    const save = (value) => fs.writeFileSync(filename, JSON.stringify(value));
    save(bundle);
    assert.equal((await readRecovery(filename)).records[0].signedBytes, record.signedBytes);
    save({ ...bundle, markets: [] });
    assert.equal(
      (await readRecovery(filename)).markets[0].id,
      descriptor.id,
      'saved signed records preserve fixture recovery when the API catalogue is unavailable',
    );
    for (const invalid of [
      { ...bundle, network: 'mainnet' },
      { ...bundle, manifest: { ...bundle.manifest, rpc: 'https://untrusted.invalid' } },
      { ...bundle, ownerHash: hash('9') },
      { ...bundle, records: [record, record] },
      { ...bundle, records: [{ ...record, hash: hash('9') }] },
      { ...bundle, markets: [{ ...descriptor, creationTxHash: hash('9') }] },
    ]) {
      save(invalid);
      await assert.rejects(readRecovery(filename));
    }
  } finally {
    temp.cleanup();
  }
});

test('public recovery CLI never executes from the isolated routine test environment', async () => {
  assert.equal(process.env.NODE_ENV, 'test');
  await assert.rejects(runClaim(['anything.json', 'status']), /forbidden in routine tests/);
});

test('standalone conflict resolution persists only a canonical spend proof and revokes it on reorg', async () => {
  const temp = temporary();
  try {
    const { record, tx, protocol, parseRecord } = await fixture();
    const { DirectClient } = await import('../web/src/features/direct/client.ts');
    const journal = new FileClaimJournal(temp.directory, parseRecord);
    await journal.put(record);
    const immutable = fs.readFileSync(
      path.join(temp.directory, `${record.hash.slice(2)}.signed.json`),
      'utf8',
    );
    const competing = tx.clone();
    competing.outputs[0].capacity -= 1n;
    let canonical = true,
      depth = 3n;
    const rpc = {
      url: protocol.RPC,
      addressPrefix: 'ckt',
      getTransactionNoCache: async (requested) =>
        requested === competing.hash()
          ? { status: 'committed', transaction: competing, blockHash: hash('5'), blockNumber: 10n }
          : undefined,
      getHeaderByNumberNoCache: async () => ({ hash: canonical ? hash('5') : hash('6') }),
      getTipHeader: async () => ({ number: 10n + depth - 1n }),
    };
    const owner = tx.outputs[0].lock;
    const signer = {
      client: rpc,
      getRecommendedAddress: async () =>
        ccc.Address.fromScript(owner, new ccc.ClientPublicTestnet()).toString(),
    };
    const client = new DirectClient(signer, protocol.MANIFEST, 'test', journal);
    await assert.rejects(client.resolveConflict(record, hash('7')), /does not prove/);
    depth = 2n;
    await assert.rejects(client.resolveConflict(record, competing.hash()), /three canonical/);
    depth = 3n;
    const result = await client.resolveConflict(record, competing.hash());
    assert.equal(result.status, 'resolved');
    assert.equal((await journal.list(record.scope))[0].conflictProof.hash, competing.hash());
    assert.equal(
      fs.readFileSync(path.join(temp.directory, `${record.hash.slice(2)}.signed.json`), 'utf8'),
      immutable,
    );
    canonical = false;
    const changed = await client.recover(result.record);
    assert.equal(changed.status, 'reorg');
    assert.equal((await journal.list(record.scope))[0].status, 'unknown');
  } finally {
    temp.cleanup();
  }
});

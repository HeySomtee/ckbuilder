import assert from 'node:assert/strict';
import test from 'node:test';
import { ccc } from '@ckb-ccc/core';
import { sponsoredChain } from '../scripts/sponsored-browser-fixture.mjs';
import { SponsoredClient } from './src/features/direct/sponsored-client.ts';
import {
  parseSponsoredRecord,
  assertSponsorSigned,
} from './src/features/direct/sponsored-journal.ts';
import { parseReservation, reservationReleased } from './src/features/direct/reservations.ts';

async function fixture() {
  let now = Date.now();
  const chain = await sponsoredChain(now + 7_200_000),
    rpc = new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] });
  rpc.getCellLiveNoCache = async (point) => {
    const value = await chain.rpc('cell', [point]);
    return value ? ccc.Cell.from(value) : undefined;
  };
  rpc.getCell = async (point) => {
    const value = await chain.rpc('historicalCell', [point]);
    return value ? ccc.Cell.from(value) : undefined;
  };
  rpc.getTipHeader = async () => {
    const value = await chain.rpc('tip', []);
    return { ...value, number: BigInt(value.number), timestamp: BigInt(value.timestamp) };
  };
  rpc.getHeaderByNumberNoCache = async () => {
    const value = await chain.rpc('header', []);
    return { ...value, number: BigInt(value.number), timestamp: BigInt(value.timestamp) };
  };
  rpc.getTransactionNoCache = async (hash) => {
    const value = await chain.rpc('transaction', [hash]);
    return value ? ccc.ClientTransactionResponse.from(value) : undefined;
  };
  rpc.findCells = async function* () {
    for (const value of await chain.rpc('cells', ['lock'])) yield ccc.Cell.from(value);
  };
  const signer = new ccc.SignerCkbPrivateKey(rpc, '0x' + '11'.repeat(32));
  const records = new Map();
  const journal = {
    list: async (scope) => [...records.values()].filter((record) => record.scope === scope),
    put: async (record) => {
      records.set(record.hash, await parseSponsoredRecord(record));
    },
  };
  const transport = {
    offer: (request) => chain.prepare(request),
    submit: (request) => chain.submit(request),
    status: async () => chain.status(),
  };
  const client = new SponsoredClient(signer, transport, journal, {
    now: () => now,
    exclusive: async (_name, action) => action(),
  });
  return {
    chain,
    rpc,
    signer,
    journal,
    transport,
    client,
    records,
    advance: (ms) => {
      now += ms;
    },
  };
}
const alter = (offer, mutate) => {
  const tx = ccc.Transaction.fromBytes(offer.unsignedBytes);
  mutate(tx);
  return {
    ...offer,
    rawHash: tx.hash(),
    unsignedBytes: tx.toHex(),
    descriptor: { ...offer.descriptor, creationTxHash: tx.hash() },
  };
};
test('First prediction independently verifies contributor economics, position, code deps and unsigned groups', async () => {
  for (const mutate of [
    (tx) => {
      tx.outputs[5].capacity -= 1n;
      tx.outputs[6].capacity += 1n;
    },
    (tx) => {
      const data = ccc.bytesFrom(tx.outputsData[1]);
      data[36] = 2;
      tx.outputsData[1] = ccc.hexFrom(data);
    },
    (tx) => {
      tx.outputs[6].lock.args = '0x' + '33'.repeat(20);
    },
    (tx) => {
      tx.cellDeps.reverse();
    },
    (tx) => {
      tx.witnesses[0] = ccc.WitnessArgs.from({ lock: '0x' + '01'.repeat(65) }).toHex();
    },
  ]) {
    const setup = await fixture();
    setup.transport.offer = async (request) => alter(await setup.chain.prepare(request), mutate);
    await assert.rejects(setup.client.prepare(setup.chain.fixture, 0, 10000000000n));
    assert.equal(setup.records.size, 0);
    assert.equal(setup.chain.submissions.length, 0);
  }
});
test('Review and signing freeze raw transaction; sponsor may alter only its own witness', async () => {
  const setup = await fixture(),
    review = await setup.client.prepare(setup.chain.fixture, 1, 12500000001n);
  assert.equal(
    BigInt(review.totalShannons),
    12500000001n + 32100000000n + BigInt(review.feeShannons),
  );
  assert.equal(review.sponsorReserveShannons, '305000000000');
  const record = await setup.client.signAndPersist(review, setup.chain.fixture);
  const partial = ccc.Transaction.fromBytes(record.ownerSignedBytes),
    final = partial.clone();
  final.witnesses[0] = ccc.WitnessArgs.from({ lock: '0x' + '01'.repeat(65) }).toHex();
  assert.doesNotThrow(() => assertSponsorSigned(partial, final));
  final.witnesses[1] = final.witnesses[0];
  assert.throws(() => assertSponsorSigned(partial, final), /your signature/);
  await assert.rejects(setup.client.signAndPersist(review, setup.chain.fixture), /review changed/);
});
test('Only a never-submitted expired signature can be explicitly discarded', async () => {
  const setup = await fixture(),
    review = await setup.client.prepare(setup.chain.fixture, 0, 10000000000n);
  const record = await setup.client.signAndPersist(review, setup.chain.fixture);
  await assert.rejects(setup.client.discardUnsubmitted(record), /Only an expired/);
  setup.advance(100000);
  await assert.rejects(setup.client.submit(record), /never shared/);
  assert.equal(setup.chain.submissions.length, 0);
  const retired = await setup.client.discardUnsubmitted(record);
  assert.equal(retired.status, 'discarded');
  assert.equal(retired.record.ownerSignedBytes, record.ownerSignedBytes);
  assert.equal(await reservationReleased(setup.rpc, parseReservation(retired.record)), true);
  await setup.client.submit(retired.record);
  assert.equal(setup.chain.submissions.length, 0);
});
test('A lost submission response preserves a durable attempted boundary and original partial bytes', async () => {
  const setup = await fixture(),
    review = await setup.client.prepare(setup.chain.fixture, 2, 10000000000n);
  const record = await setup.client.signAndPersist(review, setup.chain.fixture);
  const initial = setup.transport.submit;
  setup.transport.submit = async (request) => {
    const saved = setup.records.get(record.hash);
    assert.ok(saved.submissionAttemptedAt);
    assert.equal(saved.status, 'submitting');
    assert.equal(saved.ownerSignedBytes, request.userSignedBytes);
    return initial(request);
  };
  const unknown = await setup.client.submit(record);
  assert.equal(unknown.status, 'awaiting-sponsor');
  setup.advance(100000);
  await assert.rejects(setup.client.discardUnsubmitted(unknown.record), /never submitted/);
  await assert.rejects(
    setup.client.prepare(setup.chain.fixture, 1, 10000000000n),
    /already has a signed/,
  );
  const confirmed = await setup.client.submit(unknown.record);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(setup.chain.submissions.length, 2);
  assert.deepEqual(setup.chain.submissions[0], setup.chain.submissions[1]);
});
test('Ordinary pending inputs remain reserved against sponsored funding', async () => {
  const setup = await fixture();
  const all = await setup.chain.rpc('cells', ['lock']);
  setup.journal.otherReservations = async () => [
    {
      hash: '0x' + 'ff'.repeat(32),
      fixtureId: 'another-fixture',
      inputs: all.map((cell) => cell.outPoint),
    },
  ];
  await assert.rejects(
    setup.client.prepare(setup.chain.fixture, 0, 10000000000n),
    /Insufficient unreserved/,
  );
  assert.equal(setup.chain.submissions.length, 0);
});

test('The exact canonical original supersedes an orphaned conflict checkpoint', async () => {
  const setup = await fixture(),
    review = await setup.client.prepare(setup.chain.fixture, 2, 10000000000n);
  const record = await setup.client.signAndPersist(review, setup.chain.fixture);
  await setup.client.submit(record);
  const confirmed = await setup.client.submit(record);
  const oldProof = {
    hash: '0x' + 'aa'.repeat(32),
    blockHash: '0x' + 'bb'.repeat(32),
    blockNumber: '2',
  };
  await setup.journal.put({ ...confirmed.record, status: 'resolved', conflictProof: oldProof });
  const recovered = await setup.client.recover(record);
  assert.equal(recovered.status, 'confirmed');
  assert.equal(recovered.record.ownerSignedBytes, record.ownerSignedBytes);
  assert.equal(recovered.record.finalSignedBytes, confirmed.record.finalSignedBytes);
  assert.deepEqual(
    recovered.record.conflictProof,
    oldProof,
    'Proof remains audit data, not authority over the canonical original.',
  );
  await assert.rejects(
    setup.client.resolveConflict(recovered.record, oldProof.hash),
    /original transaction is committed/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ccc } from '@ckb-ccc/core';
import { batchChain, batchOwnerKey, attachBatchRpc } from '../scripts/batch-browser-fixture.mjs';
import { BatchClient } from './src/features/direct/batch-client.ts';
import { parseBatchRecord } from './src/features/direct/batch-journal.ts';
import { parseBatchOffer } from './src/features/direct/batch-protocol.ts';
import { parseReservation, reservationReleased } from './src/features/direct/reservations.ts';
import { CKB, BATCH_MANIFEST, pointKey } from './src/features/direct/protocol.ts';

async function setup() {
  let now = Date.now();
  const chain = await batchChain(now + 7_200_000),
    rpc = attachBatchRpc(
      new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] }),
      chain.rpc,
    );
  const signer = new ccc.SignerCkbPrivateKey(rpc, batchOwnerKey),
    records = new Map(),
    others = [];
  const journal = {
    list: async (scope) => [...records.values()].filter((record) => record.scope === scope),
    put: async (record) => records.set(record.hash, await parseBatchRecord(record)),
    otherReservations: async () => others,
  };
  const transport = {
    offer: chain.prepare,
    submit: chain.submit,
    status: chain.status,
    resume: chain.finish,
    resolve: chain.status,
  };
  const client = new BatchClient(signer, transport, journal, {
    now: () => now,
    exclusive: async (_name, action) => action(),
  });
  return {
    chain,
    rpc,
    signer,
    client,
    records,
    others,
    journal,
    transport,
    advance: (ms) => {
      now += ms;
    },
  };
}
const picks = (fixtures, count = 2) =>
  fixtures.slice(0, count).map((fixture, index) => ({
    fixture,
    outcome: index % 3,
    principal: BigInt(100 + index) * CKB,
  }));
function alter(offer, change) {
  const tx = ccc.Transaction.fromBytes(offer.unsignedBytes);
  change(tx);
  const value = structuredClone(offer);
  value.rawHash = tx.hash();
  value.unsignedBytes = tx.toHex();
  value.lines.forEach((line) => {
    if (line.mode === 'create') line.descriptor.creationTxHash = tx.hash();
  });
  value.descriptor = value.lines[0].descriptor;
  return value;
}
test('All eight independent predictions have exact participant contributions and one signed transaction', async () => {
  const s = await setup(),
    review = await s.client.prepare(picks(s.chain.fixtures(), 8));
  assert.equal(review.offer.lines.length, 8);
  assert.equal(review.storageShannons, (8n * 321n * CKB).toString());
  assert.equal(review.sponsorReserveShannons, (8n * 3050n * CKB).toString());
  assert.equal(
    BigInt(review.totalShannons),
    BigInt(review.principalShannons) + 8n * 321n * CKB + BigInt(review.feeShannons),
  );
  const record = await s.client.signAndPersist(review, s.chain.fixtures());
  assert.deepEqual(
    parseReservation(record).fixtureIds,
    s.chain.fixtures().map((fixture) => fixture.fixtureId),
  );
  const submitted = await s.client.submit(record);
  assert.equal(submitted.status, 'confirmed');
  assert.equal(s.chain.submissions.length, 1);
  assert.equal(record.hash, submitted.record.hash);
  assert.equal(submitted.record.ownerSignedBytes, record.ownerSignedBytes);
  assert.equal(
    new Set(submitted.record.descriptors.map((descriptor) => descriptor.creationTxHash)).size,
    1,
  );
  assert.equal(
    new Set(submitted.record.descriptors.map((descriptor) => descriptor.type.args)).size,
    8,
  );
  await assert.rejects(s.client.signAndPersist(review, s.chain.fixtures()), /review changed/);
});
test('Mixed funded and new markets parse 172-byte types, preserve pending ticket admission and sponsor only new reserves', async () => {
  const s = await setup();
  const first = await s.client.prepare(picks(s.chain.fixtures(), 1));
  await s.client.submit(await s.client.signAndPersist(first, s.chain.fixtures()));
  const review = await s.client.prepare(picks(s.chain.fixtures(), 2));
  assert.deepEqual(
    review.offer.lines.map((line) => line.mode),
    ['deposit', 'create'],
  );
  assert.equal(review.sponsorReserveShannons, (3050n * CKB).toString());
  const typed = review.offer.inputs.find((input) => input.type);
  assert.equal(ccc.bytesFrom(typed.type.args).length, 172);
  const parsed = await parseBatchOffer(review.offer);
  assert.equal(parsed.inputs.at(-1).type.codeHash, BATCH_MANIFEST.protocolHash);
  const tx = ccc.Transaction.fromBytes(parsed.unsignedBytes);
  assert.equal(ccc.bytesFrom(tx.outputsData[0])[2], 1);
  assert.equal(ccc.bytesFrom(tx.outputsData[0])[3], 1);
  assert.equal(
    (await s.client.submit(await s.client.signAndPersist(review, s.chain.fixtures()))).status,
    'confirmed',
  );
});
test('Independent verification rejects altered money, ticket, genesis, dependencies, headers, foreign input and witnesses', async () => {
  const mutations = [
    (tx) => {
      tx.outputs.at(-2).capacity -= 1n;
      tx.outputs.at(-1).capacity += 1n;
    },
    (tx) => {
      const data = ccc.bytesFrom(tx.outputsData[6]);
      data[36] = 2;
      tx.outputsData[6] = ccc.hexFrom(data);
    },
    (tx) => {
      tx.outputs.at(-1).lock.args = '0x' + '33'.repeat(20);
    },
    (tx) => {
      tx.outputs[5].type.args = tx.outputs[0].type.args;
    },
    (tx) => tx.cellDeps.reverse(),
    (tx) => tx.headerDeps.push('0x' + '5'.repeat(64)),
    (tx) => {
      tx.inputs[1].previousOutput.index += 1n;
    },
    (tx) => {
      tx.witnesses[0] = ccc.WitnessArgs.from({ lock: '0x' + '01'.repeat(65) }).toHex();
    },
  ];
  for (const mutation of mutations) {
    const s = await setup();
    s.transport.offer = async (request) => alter(await s.chain.prepare(request), mutation);
    await assert.rejects(s.client.prepare(picks(s.chain.fixtures())));
    assert.equal(s.records.size, 0);
    assert.equal(s.chain.submissions.length, 0);
  }
});
test('A changed later line, spent shard or stale quote invalidates the complete reviewed slip before signing', async () => {
  for (const scenario of ['fixture', 'spent', 'expiry']) {
    const s = await setup(),
      review = await s.client.prepare(picks(s.chain.fixtures()));
    let prompts = 0;
    const sign = s.signer.signTransaction.bind(s.signer);
    s.signer.signTransaction = async (tx) => {
      prompts++;
      return sign(tx);
    };
    const fixtures = structuredClone(s.chain.fixtures());
    if (scenario === 'fixture') fixtures[1].state = 'unavailable';
    if (scenario === 'spent') s.chain.live.delete(pointKey(review.offer.inputs[1].outPoint));
    if (scenario === 'expiry') s.advance(60_001);
    await assert.rejects(s.client.signAndPersist(review, fixtures));
    assert.equal(prompts, 0);
    assert.equal(s.records.size, 0);
  }
});
test('Later-line reservations block duplicate payment across versions, without blocking disjoint fixtures', async () => {
  const s = await setup(),
    review = await s.client.prepare(picks(s.chain.fixtures())),
    record = await s.client.signAndPersist(review, s.chain.fixtures());
  await assert.rejects(
    s.client.prepare(picks([s.chain.fixtures()[1]], 1)),
    /already has a signed payment/,
  );
  s.records.clear();
  s.others.push(parseReservation(record));
  await assert.rejects(
    s.client.prepare(picks([s.chain.fixtures()[1]], 1)),
    /already has a signed payment/,
  );
  const disjoint = await s.client.prepare(picks([s.chain.fixtures()[2]], 1));
  assert.ok(
    disjoint.offer.inputs
      .slice(1)
      .every((input) => !record.inputs.some((old) => pointKey(old) === pointKey(input.outPoint))),
  );
});
test('Lost submit response keeps exact partial durable, reserves every line and resumes without a second wallet signature', async () => {
  const s = await setup(),
    review = await s.client.prepare(picks(s.chain.fixtures())),
    record = await s.client.signAndPersist(review, s.chain.fixtures());
  s.chain.loseResponse = true;
  const submit = s.transport.submit;
  s.transport.submit = async (request) => {
    const saved = s.records.get(request.rawHash);
    assert.ok(saved.submissionAttemptedAt);
    assert.equal(saved.ownerSignedBytes, request.userSignedBytes);
    return submit(request);
  };
  const first = await s.client.submit(record);
  assert.equal(first.status, 'awaiting-sponsor');
  assert.ok(first.record.submissionAttemptedAt);
  await assert.rejects(s.client.discardUnsubmitted(first.record), /Only an expired/);
  s.signer.signTransaction = async () => {
    throw Error('Recovery must never sign again');
  };
  const recovered = await s.client.submit(await parseBatchRecord(structuredClone(first.record)));
  assert.equal(recovered.status, 'confirmed');
  assert.equal(s.chain.submissions.length, 2);
  assert.equal(s.chain.submissions[0].userSignedBytes, s.chain.submissions[1].userSignedBytes);
});
test('Only explicitly unshared expired signatures can release batch reservations', async () => {
  const s = await setup(),
    review = await s.client.prepare(picks(s.chain.fixtures())),
    record = await s.client.signAndPersist(review, s.chain.fixtures());
  s.advance(100_000);
  const result = await s.client.discardUnsubmitted(record);
  assert.equal(result.status, 'discarded');
  assert.equal(await reservationReleased(s.rpc, parseReservation(result.record)), true);
  assert.equal(result.record.ownerSignedBytes, record.ownerSignedBytes);
  assert.equal(s.chain.submissions.length, 0);
});
test('Recovery draft metadata must exactly match every reviewed line and is frozen before the wallet prompt', async () => {
  const s = await setup(),
    review = await s.client.prepare(picks(s.chain.fixtures()));
  const source = review.offer.lines.map((line, index) => ({
    lineId: `source-${index}`,
    marketId: line.fixture.fixtureId,
    matchId: line.fixture.fixtureId,
    outcome: ['home', 'draw', 'away'][line.outcome],
    amountCkb: String(100 + index),
  }));
  let prompts = 0;
  const sign = s.signer.signTransaction.bind(s.signer);
  s.signer.signTransaction = async (tx) => {
    prompts++;
    return sign(tx);
  };
  await assert.rejects(
    s.client.signAndPersist(
      review,
      s.chain.fixtures(),
      source.map((pick, index) => (index ? { ...pick, amountCkb: '200' } : pick)),
    ),
    /draft lines differ/,
  );
  assert.equal(prompts, 0);
  const record = await s.client.signAndPersist(review, s.chain.fixtures(), source);
  assert.equal(prompts, 1);
  source[0].amountCkb = '900';
  assert.equal(record.sourcePicks[0].amountCkb, '100');
  assert.deepEqual(
    (await parseBatchRecord(structuredClone(record))).sourcePicks,
    record.sourcePicks,
  );
  await assert.rejects(
    parseBatchRecord({ ...record, sourcePicks: record.sourcePicks.slice(1) }),
    /draft lines differ/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ccc } from '@ckb-ccc/core';
import { batchChain, batchOwnerKey, attachBatchRpc } from '../scripts/batch-browser-fixture.mjs';
import { BatchClient } from './src/features/direct/batch-client.ts';
import { parseBatchRecord } from './src/features/direct/batch-journal.ts';
import { parseBatchOffer } from './src/features/direct/batch-protocol.ts';
import { parseReservation, reservationReleased } from './src/features/direct/reservations.ts';
import { CKB, BATCH_MANIFEST, pointKey } from './src/features/direct/protocol.ts';

async function setup(options = {}) {
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
    resolve: async (identity) => ({ ...chain.status(identity), state: 'cancelled' }),
  };
  const client = new BatchClient(signer, transport, journal, {
    now: () => now,
    exclusive: async (_name, action) => action(),
    ...options,
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

test('Leaving during delayed wallet preparation releases unsigned metadata and private offer', async () => {
  const s = await setup();
  const controller = new AbortController();
  const released = [],
    cancelled = [];
  s.transport.release = async (identity) => {
    released.push(identity);
    return true;
  };
  s.transport.cancelReview = async (requestId) => {
    cancelled.push(requestId);
  };
  const prepareTransaction = s.signer.prepareTransaction.bind(s.signer);
  s.signer.prepareTransaction = async (tx) => {
    const prepared = await prepareTransaction(tx);
    controller.abort();
    return prepared;
  };
  await assert.rejects(
    s.client.prepare(picks(s.chain.fixtures(), 1), undefined, {
      signal: controller.signal,
      beforeAttempt() {},
      onWait() {},
    }),
    { name: 'AbortError' },
  );
  assert.equal(released.length, 1);
  assert.equal(cancelled.length, 1);
  assert.match(cancelled[0], /^[0-9a-f-]{36}$/);
  assert.equal((await s.client.history()).length, 0, 'no signed payment exists');
});
test('Competition selection freezes before async review and signed journal preserves it', async () => {
  const s = await setup();
  const requested = picks(s.chain.fixtures(), 1);
  const selection = {
    accountId: 'alice',
    lines: [{ fixtureId: requested[0].fixture.fixtureId, campaignIds: ['cup'] }],
  };
  const prepare = s.transport.offer;
  let sent;
  s.transport.offer = async (request) => {
    sent = structuredClone(request.competitionSelection);
    selection.lines[0].campaignIds = [];
    return prepare(request);
  };
  const review = await s.client.prepare(requested, selection);
  assert.deepEqual(sent.lines[0].campaignIds, ['cup']);
  const source = [
    {
      lineId: 'line',
      marketId: 'market',
      matchId: requested[0].fixture.fixtureId,
      outcome: 'home',
      amountCkb: '100',
      competition: { accountId: 'alice', ids: [] },
    },
  ];
  await assert.rejects(
    s.client.signAndPersist(review, s.chain.fixtures(), source),
    /Competition choices changed/,
  );
  source[0].competition.ids = ['cup'];
  const record = await s.client.signAndPersist(review, s.chain.fixtures(), source);
  assert.deepEqual(record.sourcePicks[0].competition.ids, ['cup']);
});

test('Rejected wallet and failed post-offer validation release unsigned competition reviews', async () => {
  const s = await setup(),
    released = [];
  s.transport.release = async (identity) => {
    released.push(identity);
    return true;
  };
  const review = await s.client.prepare(picks(s.chain.fixtures(), 1));
  s.signer.signTransaction = async () => {
    throw Error('Synthetic wallet rejection');
  };
  await assert.rejects(s.client.signAndPersist(review, s.chain.fixtures()), /wallet rejection/);
  await s.client.releaseReview(review);
  assert.equal(released[0].rawHash, review.hash);
  s.signer.prepareTransaction = async () => {
    throw Error('Synthetic preparation failed');
  };
  await assert.rejects(s.client.prepare(picks(s.chain.fixtures(), 1)), /preparation failed/);
  assert.equal(released.length, 2);
});
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

test('Background recovery queues behind submission and retains the same saved signature', async () => {
  let tail = Promise.resolve();
  const exclusive = (_name, action) => {
    const run = tail.then(action);
    tail = run.catch(() => {});
    return run;
  };
  const s = await setup({ exclusive });
  const review = await s.client.prepare(picks(s.chain.fixtures()));
  const record = await s.client.signAndPersist(review, s.chain.fixtures());
  let release, started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const submit = s.transport.submit;
  s.transport.submit = async (request) => {
    started();
    await gate;
    return submit(request);
  };
  const sending = s.client.submit(record);
  await waiting;
  let recovered = false;
  const recovery = s.client.recover(record).then((value) => {
    recovered = true;
    return value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recovered, false, 'Background journal writes wait for the submission lock.');
  release();
  const results = await Promise.all([sending, recovery]);
  assert.ok(results.every((value) => value.status === 'confirmed'));
  const saved = s.records.get(record.hash);
  assert.equal(saved.ownerSignedBytes, record.ownerSignedBytes);
  assert.ok(saved.finalSignedBytes);
  assert.ok(saved.submissionAttemptedAt);
  assert.equal(s.chain.submissions.length, 1);
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

test('Independent market reads overlap while every later signing pass rechecks live inputs', async () => {
  const s = await setup();
  const first = await s.client.prepare(picks(s.chain.fixtures(), 3));
  await s.client.submit(await s.client.signAndPersist(first, s.chain.fixtures()));
  const read = s.rpc.getCellLiveNoCache.bind(s.rpc);
  let active = 0,
    maximum = 0,
    reads = 0;
  s.rpc.getCellLiveNoCache = async (...args) => {
    reads++;
    maximum = Math.max(maximum, ++active);
    try {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return await read(...args);
    } finally {
      active--;
    }
  };
  const review = await s.client.prepare(picks(s.chain.fixtures(), 3));
  assert.ok(maximum >= 2 && maximum <= 8, `bounded parallel reads observed: ${maximum}`);
  assert.equal(active, 0);
  const previousReads = reads;
  await s.client.signAndPersist(review, s.chain.fixtures());
  assert.ok(
    reads > previousReads,
    'Signing performs fresh reads rather than reusing review-time liveness',
  );
});

test('Operator conflict hints require independent canonical proof and restore reservations on reorg', async () => {
  for (const mode of ['valid', 'unrelated', 'shallow']) {
    const s = await setup();
    const review = await s.client.prepare(picks(s.chain.fixtures(), 1));
    const record = await s.client.signAndPersist(review, s.chain.fixtures());
    const conflict = ccc.Transaction.fromBytes(record.ownerSignedBytes);
    conflict.outputs.at(-1).capacity -= 1n;
    if (mode === 'unrelated')
      conflict.inputs.forEach((input, index) => {
        input.previousOutput = ccc.OutPoint.from({ txHash: '0x' + '99'.repeat(32), index });
      });
    s.chain.commit(conflict);
    s.transport.status = async (identity) => ({
      ...s.chain.status(identity),
      state: 'cancelled',
      conflictHash: conflict.hash(),
    });
    if (mode === 'shallow') {
      const tip = s.rpc.getTipHeader.bind(s.rpc);
      s.rpc.getTipHeader = async () => ({ ...(await tip()), number: 4n });
    }
    const result = await s.client.recover(record);
    if (mode === 'valid') {
      assert.equal(result.status, 'resolved');
      assert.equal(result.record.conflictProof.hash, conflict.hash());
      s.chain.transactions.delete(conflict.hash());
      assert.equal((await s.client.recover(result.record)).status, 'reorg');
    } else {
      assert.notEqual(result.status, 'resolved');
      assert.equal(result.record.conflictProof, undefined);
    }
    assert.equal(s.chain.submissions.length, 0, 'Recovery does not send a replacement payment');
  }
});
test('Expired unsigned offers discover a spent sponsor input without another signature or broadcast', async () => {
  for (const state of ['expired', 'cancelled']) {
    const s = await setup();
    const review = await s.client.prepare(picks(s.chain.fixtures(), 1));
    const record = await s.client.signAndPersist(review, s.chain.fixtures());
    const conflict = ccc.Transaction.fromBytes(record.ownerSignedBytes);
    conflict.outputs.at(-1).capacity -= 1n;
    s.chain.commit(conflict);
    s.transport.status = async (identity) => ({ ...s.chain.status(identity), state });
    let searches = 0,
      resolutions = 0;
    s.transport.resolve = async (identity) => {
      resolutions++;
      assert.equal(identity.offerId, record.offer.offerId);
      assert.equal(identity.rawHash, record.hash);
      assert.equal(identity.conflictingTxHash, conflict.hash());
      return { ...s.chain.status(identity), state: 'cancelled', unsignedCancellation: true };
    };
    s.rpc.findTransactionsPaged = async (search, order, limit) => {
      searches++;
      assert.ok(ccc.Script.from(search.script).eq(record.offer.sponsorLock));
      assert.deepEqual(search.filter.blockRange, [2n, 11n]);
      assert.equal(order, 'asc');
      assert.equal(limit, 32);
      return {
        transactions: [
          ...Array.from({ length: 8 }, (_, i) => ({
            isInput: true,
            txHash: '0x9999' + i.toString(16).padStart(60, '0'),
          })),
          { isInput: true, txHash: conflict.hash() },
        ],
        lastCursor: '0x',
      };
    };
    const result = await s.client.recover(record);
    assert.equal(result.status, 'resolved');
    assert.equal(searches, 1);
    assert.equal(
      resolutions,
      1,
      'The operator acknowledges recovery before local reservations are released',
    );
    assert.equal(result.record.conflictProof.hash, conflict.hash());
    assert.equal(s.chain.submissions.length, 0);
    s.chain.transactions.delete(conflict.hash());
    assert.equal((await s.client.recover(result.record)).status, 'reorg');
  }
});

test('A missing operator recovery acknowledgement keeps the original reservation until retry succeeds', async () => {
  const s = await setup();
  const review = await s.client.prepare(picks(s.chain.fixtures(), 1));
  const record = await s.client.signAndPersist(review, s.chain.fixtures());
  const conflict = ccc.Transaction.fromBytes(record.ownerSignedBytes);
  conflict.outputs.at(-1).capacity -= 1n;
  s.chain.commit(conflict);
  s.transport.status = async (identity) => ({
    ...s.chain.status(identity),
    state: 'cancelled',
    conflictHash: conflict.hash(),
  });
  s.transport.resolve = async () => {
    throw Error('Synthetic unavailable operator');
  };
  assert.equal((await s.client.recover(record)).status, 'conflict');
  assert.equal(s.records.get(record.hash).conflictProof, undefined);
  s.transport.resolve = async (identity) => s.chain.status(identity);
  assert.equal(
    (await s.client.recover(record)).status,
    'conflict',
    'An unexpected response state is not recovery acknowledgement',
  );
  s.transport.resolve = async (identity) => ({ ...s.chain.status(identity), state: 'cancelled' });
  assert.equal((await s.client.recover(record)).status, 'resolved');
  assert.equal(s.chain.submissions.length, 0);
});

test('Unproven expired-offer history is bounded, throttled and never releases reservations', async () => {
  const s = await setup();
  const review = await s.client.prepare(picks(s.chain.fixtures(), 1));
  const record = await s.client.signAndPersist(review, s.chain.fixtures());
  s.chain.live.delete(pointKey(record.offer.sponsorInput));
  s.transport.status = async (identity) => ({ ...s.chain.status(identity), state: 'expired' });
  let searches = 0,
    candidateReads = 0;
  const read = s.rpc.getTransactionNoCache.bind(s.rpc);
  s.rpc.getTransactionNoCache = async (hash) => {
    if (hash.startsWith('0x9999')) candidateReads++;
    return read(hash);
  };
  s.rpc.findTransactionsPaged = async () => {
    searches++;
    return {
      transactions: Array.from({ length: 32 }, (_, i) => ({
        isInput: true,
        txHash: '0x9999' + i.toString(16).padStart(60, '0'),
      })),
      lastCursor: '0x',
    };
  };
  assert.equal((await s.client.recover(record)).status, 'conflict');
  assert.equal((await s.client.recover(record)).status, 'conflict');
  assert.equal(searches, 1);
  assert.equal(candidateReads, 32);
  assert.equal(s.records.get(record.hash).conflictProof, undefined);
  s.advance(60_001);
  assert.equal((await s.client.recover(record)).status, 'conflict');
  assert.equal(searches, 2);
  assert.equal(candidateReads, 64);
  assert.equal(s.chain.submissions.length, 0);
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

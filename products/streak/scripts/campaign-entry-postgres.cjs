/* Synthetic competition intent tests. Called only inside the disposable PG schema. */
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { ccc } = require('@ckb-ccc/core');
const { PgCampaignStorage } = require('../dist/modules/campaigns/storage');
const {
  newCampaign,
  publishCampaign,
  joinCampaign,
  reconcileCampaign,
  summary,
} = require('../dist/modules/campaigns/domain');
const hex = (n) => `0x${n.toString(16).padStart(64, '0')}`;

module.exports = async function entryPaymentsJourney(pool) {
  const databaseNow = async () =>
    (await pool.query('SELECT clock_timestamp() AS now')).rows[0].now.getTime();
  const waitForDatabaseTime = async (deadline) => {
    await pool.query(
      'SELECT pg_sleep(GREATEST(0, $1::double precision / 1000 - extract(epoch from clock_timestamp())) + 0.05)',
      [deadline],
    );
    assert.ok((await databaseNow()) >= deadline, 'database clock crossed the tested boundary');
  };
  const store = new PgCampaignStorage(pool),
    payments = store.entryPayments;
  const ownerLock = { codeHash: hex(7), hashType: 'type', args: '0x' + '11'.repeat(20) };
  const actor = {
    id: 'explicit-user',
    name: 'Synthetic player',
    wallet: 'synthetic',
    ownerHash: ccc.Script.from(ownerLock).hash(),
  };
  const admin = { ...actor, id: 'explicit-admin' };
  let serial = 100;
  const fixture = (id, deadline) => ({
    fixtureId: id,
    marketId: `market-${id}`,
    marketKey: `canonical-${id}`,
    home: 'Synthetic Home',
    away: 'Synthetic Away',
    league: 'Local',
    kickoffAt: new Date(deadline + 1000).toISOString(),
    cutoffAt: new Date(deadline).toISOString(),
    capacity: 32,
    occupied: 0,
    updatedAt: null,
  });
  async function campaign(id, deadline = Date.now() + 60000) {
    const draft = {
      name: id,
      description: 'Isolated entry intent test',
      kind: 'predictions',
      registrationClosesAt: new Date(deadline).toISOString(),
      fixtureIds: ['fixture-1', 'fixture-2'],
      fiveRoundId: null,
      prizes: [{ place: 1, amountShannons: '10000000000', usdReference: '' }],
      rehearsal: true,
    };
    await store.create(id, admin.id, (now) => newCampaign(id, admin, draft, now));
    return store.change(
      id,
      (value, now) => {
        publishCampaign(
          value,
          { fixtures: draft.fixtureIds.map((f) => fixture(f, deadline)), gameweeks: [] },
          now,
        );
        joinCampaign(value, actor, value.termsHash, now);
      },
      { actorId: admin.id, action: 'synthetic-publish-and-join' },
    );
  }
  function offer(fixtureId = 'fixture-1', expiresAt = Date.now() + 60000, mode = 'create') {
    const tx = ccc.Transaction.from({
      inputs: [{ previousOutput: { txHash: hex(serial++), index: 0 } }],
      outputs: [
        { capacity: 10000000000n, lock: ownerLock },
        { capacity: 10000000000n, lock: ownerLock },
      ],
      outputsData: ['0x', '0x'],
    });
    return {
      version: 'atomic-predictions-v1',
      offerId: randomUUID(),
      rawHash: tx.hash(),
      unsignedBytes: tx.toHex(),
      ownerLock,
      expiresAt,
      lines: [
        {
          fixture: { fixtureId },
          outputIndex: 0,
          mode,
          outcome: 0,
          principalShannons: '10000000000',
        },
      ],
    };
  }
  const choice = (o, ids) => ({
    accountId: actor.id,
    lines: o.lines.map((line) => ({ fixtureId: line.fixture.fixtureId, campaignIds: ids })),
  });
  const audit = { actorId: 'synthetic-reader', action: 'reconcile' };
  function evidence(o, overrides = {}) {
    return {
      revision: randomUUID(),
      verifiedAt: new Date().toISOString(),
      complete: true,
      final: false,
      five: [],
      results: [
        {
          fixtureId: 'fixture-1',
          marketKey: 'canonical-fixture-1',
          outcome: 0,
          final: true,
          void: false,
        },
      ],
      predictions: [
        {
          id: 'synthetic-position',
          ownerHash: actor.ownerHash,
          fixtureId: 'fixture-1',
          marketKey: 'canonical-fixture-1',
          outcome: 0,
          committedAt: new Date().toISOString(),
          blockNumber: '7',
          transactionIndex: 0,
          outputIndex: o.lines[0].mode === 'create' ? 1 : 0,
          transactionHash: o.rawHash,
          blockHash: hex(900),
          principalShannons: '10000000000',
          status: 'accepted',
          ...overrides,
        },
      ],
    };
  }
  await campaign('explicit-a');
  await campaign('explicit-b');
  const first = offer();
  await payments.reserve(actor, first, choice(first, ['explicit-b', 'explicit-a']));
  await payments.reserve(actor, first, choice(first, ['explicit-a', 'explicit-b']));
  for (const id of ['explicit-a', 'explicit-b']) {
    const c = await store.load(id);
    assert.equal(
      c.entries[0].predictionSlots[0].outputIndex,
      1,
      'genesis ticket is after control output',
    );
    assert.deepEqual(summary(c, actor, Date.now()).pendingFixtureIds, ['fixture-1']);
  }
  await assert.rejects(
    payments.reserve(actor, first, choice(first, [])),
    /saved competition choice/,
  );
  await assert.rejects(
    payments.reserve({ ...actor, id: 'different-account' }, first, choice(first, [])),
    /account|selection/i,
  );
  await payments.start(actor, first);
  assert.equal(
    await payments.release(actor, first),
    false,
    'submitted/unknown slots cannot be cancelled by browser',
  );
  await payments.start(actor, first);
  for (const id of ['explicit-a', 'explicit-b']) {
    for (const mismatch of [
      { outputIndex: 0 },
      { principalShannons: '20000000000' },
      { outcome: 1 },
      { transactionHash: hex(99) },
    ]) {
      const c = await store.change(
        id,
        (current, now) => reconcileCampaign(current, evidence(first, mismatch), now),
        audit,
      );
      assert.equal(c.entries[0].points, 0, 'only the exact selected canonical ticket counts');
    }
    const c = await store.change(
      id,
      (current, now) => reconcileCampaign(current, evidence(first), now),
      audit,
    );
    assert.equal(c.entries[0].points, 3);
    const originalTie = c.entries[0].tieBreakAt;
    const replacement = evidence(offer()).predictions[0];
    const reorg = { ...evidence(first), predictions: [replacement] };
    const missing = await store.change(
      id,
      (current, now) => reconcileCampaign(current, reorg, now),
      audit,
    );
    assert.equal(
      missing.entries[0].points,
      0,
      'reorg cannot substitute a later regular prediction',
    );
    assert.equal(missing.entries[0].predictionSlots[0].rawHash, first.rawHash);
    const restored = evidence(first, { committedAt: originalTie });
    const back = await store.change(
      id,
      (current, now) => reconcileCampaign(current, restored, now),
      audit,
    );
    assert.equal(back.entries[0].points, 3);
    assert.equal(back.entries[0].tieBreakAt, originalTie);
  }
  const regular = offer('fixture-2');
  await payments.reserve(actor, regular, choice(regular, []));
  await assert.rejects(
    payments.reserve(actor, regular, choice(regular, ['explicit-a'])),
    /saved competition choice/,
  );
  await payments.start(actor, regular);
  assert.equal((await store.load('explicit-a')).entries[0].predictionSlots.length, 1);
  await campaign('explicit-atomic');
  const rollback = offer();
  await assert.rejects(
    payments.reserve(actor, rollback, choice(rollback, ['explicit-atomic', 'missing'])),
    /no longer available/,
  );
  assert.equal(
    (await store.load('explicit-atomic')).entries[0].predictionSlots,
    undefined,
    'multi-competition reservation rolls back together',
  );
  const raceOffers = [offer(), offer()];
  const races = await Promise.allSettled(
    raceOffers.map((o) => payments.reserve(actor, o, choice(o, ['explicit-atomic']))),
  );
  assert.equal(
    races.filter((r) => r.status === 'fulfilled').length,
    1,
    'one slot survives concurrent offers',
  );
  const reserved = raceOffers[races.findIndex((r) => r.status === 'fulfilled')];
  assert.equal(await payments.release(actor, reserved), true);
  await assert.rejects(payments.start(actor, reserved), /cancelled/);
  const rebuilt = { ...reserved, offerId: randomUUID(), expiresAt: Date.now() + 60000 };
  await payments.reserve(actor, rebuilt, choice(rebuilt, []));
  await assert.rejects(payments.start(actor, reserved), /cancelled/);
  await payments.start(actor, rebuilt);
  await assert.rejects(
    payments.reserve(
      actor,
      { ...rebuilt, offerId: randomUUID() },
      choice(rebuilt, ['explicit-atomic']),
    ),
    /active competition choice/,
  );
  const second = offer();
  await payments.reserve(actor, second, choice(second, ['explicit-atomic']));
  await payments.release(actor, reserved);
  assert.equal(
    (await store.load('explicit-atomic')).entries[0].predictionSlots[0].offerId,
    second.offerId,
    'stale release cannot clear a newer selected offer',
  );
  const simultaneous = await Promise.allSettled([
    payments.start(actor, second),
    payments.release(actor, second),
  ]);
  assert.ok(
    simultaneous[0].status === 'rejected' || simultaneous[1].value === false,
    'release and submit cannot both succeed',
  );
  await campaign('explicit-expiry');
  const expires = offer('fixture-1', (await databaseNow()) + 700);
  await payments.reserve(actor, expires, choice(expires, ['explicit-expiry']));
  await payments.start(actor, expires);
  await waitForDatabaseTime(expires.expiresAt);
  await payments.observe({ state: 'blocked', offer: expires });
  assert.equal(await payments.release(actor, expires), false, 'timeout is not failure proof');
  await payments.observe({ state: 'expired', offer: expires });
  assert.deepEqual(
    (await store.load('explicit-expiry')).entries[0].predictionSlots,
    [],
    'verified expired unsigned offer releases conservatively started slot',
  );
  await assert.rejects(payments.start(actor, expires), /cancelled/);
  await campaign('explicit-unsigned-cancel');
  const cancelled = offer();
  await payments.reserve(actor, cancelled, choice(cancelled, ['explicit-unsigned-cancel']));
  await payments.start(actor, cancelled);
  await payments.observe({ state: 'cancelled', offer: cancelled, conflictHash: hex(991) });
  assert.equal(await payments.release(actor, cancelled), false, 'A conflict alone cannot release a started entry');
  await payments.observe({ state: 'cancelled', offer: cancelled, unsignedCancellation: true, signedBytes: '0x01' });
  assert.equal(await payments.release(actor, cancelled), false, 'A signed response cannot claim unsigned cancellation');
  await payments.observe({ state: 'cancelled', offer: cancelled, unsignedCancellation: true });
  assert.deepEqual((await store.load('explicit-unsigned-cancel')).entries[0].predictionSlots, [], 'Operator-confirmed never-accepted cancellation clears the failed entry');
  await assert.rejects(payments.start(actor, cancelled), /cancelled/);
  const expiredUnused = offer('fixture-2', (await databaseNow()) + 700);
  await payments.reserve(actor, expiredUnused, choice(expiredUnused, ['explicit-expiry']));
  await waitForDatabaseTime(expiredUnused.expiresAt);
  const newAttempt = offer('fixture-2', Date.now() + 10000, 'deposit');
  await payments.reserve(actor, newAttempt, choice(newAttempt, ['explicit-expiry']));
  assert.equal(
    (await store.load('explicit-expiry')).entries[0].predictionSlots.find(
      (s) => s.fixtureId === 'fixture-2',
    ).outputIndex,
    0,
  );
  await assert.rejects(payments.start(actor, expiredUnused), /expired/);
  const cutoff = (await databaseNow()) + 700;
  await campaign('explicit-cutoff', cutoff);
  const blocking = await pool.connect();
  await blocking.query('BEGIN');
  await blocking.query('SELECT id FROM streak_campaigns WHERE id=$1 FOR UPDATE', [
    'explicit-cutoff',
  ]);
  const late = offer();
  const rejected = assert.rejects(
    payments.reserve(actor, late, choice(late, ['explicit-cutoff'])),
    /closed/,
  );
  await waitForDatabaseTime(cutoff);
  await blocking.query('COMMIT');
  blocking.release();
  await rejected;
  assert.equal((await store.load('explicit-cutoff')).entries[0].predictionSlots, undefined);
  console.log(
    'ok - explicit competition payments: atomic slots, exact evidence, regular opt-out, races, expiry, recovery and cutoff locks',
  );
};

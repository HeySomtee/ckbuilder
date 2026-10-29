require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { Pool } = require('pg');
const { PgActivityStorage, marketKey } = require('../dist/modules/activity/storage');
const { ActivityService, recoveryDelay } = require('../dist/modules/activity/service');
const { activityEventId } = require('../dist/modules/activity/events');
const {
  createRecord,
  PUBLIC_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
} = require('../dist/modules/direct/registry');
const H = (n) => `0x${n.toString(16).padStart(64, '0')}`;
function descriptor(id) {
  const cutoff = 1_900_000_000_000,
    args = Buffer.alloc(172);
  args.writeUInt32LE(id);
  args.writeBigUInt64LE(BigInt(cutoff), 68);
  Buffer.from(PUBLIC_DIRECT_CONFIG.guardHash.slice(2), 'hex').copy(args, 76);
  return {
    ...createRecord(
      {
        id: `api-football-${id}`,
        sport: 'football',
        kickoff: new Date(cutoff).toISOString(),
        date: '2030-03-17',
        status: 'scheduled',
        stage: 'Synthetic index test',
        home: { name: 'Home', code: 'H', flag: '' },
        away: { name: 'Away', code: 'A', flag: '' },
        oracle: { provider: 'api-football', source: PROVIDER_ORIGIN, fixtureId: String(id) },
      },
      {
        codeHash: PUBLIC_DIRECT_CONFIG.protocolHash,
        hashType: 'data2',
        args: `0x${args.toString('hex')}`,
      },
      H(id),
    ),
    entryEnabled: false,
  };
}
const ownerA = H(9001),
  ownerB = H(9002);
const position = (tx, status = 'accepted') => ({
  id: `${tx}:1`,
  status,
  outcome: 0,
  principalShannons: '10000000000',
  storageShannons: '32100000000',
  entitlementShannons: status === 'claimable' ? '9007199254740993' : null,
  outPoint: { txHash: tx, index: 1 },
  transactionHash: tx,
});
function event(d, tx, state = 'signed', pending = true) {
  const p = { ...position(tx, 'submitted'), id: `submitted:${tx}:1` };
  const value = {
    version: 1,
    kind: 'payment',
    transactionHash: tx,
    state,
    observedAt: Date.now(),
    descriptors: [d],
    ownerHash: ownerA,
    ...(pending ? { positions: [{ descriptor: d, ownerHash: ownerA, position: p }] } : {}),
  };
  return { ...value, id: activityEventId(value) };
}
function projection(d, owners) {
  return {
    descriptor: d,
    owners,
    phase: 'settled',
    checkedAt: Date.now(),
    checkpoint: { blockNumber: '100', blockHash: H(100) },
    transactionHashes: [
      d.creationTxHash,
      ...Object.values(owners).flatMap((s) => s.positions.map((p) => p.transactionHash)),
    ],
  };
}
function snapshot(...positions) {
  return {
    phase: 'settled',
    positions,
    checkedAt: Date.now(),
    historyComplete: true,
    settlement: { outcome: 0, emptyWinner: false },
  };
}

async function main() {
  assert.ok(process.env.PG_TEST_URL, 'A disposable local PG_TEST_URL is required');
  const url = new URL(process.env.PG_TEST_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /^\/[a-zA-Z0-9_]+_test$/);
  assert.equal(url.search, '');
  const originalFetch = global.fetch;
  global.fetch = () => {
    throw Error('External HTTP is forbidden in activity storage tests');
  };
  const schema = `activity_test_${randomUUID().replaceAll('-', '')}`,
    admin = new Pool({ connectionString: url.href });
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 8 });
    const store = new PgActivityStorage(pool),
      d = descriptor(1),
      tx = H(101),
      e = event(d, tx);
    await store.initialize();
    await store.bootstrap([d]);
    const duplicate = await Promise.all([store.ingest(e), store.ingest(e)]);
    assert.equal(duplicate.filter(Boolean).length, 1, 'replayed events enqueue once');
    const simultaneous = await Promise.all([store.take(), store.take()]);
    assert.equal(simultaneous.filter(Boolean).length, 1, 'a market has one leased reader');
    const first = simultaneous.find(Boolean);
    let view = await store.read(ownerA, 'synthetic-wallet-A');
    assert.equal(view.summary.open, 1);
    assert.equal(view.groups[0].snapshot.positions[0].status, 'submitted');
    assert.equal(view.summary.collectibleShannons, '0', 'submission cannot mint an entitlement');
    assert.equal(
      (await store.read(ownerB, 'synthetic-wallet-B')).groups.length,
      0,
      'owner scoped pending records',
    );
    await store.ingest(event(d, tx, 'confirming'));
    const p = projection(d, {
      [ownerA]: snapshot(position(tx, 'claimable')),
      [ownerB]: snapshot(position(H(102), 'claimed')),
    });
    assert.equal(
      await store.complete(first, p, 86_400_000),
      false,
      'a read cannot overwrite an event received during it',
    );
    const next = await store.take();
    assert.ok(next);
    assert.equal(await store.complete(next, p, 86_400_000), true);
    view = await store.read(ownerA, 'synthetic-wallet-A');
    assert.equal(
      view.groups[0].snapshot.positions.length,
      1,
      'verified birth replaces pending observation',
    );
    assert.equal(
      view.summary.collectibleShannons,
      '9007199254740993',
      'money remains exact beyond JS number precision',
    );
    assert.equal(
      view.summary.completed,
      0,
      'uncollected returns are separate from collected history',
    );
    await store.ingest(event(d, tx, 'funded'));
    assert.equal(
      (await store.read(ownerA, 'synthetic-wallet-A')).summary.open,
      0,
      'late funded event cannot reinsert already projected pending ticket',
    );
    const failed = await store.take();
    await store.fail(failed);
    view = await store.read(ownerA, 'synthetic-wallet-A');
    assert.equal(view.groups[0].stale, true);
    assert.equal(
      view.groups[0].snapshot.positions[0].status,
      'claimable',
      'failed refresh preserves prior rows',
    );
    assert.equal(view.coverage, 'indexing');
    await pool.query('UPDATE activity_markets SET due_at=clock_timestamp()');
    const rollback = await store.take();
    await store.complete(rollback, projection(d, {}), 86_400_000);
    assert.equal(
      (await store.read(ownerA, 'synthetic-wallet-A')).groups.length,
      0,
      'canonical rollback removes orphaned owner rows',
    );
    assert.equal(
      (await store.read(ownerB, 'synthetic-wallet-B')).groups.length,
      0,
      'complete market replacement removes every orphaned owner',
    );

    // Same fixture, different creation identity never merges positions.
    const newer = { ...d, creationTxHash: H(777) };
    assert.notEqual(marketKey(d), marketKey(newer));
    const many = Array.from({ length: 24 }, (_, i) => descriptor(i + 10));
    await store.bootstrap(many);
    for (let i = 0; i < many.length; i++) {
      const job = await store.take();
      assert.ok(job);
      await store.complete(
        job,
        projection(job.descriptor, { [ownerA]: snapshot(position(H(i + 500), 'claimable')) }),
        86_400_000,
      );
    }
    const began = performance.now();
    const page1 = await store.read(ownerA, 'synthetic-wallet-A');
    const elapsed = performance.now() - began;
    assert.equal(page1.groups.length, 20);
    assert.ok(page1.nextCursor);
    const page2 = await store.read(ownerA, 'synthetic-wallet-A', page1.nextCursor);
    assert.equal(page2.groups.length, 4);
    assert.equal(page2.nextCursor, null);
    assert.equal(page1.summary.claimable, 24, 'summary covers all pages');
    assert.equal(page2.summary.claimable, 24);
    assert.equal(
      new Set([...page1.groups, ...page2.groups].map((g) => marketKey(g.descriptor))).size,
      24,
    );
    await assert.rejects(store.read(ownerA, 'synthetic-wallet-A', '../../private'), /cursor/);
    assert.equal(
      (await store.read(ownerB, 'synthetic-wallet-B', page1.nextCursor)).groups.length,
      0,
      'foreign cursor cannot cross owner boundary',
    );

    const never = descriptor(100),
      pending = event(never, H(1001));
    await store.ingest(pending);
    await store.ingest(event(never, H(1001), 'rejected'));
    assert.equal(
      (await store.read(ownerA, 'synthetic-wallet-A')).summary.open,
      1,
      'rejected signed observation preserves recovery',
    );
    assert.equal(
      (await store.read(ownerB, 'synthetic-wallet-B')).coverage,
      'complete',
      'another owner unsigned candidate cannot hold all wallets indexing',
    );

    // Receipt durable before ack: lost response and API restart replay safely.
    const replay = event(descriptor(101), H(1002));
    let acked = 0;
    const source = {
      catalogue: async () => [],
      events: async () => ({ events: [replay], hasMore: false }),
      acknowledge: async () => {
        acked++;
        if (acked === 1) throw Error('lost acknowledgement');
      },
      project: async () => {
        throw Error('chain reads are forbidden on the DB read path');
      },
      canonicalCheckpoint: async () => false,
    };
    await assert.rejects(new ActivityService(store, source).drain(), /acknowledgement/);
    const before = await pool.query('SELECT requested FROM activity_markets WHERE market_key=$1', [
      marketKey(replay.descriptors[0]),
    ]);
    await new ActivityService(new PgActivityStorage(pool), source).drain();
    const after = await pool.query('SELECT requested FROM activity_markets WHERE market_key=$1', [
      marketKey(replay.descriptors[0]),
    ]);
    assert.equal(acked, 2);
    assert.equal(
      before.rows[0].requested,
      after.rows[0].requested,
      'restart dedup avoids duplicate jobs',
    );

    const transactionFailure = event(descriptor(200), H(2000));
    await pool.query(
      `CREATE FUNCTION activity_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic write failure'; END $$`,
    );
    await pool.query(
      'CREATE TRIGGER activity_reject_insert BEFORE INSERT ON activity_pending FOR EACH ROW EXECUTE FUNCTION activity_reject()',
    );
    await assert.rejects(store.ingest(transactionFailure), /synthetic write failure/);
    assert.equal(
      (
        await pool.query('SELECT event_id FROM activity_event_receipts WHERE event_id=$1', [
          transactionFailure.id,
        ])
      ).rowCount,
      0,
      'failed projection write rolls back event receipt',
    );
    assert.equal(
      (
        await pool.query('SELECT market_key FROM activity_markets WHERE market_key=$1', [
          marketKey(transactionFailure.descriptors[0]),
        ])
      ).rowCount,
      0,
      'same transaction rolls back catalogue change',
    );
    await pool.query('DROP TRIGGER activity_reject_insert ON activity_pending');
    assert.equal(
      await store.ingest(transactionFailure),
      true,
      'unacknowledged event can be replayed after recovery',
    );

    // A hint arriving during a failed read must stay due now, and replay once.
    const target = page1.groups[0].descriptor;
    await store.hint(ownerA, H(3000), target.id);
    const hintBefore = await pool.query(
      'SELECT requested FROM activity_markets WHERE market_key=$1',
      [marketKey(target)],
    );
    await store.hint(ownerA, H(3000), target.id);
    assert.equal(
      (
        await pool.query('SELECT requested FROM activity_markets WHERE market_key=$1', [
          marketKey(target),
        ])
      ).rows[0].requested,
      hintBefore.rows[0].requested,
    );
    await pool.query(
      "UPDATE activity_markets SET due_at=clock_timestamp()+interval '1 day' WHERE market_key<>$1",
      [marketKey(target)],
    );
    const oldJob = await store.take();
    assert.ok(oldJob);
    await store.hint(ownerA, H(3001), target.id);
    await store.fail(oldJob);
    const newJob = await store.take();
    assert.ok(newJob, 'new evidence is not hidden by old failure backoff');
    await store.complete(
      newJob,
      projection(target, { [ownerA]: snapshot(position(H(3500), 'claimed')) }),
      86_400_000,
    );
    const restarting = await pool.query(
      "UPDATE activity_markets SET due_at=clock_timestamp(),lease_id=$2,lease_until=clock_timestamp()-interval '1 second' WHERE market_key=$1",
      [marketKey(target), 'expired-worker'],
    );
    assert.equal(restarting.rowCount, 1);
    const recovered = await store.take();
    assert.ok(recovered);
    assert.notEqual(recovered.lease, 'expired-worker', 'crashed reader lease is recoverable');
    await store.complete(
      recovered,
      projection(target, { [ownerA]: snapshot(position(H(3500), 'claimed')) }),
      86_400_000,
    );

    assert.equal(
      recoveryDelay({ ...projection(d, {}), phase: 'open' }),
      300_000,
      'empty open market keeps targeted discovery',
    );
    assert.equal(
      recoveryDelay({ ...projection(d, {}), phase: 'settled' }),
      86_400_000,
      'collected history uses daily checkpoint audit',
    );
    const partial = new ActivityService(
      store,
      {
        ...source,
        catalogue: async () => {
          throw Error('one catalogue unavailable');
        },
      },
      () => {},
    );
    await partial.drain();
    assert.equal(
      (await partial.read(ownerA, 'synthetic-wallet-A')).coverage,
      'indexing',
      'partial bootstrap is never a complete empty history',
    );

    await pool.query("UPDATE activity_markets SET due_at=clock_timestamp()+interval '1 day'");
    const liveEvent = event(descriptor(250), H(2500));
    let chainStarted = false,
      releaseChain;
    const barrier = new Promise((resolve) => {
      releaseChain = resolve;
    });
    const engine = new ActivityService(
      store,
      {
        catalogue: async () => {
          throw Error('synthetic unavailable catalogue');
        },
        events: async () => ({ events: [liveEvent], hasMore: false }),
        acknowledge: async () => {},
        project: async (desc) => {
          chainStarted = true;
          await barrier;
          return {
            ...projection(desc, { [ownerA]: { ...snapshot(position(H(2500))), phase: 'open' } }),
            phase: 'open',
          };
        },
        canonicalCheckpoint: async () => false,
      },
      () => {},
    );
    const stop = engine.start();
    try {
      await engine.drain();
      for (let i = 0; i < 200 && !chainStarted; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.ok(chainStarted, 'events still process while one catalogue is unavailable');
      const during = await engine.read(ownerA, 'synthetic-wallet-A');
      assert.ok(
        during.groups.length > 0,
        'a blocked chain reader never holds saved database reads',
      );
      assert.equal(during.coverage, 'indexing');
      releaseChain();
      let projected = false;
      for (let i = 0; i < 200 && !projected; i++) {
        projected = (
          await pool.query(
            'SELECT completed>0 AS ready FROM activity_markets WHERE market_key=$1',
            [marketKey(liveEvent.descriptors[0])],
          )
        ).rows[0].ready;
        if (!projected) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(projected, 'event-triggered job updates wallet rows without a page chain scan');
    } finally {
      releaseChain();
      stop();
    }

    // An older signed observation cannot erase a recovery notice from newer evidence.
    const uncertain = event(descriptor(300), H(3000), 'blocked');
    await store.ingest(uncertain);
    await store.ingest(event(uncertain.descriptors[0], H(3000), 'signed'));
    const retainedIssue = await pool.query(
      'SELECT issue FROM activity_pending WHERE transaction_hash=$1',
      [H(3000)],
    );
    assert.match(retainedIssue.rows[0].issue, /recovery/);

    let failedFeedCalls = 0;
    const outage = new ActivityService(
      store,
      {
        catalogue: async () => [],
        events: async () => {
          failedFeedCalls++;
          return { events: [uncertain], hasMore: true };
        },
        acknowledge: async () => {
          throw Error('synthetic acknowledgement outage');
        },
        project: async () => {
          throw Error('synthetic unavailable chain');
        },
        canonicalCheckpoint: async () => false,
      },
      () => {},
    );
    const stopOutage = outage.start();
    try {
      await assert.rejects(outage.drain(), /acknowledgement outage/);
      await new Promise((resolve) => setTimeout(resolve, 450));
      assert.equal(
        failedFeedCalls,
        1,
        'failed backlog delivery backs off instead of retrying every250ms',
      );
    } finally {
      stopOutage();
    }

    console.log(
      `Activity PostgreSQL: replay, atomicity, leases, owner isolation, pending, exact totals, pagination, stale retention and rollback passed. 24-market first page ${elapsed.toFixed(1)}ms; 0 chain reads (synthetic local evidence).`,
    );

    // Local file-backed accounts must survive enabling the PostgreSQL index.
    // Use this test's disposable schema, never a developer application store.
    const { activityService } = require('../dist/modules/activity/runtime');
    const { authStorage } = require('../dist/auth');
    const { FileAuthStorage } = require('../dist/modules/identity/storage');
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.equal(activityService(), undefined, 'missing configuration does not fabricate an index');
    const dedicated = new URL(url);
    dedicated.searchParams.set('options', `-c search_path=${schema}`);
    process.env.STREAK_ACTIVITY_DATABASE_URL = dedicated.href;
    const runtime = activityService();
    try {
      assert.ok(runtime, 'dedicated Activity database enables saved history');
      assert.ok(
        (await authStorage()) instanceof FileAuthStorage,
        'account storage stays file-backed',
      );
      assert.equal(process.env.DATABASE_URL, undefined, 'legacy ledger database remains unchanged');
      const indexed = await runtime.read(ownerA, 'synthetic-local-address');
      const saved = await store.read(ownerA, 'synthetic-local-address');
      assert.deepEqual(indexed.groups, saved.groups);
      assert.deepEqual(indexed.summary, saved.summary);
      assert.equal(indexed.available, true);
      assert.equal(
        indexed.coverage,
        'indexing',
        'an unstarted relay never claims complete coverage',
      );
      assert.equal(activityService(), runtime, 'repeated reads reuse the configured pool');
      console.log(
        'Activity local configuration: dedicated durable reads preserve file-backed identity; no chain calls.',
      );
    } finally {
      delete process.env.STREAK_ACTIVITY_DATABASE_URL;
      await runtime?.store.pool.end();
    }
  } finally {
    global.fetch = originalFetch;
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

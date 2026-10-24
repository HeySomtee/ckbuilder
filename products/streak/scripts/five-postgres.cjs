require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { PgFiveStorage } = require('../dist/modules/five/storage');
const { FiveService } = require('../dist/modules/five/service');
const { FiveRewards } = require('../dist/modules/five/rewards');
const { closeAuction } = require('../dist/modules/five/auction');
const { ccc } = require('@ckb-ccc/core');
const { newRound, parseTerms, saveEntry } = require('../dist/modules/five/domain');
async function main() {
  assert.ok(process.env.PG_TEST_URL);
  const url = new URL(process.env.PG_TEST_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /^\/[a-zA-Z0-9_]+_test$/);
  assert.equal(url.search, '');
  const schema = `five_test_${randomUUID().replaceAll('-', '')}`,
    admin = new Pool({ connectionString: url.href });
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 12 });
    const storage = new PgFiveStorage(pool),
      now = Date.now();
    const players = ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
      id: `p${i}`,
      name: `Player ${i}`,
      teamId: `t${i}`,
      team: `Club ${i}`,
      position,
      cost: 80,
      fixtureId: `f${i}`,
    }));
    const terms = parseTerms({
      name: 'PG Five',
      lockAt: new Date(now + 600_000).toISOString(),
      finalizeAfter: new Date(now + 7_200_000).toISOString(),
      limit: 2,
      qualifyingBps: 500,
      sponsorship: false,
      minimumShannons: '10000000000',
      source: 'Synthetic test',
      players,
    });
    const round = await storage.create('test', 'admin', (now) =>
      newRound('test', 'admin', terms, now),
    );
    await storage.change('test', (r) => {
      r.state = 'open';
    });
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        storage.change('test', (r, time) =>
          saveEntry(
            r,
            { id: `p${i}`, name: 'Player', wallet: `wallet${i}` },
            players.map((p) => p.id),
            'p2',
            r.termsHash,
            time,
          ),
        ),
      ),
    );
    assert.equal(attempts.filter((r) => r.status === 'fulfilled').length, 2);
    assert.equal((await storage.load('test')).entries.length, 2);
    const before = await storage.load('test');
    await assert.rejects(
      storage.change('test', (r) => {
        r.entries = [];
        throw Error('abort');
      }),
      /abort/,
    );
    assert.deepEqual(await storage.load('test'), before);
    await assert.rejects(
      storage.create('test', 'admin', (time) =>
        newRound('test', 'admin', { ...terms, name: 'Changed' }, time),
      ),
      /different gameweek/,
    );
    assert.equal(
      (await storage.create('test', 'admin', (time) => newRound('test', 'admin', terms, time)))
        .termsHash,
      round.termsHash,
    );
    await storage.create('cutoff', 'admin', (time) => newRound('cutoff', 'admin', terms, time));
    await storage.change('cutoff', (r, time) => {
      r.state = 'open';
      r.terms.lockAt = new Date(time + 350).toISOString();
    });
    const blocker = await pool.connect();
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM streak_five_rounds WHERE id=$1 FOR UPDATE', ['cutoff']);
    const waiting = storage.change('cutoff', (r, time) =>
      saveEntry(
        r,
        { id: 'late', name: 'Late', wallet: 'late' },
        players.map((p) => p.id),
        'p2',
        r.termsHash,
        time,
      ),
    );
    const result = assert.rejects(waiting, /closed/);
    await new Promise((done) => setTimeout(done, 500));
    await blocker.query('COMMIT');
    blocker.release();
    await result;
    // Real jsonb round-tripping and competing API schedulers must not churn scores.
    await storage.create('fpl-2030-1', 'fpl-scheduler', (time) =>
      newRound('fpl-2030-1', 'fpl-scheduler', { ...terms, source: 'FPL event 1' }, time),
    );
    await storage.change('fpl-2030-1', (r, time) => {
      r.state = 'open';
      r.terms.lockAt = new Date(time - 1000).toISOString();
    });
    const locked = await storage.load('fpl-2030-1');
    const feed = {
      available: true,
      season: async () => ({
        season: '2030',
        events: [
          { id: 1, name: 'GW1', deadline: locked.terms.lockAt, finished: false, checked: false },
        ],
      }),
      catalogue: async () => {
        throw Error('No upcoming round');
      },
      results: async () => ({
        source: 'Synthetic database results',
        complete: false,
        stats: Object.fromEntries(
          players.map((p) => [
            p.id,
            {
              minutes: 90,
              goals: 0,
              assists: 0,
              conceded: 0,
              saves: 0,
              penaltySaves: 0,
              yellow: 0,
              red: 0,
              ownGoals: 0,
              penaltyMisses: 0,
            },
          ]),
        ),
      }),
    };
    const a = new FiveService(storage, [], feed, undefined, undefined, true);
    const b = new FiveService(new PgFiveStorage(pool), [], feed, undefined, undefined, true);
    await Promise.all([a.progress(), b.progress()]);
    assert.equal((await storage.load('fpl-2030-1')).scoreRevision, 1);
    await a.progress();
    await b.progress();
    assert.equal(
      (await storage.load('fpl-2030-1')).scoreRevision,
      1,
      'jsonb ordering does not create duplicate score revisions',
    );
    const rewards = new FiveRewards(
      pool,
      new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] }),
      'ckt1synthetic',
    );
    await rewards.init();
    const refundRound = newRound(
      'refund-race',
      'admin',
      { ...terms, sponsorshipMode: 'auction' },
      Date.now(),
    );
    refundRound.state = 'cancelled';
    refundRound.sponsors = [
      {
        id: 'late',
        accountId: 'donor',
        wallet: 'synthetic-refund-wallet',
        amountShannons: '10000000000',
        display: 'anonymous',
        name: '',
        logo: '',
        link: '',
        moderation: 'pending',
        createdAt: new Date().toISOString(),
        funding: 'confirmed',
      },
    ];
    await pool.query(
      "INSERT INTO streak_five_claim_requests(wallet,refund_only) VALUES('synthetic-refund-wallet',true)",
    );
    const consumer = await pool.connect();
    try {
      await consumer.query('BEGIN');
      await consumer.query(
        "SELECT wallet FROM streak_five_claim_requests WHERE wallet='synthetic-refund-wallet' FOR UPDATE",
      );
      const producer = rewards.credit(refundRound);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await consumer.query(
        "DELETE FROM streak_five_claim_requests WHERE wallet='synthetic-refund-wallet'",
      );
      await consumer.query('COMMIT');
      await producer;
      assert.equal(
        (
          await pool.query(
            "SELECT refund_only FROM streak_five_claim_requests WHERE wallet='synthetic-refund-wallet'",
          )
        ).rows[0]?.refund_only,
        true,
        'A refund racing queue consumption remains queued',
      );
      await pool.query(
        "UPDATE streak_five_claim_requests SET refund_only=false WHERE wallet='synthetic-refund-wallet'",
      );
      await rewards.credit(refundRound);
      assert.equal(
        (
          await pool.query(
            "SELECT refund_only FROM streak_five_claim_requests WHERE wallet='synthetic-refund-wallet'",
          )
        ).rows[0].refund_only,
        false,
        'Automatic retry cannot downgrade an explicit collection',
      );
      assert.equal(
        (
          await pool.query(
            "SELECT count(*)::int AS n FROM streak_five_credits WHERE id='refund-race:refund:late'",
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await consumer.query('ROLLBACK');
      consumer.release();
    }
    await storage.create('audit-auction', 'admin', (time) =>
      newRound('audit-auction', 'admin', { ...terms, sponsorshipMode: 'auction' }, time),
    );
    await storage.change('audit-auction', (r, time) => {
      r.state = 'open';
      r.terms.lockAt = new Date(time - 1).toISOString();
    });
    await storage.change('audit-auction', (r, time) => {
      assert.equal(closeAuction(r, time), true);
    });
    const audit = (
      await pool.query(
        "SELECT data FROM streak_five_audit WHERE round_id='audit-auction' ORDER BY revision DESC LIMIT 1",
      )
    ).rows[0].data;
    assert.equal(
      audit.auction.amountShannons,
      '0',
      'Auction snapshot has an immutable audit record',
    );
    console.log(
      'Five auction PostgreSQL refund producer/consumer race, manual scope and closure audit passed.',
    );
    console.log(
      'Five PostgreSQL admission races, rollback, idempotency, DB-clock cutoff and automatic jsonb deduplication passed.',
    );
  } finally {
    if (pool) await pool.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

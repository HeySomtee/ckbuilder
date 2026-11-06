/** Called only inside five-postgres.cjs's guarded disposable PostgreSQL schema. */
const assert = require('node:assert/strict');
const { PgFiveStorage } = require('../dist/modules/five/storage');
const { PgSurvivorStorage } = require('../dist/modules/survivor/storage');
const { FiveRewards } = require('../dist/modules/five/rewards');
const { RewardWorkQueue } = require('../dist/modules/five/work-queue');

function initializers(pool) {
  // Schema initialization uses only the network prefix. Any accidental chain
  // access fails because this synthetic adapter exposes no RPC methods.
  const five = new PgFiveStorage(pool);
  const survivor = new PgSurvivorStorage(pool);
  const rewards = new FiveRewards(pool, { addressPrefix: 'ckt' }, 'synthetic-only');
  const queue = new RewardWorkQueue(pool);
  return [() => five.list(), () => survivor.list(), () => rewards.init(), () => queue.initialize()];
}
const isInitializer = (sql) =>
  typeof sql === 'string' && sql.includes('CREATE TABLE IF NOT EXISTS streak_reward_work');

async function concurrentInitialization(pool) {
  const original = pool.query;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let arrived = 0;
  const timer = setTimeout(release, 5000);
  pool.query = function (...args) {
    if (!isInitializer(args[0])) return original.apply(this, args);
    // Align real database starts, rather than relying on accidental scheduling.
    assert.match(args[0].trim(), /^SELECT pg_advisory_xact_lock\(7138831\);/);
    arrived++;
    if (arrived === 4) release();
    return gate.then(() => original.apply(this, args));
  };
  try {
    const results = await Promise.allSettled(initializers(pool).map((init) => init()));
    assert.equal(arrived, 4, 'All four actual initializer paths reached the barrier.');
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  } finally {
    clearTimeout(timer);
    release();
    pool.query = original;
  }
}

module.exports = async function rewardSchemaChecks(pool) {
  const schema = (await pool.query('SELECT current_schema() AS name')).rows[0].name;
  assert.match(
    schema,
    /^five_test_[a-f0-9]{32}$/,
    'Only the disposable Five harness may run this check.',
  );
  // First exercise a completely empty schema, then the deployment case where
  // all previous game tables exist and only the newly shared queue is missing.
  await concurrentInitialization(pool);
  for (let trial = 0; trial < 5; trial++) {
    await pool.query('DROP TABLE streak_reward_work');
    await concurrentInitialization(pool);
  }
  await pool.query(`
    INSERT INTO streak_five_rounds(id,creator,data) VALUES('schema-sentinel','synthetic',
      '{"state":"open","terms":{"name":"Retained","lockAt":"2030-01-01T00:00:00Z"}}');
    INSERT INTO streak_survivor_competitions(id,creator,state,data)
      VALUES('schema-sentinel','synthetic','open','{"proof":"retained"}');
    INSERT INTO streak_five_credits(id,wallet,amount) VALUES('schema-sentinel','synthetic',1);
    INSERT INTO streak_five_payouts(id,wallet,amount,signed_bytes,tx_hash,status)
      VALUES('schema-sentinel','synthetic',1,'synthetic retained signed bytes','synthetic-hash','submitted');
    INSERT INTO streak_reward_work(kind,subject,generation,due_at)
      VALUES('five','schema-sentinel',7,'2030-01-01T00:00:00Z');
  `);
  const tables = [
    'streak_five_rounds',
    'streak_survivor_competitions',
    'streak_five_credits',
    'streak_five_payouts',
    'streak_reward_work',
  ];
  const snapshot = async () =>
    Promise.all(
      tables.map(
        async (table) =>
          (await pool.query(`SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`))
            .rows,
      ),
    );
  const retained = await snapshot();
  await concurrentInitialization(pool);
  assert.deepEqual(
    await snapshot(),
    retained,
    'Repeat boot preserves game, credit, signed payout and pending work records.',
  );

  for (const initialize of initializers(pool)) {
    const original = pool.query;
    let injected = false;
    pool.query = function (...args) {
      if (isInitializer(args[0]) && !injected) {
        injected = true;
        args[0] += `
          INSERT INTO streak_reward_work(kind,subject) VALUES('five','must-roll-back');
          SELECT 1/0;`;
      }
      return original.apply(this, args);
    };
    try {
      await assert.rejects(initialize(), (error) => error.code === '22012');
      assert.equal(injected, true);
    } finally {
      pool.query = original;
    }
    assert.deepEqual(
      await snapshot(),
      retained,
      'Failed schema queries roll back without losing existing obligations.',
    );
    const lock = await pool.query('SELECT pg_try_advisory_xact_lock(7138831) AS acquired');
    assert.equal(
      lock.rows[0].acquired,
      true,
      'Failed initialization releases its transaction-scoped lock.',
    );
    await initialize();
    assert.deepEqual(
      await snapshot(),
      retained,
      'The same failed initializer can retry successfully.',
    );
  }
  await pool.query(`
    DELETE FROM streak_reward_work WHERE subject='schema-sentinel';
    DELETE FROM streak_five_payouts WHERE id='schema-sentinel';
    DELETE FROM streak_five_credits WHERE id='schema-sentinel';
    DELETE FROM streak_survivor_competitions WHERE id='schema-sentinel';
    DELETE FROM streak_five_rounds WHERE id='schema-sentinel';
  `);
  console.log(
    'Rewards schema: four-way cold/deployed startup, retained obligations, transactional failure and same-instance retry passed.',
  );
};

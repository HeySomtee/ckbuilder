require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { PgSurvivorStorage } = require('../dist/modules/survivor/storage');
const {
  createCompetition,
  publish,
  join,
  savePick,
  advance,
} = require('../dist/modules/survivor/domain');

async function main() {
  assert.ok(process.env.PG_TEST_URL, 'PG_TEST_URL is required.');
  const url = new URL(process.env.PG_TEST_URL);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.match(url.pathname, /^\/[a-zA-Z0-9_]+_test$/);
  assert.equal(url.search, '');
  const schema = `streak_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Pool({ connectionString: url.href });
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 12 });
    const store = new PgSurvivorStorage(pool),
      now = Date.now();
    const terms = {
      name: 'PG competition',
      mode: 'free',
      feeShannons: '0',
      prizeShannons: '0',
      limit: 2,
    };
    const slate = {
      key: 'one',
      label: 'Round 1',
      lockAt: new Date(now + 60000).toISOString(),
      resolveAt: new Date(now + 120000).toISOString(),
      fixtures: [
        {
          id: 'fixture',
          kickoff: new Date(now + 90000).toISOString(),
          home: { id: 'a', name: 'A', code: 'A' },
          away: { id: 'b', name: 'B', code: 'B' },
        },
      ],
    };
    await store.create('race', 'admin', (time) =>
      createCompetition('race', 'admin', terms, [slate], time),
    );
    await store.change('race', (c, time) => {
      publish(c, time);
      join(c, 'first', 'First', c.termsHash, time);
    });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        store.change('race', (c, time) => join(c, `player${i}`, `Player ${i}`, c.termsHash, time)),
      ),
    );
    assert.equal(
      results.filter((r) => r.status === 'fulfilled').length,
      1,
      'Only one concurrent last-place entry wins.',
    );
    const c = await store.load('race');
    assert.equal(c.entries.length, 2);
    await assert.rejects(store.remove('race'), /entrants/);
    await store.create('empty', 'admin', (time) =>
      createCompetition('empty', 'admin', terms, [slate], time),
    );
    await store.change('empty', (c, time) => publish(c, time));
    await store.remove('empty');
    await store.remove('empty');
    assert.equal(await store.load('empty'), null);
    assert.equal(
      (await store.list()).some((c) => c.id === 'empty'),
      false,
    );
    await assert.rejects(
      store.change('empty', (c, time) => join(c, 'late', 'Late', c.termsHash, time)),
      /not found/,
    );
    await assert.rejects(
      store.create('empty', 'admin', () => c),
      /deleted/,
    );
    // Deletion and admission must serialize on the same row.
    await store.create('delete-race', 'admin', (time) =>
      createCompetition('delete-race', 'admin', terms, [slate], time),
    );
    await store.change('delete-race', (c, time) => publish(c, time));
    const deletionRace = await Promise.allSettled([
      store.remove('delete-race'),
      store.change('delete-race', (c, time) => join(c, 'racer', 'Racer', c.termsHash, time)),
    ]);
    assert.equal(deletionRace.filter((r) => r.status === 'fulfilled').length, 1);
    const survivor = await store.load('delete-race');
    assert.ok(survivor === null || survivor.entries.length === 1);
    const winner = c.entries[1];
    await Promise.all(
      Array.from({ length: 5 }, () =>
        store.change('race', (c, time) =>
          join(c, winner.accountId, winner.name, c.termsHash, time),
        ),
      ),
    );
    assert.equal((await store.load('race')).entries.length, 2);
    await assert.rejects(
      store.change('race', (c, time) => {
        savePick(c, 'first', 0, 'a', time);
        throw Error('Interrupted transaction');
      }),
      /Interrupted/,
    );
    assert.deepEqual(
      (await store.load('race')).entries[0].picks,
      {},
      'Rollback cannot leave a partial pick.',
    );
    await store.change('race', (c, time) => savePick(c, 'first', 0, 'a', time));
    const restarted = new PgSurvivorStorage(pool);
    assert.equal((await restarted.load('race')).entries[0].picks['0'].teamId, 'a');
    await store.create('race', 'admin', () => {
      throw Error('Idempotent retry must not recreate');
    });
    await assert.rejects(
      store.create('race', 'other-admin', () => c),
      /already in use/,
    );
    await store.change('race', (c, time) => {
      c.rounds[0].lockAt = new Date(time + 200).toISOString();
    });
    const lock = await pool.connect();
    await lock.query('BEGIN');
    await lock.query('SELECT id FROM streak_survivor_competitions WHERE id=$1 FOR UPDATE', [
      'race',
    ]);
    const queued = store.change('race', (c, time) => savePick(c, 'first', 0, 'b', time));
    const rejected = assert.rejects(queued, /locked/);
    await lock.query('SELECT pg_sleep(0.35)');
    await lock.query('COMMIT');
    lock.release();
    await rejected;
    assert.equal(
      (await store.load('race')).entries[0].picks['0'].teamId,
      'a',
      'A queued pick is checked against DB time after its lock.',
    );
    await store.change('race', (c, time) => {
      c.rounds[0].resolveAt = new Date(time - 1).toISOString();
      advance(c, {}, time);
    });
    const finished = JSON.stringify(await store.load('race'));
    await restarted.change('race', (c, time) => advance(c, {}, time));
    assert.equal(
      JSON.stringify(await restarted.load('race')),
      finished,
      'Restart cannot double-finalize.',
    );
    console.log(
      'PASS Survivor PostgreSQL: concurrent final place, duplicate admission/create, rollback, persisted pick, deadline under contention and restart finalization.',
    );
  } finally {
    await pool?.end();
    assert.match(schema, /^streak_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

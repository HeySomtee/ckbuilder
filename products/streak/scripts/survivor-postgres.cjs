require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { ccc } = require('@ckb-ccc/core');
const { FiveRewards } = require('../dist/modules/five/rewards');
const { PgSurvivorStorage } = require('../dist/modules/survivor/storage');
const { prizeRound } = require('../dist/modules/survivor/prizes');
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
    await store.change('race', () => {}, {
      intent: 'survivor.race:prize',
      outpoints: ['synthetic-shared-input'],
    });
    await assert.rejects(
      store.change('race', () => {}, {
        intent: 'five-round:sponsor',
        outpoints: ['synthetic-shared-input'],
      }),
      /Another reward payment/,
    );
    await assert.rejects(
      store.change(
        'race',
        () => {
          throw Error('abort funding');
        },
        { intent: 'survivor.race:prize', outpoints: ['synthetic-rollback-input'] },
      ),
      /abort funding/,
    );
    assert.equal(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM streak_five_funding_inputs WHERE outpoint='synthetic-rollback-input'",
        )
      ).rows[0].n,
      0,
    );
    await restarted.change('race', (c, time) => advance(c, {}, time));
    assert.equal(
      JSON.stringify(await restarted.load('race')),
      finished,
      'Restart cannot double-finalize.',
    );
    // Exercise real persisted Survivor outcomes through the shared credit ledger.
    // Funding is a synthetic confirmed record; no chain read, signing or payout runs.
    const chain = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
    const rewards = new FiveRewards(pool, chain, 'ckt1synthetic-rewards');
    const replayRewards = new FiveRewards(pool, chain, 'ckt1synthetic-rewards');
    await rewards.init();
    await replayRewards.init();
    for (const scenario of ['sole-picker', 'early-winner', 'all-loss', 'all-missed']) {
      const id = `prize-${scenario}`;
      const prize = '20000000001';
      await store.create(id, 'creator', (time) => {
        const competition = createCompetition(
          id,
          'creator',
          { ...terms, prizeShannons: prize },
          [
            {
              ...slate,
              testingPolicy: 'admin-controlled-v1',
              lockAt: new Date(time + 60000).toISOString(),
              resolveAt: new Date(time + 120000).toISOString(),
              fixtures: [{ ...slate.fixtures[0], kickoff: new Date(time + 90000).toISOString() }],
            },
          ],
          time,
          `creator-${scenario}`,
        );
        competition.prizeFunding = {
          id: competition.fundingIntentId,
          accountId: 'creator',
          wallet: competition.creatorWallet,
          amountShannons: prize,
          display: 'anonymous',
          name: '',
          logo: '',
          link: '',
          moderation: 'approved',
          createdAt: competition.createdAt,
          funding: 'confirmed',
        };
        publish(competition, time);
        for (const entrant of ['first', 'second'])
          join(
            competition,
            entrant,
            entrant,
            competition.termsHash,
            time,
            `${entrant}-${scenario}`,
          );
        if (scenario !== 'all-missed') savePick(competition, 'first', 0, 'a', time);
        if (scenario === 'early-winner' || scenario === 'all-loss')
          savePick(competition, 'second', 0, 'b', time);
        return competition;
      });
      await store.change(id, (competition, time) => {
        competition.rounds[0].testClosedAt = new Date(time - 1000).toISOString();
        if (scenario === 'all-loss')
          competition.rounds[0].testResolvedAt = new Date(time).toISOString();
        advance(
          competition,
          scenario === 'early-winner' || scenario === 'all-loss'
            ? {
                fixture: {
                  outcome: scenario === 'all-loss' ? 'draw' : 'home',
                  home: 1,
                  away: scenario === 'all-loss' ? 1 : 0,
                  confirmedAt: new Date(time).toISOString(),
                },
              }
            : {},
          time,
        );
      });
      const completed = await restarted.load(id);
      assert.equal(completed.state, scenario === 'all-missed' ? 'cancelled' : 'complete');
      const winners = completed.entries.filter((entry) => entry.status === 'winner');
      assert.equal(winners.length, scenario === 'all-missed' ? 0 : scenario === 'all-loss' ? 2 : 1);
      if (scenario === 'early-winner' || scenario === 'sole-picker')
        assert.ok(
          Date.parse(completed.rounds[0].finalizedAt) < Date.parse(completed.rounds[0].resolveAt),
          'A sole survivor is finalized before the scheduled resolution time.',
        );
      if (scenario === 'all-loss')
        assert.ok(winners.every((entry) => entry.picks['0'].result === 'rescued'));
      const snapshot = JSON.stringify(completed);
      await Promise.all(
        Array.from({ length: 6 }, async (_, index) => {
          const source = index % 2 ? restarted : store;
          const ledger = index % 2 ? replayRewards : rewards;
          const persisted = await source.change(id, (competition, time) => {
            // Even contradictory late evidence cannot rewrite an already paid outcome.
            advance(
              competition,
              {
                fixture: {
                  outcome: 'away',
                  home: 0,
                  away: 1,
                  confirmedAt: new Date(time).toISOString(),
                },
              },
              time,
            );
          });
          await ledger.credit(prizeRound(persisted), true);
        }),
      );
      assert.equal(JSON.stringify(await restarted.load(id)), snapshot);
      const creditRows = (
        await pool.query(
          'SELECT id,wallet,amount::text AS amount FROM streak_five_credits WHERE starts_with(id,$1) ORDER BY id',
          [`survivor.${id}:`],
        )
      ).rows;
      const expected =
        scenario === 'all-missed'
          ? [
              {
                id: `survivor.${id}:refund:${completed.fundingIntentId}`,
                wallet: completed.creatorWallet,
                amount: prize,
              },
            ]
          : [
              ...winners.map((entry) => ({
                id: `survivor.${id}:prize:${entry.publicId}`,
                wallet: entry.wallet,
                amount: (BigInt(prize) / BigInt(winners.length)).toString(),
              })),
              ...(scenario === 'all-loss'
                ? [
                    {
                      id: `survivor.${id}:prize:creator-remainder`,
                      wallet: completed.creatorWallet,
                      amount: '1',
                    },
                  ]
                : []),
            ];
      assert.deepEqual(
        creditRows,
        expected.sort((a, b) => a.id.localeCompare(b.id)),
      );
      assert.equal(
        creditRows.reduce((sum, row) => sum + BigInt(row.amount), 0n),
        BigInt(prize),
      );
      const wallets = creditRows.map((row) => row.wallet);
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM streak_five_claim_requests WHERE wallet=ANY($1::text[])',
            [wallets],
          )
        ).rows[0].n,
        wallets.length,
      );
      await pool.query('DELETE FROM streak_five_claim_requests WHERE wallet=ANY($1::text[])', [
        wallets,
      ]);
      await replayRewards.credit(prizeRound(await restarted.load(id)), true);
      assert.equal(
        (
          await pool.query(
            'SELECT count(*)::int AS n FROM streak_five_claim_requests WHERE wallet=ANY($1::text[])',
            [wallets],
          )
        ).rows[0].n,
        0,
        'Replaying an already consumed prize or refund cannot create another payment request.',
      );
    }
    console.log(
      'PASS Survivor PostgreSQL: concurrent entry/deadline recovery; persisted early winners, all-loss shares, cancellation refunds and idempotent credit replay.',
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

require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { ccc } = require('@ckb-ccc/core');
const { DummyFiveFeed, sampleFixtures } = require('../dist/modules/games-test/data');
const { TestGameControls } = require('../dist/modules/games-test/runtime');
const { testPool } = require('../dist/modules/games-test/runtime');
const { bindTestWallet, assertGameScope } = require('../dist/modules/games-test/scope');
const { newRound, parseTerms } = require('../dist/modules/five/domain');
const { FiveService } = require('../dist/modules/five/service');
const { PgFiveProfiles } = require('../dist/modules/five/profile');
const { FiveFunding } = require('../dist/modules/five/funding');
const { FiveRewards } = require('../dist/modules/five/rewards');
const { PgFiveStorage } = require('../dist/modules/five/storage');
const { SurvivorService } = require('../dist/modules/survivor/service');
const { PgSurvivorStorage } = require('../dist/modules/survivor/storage');
async function main() {
  assert.ok(process.env.PG_TEST_URL);
  const url = new URL(process.env.PG_TEST_URL);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname));
  assert.match(url.pathname, /^\/[a-zA-Z0-9_]+_test$/);
  assert.equal(url.search, '');
  const schema = 'games_test_' + randomUUID().replaceAll('-', '');
  const admin = new Pool({ connectionString: url.href });
  let pool,
    scopePool,
    ownsScope = false;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({ connectionString: url.href, options: `-c search_path=${schema}`, max: 5 });
    const fiveStore = new PgFiveStorage(pool),
      survivorStore = new PgSurvivorStorage(pool);
    const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
    const wallet = new ccc.SignerCkbPrivateKey(client, '0x' + '19'.repeat(32));
    const address = await wallet.getRecommendedAddress();
    const owner = { id: 'admin', name: 'Admin', wallet: address };
    const other = { id: 'other', name: 'Other', wallet: 'dummy-other' };
    const feed = new DummyFiveFeed();
    const funding = new FiveFunding(fiveStore, client, address);
    const profiles = new PgFiveProfiles(pool);
    await profiles.save(owner.id, owner.name);
    const five = new FiveService(fiveStore, [address], feed, funding, undefined, false, profiles);
    const survivor = new SurvivorService(
      survivorStore,
      [address],
      () => sampleFixtures(anchor),
      () => ({}),
      true,
    );
    const anchor = Date.now();
    const controls = new TestGameControls(fiveStore, survivorStore, feed, five, survivor, funding);
    const control = (game, action, id, rest = {}) =>
      controls.action(owner, { game, action, id, ...rest });
    await assert.rejects(
      controls.action(other, { game: 'five', action: 'start', id: 'denied' }),
      /Only/,
    );
    const ordinaryTerms = parseTerms(await feed.catalogue(1));
    await fiveStore.create('ordinary', 'admin', (now) => ({
      ...newRound('ordinary', 'admin', ordinaryTerms, now),
      state: 'open',
    }));
    await assert.rejects(control('five', 'close', 'ordinary'), /synthetic/);
    await control('five', 'start', 'five1');
    const r = await fiveStore.load('five1'),
      hash = r.termsHash;
    await five.action(owner, {
      action: 'enter',
      id: r.id,
      players: ['1', '7', '13', '19', '25'],
      captain: '13',
      termsHash: hash,
    });
    await assert.rejects(control('five', 'results', r.id), /Close/);
    await control('five', 'close', r.id);
    const firstClose = (await fiveStore.load(r.id)).testClosedAt;
    assert.equal(
      (await five.read(owner)).currentRoundId,
      r.id,
      'Controlled deadline becomes the current team immediately',
    );
    assert.equal((await fiveStore.list()).find((item) => item.id === r.id).lockAt, firstClose);
    await control('five', 'close', r.id);
    assert.equal((await fiveStore.load(r.id)).testClosedAt, firstClose);
    await assert.rejects(
      five.action(owner, {
        action: 'enter',
        id: r.id,
        players: ['1', '7', '13', '19', '25'],
        captain: '13',
        termsHash: hash,
      }),
      /closed/,
    );
    await control('five', 'results', r.id);
    await control('five', 'finalize', r.id);
    assert.equal((await fiveStore.load(r.id)).state, 'final');
    assert.equal((await fiveStore.load(r.id)).termsHash, hash);
    assert.equal(
      (await new PgFiveStorage(pool).load(r.id)).testClosedAt,
      firstClose,
      'Restart keeps controlled deadlines',
    );
    await control('five', 'start', 'five2');
    assert.equal((await five.read(owner, 'five2')).detail.state, 'open');
    assert.equal(
      (await five.read(owner)).detail.id,
      r.id,
      'A new dummy round does not hide the previous team and points',
    );
    await fiveStore.change('ordinary', (r) => {
      r.testClosedAt = firstClose;
    });
    assert.equal(
      (await fiveStore.list()).find((item) => item.id === 'ordinary').lockAt,
      ordinaryTerms.lockAt,
      'Ordinary gameweeks ignore synthetic close timestamps',
    );
    // Hold transaction validation while the admin closes the same database row.
    // Signature verification is stubbed here; devnet tests cover actual signing.
    const payer = {
      id: 'payer',
      name: 'Payer',
      wallet: await new ccc.SignerCkbPrivateKey(
        client,
        '0x' + '20'.repeat(32),
      ).getRecommendedAddress(),
    };
    const intent = {
      sponsorId: 'race',
      amountShannons: '10000000000',
      display: 'anonymous',
      custodyAccepted: true,
    };
    await funding.intent(payer, 'five2', intent);
    let releaseValidation, sawValidation;
    const validationStarted = new Promise((resolve) => {
      sawValidation = resolve;
    });
    class DelayedFunding extends FiveFunding {
      async validate() {
        sawValidation();
        return new Promise((resolve) => {
          releaseValidation = () => resolve(ccc.Transaction.from({}));
        });
      }
    }
    const racing = new DelayedFunding(fiveStore, client, address).submit(payer, 'five2', {
      sponsorId: 'race',
      signedBytes: '0x00',
    });
    await validationStarted;
    await control('five', 'close', 'five2');
    releaseValidation();
    await assert.rejects(racing, /deadline has passed/);
    assert.equal((await fiveStore.load('five2')).sponsors[0].signedBytes, undefined);
    const slates = (await survivor.read(owner)).slates;
    await survivor.action(owner, {
      action: 'create',
      id: 'survivor',
      terms: {
        name: 'Synthetic Survivor',
        mode: 'free',
        feeShannons: '0',
        prizeShannons: '0',
        limit: 10,
      },
      roundKeys: slates.map((s) => s.key),
    });
    await survivor.action(owner, { action: 'publish', id: 'survivor' });
    let c = await survivorStore.load('survivor');
    for (const actor of [owner, other]) {
      await survivor.action(actor, { action: 'join', id: c.id, termsHash: c.termsHash });
      await survivor.action(actor, { action: 'pick', id: c.id, round: 0, teamId: '1' });
    }
    const survivorHash = c.termsHash;
    await control('survivor', 'close', c.id, { round: 0 });
    await assert.rejects(
      survivor.action(owner, { action: 'pick', id: c.id, round: 0, teamId: '2' }),
      /locked|closed/i,
    );
    await control('survivor', 'results', c.id, { round: 0, scenario: 'home' });
    c = await survivorStore.load(c.id);
    assert.equal(c.currentRound, 1);
    assert.equal(c.termsHash, survivorHash);
    assert.equal(c.entries[0].status, 'active');
    await assert.rejects(control('survivor', 'close', c.id, { round: 0 }), /Refresh/);
    await assert.rejects(
      survivor.action(owner, { action: 'pick', id: c.id, round: 1, teamId: '1' }),
      /already|used/i,
    );
    await survivor.action(owner, { action: 'pick', id: c.id, round: 1, teamId: '3' });
    await survivor.action(other, { action: 'pick', id: c.id, round: 1, teamId: '4' });
    await control('survivor', 'close', c.id, { round: 1 });
    await control('survivor', 'results', c.id, { round: 1, scenario: 'home' });
    c = await survivorStore.load(c.id);
    assert.equal(c.state, 'complete');
    assert.equal(c.entries.find((e) => e.accountId === owner.id).status, 'winner');
    assert.equal(c.entries.find((e) => e.accountId === other.id).status, 'out');
    // Same physical database still gets a separate namespace, even through a URL alias.
    assert.equal(
      (await admin.query("SELECT to_regnamespace('streak_games_test') AS ns")).rows[0].ns,
      null,
      'This test must own its reserved schema',
    );
    ownsScope = true;
    scopePool = testPool(url.href);
    await bindTestWallet(scopePool, address);
    await assert.rejects(bindTestWallet(scopePool, 'another-wallet'), /another rewards wallet/);
    await assert.rejects(assertGameScope(scopePool, false), /scope/);
    await assert.rejects(new PgFiveStorage(scopePool).list(), /scope/);
    assert.equal((await new PgFiveStorage(scopePool, true).list()).length, 0);
    await assert.rejects(new PgFiveProfiles(scopePool).get(owner.id), /scope/);
    const testProfiles = new PgFiveProfiles(scopePool, true);
    assert.equal(
      await testProfiles.get(owner.id),
      null,
      'test names do not inherit ordinary names',
    );
    await testProfiles.save(owner.id, 'Synthetic Test Manager');
    assert.equal((await profiles.get(owner.id)).displayName, owner.name);
    assert.equal((await testProfiles.get(owner.id)).displayName, 'Synthetic Test Manager');
    const fallbackPool = new Pool({
      connectionString: url.href,
      options: '-c search_path=public,streak_games_test',
    });
    try {
      await assert.rejects(assertGameScope(fallbackPool, false), /scope/);
      await assert.rejects(
        new FiveRewards(fallbackPool, client, address).request(address),
        /scope/,
      );
      await assert.rejects(assertGameScope(fallbackPool, true), /scope/);
    } finally {
      await fallbackPool.end();
    }
    assert.ok((await fiveStore.list()).length > 0, 'Regular namespace records remain separate');
    console.log(
      'Same-service Five and Survivor immediate lifecycle, authorization, durable deadlines and no-reuse passed',
    );
  } finally {
    await pool?.end();
    await scopePool?.end();
    if (ownsScope) await admin.query('DROP SCHEMA streak_games_test CASCADE');
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

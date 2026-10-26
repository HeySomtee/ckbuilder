import { Pool } from 'pg';
import { ccc } from '@ckb-ccc/core';
import { postgresConfig } from '../../infrastructure/postgres-config';
import { FiveError, identifier, newRound, object, parseTerms } from '../five/domain';
import { FiveService, type Actor } from '../five/service';
import { FiveFunding } from '../five/funding';
import { FiveRewards } from '../five/rewards';
import { PgFiveStorage } from '../five/storage';
import { lockTime, TEST_TIMING_POLICY } from '../five/timing';
import { PgSurvivorStorage } from '../survivor/storage';
import { SurvivorService } from '../survivor/service';
import { advance, lockTime as survivorLockTime, type Result } from '../survivor/domain';
import { DummyFiveFeed, sampleFixtures } from './data';
import { bindTestWallet, TEST_SCHEMA } from './scope';

function databaseIdentity(value: string) {
  const url = new URL(value);
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
}
export function testConfig(env: NodeJS.ProcessEnv = process.env) {
  const database = env.STREAK_GAMES_TEST_DATABASE_URL;
  if (env.STREAK_GAMES_TEST_ENABLED !== '1' || env.STREAK_FIVE_NETWORK !== 'testnet' || !database)
    throw new FiveError('In-app test mode is not configured on this instance.', 503);
  for (const normal of [
    env.DATABASE_URL,
    env.STREAK_FIVE_DATABASE_URL,
    env.STREAK_SURVIVOR_DATABASE_URL,
  ])
    if (normal && databaseIdentity(normal) === databaseIdentity(database))
      throw new FiveError('Test games require a separate database.', 503);
  const address = env.STREAK_GAMES_TEST_REWARDS_ADDRESS;
  if (
    !address ||
    !/^ckt1[a-z0-9]{20,250}$/.test(address) ||
    address === env.STREAK_FIVE_REWARDS_ADDRESS
  )
    throw new FiveError('Test games require a separate testnet rewards wallet.', 503);
  return { database, address };
}
function admins(value: string | undefined) {
  const list = (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length > 10 || list.some((s) => !/^ckt1[a-z0-9]{20,250}$/.test(s)))
    throw new FiveError('Test game admin configuration needs attention.', 503);
  return list;
}
export function testPool(database: string) {
  const url = new URL(database);
  url.searchParams.delete('options');
  const pool = new Pool({
    ...postgresConfig(url.href),
    options: `-c search_path=${TEST_SCHEMA}`,
    max: 3,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', () => console.warn('[games-test] database connection interrupted'));
  return pool;
}
export class TestGameControls {
  constructor(
    private readonly fiveStore: PgFiveStorage,
    private readonly survivorStore: PgSurvivorStorage,
    private readonly feed: DummyFiveFeed,
    readonly five: FiveService,
    readonly survivor: SurvivorService,
    private readonly funding: FiveFunding,
  ) {}
  async action(actor: Actor, input: unknown) {
    const body = object(input),
      id = identifier(body.id);
    const five = body.game === 'five';
    if (body.game !== 'five' && body.game !== 'survivor') throw new FiveError('Choose a game.');
    if (!(five ? this.five.isAdmin(actor) : this.survivor.isAdmin(actor)))
      throw new FiveError('Only the configured game admin can control test rounds.', 403);
    if (five) {
      if (body.action === 'start') {
        const existing = await this.fiveStore.load(id);
        if (existing) {
          if (existing.terms.testingPolicy !== TEST_TIMING_POLICY)
            throw new FiveError('Not a test round.', 409);
          return this.five.read(actor, id);
        }
        const event = (await this.fiveStore.list()).length + 1;
        const terms = {
          ...parseTerms(await this.feed.catalogue(event)),
          testingPolicy: TEST_TIMING_POLICY,
        };
        await this.fiveStore.create(id, actor!.id, (now) => ({
          ...newRound(id, actor!.id, terms, now),
          state: 'open',
        }));
      } else {
        await this.fiveStore.change(id, (r, now) => {
          if (r.terms.testingPolicy !== TEST_TIMING_POLICY || r.state !== 'open')
            throw new FiveError('Choose an open synthetic gameweek.', 409);
          if (body.action === 'close') r.testClosedAt ??= new Date(now).toISOString();
          else if (body.action === 'results') {
            if (now < lockTime(r))
              throw new FiveError('Close picks and bidding before applying results.', 409);
            r.testResultsAt ??= new Date(now).toISOString();
          } else if (body.action !== 'finalize') throw new FiveError('Unknown test control.');
        });
        if (body.action === 'results') {
          const r = (await this.fiveStore.load(id))!;
          const event = Number(/Synthetic gameweek (\d+)/.exec(r.terms.source)?.[1] ?? 1);
          const result = await this.feed.results(event, r.terms);
          await this.five.action(actor, { id, action: 'scores', ...result });
        }
        if (body.action === 'finalize') {
          await this.funding.reconcile(id);
          await this.funding.settleAuction(id);
          const r = (await this.fiveStore.load(id))!;
          await this.five.action(actor, { id, action: 'finalize', revision: r.revision });
        }
      }
      return this.five.read(actor, id);
    }
    await this.survivorStore.change(id, (c, now) => {
      const r = c.rounds[c.currentRound];
      if (
        !['open', 'running'].includes(c.state) ||
        r.testingPolicy !== TEST_TIMING_POLICY ||
        body.round !== c.currentRound
      )
        throw new FiveError('Refresh the current synthetic Survivor round.', 409);
      if (body.action === 'close') {
        r.testClosedAt ??= new Date(now).toISOString();
        advance(c, {}, now);
      } else if (body.action === 'results') {
        if (now < survivorLockTime(r))
          throw new FiveError('Close picks before applying results.', 409);
        if (!['mixed', 'home', 'away', 'draw', 'void'].includes(String(body.scenario)))
          throw new FiveError('Choose a synthetic result scenario.');
        r.testResolvedAt ??= new Date(now).toISOString();
        const results: Record<string, Result> = {};
        if (body.scenario !== 'void')
          r.fixtures.forEach((f, i) => {
            const outcome =
              body.scenario === 'mixed'
                ? i % 3 === 0
                  ? 'draw'
                  : i % 2 === 0
                    ? 'away'
                    : 'home'
                : (body.scenario as 'home' | 'away' | 'draw');
            results[f.id] = {
              outcome,
              home: outcome === 'away' ? 0 : 2,
              away: outcome === 'home' ? 0 : 2,
              confirmedAt: new Date(now).toISOString(),
            };
          });
        advance(c, results, now);
      } else throw new FiveError('Unknown test control.');
      c.audit.push({
        at: new Date(now).toISOString(),
        action: `test-admin-${String(body.action)}`,
        round: Number(body.round),
      });
    });
    return this.survivor.read(actor, id);
  }
}
let runtime: Promise<TestGameControls> | undefined;
export function testGames() {
  testConfig();
  runtime ??= (async () => {
    const config = testConfig(),
      pool = testPool(config.database);
    try {
      await bindTestWallet(pool, config.address);
      await pool.query(
        'CREATE TABLE IF NOT EXISTS streak_test_schedule (id integer PRIMARY KEY CHECK(id=1), anchor timestamptz NOT NULL)',
      );
      await pool.query(
        'INSERT INTO streak_test_schedule(id,anchor) VALUES(1,clock_timestamp()) ON CONFLICT DO NOTHING',
      );
      // New catalogues may roll forward; published competitions keep their stored slates.
      await pool.query(
        "UPDATE streak_test_schedule SET anchor=clock_timestamp() WHERE anchor < clock_timestamp()-interval '7 days'",
      );
      const row = await pool.query<{ anchor: Date }>(
        'SELECT anchor FROM streak_test_schedule WHERE id=1',
      );
      const fixtures = sampleFixtures(row.rows[0].anchor.getTime());
      const store = new PgFiveStorage(pool, true),
        survivorStore = new PgSurvivorStorage(pool, true),
        feed = new DummyFiveFeed();
      const client = new ccc.ClientPublicTestnet({
        url: 'https://testnet.ckb.dev/',
        fallbacks: [],
        timeout: 10000,
        maxConcurrent: 2,
      });
      const funding = new FiveFunding(store, client, config.address),
        rewards = new FiveRewards(pool, client, config.address, true);
      const five = new FiveService(
        store,
        admins(process.env.STREAK_FIVE_ADMIN_WALLETS ?? process.env.STREAK_SURVIVOR_ADMIN_WALLETS),
        feed,
        funding,
        rewards,
      );
      const survivor = new SurvivorService(
        survivorStore,
        admins(process.env.STREAK_SURVIVOR_ADMIN_WALLETS),
        () => fixtures,
        () => ({}),
        true,
      );
      return new TestGameControls(store, survivorStore, feed, five, survivor, funding);
    } catch (error) {
      await pool.end();
      throw error;
    }
  })().catch((error) => {
    runtime = undefined;
    throw error;
  });
  return runtime;
}

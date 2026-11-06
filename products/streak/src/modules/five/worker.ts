import { ccc } from '@ckb-ccc/core';
import { Pool, type QueryConfig } from 'pg';
import { DueWork } from '../../infrastructure/due-work';
import {
  installWorkerHealthProbe,
  workerHealthConfigured,
} from '../../infrastructure/worker-health';
import { RewardWorkQueue } from './work-queue';
import { isAuction } from './auction';
import { lockTime } from './timing';
import { lockTime as survivorLockTime } from '../survivor/domain';
import { postgresConfig } from '../../infrastructure/postgres-config';
import { PgFiveStorage } from './storage';
import { FiveFunding } from './funding';
import { FiveRewards } from './rewards';
import { testConfig, testPool } from '../games-test/runtime';
import { bindTestWallet } from '../games-test/scope';
import { PgSurvivorStorage } from '../survivor/storage';
import { SurvivorPrizes } from '../survivor/prizes';

/** Dedicated process: no legacy or prediction signing material, no .env loading. */
async function main() {
  if (process.env.STREAK_FIVE_NETWORK !== 'testnet') throw Error('Set STREAK_FIVE_NETWORK=testnet');
  const testing = process.argv.includes('--games-test');
  const config = testing ? testConfig() : null;
  const key = testing
      ? process.env.STREAK_GAMES_TEST_REWARDS_PRIVATE_KEY
      : process.env.STREAK_FIVE_REWARDS_PRIVATE_KEY,
    address = config?.address ?? process.env.STREAK_FIVE_REWARDS_ADDRESS;
  const database =
    config?.database ??
    process.env.STREAK_FIVE_DATABASE_URL ??
    process.env.STREAK_SURVIVOR_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!key || !address || !database)
    throw Error('Configure the dedicated Five rewards wallet and database');
  if (process.env.TREASURY_PRIVATE_KEY || process.env.STREAK_DIRECT_PRIVATE_KEY)
    throw Error('Run Five rewards separately from other signing keys');
  if (testing && process.env.STREAK_FIVE_REWARDS_PRIVATE_KEY)
    throw Error('Run test rewards separately from the regular rewards signer');
  const pool = testing
    ? testPool(database)
    : new Pool({ ...postgresConfig(database), max: 3, connectionTimeoutMillis: 5000 });
  if (testing) await bindTestWallet(pool, address);
  pool.on('error', () => console.warn('[five-rewards] database connection interrupted'));
  const client = new ccc.ClientPublicTestnet({
    url: 'https://testnet.ckb.dev/',
    fallbacks: [],
    timeout: 10000,
    maxConcurrent: 2,
  });
  const signer = new ccc.SignerCkbPrivateKey(client, key),
    store = new PgFiveStorage(pool, testing);
  if ((await signer.getRecommendedAddress()) !== address)
    throw Error('Dedicated Five rewards address does not match signer');
  const funding = new FiveFunding(store, client, address),
    rewards = new FiveRewards(pool, client, address, testing);
  const survivorStore = new PgSurvivorStorage(pool, testing);
  const survivor = new SurvivorPrizes(survivorStore, rewards);
  await store.list();
  await survivorStore.list();
  await rewards.init();
  const queue = new RewardWorkQueue(pool);
  await queue.initialize();
  await queue.seed();
  const hostedHealth = workerHealthConfigured();
  let stopped = false;
  let current: Promise<number> | undefined;
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const run = async (): Promise<number> => {
    for (const job of await queue.due()) {
      if (stopped) break;
      let next: number | null = null;
      try {
        if (job.kind === 'five') {
          await funding.reconcile(job.subject);
          await funding.settleAuction(job.subject);
          const round = await store.load(job.subject);
          if (round) {
            await rewards.credit(round);
            if (round.sponsors.some((s) => s.signedBytes && s.funding === 'submitted'))
              next = Date.now() + 10_000;
            else if (isAuction(round) && !round.auction && round.state === 'open')
              next = Math.max(Date.now() + 10_000, lockTime(round));
          }
        } else if (job.kind === 'survivor') {
          await survivor.tick(job.subject);
          const competition = await survivorStore.load(job.subject);
          if (competition?.prizeFunding?.funding === 'submitted') next = Date.now() + 10_000;
          else if (competition?.state === 'draft' && competition.prizeFunding?.signedBytes)
            next = Math.max(Date.now() + 10_000, survivorLockTime(competition.rounds[0]));
        } else {
          await rewards.tick(signer, (id) =>
            id.startsWith('survivor.') ? survivor.verify(id.slice(9)) : funding.verifyConfirmed(id),
          );
          if (await rewards.pendingWork()) next = Date.now() + 10_000;
        }
      } catch {
        next = Date.now() + 30_000;
        console.warn('[five-rewards] saved work deferred; financial records retained');
      }
      await queue.complete(job, next);
    }
    if (!hostedHealth) await rewards.heartbeat();
    return Math.min(await queue.delay(), hostedHealth ? 15 * 60_000 : 10_000);
  };
  const work = new DueWork(
    () => {
      current = run().finally(() => {
        current = undefined;
      });
      return current;
    },
    () => console.warn('[five-rewards] delivery paused; saved work retained'),
    30_000,
    true,
  );
  const removeHealth = installWorkerHealthProbe(
    async () => {
      if (stopped) return false;
      // pg supports per-query timeouts; its current QueryConfig types omit it.
      const probe: QueryConfig & { query_timeout: number } = {
        text: 'SELECT 1',
        query_timeout: 2000,
      };
      await Promise.all([pool.query(probe), client.getTipHeader()]);
      return !stopped;
    },
    () => work.wake(),
  );
  const stop = () => {
    stopped = true;
    work.stop();
    finish();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    work.start();
    await finished;
    await current;
  } finally {
    work.stop();
    removeHealth();
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    await pool.end();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error('[five-rewards] startup failed; check dedicated testnet configuration');
    process.exitCode = 1;
  });

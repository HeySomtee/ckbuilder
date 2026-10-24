import { ccc } from '@ckb-ccc/core';
import { Pool } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { postgresConfig } from '../../infrastructure/postgres-config';
import { PgFiveStorage } from './storage';
import { FiveFunding } from './funding';
import { FiveRewards } from './rewards';

/** Dedicated process: no legacy or prediction signing material, no .env loading. */
async function main() {
  if (process.env.STREAK_FIVE_NETWORK !== 'testnet') throw Error('Set STREAK_FIVE_NETWORK=testnet');
  const key = process.env.STREAK_FIVE_REWARDS_PRIVATE_KEY,
    address = process.env.STREAK_FIVE_REWARDS_ADDRESS;
  const database =
    process.env.STREAK_FIVE_DATABASE_URL ??
    process.env.STREAK_SURVIVOR_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!key || !address || !database)
    throw Error('Configure the dedicated Five rewards wallet and database');
  if (process.env.TREASURY_PRIVATE_KEY || process.env.STREAK_DIRECT_PRIVATE_KEY)
    throw Error('Run Five rewards separately from other signing keys');
  const pool = new Pool({ ...postgresConfig(database), max: 3, connectionTimeoutMillis: 5000 });
  pool.on('error', () => console.warn('[five-rewards] database connection interrupted'));
  const client = new ccc.ClientPublicTestnet({
    url: 'https://testnet.ckb.dev/',
    fallbacks: [],
    timeout: 10000,
    maxConcurrent: 2,
  });
  const signer = new ccc.SignerCkbPrivateKey(client, key),
    store = new PgFiveStorage(pool);
  if ((await signer.getRecommendedAddress()) !== address)
    throw Error('Dedicated Five rewards address does not match signer');
  const funding = new FiveFunding(store, client, address),
    rewards = new FiveRewards(pool, client, address);
  let stopped = false,
    cursor = 0;
  const credited = new Map<string, number>();
  process.on('SIGTERM', () => {
    stopped = true;
  });
  process.on('SIGINT', () => {
    stopped = true;
  });
  try {
    while (!stopped) {
      try {
        const rounds = await store.list();
        const batch = [...rounds.slice(cursor), ...rounds.slice(0, cursor)].slice(0, 4);
        cursor = (cursor + batch.length) % Math.max(rounds.length, 1);
        for (const r of batch) {
          try {
            await funding.reconcile(r.id);
            await funding.settleAuction(r.id);
            const round = await store.load(r.id);
            if (round && credited.get(round.id) !== round.revision) {
              await rewards.credit(round);
              credited.set(round.id, round.revision);
            }
          } catch {
            console.warn('[five-rewards] gameweek refresh deferred');
          }
        }
        await rewards.tick(signer, (id) => funding.verifyConfirmed(id));
        await rewards.heartbeat();
      } catch {
        console.warn('[five-rewards] delivery paused; saved transactions retained for retry');
      }
      if (!stopped) await delay(10000);
    }
  } finally {
    await pool.end();
  }
}
if (require.main === module)
  void main().catch(() => {
    console.error('[five-rewards] startup failed; check dedicated testnet configuration');
    process.exitCode = 1;
  });

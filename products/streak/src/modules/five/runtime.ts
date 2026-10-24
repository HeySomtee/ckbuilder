import { Pool } from 'pg';
import { getPool, pgEnabled } from '../../store_pg';
import { postgresConfig } from '../../infrastructure/postgres-config';
import { FiveError } from './domain';
import { FplFiveFeed } from './feed';
import { FiveService } from './service';
import { PgFiveStorage } from './storage';
import { ccc } from '@ckb-ccc/core';
import { FiveFunding } from './funding';
import { FiveRewards } from './rewards';
let service: FiveService | undefined;
export function fiveService() {
  if (process.env.STREAK_FIVE_NETWORK && process.env.STREAK_FIVE_NETWORK !== 'testnet')
    throw new FiveError('Streak Five currently supports testnet only.', 503);
  if (service) return service;
  const database = process.env.STREAK_FIVE_DATABASE_URL ?? process.env.STREAK_SURVIVOR_DATABASE_URL;
  if (!database && !pgEnabled())
    throw new FiveError('Streak Five needs its persistent database connection.', 503);
  const admins = (
    process.env.STREAK_FIVE_ADMIN_WALLETS ??
    process.env.STREAK_SURVIVOR_ADMIN_WALLETS ??
    ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (admins.length > 10 || admins.some((a) => !/^ckt1[a-z0-9]{20,250}$/.test(a)))
    throw new FiveError('Five admin configuration needs attention.', 503);
  const pool = database
    ? new Pool({
        ...postgresConfig(database),
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5000,
      })
    : getPool();
  if (database) pool.on('error', () => console.warn('[five] database connection interrupted'));
  const store = new PgFiveStorage(pool),
    address = process.env.STREAK_FIVE_REWARDS_ADDRESS;
  const client = new ccc.ClientPublicTestnet({
    url: 'https://testnet.ckb.dev/',
    fallbacks: [],
    timeout: 10000,
    maxConcurrent: 2,
  });
  service = new FiveService(
    store,
    admins,
    new FplFiveFeed(process.env.STREAK_FIVE_FPL_ENABLED === '1'),
    address ? new FiveFunding(store, client, address) : undefined,
    address ? new FiveRewards(pool, client, address) : undefined,
    process.env.STREAK_FIVE_FPL_ENABLED === '1',
  );
  return service;
}

export function startFiveProgression() {
  if (process.env.STREAK_FIVE_FPL_ENABLED !== '1') return () => {};
  const tick = () => {
    void Promise.resolve()
      .then(() => fiveService().progress())
      .catch(() => console.warn('[five] automatic gameweek refresh deferred'));
  };
  tick();
  const timer = setInterval(tick, 60_000);
  timer.unref();
  return () => clearInterval(timer);
}

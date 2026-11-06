import { getPool, pgEnabled } from '../../store_pg';
import { provider } from '../../providers';
import { PgSurvivorStorage } from './storage';
import { SurvivorService } from './service';
import { SurvivorError } from './domain';
import { Pool } from 'pg';
import { postgresConfig } from '../../infrastructure/postgres-config';
import { FplFiveFeed } from '../five/feed';
import { ccc } from '@ckb-ccc/core';
import { FiveRewards } from '../five/rewards';
import { SurvivorPrizes } from './prizes';
import { sharedPrizeDatabase } from './config';

let service: SurvivorService | undefined;
export function survivorService() {
  const dedicatedDatabase = process.env.STREAK_SURVIVOR_DATABASE_URL;
  if (!dedicatedDatabase && !pgEnabled())
    throw new SurvivorError(
      'Survivor needs its persistent database connection. Please try again shortly.',
      503,
    );
  if (!service) {
    const fpl = new FplFiveFeed(process.env.STREAK_FIVE_FPL_ENABLED === '1');
    const admins = (process.env.STREAK_SURVIVOR_ADMIN_WALLETS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (admins.length > 10 || admins.some((a) => !/^ckt1[a-z0-9]{20,250}$/.test(a)))
      throw new SurvivorError('Survivor admin configuration needs attention.', 503);
    // Local development can keep its existing file-backed accounts and ledger
    // while Survivor uses the same durable PostgreSQL adapter as hosted play.
    const pool = dedicatedDatabase
      ? new Pool({
          ...postgresConfig(dedicatedDatabase),
          max: 3,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
        })
      : getPool();
    if (dedicatedDatabase)
      pool.on('error', () => console.warn('[survivor] database connection interrupted'));
    const storage = new PgSurvivorStorage(pool);
    const address = process.env.STREAK_FIVE_REWARDS_ADDRESS;
    const shared = sharedPrizeDatabase(process.env);
    const prizes =
      address && shared
        ? new SurvivorPrizes(
            storage,
            new FiveRewards(
              pool,
              new ccc.ClientPublicTestnet({
                url: 'https://testnet.ckb.dev/',
                fallbacks: [],
                timeout: 10000,
                maxConcurrent: 2,
              }),
              address,
            ),
          )
        : undefined;
    service = new SurvivorService(
      storage,
      admins,
      () =>
        provider.id === 'football'
          ? (provider.survivorFixtures?.() ??
            provider.scheduleFixtures?.() ??
            provider.loadFixtures())
          : [],
      () => provider.fixtureObservationHistory?.() ?? provider.fixtureObservations?.() ?? {},
      false,
      async () => new Map((await fpl.season()).events.map((e) => [e.id, e.deadline])),
      prizes,
      address && !shared
        ? 'Creator prizes require Survivor and Five rewards to use the same database. Existing competitions remain available.'
        : '',
    );
  }
  return service;
}
export async function tickSurvivor() {
  if ((!process.env.STREAK_SURVIVOR_DATABASE_URL && !pgEnabled()) || provider.id !== 'football')
    return;
  const current = survivorService();
  return current.tick();
}

import { getPool, pgEnabled } from '../../store_pg';
import { provider } from '../../providers';
import { PgSurvivorStorage } from './storage';
import { SurvivorService } from './service';
import { SurvivorError } from './domain';
import { Pool } from 'pg';
import { postgresConfig } from '../../infrastructure/postgres-config';

let service: SurvivorService | undefined;
export function survivorService() {
  const dedicatedDatabase = process.env.STREAK_SURVIVOR_DATABASE_URL;
  if (!dedicatedDatabase && !pgEnabled())
    throw new SurvivorError(
      'Survivor needs its persistent database connection. Please try again shortly.',
      503,
    );
  if (!service) {
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
    service = new SurvivorService(
      new PgSurvivorStorage(pool),
      admins,
      () =>
        provider.id === 'football'
          ? (provider.scheduleFixtures?.() ?? provider.loadFixtures())
          : [],
      () => provider.fixtureObservationHistory?.() ?? provider.fixtureObservations?.() ?? {},
    );
  }
  return service;
}
export async function tickSurvivor() {
  if ((!process.env.STREAK_SURVIVOR_DATABASE_URL && !pgEnabled()) || provider.id !== 'football')
    return;
  const current = survivorService();
  await current.tick();
}

import * as ccc from '@ckb-ccc/core';
import { Pool } from 'pg';
import type { ActivityPage } from '../../../shared/activity-wire';
import { postgresConfig } from '../../infrastructure/postgres-config';
import { getPool, pgEnabled } from '../../store_pg';
import { DirectRegistry, V4_DIRECT_CONFIG } from '../direct/registry';
import { sponsorProxy } from '../direct/sponsor-proxy';
import { readActivityMarket } from './chain';
import { ActivityService } from './service';
import { PgActivityStorage } from './storage';

const client = new ccc.ClientPublicTestnet({
  url: 'https://testnet.ckb.dev/',
  fallbacks: [],
  timeout: 10_000,
  maxConcurrent: 2,
});
let instance: ActivityService | undefined;
let stop: (() => void) | undefined;

export function activityService(): ActivityService | undefined {
  if (instance) return instance;
  // Keep local file-backed identities intact while using the same durable index
  // as hosted play. Production continues to share DATABASE_URL by default.
  const database = process.env.STREAK_ACTIVITY_DATABASE_URL;
  if (!database && !pgEnabled()) return undefined;
  const pool = database
    ? new Pool({
        ...postgresConfig(database),
        max: 3,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      })
    : getPool();
  if (database) pool.on('error', () => console.warn('[activity] database connection interrupted'));
  instance = new ActivityService(new PgActivityStorage(pool), {
    catalogue: async () =>
      [
        new DirectRegistry(process.env.STREAK_DIRECT_REGISTRY_DIR),
        new DirectRegistry(process.env.STREAK_DIRECT_LEGACY_REGISTRY_DIR),
        new DirectRegistry(process.env.STREAK_DIRECT_BATCH_REGISTRY_DIR, V4_DIRECT_CONFIG),
      ].flatMap((registry) =>
        registry.all().map((descriptor) => ({ ...descriptor, entryEnabled: false })),
      ),
    events: () => sponsorProxy('/activity/events'),
    acknowledge: (ids) => sponsorProxy('/activity/ack', { ids }),
    project: (descriptor, previous) => readActivityMarket(client, descriptor, previous),
    canonicalCheckpoint: async (projection) => {
      const header = await client.getHeaderByNumberNoCache(projection.checkpoint.blockNumber);
      return !!header && header.hash === projection.checkpoint.blockHash;
    },
  });
  return instance;
}

export function startActivity(): () => void {
  if (!stop) stop = activityService()?.start();
  return () => {
    stop?.();
    stop = undefined;
  };
}

export async function activityOwner(
  address: string,
): Promise<{ address: string; ownerHash: string }> {
  const parsed = await ccc.Address.fromString(address, client);
  if (parsed.prefix !== 'ckt') throw Error('Activity requires a verified testnet address');
  return { address: parsed.toString(), ownerHash: parsed.script.hash() };
}

export function unavailableActivity(ownerHash: string, address: string): ActivityPage {
  return {
    version: 1,
    network: 'testnet',
    available: false,
    ownerHash,
    address,
    groups: [],
    nextCursor: null,
    coverage: 'unavailable',
    updating: false,
    updatedAt: null,
    summary: { open: 0, completed: 0, collectibleShannons: '0', claimable: 0 },
  };
}

import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type {
  ActivityPage,
  ActivityPosition,
  ActivitySnapshot,
} from '../../../shared/activity-wire';
import type { DirectMarketDescriptor } from '../direct/registry';
import type { ActivityMarketProjection } from './chain';
import type { ActivityPublicEvent } from './events';

/** This index owns display data and replay cursors, never a signing key or spend authority. */
export const ACTIVITY_SCHEMA = `
CREATE TABLE IF NOT EXISTS activity_markets (
  market_key text PRIMARY KEY, descriptor jsonb NOT NULL,
  requested bigint NOT NULL DEFAULT 1, completed bigint NOT NULL DEFAULT 0,
  due_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_id text, lease_until timestamptz, failures integer NOT NULL DEFAULT 0,
  projection jsonb, checked_at timestamptz, stale boolean NOT NULL DEFAULT true,
  catalogue_member boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS activity_due ON activity_markets(due_at,lease_until);
CREATE TABLE IF NOT EXISTS activity_wallet_markets (
  owner_hash text NOT NULL, market_key text NOT NULL REFERENCES activity_markets(market_key),
  snapshot jsonb NOT NULL, open_count integer NOT NULL, completed_count integer NOT NULL,
  claimable_count integer NOT NULL, collectible numeric(40,0) NOT NULL,
  PRIMARY KEY(owner_hash,market_key)
);
CREATE INDEX IF NOT EXISTS activity_participants ON activity_wallet_markets(market_key);
CREATE TABLE IF NOT EXISTS activity_pending (
  owner_hash text NOT NULL, market_key text NOT NULL REFERENCES activity_markets(market_key),
  position_id text NOT NULL, transaction_hash text NOT NULL, position jsonb NOT NULL, issue text,
  PRIMARY KEY(owner_hash,market_key,position_id)
);
CREATE INDEX IF NOT EXISTS activity_pending_market ON activity_pending(market_key,transaction_hash);
CREATE TABLE IF NOT EXISTS activity_event_receipts (
  event_id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
`;

export const marketKey = (d: DirectMarketDescriptor): string =>
  createHash('sha256')
    .update(`testnet:${d.type.codeHash}:${d.type.hashType}:${d.type.args}:${d.creationTxHash}`)
    .digest('hex');

export function validActivityCursor(value: string): boolean {
  return (
    /^[1-9][0-9]{0,15}:[a-f0-9]{64}$/.test(value) &&
    Number.isSafeInteger(Number(value.split(':')[0]))
  );
}

export interface ActivityJob {
  key: string;
  descriptor: DirectMarketDescriptor;
  generation: string;
  changed: boolean;
  lease: string;
  failures: number;
  previous?: ActivityMarketProjection;
}

function statistics(snapshot: ActivitySnapshot) {
  let open = 0,
    completed = 0,
    claimable = 0,
    collectible = 0n;
  for (const p of snapshot.positions) {
    if (['claimed', 'refunded'].includes(p.status)) completed++;
    else if (p.status !== 'claimable') open++;
    if (p.status === 'claimable' && p.entitlementShannons !== null) {
      claimable++;
      collectible += BigInt(p.entitlementShannons);
    }
  }
  return { open, completed, claimable, collectible: collectible.toString() };
}

export class PgActivityStorage {
  private ready?: Promise<void>;
  constructor(readonly pool: Pool) {}

  initialize(): Promise<void> {
    if (!this.ready)
      this.ready = this.pool
        .query(ACTIVITY_SCHEMA)
        .then(() => undefined)
        .catch((error) => {
          this.ready = undefined;
          throw error;
        });
    return this.ready;
  }

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    await this.initialize();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const value = await fn(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** The receipt and all affected jobs commit together, before the private relay is acked. */
  async ingest(event: ActivityPublicEvent): Promise<boolean> {
    const { id: eventId, descriptors } = event;
    if (!/^0x[a-f0-9]{64}$/.test(eventId) || !descriptors.length || descriptors.length > 8)
      throw Error('Invalid activity event');
    return this.transaction(async (client) => {
      const receipt = await client.query(
        'INSERT INTO activity_event_receipts(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id',
        [eventId],
      );
      if (!receipt.rowCount) return false;
      for (const descriptor of descriptors) await this.enqueue(client, descriptor, true);
      {
        for (const item of event.positions ?? []) {
          await client.query(
            `INSERT INTO activity_pending(owner_hash,market_key,position_id,transaction_hash,position,issue)
            SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM activity_markets
              WHERE market_key=$2 AND projection->'transactionHashes' ? $4)
            ON CONFLICT(owner_hash,market_key,position_id) DO UPDATE SET issue=COALESCE(EXCLUDED.issue,activity_pending.issue)`,
            [
              item.ownerHash,
              marketKey(item.descriptor),
              item.position.id,
              event.transactionHash,
              JSON.stringify(item.position),
              ['rejected', 'cancelled', 'expired', 'uncertain', 'blocked'].includes(event.state)
                ? 'Payment status needs recovery. Keep the saved transaction while its status is checked.'
                : null,
            ],
          );
        }
      }
      return true;
    });
  }

  private async enqueue(client: PoolClient, descriptor: DirectMarketDescriptor, changed: boolean) {
    await client.query(
      `INSERT INTO activity_markets(market_key,descriptor,catalogue_member) VALUES($1,$2,$3)
      ON CONFLICT(market_key) DO UPDATE SET descriptor=EXCLUDED.descriptor
      ${changed ? ', requested=activity_markets.requested+1, due_at=clock_timestamp(), stale=true' : ', catalogue_member=true'}`,
      [marketKey(descriptor), JSON.stringify(descriptor), !changed],
    );
  }

  /** Existing catalogues are imported once. Repeated startup never schedules a full rescan. */
  async bootstrap(descriptors: readonly DirectMarketDescriptor[]): Promise<void> {
    if (descriptors.length > 768) throw Error('Activity catalogue exceeds its bound');
    await this.transaction(async (client) => {
      for (const descriptor of descriptors) await this.enqueue(client, descriptor, false);
    });
  }

  async take(): Promise<ActivityJob | null> {
    await this.initialize();
    const lease = randomUUID();
    const result = await this.pool.query<{
      market_key: string;
      descriptor: DirectMarketDescriptor;
      requested: string;
      completed: string;
      failures: number;
      projection: ActivityMarketProjection | null;
    }>(
      `UPDATE activity_markets SET lease_id=$1, lease_until=clock_timestamp()+interval '5 minutes'
       WHERE market_key=(SELECT market_key FROM activity_markets
         WHERE due_at<=clock_timestamp() AND (lease_until IS NULL OR lease_until<clock_timestamp())
         ORDER BY due_at,market_key FOR UPDATE SKIP LOCKED LIMIT 1)
       RETURNING market_key,descriptor,requested,completed,failures,projection`,
      [lease],
    );
    const row = result.rows[0];
    return row
      ? {
          key: row.market_key,
          descriptor: row.descriptor,
          generation: row.requested,
          changed: row.requested !== row.completed,
          lease,
          failures: row.failures,
          ...(row.projection ? { previous: row.projection } : {}),
        }
      : null;
  }

  async complete(
    job: ActivityJob,
    projection: ActivityMarketProjection,
    retryMs: number,
  ): Promise<boolean> {
    return this.transaction(async (client) => {
      const current = await client.query<{ requested: string }>(
        'SELECT requested FROM activity_markets WHERE market_key=$1 AND lease_id=$2 FOR UPDATE',
        [job.key, job.lease],
      );
      if (!current.rowCount) return false;
      if (marketKey(projection.descriptor) !== job.key)
        throw Error('Activity projection identity changed');
      // A newer event must never be overwritten by a read that started before it.
      if (current.rows[0].requested !== job.generation) {
        await client.query(
          'UPDATE activity_markets SET lease_id=NULL,lease_until=NULL,due_at=clock_timestamp() WHERE market_key=$1',
          [job.key],
        );
        return false;
      }
      await client.query('DELETE FROM activity_wallet_markets WHERE market_key=$1', [job.key]);
      await client.query(
        'DELETE FROM activity_pending WHERE market_key=$1 AND transaction_hash=ANY($2::text[])',
        [job.key, projection.transactionHashes],
      );
      for (const [owner, snapshot] of Object.entries(projection.owners)) {
        if (!/^0x[0-9a-f]{64}$/.test(owner)) throw Error('Invalid activity owner');
        const s = statistics(snapshot);
        await client.query(
          `INSERT INTO activity_wallet_markets(owner_hash,market_key,snapshot,open_count,completed_count,claimable_count,collectible)
          VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            owner,
            job.key,
            JSON.stringify(snapshot),
            s.open,
            s.completed,
            s.claimable,
            s.collectible,
          ],
        );
      }
      await client.query(
        `UPDATE activity_markets SET projection=$2,completed=requested,failures=0,catalogue_member=true,
        checked_at=$3, stale=false, lease_id=NULL,lease_until=NULL,
        due_at=clock_timestamp()+$4::double precision*interval '1 millisecond' WHERE market_key=$1`,
        [job.key, JSON.stringify(projection), new Date(projection.checkedAt), retryMs],
      );
      return true;
    });
  }

  async fail(job: ActivityJob): Promise<void> {
    // Preserve previously verified rows. Never replace a failed read with an empty wallet.
    await this.pool.query(
      `UPDATE activity_markets SET stale=true, failures=LEAST(failures+1,10),
      lease_id=NULL,lease_until=NULL,due_at=CASE WHEN requested<>$4::bigint THEN clock_timestamp()
        ELSE clock_timestamp()+$3::double precision*interval '1 millisecond' END
      WHERE market_key=$1 AND lease_id=$2`,
      [
        job.key,
        job.lease,
        Math.min(600_000, 15_000 * 2 ** Math.min(job.failures, 6)),
        job.generation,
      ],
    );
  }

  async refreshOwner(owner: string): Promise<void> {
    await this.initialize();
    // User clicks coalesce with existing work; they cannot invalidate a running read.
    await this.pool.query(
      `UPDATE activity_markets SET due_at=LEAST(due_at,clock_timestamp())
      WHERE market_key IN (SELECT market_key FROM activity_wallet_markets WHERE owner_hash=$1 UNION SELECT market_key FROM activity_pending WHERE owner_hash=$1)
      AND (checked_at IS NULL OR checked_at<clock_timestamp()-interval '15 seconds')`,
      [owner],
    );
  }

  async hint(owner: string, transactionHash: string, fixtureId?: string): Promise<void> {
    // A browser hint is merely a request to refresh an already-owned market.
    await this.transaction(async (client) => {
      const id = createHash('sha256')
        .update(`activity-hint:${owner}:${transactionHash}:${fixtureId ?? ''}`)
        .digest('hex');
      const receipt = await client.query(
        'INSERT INTO activity_event_receipts(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id',
        [id],
      );
      if (!receipt.rowCount) return;
      await client.query(
        `UPDATE activity_markets SET due_at=clock_timestamp(),requested=requested+1,stale=true
      WHERE market_key IN (SELECT market_key FROM activity_wallet_markets WHERE owner_hash=$1 UNION SELECT market_key FROM activity_pending WHERE owner_hash=$1)
      AND ($2::text IS NULL OR descriptor->>'fixtureId'=$2 OR descriptor->>'id'=$2)
      `,
        [owner, fixtureId ?? null],
      );
    });
  }

  async read(owner: string, address: string, cursor?: string): Promise<ActivityPage> {
    await this.initialize();
    if (!/^0x[0-9a-f]{64}$/.test(owner) || (cursor && !validActivityCursor(cursor)))
      throw Error('Invalid activity cursor or owner');
    const [beforeDate, beforeKey] = cursor?.split(':') ?? [];
    return this.transaction(async (client) => {
      // A single snapshot prevents mixed page/totals during settlement replacement.
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const result = await client.query<{
        market_key: string;
        descriptor: DirectMarketDescriptor;
        snapshot: ActivitySnapshot | null;
        stale: boolean;
        pending: ActivityPosition[];
        issue: string | null;
      }>(
        `WITH owned AS (SELECT market_key FROM activity_wallet_markets WHERE owner_hash=$1
          UNION SELECT market_key FROM activity_pending WHERE owner_hash=$1)
         SELECT m.market_key,m.descriptor,w.snapshot,m.stale,
           COALESCE((SELECT jsonb_agg(p.position ORDER BY p.position_id) FROM activity_pending p
             WHERE p.owner_hash=$1 AND p.market_key=m.market_key),'[]'::jsonb) AS pending,
           (SELECT max(p.issue) FROM activity_pending p WHERE p.owner_hash=$1 AND p.market_key=m.market_key) AS issue
         FROM owned JOIN activity_markets m USING(market_key)
         LEFT JOIN activity_wallet_markets w ON w.market_key=m.market_key AND w.owner_hash=$1
         WHERE ($2::bigint IS NULL OR ((m.descriptor->>'cutoffMs')::bigint,m.market_key)<($2::bigint,$3::text))
         ORDER BY (m.descriptor->>'cutoffMs')::bigint DESC,m.market_key DESC LIMIT 21`,
        [owner, beforeDate ?? null, beforeKey ?? null],
      );
      const totals = await client.query<{
        open: string;
        completed: string;
        claimable: string;
        collectible: string;
        updated: Date | null;
        stale: boolean;
      }>(
        `SELECT COALESCE(sum(open_count),0)::text AS open,COALESCE(sum(completed_count),0)::text AS completed,
          COALESCE(sum(claimable_count),0)::text AS claimable,COALESCE(sum(collectible),0)::text AS collectible,
          min(checked_at) AS updated,COALESCE(bool_or(stale),false) AS stale
          FROM activity_wallet_markets w JOIN activity_markets m USING(market_key) WHERE owner_hash=$1`,
        [owner],
      );
      const coverage = await client.query<{ incomplete: boolean; updating: boolean }>(
        `SELECT
        EXISTS(SELECT 1 FROM activity_markets WHERE catalogue_member AND completed=0) AS incomplete,
        EXISTS(SELECT 1 FROM activity_markets m LEFT JOIN activity_wallet_markets w USING(market_key)
          WHERE (w.owner_hash=$1 OR (m.catalogue_member AND m.completed=0)) AND (m.requested>m.completed OR m.lease_until>clock_timestamp())) AS updating`,
        [owner],
      );
      const pending = await client.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM activity_pending WHERE owner_hash=$1',
        [owner],
      );
      const total = totals.rows[0],
        state = coverage.rows[0];
      const rows = result.rows.slice(0, 20);
      return {
        version: 1,
        network: 'testnet',
        available: true,
        ownerHash: owner,
        address,
        groups: rows.map((row) => ({
          descriptor: row.descriptor,
          snapshot: {
            ...(row.snapshot ?? {
              phase: 'unknown' as const,
              checkedAt: 0,
              historyComplete: false,
            }),
            ...(row.issue ? { uncertainty: row.issue } : {}),
            positions: [...(row.snapshot?.positions ?? []), ...row.pending],
          },
          stale: row.stale,
        })),
        nextCursor:
          result.rows.length > 20 ? `${rows[19].descriptor.cutoffMs}:${rows[19].market_key}` : null,
        coverage:
          state.incomplete || total.stale || pending.rows[0].count > 0 ? 'indexing' : 'complete',
        updating: state.updating || pending.rows[0].count > 0,
        updatedAt: total.updated?.getTime() ?? null,
        summary: {
          open: Number(total.open) + pending.rows[0].count,
          completed: Number(total.completed),
          collectibleShannons: total.collectible,
          claimable: Number(total.claimable),
        },
      };
    });
  }
}

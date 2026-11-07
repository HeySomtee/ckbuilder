import type { Pool, PoolClient } from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { assertGameScope } from '../games-test/scope';
import { CampaignError, type Campaign, type CampaignEntry } from './domain';

export interface CampaignAudit {
  actorId: string;
  action: string;
}
export interface PayoutReservation {
  transactionHash: string;
  outputIndex: number;
  publicId: string;
}
export interface CampaignStorage {
  clock(): Promise<number>;
  list(): Promise<Campaign[]>;
  load(id: string): Promise<Campaign | null>;
  create(id: string, creator: string, build: (now: number) => Campaign): Promise<Campaign>;
  change(
    id: string,
    mutate: (campaign: Campaign, now: number) => void,
    audit: CampaignAudit,
    payout?: PayoutReservation,
  ): Promise<Campaign>;
}
const metadata = (campaign: Campaign) => ({ ...campaign, entries: [] });
const freshness = (campaign: Campaign) => ({
  verifiedAt: campaign.verifiedAt,
  fixtureChecks: Object.fromEntries(
    campaign.fixtures.map((fixture) => [fixture.fixtureId, fixture.updatedAt]),
  ),
  absenceProofs: campaign.absenceProofs ?? [],
});
type Freshness = ReturnType<typeof freshness>;
const withFreshness = (campaign: Campaign, checks: Freshness | null): Campaign =>
  checks
    ? {
        ...campaign,
        verifiedAt: checks.verifiedAt,
        absenceProofs: checks.absenceProofs,
        fixtures: campaign.fixtures.map((fixture) => ({
          ...fixture,
          updatedAt: checks.fixtureChecks[fixture.fixtureId] ?? fixture.updatedAt,
        })),
      }
    : campaign;

/** Chain tip/check timestamps are freshness, not a new score or audit revision. */
export const campaignSemantics = (campaign: Campaign) => ({
  ...campaign,
  verifiedAt: null,
  fixtures: campaign.fixtures.map((fixture) => ({ ...fixture, updatedAt: null })),
  absenceProofs: (campaign.absenceProofs ?? []).map(
    ({ checkedAt: _checkedAt, checkpoint: _checkpoint, ...proof }) => proof,
  ),
});

export interface CampaignJob {
  id: string;
  generation: string;
}

export function campaignCheckDelay(campaign: Campaign, now: number): number {
  if (campaign.state === 'draft') return 86_400_000;
  const pendingAwards = campaign.awards.some(
    (award) => award.publicId && !['paid', 'unawarded'].includes(award.status),
  );
  if (campaign.state === 'finished' || campaign.deletedAt)
    return pendingAwards || campaign.scoreStatus === 'review-required' ? 900_000 : 86_400_000;
  if (campaign.evidenceFinal) return 900_000;
  const deadlines = campaign.gameweek
    ? [Date.parse(campaign.gameweek.lockAt)]
    : campaign.fixtures.map((fixture) => Date.parse(fixture.cutoffAt));
  if (deadlines.some((deadline) => deadline <= now)) return 120_000;
  return Math.max(250, Math.min(900_000, ...deadlines.map((deadline) => deadline - now)));
}

/** Campaign writes serialize on their own row. Entries and payout proofs are not deleted. */
export class PgCampaignStorage implements CampaignStorage {
  private ready?: Promise<void>;
  private readonly listeners = new Set<() => void>();
  constructor(private readonly pool: Pool) {}
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private changed(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        console.warn('[campaigns] local wake deferred to durable schedule');
      }
    }
  }
  private init(): Promise<void> {
    this.ready ??= assertGameScope(this.pool, false)
      .then(() =>
        this.pool.query(
          `
      CREATE TABLE IF NOT EXISTS streak_campaigns (
        id text PRIMARY KEY, creator text NOT NULL, created_at timestamptz NOT NULL,
        data jsonb NOT NULL);
      CREATE INDEX IF NOT EXISTS streak_campaign_reconciliation ON streak_campaigns(id)
        WHERE data->>'state'<>'draft';
      ALTER TABLE streak_campaigns ADD COLUMN IF NOT EXISTS checks jsonb;
      ALTER TABLE streak_campaigns ADD COLUMN IF NOT EXISTS due_at timestamptz NOT NULL DEFAULT clock_timestamp();
      ALTER TABLE streak_campaigns ADD COLUMN IF NOT EXISTS wake_generation bigint NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS streak_campaign_due ON streak_campaigns(due_at,id) WHERE data->>'state'<>'draft';
      CREATE TABLE IF NOT EXISTS streak_campaign_entries (
        campaign_id text NOT NULL REFERENCES streak_campaigns(id), account_id text NOT NULL,
        owner_hash text NOT NULL, public_id text NOT NULL, joined_at timestamptz NOT NULL,
        data jsonb NOT NULL, PRIMARY KEY(campaign_id,account_id),
        UNIQUE(campaign_id,owner_hash), UNIQUE(campaign_id,public_id));
      CREATE INDEX IF NOT EXISTS streak_campaign_entries_owner ON streak_campaign_entries(owner_hash,campaign_id);
      CREATE TABLE IF NOT EXISTS streak_campaign_audit (
        campaign_id text NOT NULL REFERENCES streak_campaigns(id), revision integer NOT NULL,
        actor_id text NOT NULL, action text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
        data jsonb NOT NULL, PRIMARY KEY(campaign_id,revision));
      CREATE TABLE IF NOT EXISTS streak_campaign_payout_outputs (
        network text NOT NULL CHECK(network='mainnet'), transaction_hash text NOT NULL,
        output_index integer NOT NULL, campaign_id text NOT NULL REFERENCES streak_campaigns(id),
        public_id text NOT NULL, PRIMARY KEY(network,transaction_hash,output_index), UNIQUE(campaign_id,public_id));
    `,
        ),
      )
      .then(() => {})
      .catch((error: unknown) => {
        this.ready = undefined;
        throw error;
      });
    return this.ready;
  }
  async clock(): Promise<number> {
    const result = await this.pool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    return result.rows[0].now.getTime();
  }
  async list(): Promise<Campaign[]> {
    await this.init();
    // Bound discovery separately from saved/archived detail access. No creation limit is implied.
    const records = await this.pool.query<{ data: Campaign; checks: Freshness | null }>(
      `SELECT c.data || jsonb_build_object('entries',COALESCE(e.entries,'[]'::jsonb)) AS data,c.checks
       FROM (SELECT id,created_at,data,checks FROM streak_campaigns ORDER BY created_at DESC,id LIMIT 100) c
       LEFT JOIN LATERAL (SELECT jsonb_agg(data ORDER BY joined_at,public_id) AS entries
         FROM streak_campaign_entries WHERE campaign_id=c.id) e ON true
       ORDER BY c.created_at DESC,c.id`,
    );
    return records.rows.map(({ data, checks }) => withFreshness(data, checks));
  }

  async dueJobs(limit = 8): Promise<CampaignJob[]> {
    await this.init();
    const result = await this.pool.query<CampaignJob>(
      `SELECT id,wake_generation::text AS generation FROM streak_campaigns
       WHERE data->>'state'<>'draft' AND due_at<=clock_timestamp() ORDER BY due_at,id LIMIT $1`,
      [limit],
    );
    return result.rows;
  }
  async defer(job: CampaignJob, delay: number): Promise<void> {
    await this.pool.query(
      `UPDATE streak_campaigns SET due_at=clock_timestamp()+$3::double precision*interval '1 millisecond'
       WHERE id=$1 AND wake_generation=$2::bigint`,
      [job.id, job.generation, delay],
    );
  }
  async nextDueDelay(): Promise<number> {
    await this.init();
    const result = await this.pool.query<{ delay: number | null }>(
      `SELECT (extract(epoch FROM min(due_at)-clock_timestamp())*1000)::double precision AS delay
       FROM streak_campaigns WHERE data->>'state'<>'draft'`,
    );
    return Math.max(0, Math.min(900_000, result.rows[0]?.delay ?? 900_000));
  }
  async wakeSources(
    kind: 'predictions' | 'five',
    fixtureIds?: string[],
    freshnessOnly = false,
  ): Promise<void> {
    await this.init();
    const result = await this.pool.query(
      `UPDATE streak_campaigns SET due_at=clock_timestamp(),wake_generation=wake_generation+1
       WHERE data->>'state'<>'draft' AND data->'draft'->>'kind'=$1
       AND (data->>'deletedAt' IS NULL OR data->>'state'='finished')
       AND ($2::text[] IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(data->'fixtures') f WHERE f->>'fixtureId'=ANY($2::text[])))
       AND (NOT $3::boolean OR data->>'scoreStatus' IN ('unavailable','review-required'))`,
      [kind, fixtureIds ?? null, freshnessOnly],
    );
    if (result.rowCount) this.changed();
  }
  /** Cursor pagination separates obligation processing from the bounded discovery page. */
  async reconciliationIds(afterId = '', limit = 8): Promise<string[]> {
    if (
      typeof afterId !== 'string' ||
      afterId.length > 180 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new CampaignError('Invalid reconciliation cursor.');
    await this.init();
    const rows = await this.pool.query<{ id: string }>(
      "SELECT id FROM streak_campaigns WHERE data->>'state'<>'draft' AND id>$1 ORDER BY id LIMIT $2",
      [afterId, limit],
    );
    return rows.rows.map((row) => row.id);
  }
  async load(id: string): Promise<Campaign | null> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query('SET LOCAL statement_timeout = 5000');
      const campaign = await this.read(client, id, false);
      await client.query('COMMIT');
      return campaign;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  private async read(client: PoolClient, id: string, lock: boolean): Promise<Campaign | null> {
    const result = await client.query<{ data: Campaign; checks: Freshness | null }>(
      `SELECT data,checks FROM streak_campaigns WHERE id=$1${lock ? ' FOR UPDATE' : ''}`,
      [id],
    );
    if (!result.rows[0]) return null;
    const entries = await client.query<{ data: CampaignEntry }>(
      'SELECT data FROM streak_campaign_entries WHERE campaign_id=$1 ORDER BY joined_at,public_id',
      [id],
    );
    return withFreshness(
      { ...result.rows[0].data, entries: entries.rows.map((e) => e.data) },
      result.rows[0].checks,
    );
  }
  async create(id: string, creator: string, build: (now: number) => Campaign): Promise<Campaign> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      const time = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const campaign = build(time.rows[0].now.getTime());
      const result = await client.query(
        'INSERT INTO streak_campaigns(id,creator,created_at,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',
        [id, creator, campaign.createdAt, JSON.stringify(metadata(campaign))],
      );
      if (!result.rowCount) {
        const previous = await this.read(client, id, true);
        if (
          !previous ||
          previous.creator !== creator ||
          previous.deletedAt ||
          !isDeepStrictEqual(previous.draft, campaign.draft)
        )
          throw new CampaignError('This draft identifier is already in use.', 409);
        await client.query('COMMIT');
        return previous;
      }
      await client.query(
        'INSERT INTO streak_campaign_audit(campaign_id,revision,actor_id,action,data) VALUES($1,$2,$3,$4,$5)',
        [id, campaign.revision, creator, 'create', JSON.stringify(metadata(campaign))],
      );
      await client.query('COMMIT');
      return campaign;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async change(
    id: string,
    mutate: (campaign: Campaign, now: number) => void,
    audit: CampaignAudit,
    payout?: PayoutReservation,
  ): Promise<Campaign> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      const campaign = await this.read(client, id, true);
      if (!campaign) throw new CampaignError('Competition not found.', 404);
      const before = structuredClone(campaign),
        oldEntries = new Map(before.entries.map((e) => [e.accountId, e]));
      // Read time after acquiring the lock so a queued join cannot cross the cutoff.
      const time = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const now = time.rows[0].now.getTime();
      mutate(campaign, now);
      // Parallel freshness-only observations share a semantic revision. Do not
      // allow the older response to move the displayed verification time back.
      if (
        audit.action === 'reconcile' &&
        before.verifiedAt &&
        campaign.verifiedAt &&
        Date.parse(before.verifiedAt) > Date.parse(campaign.verifiedAt) &&
        isDeepStrictEqual(campaignSemantics(before), campaignSemantics(campaign))
      ) {
        Object.assign(campaign, withFreshness(campaign, freshness(before)));
      }
      if (
        [...oldEntries.keys()].some(
          (accountId) => !campaign.entries.some((entry) => entry.accountId === accountId),
        )
      )
        throw new CampaignError('Campaign registrations cannot be deleted.', 409);
      if (payout) {
        await client.query(
          `INSERT INTO streak_campaign_payout_outputs(network,transaction_hash,output_index,campaign_id,public_id)
          VALUES('mainnet',$1,$2,$3,$4) ON CONFLICT DO NOTHING`,
          [payout.transactionHash, payout.outputIndex, id, payout.publicId],
        );
        const output = await client.query<{ campaign_id: string; public_id: string }>(
          "SELECT campaign_id,public_id FROM streak_campaign_payout_outputs WHERE network='mainnet' AND transaction_hash=$1 AND output_index=$2",
          [payout.transactionHash, payout.outputIndex],
        );
        if (output.rows[0]?.campaign_id !== id || output.rows[0]?.public_id !== payout.publicId)
          throw new CampaignError(
            'This mainnet payment output already belongs to another award.',
            409,
          );
      }
      const semanticChange = !isDeepStrictEqual(
        campaignSemantics(before),
        campaignSemantics(campaign),
      );
      // Presentation changes are audited without waking chain/Five reconciliation.
      const refreshSources = audit.action !== 'reconcile' && !audit.action.startsWith('artwork-');
      if (semanticChange) {
        campaign.revision++;
        campaign.updatedAt = new Date(now).toISOString();
        await client.query(
          `UPDATE streak_campaigns SET data=$2,checks=$3
          ${refreshSources ? ',due_at=clock_timestamp(),wake_generation=wake_generation+1' : ''} WHERE id=$1`,
          [id, JSON.stringify(metadata(campaign)), JSON.stringify(freshness(campaign))],
        );
        const changed: CampaignEntry[] = [];
        for (const entry of campaign.entries)
          if (!isDeepStrictEqual(oldEntries.get(entry.accountId), entry)) {
            changed.push(entry);
            await client.query(
              `INSERT INTO streak_campaign_entries(campaign_id,account_id,owner_hash,public_id,joined_at,data)
            VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(campaign_id,account_id) DO UPDATE SET data=EXCLUDED.data`,
              [
                id,
                entry.accountId,
                entry.ownerHash,
                entry.publicId,
                entry.joinedAt,
                JSON.stringify(entry),
              ],
            );
          }
        await client.query(
          'INSERT INTO streak_campaign_audit(campaign_id,revision,actor_id,action,data) VALUES($1,$2,$3,$4,$5)',
          [
            id,
            campaign.revision,
            audit.actorId,
            audit.action,
            JSON.stringify({ campaign: metadata(campaign), changedEntries: changed }),
          ],
        );
      } else if (!isDeepStrictEqual(freshness(before), freshness(campaign))) {
        await client.query('UPDATE streak_campaigns SET checks=$2 WHERE id=$1', [
          id,
          JSON.stringify(freshness(campaign)),
        ]);
      }
      await client.query('COMMIT');
      if (semanticChange && refreshSources) this.changed();
      return campaign;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

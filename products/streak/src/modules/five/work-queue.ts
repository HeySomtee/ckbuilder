import type { Pool, PoolClient } from 'pg';

// Every initializer sends one multi-statement query, which PostgreSQL runs in
// one implicit transaction. Take this shared DDL lock before any table locks;
// concurrent API/worker first boots must not race CREATE TABLE IF NOT EXISTS.
// This schema-only key is separate from competition and payout signer locks.
export const rewardSchemaGuard = 'SELECT pg_advisory_xact_lock(7138831);';
export const rewardWorkSchema = `CREATE TABLE IF NOT EXISTS streak_reward_work (
  kind text NOT NULL CHECK(kind IN ('five','survivor','payout')), subject text NOT NULL,
  generation bigint NOT NULL DEFAULT 1, due_at timestamptz DEFAULT clock_timestamp(),
  PRIMARY KEY(kind,subject));
  CREATE INDEX IF NOT EXISTS streak_reward_work_due ON streak_reward_work(due_at);`;
export type RewardWork = {
  kind: 'five' | 'survivor' | 'payout';
  subject: string;
  generation: string;
};

/** Enqueue in the same transaction as the source mutation, before any wake hint. */
export async function enqueueRewardWork(
  client: Pick<PoolClient, 'query'>,
  kind: RewardWork['kind'],
  subject: string,
): Promise<void> {
  await client.query(
    `INSERT INTO streak_reward_work(kind,subject) VALUES($1,$2)
    ON CONFLICT(kind,subject) DO UPDATE SET generation=streak_reward_work.generation+1,
    due_at=LEAST(streak_reward_work.due_at,clock_timestamp())`,
    [kind, subject],
  );
}

export class RewardWorkQueue {
  constructor(private readonly pool: Pool) {}
  async initialize(): Promise<void> {
    await this.pool.query(`${rewardSchemaGuard}\n${rewardWorkSchema}`);
  }
  async due(): Promise<RewardWork[]> {
    const rows = await this.pool
      .query<RewardWork>(`SELECT kind,subject,generation::text FROM streak_reward_work
      WHERE due_at<=clock_timestamp() ORDER BY due_at,kind,subject LIMIT 8`);
    return rows.rows;
  }
  async complete(job: RewardWork, at: number | null): Promise<void> {
    // Newer work stays due immediately, behind already waiting jobs. Keeping its
    // old deadline would let continuously edited rounds starve unrelated payouts.
    await this.pool.query(
      `UPDATE streak_reward_work SET due_at=CASE WHEN generation=$3::bigint THEN $4::timestamptz
        ELSE CASE WHEN due_at<=clock_timestamp() THEN clock_timestamp() ELSE due_at END
        END WHERE kind=$1 AND subject=$2`,
      [job.kind, job.subject, job.generation, at === null ? null : new Date(at)],
    );
  }
  async delay(): Promise<number> {
    const result = await this.pool.query<{ delay: number | null }>(
      'SELECT EXTRACT(EPOCH FROM (min(due_at)-clock_timestamp()))::double precision*1000 AS delay FROM streak_reward_work',
    );
    return Math.max(250, Math.min(15 * 60_000, result.rows[0]?.delay ?? 15 * 60_000));
  }
  async seed(): Promise<void> {
    // Startup migration discovers obligations created before durable enqueueing.
    // API and worker must deploy together; mixed old/new producers are unsupported.
    // Existing jobs retain their next due time and generation.
    await this.pool.query(`INSERT INTO streak_reward_work(kind,subject)
      SELECT 'five',id FROM streak_five_rounds WHERE data->>'state' IN ('open','final','cancelled')
      AND jsonb_array_length(COALESCE(data->'sponsors','[]'::jsonb))>0
      ON CONFLICT DO NOTHING`);
    await this.pool.query(`INSERT INTO streak_reward_work(kind,subject)
      SELECT 'survivor',id FROM streak_survivor_competitions
      WHERE deleted_at IS NULL AND data->'prizeFunding'->>'signedBytes' IS NOT NULL
      ON CONFLICT DO NOTHING`);
    await this.pool.query(`INSERT INTO streak_reward_work(kind,subject)
      SELECT 'payout','wallet' WHERE EXISTS(SELECT 1 FROM streak_five_claim_requests)
      OR EXISTS(SELECT 1 FROM streak_five_payouts WHERE status<>'confirmed') ON CONFLICT DO NOTHING`);
  }
}

import type { Pool } from 'pg';
import { SurvivorError, type Competition } from './domain';

export type CompetitionSummary = Pick<Competition, 'id' | 'state' | 'terms' | 'createdAt'>;
export interface SurvivorStorage {
  list(): Promise<CompetitionSummary[]>;
  load(id: string): Promise<Competition | null>;
  create(id: string, creator: string, build: (now: number) => Competition): Promise<Competition>;
  change(id: string, mutate: (competition: Competition, now: number) => void): Promise<Competition>;
  remove(id: string): Promise<void>;
}
const schema = `CREATE TABLE IF NOT EXISTS streak_survivor_competitions (
  id text PRIMARY KEY, creator text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL, data jsonb NOT NULL
); ALTER TABLE streak_survivor_competitions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS streak_survivor_state ON streak_survivor_competitions(state, created_at DESC);`;
export class PgSurvivorStorage implements SurvivorStorage {
  private ready?: Promise<void>;
  constructor(private readonly pool: Pool) {}
  private init() {
    this.ready ??= this.pool
      .query(schema)
      .then(() => {})
      .catch((error) => {
        this.ready = undefined;
        throw error;
      });
    return this.ready;
  }
  async list(): Promise<CompetitionSummary[]> {
    await this.init();
    const rows = await this.pool.query<{ data: CompetitionSummary }>(
      `SELECT jsonb_build_object('id',id,'state',state,'terms',data->'terms','createdAt',created_at) AS data FROM streak_survivor_competitions WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 100`,
    );
    return rows.rows.map((r) => r.data);
  }
  async load(id: string): Promise<Competition | null> {
    await this.init();
    const row = await this.pool.query<{ data: Competition }>(
      'SELECT data FROM streak_survivor_competitions WHERE id=$1 AND deleted_at IS NULL',
      [id],
    );
    return row.rows[0]?.data ?? null;
  }
  async create(id: string, creator: string, build: (now: number) => Competition) {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      // Bound active competitions and serialize idempotent creation across operators.
      await client.query('SELECT pg_advisory_xact_lock(7138821)');
      const old = await client.query<{ data: Competition; deleted_at: Date | null }>(
        'SELECT data, deleted_at FROM streak_survivor_competitions WHERE id=$1',
        [id],
      );
      if (old.rows[0]) {
        if (old.rows[0].deleted_at)
          throw new SurvivorError('This competition was deleted. Create a new competition.', 409);
        if (old.rows[0].data.creator !== creator)
          throw new SurvivorError('Competition identifier is already in use.', 409);
        await client.query('COMMIT');
        return old.rows[0].data;
      }
      const count = await client.query<{ count: string }>(
        'SELECT count(*) FROM streak_survivor_competitions WHERE deleted_at IS NULL',
      );
      if (Number(count.rows[0].count) >= 100)
        throw new SurvivorError(
          'Competition capacity reached. Archive planning is required before creating more.',
          409,
        );
      const time = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const data = build(time.rows[0].now.getTime());
      await client.query(
        'INSERT INTO streak_survivor_competitions(id, creator, state, data) VALUES($1,$2,$3,$4)',
        [id, creator, data.state, JSON.stringify(data)],
      );
      await client.query('COMMIT');
      return data;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async change(id: string, mutate: (competition: Competition, now: number) => void) {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      const row = await client.query<{ data: Competition }>(
        'SELECT data FROM streak_survivor_competitions WHERE id=$1 AND deleted_at IS NULL FOR UPDATE',
        [id],
      );
      if (!row.rows[0]) throw new SurvivorError('Competition not found.', 404);
      const data = row.rows[0].data,
        before = JSON.stringify(data);
      const time = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      mutate(data, time.rows[0].now.getTime());
      const after = JSON.stringify(data);
      if (before !== after)
        await client.query(
          'UPDATE streak_survivor_competitions SET state=$2, data=$3 WHERE id=$1',
          [id, data.state, after],
        );
      await client.query('COMMIT');
      return data;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async remove(id: string): Promise<void> {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      const row = await client.query<{ data: Competition; deleted_at: Date | null }>(
        'SELECT data, deleted_at FROM streak_survivor_competitions WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!row.rows[0]) throw new SurvivorError('Competition not found.', 404);
      if (!row.rows[0].deleted_at) {
        if (row.rows[0].data.entries.length)
          throw new SurvivorError(
            'This competition has entrants. Their entries and results must be kept.',
            409,
          );
        await client.query(
          'UPDATE streak_survivor_competitions SET deleted_at=clock_timestamp() WHERE id=$1',
          [id],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

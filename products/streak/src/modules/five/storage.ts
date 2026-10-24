import type { Pool } from 'pg';
import { FiveError, type Round } from './domain';
export type Summary = Pick<Round, 'id' | 'state' | 'createdAt'> & { name: string; lockAt: string };
export interface FiveStorage {
  clock(): Promise<number>;
  list(): Promise<Summary[]>;
  load(id: string): Promise<Round | null>;
  create(id: string, creator: string, build: (now: number) => Round): Promise<Round>;
  change(
    id: string,
    mutate: (round: Round, now: number) => void,
    reservation?: { intent: string; outpoints: string[] },
  ): Promise<Round>;
}
export class PgFiveStorage implements FiveStorage {
  private ready?: Promise<void>;
  constructor(private readonly pool: Pool) {}
  async clock() {
    const row = await this.pool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    return row.rows[0].now.getTime();
  }
  private init() {
    this.ready ??= this.pool
      .query(
        `CREATE TABLE IF NOT EXISTS streak_five_rounds (
      id text PRIMARY KEY, creator text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      data jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS streak_five_audit (
        round_id text NOT NULL REFERENCES streak_five_rounds(id), revision integer NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(), data jsonb NOT NULL,
        PRIMARY KEY(round_id,revision));
      CREATE TABLE IF NOT EXISTS streak_five_funding_inputs (
        outpoint text PRIMARY KEY,intent text NOT NULL);`,
      )
      .then(() => {})
      .catch((error) => {
        this.ready = undefined;
        throw error;
      });
    return this.ready;
  }
  async list(): Promise<Summary[]> {
    await this.init();
    const rows = await this.pool.query<{ data: Summary }>(`SELECT jsonb_build_object(
      'id',id,'state',data->>'state','createdAt',created_at,'name',data->'terms'->>'name',
      'lockAt',data->'terms'->>'lockAt') AS data FROM streak_five_rounds ORDER BY created_at DESC LIMIT 100`);
    return rows.rows.map((r) => r.data);
  }
  async load(id: string) {
    await this.init();
    const rows = await this.pool.query<{ data: Round }>(
      'SELECT data FROM streak_five_rounds WHERE id=$1',
      [id],
    );
    return rows.rows[0]?.data ?? null;
  }
  async create(id: string, creator: string, build: (now: number) => Round) {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      await client.query('SELECT pg_advisory_xact_lock(7138822)');
      const old = await client.query<{ data: Round }>(
        'SELECT data FROM streak_five_rounds WHERE id=$1',
        [id],
      );
      if (old.rows[0]) {
        if (old.rows[0].data.creator !== creator)
          throw new FiveError('Gameweek identifier already exists.', 409);
        if (build(Date.parse(old.rows[0].data.createdAt)).termsHash !== old.rows[0].data.termsHash)
          throw new FiveError('This identifier belongs to a different gameweek draft.', 409);
        await client.query('COMMIT');
        return old.rows[0].data;
      }
      const count = await client.query<{ count: string }>(
        'SELECT count(*) FROM streak_five_rounds',
      );
      if (Number(count.rows[0].count) >= 100)
        throw new FiveError(
          'Gameweek capacity reached. Archive completed rounds before creating more.',
          409,
        );
      const time = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const round = build(time.rows[0].now.getTime());
      await client.query('INSERT INTO streak_five_rounds(id,creator,data) VALUES($1,$2,$3)', [
        id,
        creator,
        JSON.stringify(round),
      ]);
      await client.query('INSERT INTO streak_five_audit(round_id,revision,data) VALUES($1,$2,$3)', [
        id,
        round.revision,
        JSON.stringify(round),
      ]);
      await client.query('COMMIT');
      return round;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async change(
    id: string,
    mutate: (round: Round, now: number) => void,
    reservation?: { intent: string; outpoints: string[] },
  ) {
    await this.init();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      const rows = await client.query<{ data: Round }>(
        'SELECT data FROM streak_five_rounds WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (!rows.rows[0]) throw new FiveError('Gameweek not found.', 404);
      const round = rows.rows[0].data,
        before = JSON.stringify(round);
      if (reservation)
        for (const outpoint of [...reservation.outpoints].sort()) {
          await client.query(
            'INSERT INTO streak_five_funding_inputs(outpoint,intent) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [outpoint, reservation.intent],
          );
          const old = await client.query<{ intent: string }>(
            'SELECT intent FROM streak_five_funding_inputs WHERE outpoint=$1',
            [outpoint],
          );
          if (old.rows[0].intent !== reservation.intent)
            throw new FiveError(
              'Another contribution already uses these wallet inputs. Wait for it to confirm before paying again.',
              409,
            );
        }
      const time = await client.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      mutate(round, time.rows[0].now.getTime());
      if (before !== JSON.stringify(round)) {
        round.revision++;
        await client.query('UPDATE streak_five_rounds SET data=$2 WHERE id=$1', [
          id,
          JSON.stringify(round),
        ]);
        // Retain scoring, auction closure and final allocation; squad edits stay in the aggregate.
        if (
          round.scoreRevision !== JSON.parse(before).scoreRevision ||
          round.state !== JSON.parse(before).state ||
          JSON.stringify(round.auction) !== JSON.stringify(JSON.parse(before).auction)
        )
          await client.query(
            'INSERT INTO streak_five_audit(round_id,revision,data) VALUES($1,$2,$3)',
            [
              id,
              round.revision,
              JSON.stringify({
                state: round.state,
                termsHash: round.termsHash,
                rulesVersion: round.rulesVersion,
                rawStats: round.rawStats,
                scoreSource: round.scoreSource,
                scoresAt: round.scoresAt,
                scoreRevision: round.scoreRevision,
                scoresComplete: round.scoresComplete,
                ...(round.auction ? { auction: round.auction } : {}),
                ...(round.state === 'final'
                  ? {
                      entries: round.entries,
                      rewards: round.rewards,
                      finalizedAt: round.finalizedAt,
                    }
                  : {}),
              }),
            ],
          );
      }
      await client.query('COMMIT');
      return round;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

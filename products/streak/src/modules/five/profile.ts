import type { Pool } from 'pg';
import { assertGameScope } from '../games-test/scope';
import { FiveError, identifier } from './domain';
import { rewardSchemaGuard } from './work-queue';

export type FiveProfile = { displayName: string; updatedAt: string };
export interface FiveProfiles {
  get(accountId: string): Promise<FiveProfile | null>;
  getMany(accountIds: readonly string[]): Promise<Map<string, FiveProfile>>;
  save(accountId: string, displayName: unknown): Promise<FiveProfile>;
}

/** Public game identity is deliberately separate from login usernames and wallets. */
export function parseFiveName(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 200 || /[\p{Cc}\p{Cf}]/u.test(raw))
    throw new FiveError(
      'Use 3 to 24 letters or numbers for your FPL name. Spaces and simple punctuation are welcome.',
    );
  const name = raw
    .normalize('NFC')
    .replace(/\p{Zs}+/gu, ' ')
    .trim();
  if (
    [...name].length < 3 ||
    [...name].length > 24 ||
    !/^[\p{L}\p{N}][\p{L}\p{N}\p{M} ._'’\-]*[\p{L}\p{N}\p{M}]$/u.test(name)
  )
    throw new FiveError(
      'Use 3 to 24 letters or numbers for your FPL name. Spaces and simple punctuation are welcome.',
    );
  return name;
}

export class PgFiveProfiles implements FiveProfiles {
  private ready?: Promise<void>;
  constructor(
    private readonly pool: Pool,
    private readonly testing = false,
  ) {}
  private init(): Promise<void> {
    this.ready ??= assertGameScope(this.pool, this.testing)
      .then(() =>
        this.pool.query(`${rewardSchemaGuard}
        CREATE TABLE IF NOT EXISTS streak_five_profiles (
          account_id text PRIMARY KEY,
          display_name text NOT NULL CHECK(char_length(display_name) BETWEEN 3 AND 24),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
        );`),
      )
      .then(() => {})
      .catch((error) => {
        this.ready = undefined;
        throw error;
      });
    return this.ready;
  }
  async get(accountId: string): Promise<FiveProfile | null> {
    return (await this.getMany([accountId])).get(accountId) ?? null;
  }
  async getMany(accountIds: readonly string[]): Promise<Map<string, FiveProfile>> {
    if (accountIds.length > 1000) throw new FiveError('Too many manager profiles requested.');
    const ids = [...new Set(accountIds.map(identifier))];
    if (!ids.length) return new Map();
    await this.init();
    const result = await this.pool.query<{
      account_id: string;
      display_name: string;
      updated_at: Date;
    }>(
      'SELECT account_id,display_name,updated_at FROM streak_five_profiles WHERE account_id=ANY($1::text[])',
      [ids],
    );
    return new Map(
      result.rows.map((r) => [
        r.account_id,
        {
          displayName: r.display_name,
          updatedAt: r.updated_at.toISOString(),
        },
      ]),
    );
  }
  async save(accountId: string, raw: unknown): Promise<FiveProfile> {
    const id = identifier(accountId),
      displayName = parseFiveName(raw);
    await this.init();
    const result = await this.pool.query<{ display_name: string; updated_at: Date }>(
      `INSERT INTO streak_five_profiles(account_id,display_name) VALUES($1,$2)
       ON CONFLICT(account_id) DO UPDATE SET display_name=EXCLUDED.display_name,updated_at=clock_timestamp()
       WHERE streak_five_profiles.display_name IS DISTINCT FROM EXCLUDED.display_name
       RETURNING display_name,updated_at`,
      [id, displayName],
    );
    const row = result.rows[0];
    if (row) return { displayName: row.display_name, updatedAt: row.updated_at.toISOString() };
    const current = await this.get(id);
    if (!current) throw new FiveError('Your FPL name could not be saved. Please retry.', 503);
    return current;
  }
}

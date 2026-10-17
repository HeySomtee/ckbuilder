import { createHash, randomBytes } from 'crypto';
import { mkdir, open, readFile, rename, unlink } from 'fs/promises';
import { dirname } from 'path';
import type { Pool } from 'pg';

export const CHALLENGE_TTL_MS = 5 * 60_000;
export class AuthBusyError extends Error {}
export const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export interface AuthStorage {
  issue(address: string, message: string, audience?: string, expiresAt?: number): Promise<void>;
  consume(address: string, audience?: string): Promise<string | null>;
  saveSession(hash: string, userId: string, ttl: number): Promise<void>;
  session(hash: string): Promise<string | null>;
  revoke(hash: string): Promise<void>;
}

// Additive schema: never reset account or money tables. Separate from ledger snapshots.
export const AUTH_SCHEMA = `
CREATE TABLE IF NOT EXISTS auth_challenges (
  address_hash text PRIMARY KEY, subject_hash text NOT NULL, message text NOT NULL, audience text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL, consumed boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS auth_challenges_expiry ON auth_challenges(expires_at);
CREATE INDEX IF NOT EXISTS auth_challenges_subject ON auth_challenges(subject_hash,expires_at);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
`;

export class PgAuthStorage implements AuthStorage {
  constructor(
    private readonly pool: Pool,
    private readonly now = Date.now,
  ) {}
  async issue(
    address: string,
    message: string,
    audience = 'test',
    expiresAt = Date.now() + CHALLENGE_TTL_MS,
  ): Promise<void> {
    const subject = tokenHash(address.split(':')[0]);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [subject]);
      const count = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM auth_challenges
        WHERE subject_hash=$1 AND expires_at>clock_timestamp()`,
        [subject],
      );
      if (count.rows[0].count >= 5)
        throw new AuthBusyError(
          'Too many login attempts for this address. Try again in five minutes.',
        );
      await client.query(
        `INSERT INTO auth_challenges(address_hash,subject_hash,message,audience,expires_at)
        VALUES($1,$2,$3,$4,$5)`,
        [tokenHash(address), subject, message, audience, new Date(expiresAt)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    await this.prune();
  }
  async consume(address: string, audience = 'test'): Promise<string | null> {
    const result = await this.pool.query<{ message: string; expires_at: Date }>(
      `
      UPDATE auth_challenges SET consumed=true
      WHERE address_hash=$1 AND audience=$2 AND NOT consumed
        AND expires_at>GREATEST(clock_timestamp(), $3::timestamptz)
      RETURNING message, expires_at`,
      [tokenHash(address), audience, new Date(this.now())],
    );
    const row = result.rows[0];
    return row && row.expires_at.getTime() > this.now() ? row.message : null;
  }
  async saveSession(hash: string, userId: string, ttl: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO auth_sessions(token_hash,user_id,expires_at)
      VALUES($1,$2,clock_timestamp()+$3::double precision*interval '1 millisecond')`,
      [hash, userId, ttl],
    );
    await this.prune();
  }
  async session(hash: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>(
      'SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND expires_at>clock_timestamp()',
      [hash],
    );
    return result.rows[0]?.user_id ?? null;
  }
  async revoke(hash: string): Promise<void> {
    await this.pool.query('DELETE FROM auth_sessions WHERE token_hash=$1', [hash]);
  }
  private async prune(): Promise<void> {
    // Bounded cleanup also works when more than one API instance calls it.
    await this.pool.query(`DELETE FROM auth_sessions WHERE token_hash IN
      (SELECT token_hash FROM auth_sessions WHERE expires_at<=clock_timestamp() LIMIT 1000)`);
    await this.pool.query(`DELETE FROM auth_challenges WHERE address_hash IN
      (SELECT address_hash FROM auth_challenges WHERE expires_at<=clock_timestamp() LIMIT 1000)`);
  }
}

interface FileState {
  version: 1;
  challenges: Record<
    string,
    {
      subject: string;
      audience: string;
      message: string;
      issued: number;
      expires: number;
      consumed: boolean;
    }
  >;
  sessions: Record<string, { userId: string; expires: number }>;
}

/** Development adapter only. One process, atomic replacement, no silent corruption recovery. */
export class FileAuthStorage implements AuthStorage {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly file: string,
    private readonly now = Date.now,
  ) {}
  private run<T>(write: boolean, operation: (state: FileState) => T): Promise<T> {
    const task = this.queue.then(async () => {
      let state: FileState;
      try {
        const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'));
        if (!validState(parsed))
          throw new Error('Invalid authentication storage. Restore the local auth file.');
        state = parsed;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        state = { version: 1, challenges: {}, sessions: {} };
      }
      for (const [key, row] of Object.entries(state.sessions))
        if (row.expires <= this.now()) delete state.sessions[key];
      for (const [key, row] of Object.entries(state.challenges))
        if (row.expires <= this.now()) delete state.challenges[key];
      const result = operation(state);
      if (write) {
        if (
          Object.keys(state.sessions).length > 10_000 ||
          Object.keys(state.challenges).length > 5_000
        )
          throw new AuthBusyError('Local authentication storage is full. Try again later.');
        await mkdir(dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${randomBytes(8).toString('hex')}.tmp`;
        try {
          const handle = await open(temporary, 'wx', 0o600);
          try {
            await handle.writeFile(JSON.stringify(state));
            await handle.sync();
          } finally {
            await handle.close();
          }
          await rename(temporary, this.file);
        } finally {
          await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        }
      }
      return result;
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  issue(
    address: string,
    message: string,
    audience = 'test',
    expiresAt = this.now() + CHALLENGE_TTL_MS,
  ): Promise<void> {
    return this.run(true, (state) => {
      const key = tokenHash(address);
      const subject = tokenHash(address.split(':')[0]);
      if (Object.values(state.challenges).filter((row) => row.subject === subject).length >= 5)
        throw new AuthBusyError(
          'Too many login attempts for this address. Try again in five minutes.',
        );
      if (state.challenges[key]) throw new Error('Duplicate login challenge.');
      state.challenges[key] = {
        subject,
        audience,
        message,
        issued: this.now(),
        expires: expiresAt,
        consumed: false,
      };
    });
  }
  consume(address: string, audience = 'test'): Promise<string | null> {
    return this.run(true, (state) => {
      const row = state.challenges[tokenHash(address)];
      if (!row || row.consumed || row.audience !== audience) return null;
      row.consumed = true;
      return row.message;
    });
  }
  saveSession(hash: string, userId: string, ttl: number): Promise<void> {
    return this.run(true, (state) => {
      state.sessions[hash] = { userId, expires: this.now() + ttl };
    });
  }
  session(hash: string): Promise<string | null> {
    return this.run(false, (state) => state.sessions[hash]?.userId ?? null);
  }
  revoke(hash: string): Promise<void> {
    return this.run(true, (state) => {
      delete state.sessions[hash];
    });
  }
}

function validState(value: unknown): value is FileState {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1 ||
    !('sessions' in value) ||
    !('challenges' in value)
  )
    return false;
  const record = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (!record(value.sessions) || !record(value.challenges)) return false;
  return (
    Object.entries(value.sessions).every(
      ([key, row]) =>
        /^[a-f0-9]{64}$/.test(key) &&
        record(row) &&
        typeof row.userId === 'string' &&
        typeof row.expires === 'number' &&
        Number.isFinite(row.expires),
    ) &&
    Object.entries(value.challenges).every(
      ([key, row]) =>
        /^[a-f0-9]{64}$/.test(key) &&
        record(row) &&
        typeof row.subject === 'string' &&
        typeof row.audience === 'string' &&
        typeof row.message === 'string' &&
        typeof row.issued === 'number' &&
        Number.isFinite(row.issued) &&
        typeof row.expires === 'number' &&
        Number.isFinite(row.expires) &&
        typeof row.consumed === 'boolean',
    )
  );
}

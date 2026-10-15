/** Durable wallet authentication. Raw session tokens never reach storage. */
import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { DB_FILE, SESSION_TTL_MS } from './config';
import { getPool, pgEnabled } from './store_pg';
import {
  AUTH_SCHEMA,
  AuthStorage,
  CHALLENGE_TTL_MS,
  FileAuthStorage,
  PgAuthStorage,
  tokenHash,
} from './modules/identity/storage';

let ready: Promise<AuthStorage> | undefined;
export function authStorage(): Promise<AuthStorage> {
  if (!ready)
    ready = (async () => {
      if (pgEnabled()) {
        const pool = getPool();
        await pool.query(AUTH_SCHEMA);
        return new PgAuthStorage(pool);
      }
      if (process.env.NODE_ENV === 'production' || process.env.STREAK_PUBLIC_ORIGIN)
        throw new Error('Production authentication requires PostgreSQL.');
      return new FileAuthStorage(join(dirname(DB_FILE), 'auth.json'));
    })().catch((error) => {
      ready = undefined;
      throw error;
    });
  return ready;
}

export async function issueChallenge(
  address: string,
  origin: string,
): Promise<{ message: string; challengeId: string }> {
  const challengeId = randomBytes(32).toString('hex');
  const issued = Date.now();
  const message = `Streak wallet sign-in v1\nOrigin: ${origin}\nNetwork: CKB Pudge testnet\nAddress: ${address}\nNonce: ${challengeId}\nIssued: ${new Date(issued).toISOString()}\nExpires: ${new Date(issued + CHALLENGE_TTL_MS).toISOString()}\nThis signature signs you in. It does not authorize a payment.`;
  await (
    await authStorage()
  ).issue(`${address}:${challengeId}`, message, origin, issued + CHALLENGE_TTL_MS);
  return { message, challengeId };
}

export async function takeChallenge(
  address: string,
  challengeId: string,
  origin: string,
): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(challengeId)) return null;
  return (await authStorage()).consume(`${address}:${challengeId}`, origin);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await (await authStorage()).saveSession(tokenHash(token), userId, SESSION_TTL_MS);
  return token;
}

export async function getSessionUserId(token: string | undefined): Promise<string | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (await authStorage()).session(tokenHash(token));
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (token && /^[a-f0-9]{64}$/.test(token)) await (await authStorage()).revoke(tokenHash(token));
}

export function validateUsername(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  return /^[a-zA-Z0-9_]{3,20}$/.test(trimmed) ? trimmed : null;
}

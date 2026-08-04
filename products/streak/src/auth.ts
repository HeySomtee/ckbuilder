/**
 * Streak — authentication.
 *
 * Passwords are salted + hashed with scrypt (Node built-in, no deps). Sessions
 * are random opaque tokens kept in memory and mapped to a userId. On restart
 * everyone is logged out — acceptable for this product; move to a signed cookie
 * or Redis to persist sessions later.
 */

import { randomBytes } from "crypto";

import { SESSION_TTL_MS } from "./config";

interface Session {
  userId: string;
  expires: number;
}

const sessions = new Map<string, Session>();

// ── Wallet login challenges (sign-in-with-CKB) ────────────────────────

interface Challenge {
  message: string;
  expires: number;
}

/** Short-lived login challenges, keyed by the connecting address. */
const challenges = new Map<string, Challenge>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Issue a nonce message for `address` to sign. Overwrites any prior one. */
export function issueChallenge(address: string): string {
  const nonce = randomBytes(16).toString("hex");
  const message =
    `Streak Terminal — sign in\n\n` +
    `Address: ${address}\n` +
    `Nonce: ${nonce}\n` +
    `Issued: ${new Date().toISOString()}`;
  challenges.set(address, { message, expires: Date.now() + CHALLENGE_TTL_MS });
  return message;
}

/** Consume the challenge for `address` (single-use). Null if missing/expired. */
export function takeChallenge(address: string): string | null {
  const c = challenges.get(address);
  if (!c) return null;
  challenges.delete(address);
  if (c.expires < Date.now()) return null;
  return c.message;
}

export function createSession(userId: string): string {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  return token;
}

export function getSessionUserId(token: string | undefined): string | null {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s.userId;
}

export function destroySession(token: string | undefined): void {
  if (token) sessions.delete(token);
}

/** Validation helpers shared by the signup route. */
export function validateUsername(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(trimmed)) return null;
  return trimmed;
}

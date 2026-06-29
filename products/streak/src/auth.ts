/**
 * Streak — authentication.
 *
 * Passwords are salted + hashed with scrypt (Node built-in, no deps). Sessions
 * are random opaque tokens kept in memory and mapped to a userId. On restart
 * everyone is logged out — acceptable for this product; move to a signed cookie
 * or Redis to persist sessions later.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

import { SESSION_TTL_MS } from "./config";

interface Session {
  userId: string;
  expires: number;
}

const sessions = new Map<string, Session>();

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (stored.length !== derived.length) return false;
  return timingSafeEqual(derived, stored);
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

export function validatePassword(pw: unknown): string | null {
  if (typeof pw !== "string") return null;
  if (pw.length < 6 || pw.length > 200) return null;
  return pw;
}

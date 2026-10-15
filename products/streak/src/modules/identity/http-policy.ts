import type { IncomingMessage } from 'http';
import { SESSION_COOKIE, SESSION_TTL_MS } from '../../config';

export function publicOrigin(req?: IncomingMessage): string {
  const configured = process.env.STREAK_PUBLIC_ORIGIN;
  if (configured) {
    const url = new URL(configured);
    if (url.origin !== configured || url.protocol !== 'https:' || url.username || url.password)
      throw new Error('STREAK_PUBLIC_ORIGIN must be an HTTPS origin without a path.');
    return url.origin;
  }
  if (process.env.NODE_ENV === 'production')
    throw new Error('STREAK_PUBLIC_ORIGIN is required in production.');
  const url = new URL(`http://${req?.headers.host ?? 'localhost:4100'}`);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Configure STREAK_PUBLIC_ORIGIN for hosted requests.');
  return url.origin;
}

export function mutationAllowed(req: IncomingMessage): boolean {
  const expected = publicOrigin(req);
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (expected.startsWith('https:') && !req.headers.origin) return false;
  if (req.headers.origin && req.headers.origin !== expected) return false;
  // Non-browser clients may omit Origin; requiring JSON prevents simple cross-site forms.
  return req.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json';
}

export function sessionCookie(token: string, req: IncomingMessage): string {
  const secure = publicOrigin(req).startsWith('https:') ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? SESSION_TTL_MS / 1000 : 0}${secure}`;
}

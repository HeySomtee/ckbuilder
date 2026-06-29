/**
 * Streak — live World Cup scores client.
 *
 * Bridges the game to the public worldcup2026 REST API
 * (https://github.com/rezarahiminia/worldcup2026, hosted at worldcup26.ir).
 *
 * Three ways to enable live results, checked in order:
 *
 *   1. WC_API_TOKEN          → use this JWT as-is (advanced).
 *   2. WC_API_EMAIL + WC_API_PASSWORD
 *                            → auto-register on first boot, then login, and
 *                              cache the JWT in db.json. Refresh on 401.
 *   3. (nothing)             → fall back to deterministic simulated results
 *                              (see matches.ts). Game still fully playable.
 *
 * Results are cached for 30s so the settlement loop doesn't hammer the API,
 * and exposed keyed by our internal match id (`wc-<id>`).
 */

import { read, update } from "./store";
import type { LiveScoresAuth, Outcome } from "./types";

const EXPLICIT_TOKEN = process.env.WC_API_TOKEN?.trim() || undefined;
const EMAIL = process.env.WC_API_EMAIL?.trim() || undefined;
const PASSWORD = process.env.WC_API_PASSWORD || undefined;
const NAME = process.env.WC_API_NAME?.trim() || "Streak Terminal";
const BASE = (process.env.WC_API_BASE?.trim() || "https://worldcup26.ir").replace(
  /\/$/,
  "",
);

const CACHE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 20_000;

export interface LiveResult {
  finished: boolean;
  live: boolean;
  home: number;
  away: number;
  result?: Outcome;
}

export interface LiveScoresStatus {
  enabled: boolean;
  source: "token" | "credentials" | "none";
  base: string;
  email?: string;
  lastSyncIso?: string;
  lastError?: string;
  matchCount: number;
  liveMatches: number;
  finishedMatches: number;
}

let cache: { ts: number; data: Record<string, LiveResult> } = { ts: 0, data: {} };
let memoToken: string | undefined = EXPLICIT_TOKEN;
let bootstrapping: Promise<string | undefined> | null = null;
let lastError: string | undefined;
let lastSyncIso: string | undefined;

export function liveScoresEnabled(): boolean {
  return !!(EXPLICIT_TOKEN || (EMAIL && PASSWORD));
}

function outcomeFromScore(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

/** fetch with a hard timeout. */
async function http(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadCachedAuth(): Promise<LiveScoresAuth | undefined> {
  return read((db) => db.liveScores);
}

async function saveAuth(auth: LiveScoresAuth | undefined): Promise<void> {
  await update((db) => {
    if (!auth) delete db.liveScores;
    else db.liveScores = auth;
  });
}

/** POST /auth/register or /auth/authenticate; returns a JWT on success. */
async function callAuth(
  endpoint: "register" | "authenticate",
  body: Record<string, unknown>,
): Promise<string | undefined> {
  try {
    const res = await http(`/auth/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Surface a useful message but don't throw — caller will try the next step.
      lastError = `auth/${endpoint}: ${json?.message || json?.error || res.status}`;
      return undefined;
    }
    return typeof json?.token === "string" ? json.token : undefined;
  } catch (err: any) {
    lastError = `auth/${endpoint}: ${err?.message || err}`;
    return undefined;
  }
}

/**
 * Make sure we have a usable JWT, by (in order):
 *   - returning the explicit env token
 *   - returning a cached token from db.json
 *   - logging in with WC_API_EMAIL + WC_API_PASSWORD (cached)
 *   - registering with the same credentials, then logging in.
 */
async function ensureToken(): Promise<string | undefined> {
  if (EXPLICIT_TOKEN) return EXPLICIT_TOKEN;
  if (memoToken) return memoToken;

  // Coalesce concurrent callers.
  if (bootstrapping) return bootstrapping;

  bootstrapping = (async () => {
    if (!EMAIL || !PASSWORD) return undefined;

    const cached = await loadCachedAuth();
    if (cached?.token && cached.email === EMAIL && cached.base === BASE) {
      memoToken = cached.token;
      return memoToken;
    }

    // Try login first (account may already exist).
    let token = await callAuth("authenticate", { email: EMAIL, password: PASSWORD });
    if (!token) {
      // Register, then login.
      await callAuth("register", { name: NAME, email: EMAIL, password: PASSWORD });
      token = await callAuth("authenticate", { email: EMAIL, password: PASSWORD });
    }

    if (token) {
      memoToken = token;
      await saveAuth({
        base: BASE,
        email: EMAIL,
        token,
        obtainedAt: new Date().toISOString(),
      });
      lastError = undefined;
    }
    return memoToken;
  })().finally(() => {
    bootstrapping = null;
  });

  return bootstrapping;
}

/** Invalidate the cached token (e.g. after a 401) so next call re-auths. */
async function invalidateToken(): Promise<void> {
  memoToken = EXPLICIT_TOKEN; // keep the explicit one if present
  if (!EXPLICIT_TOKEN) await saveAuth(undefined);
}

/**
 * Fetch the current results map. Returns `{}` when no token is configured or
 * on any network/parse error (so settlement always degrades gracefully).
 */
export async function fetchLiveResults(): Promise<Record<string, LiveResult>> {
  if (!liveScoresEnabled()) return {};
  if (Date.now() - cache.ts < CACHE_MS) return cache.data;

  const token = await ensureToken();
  if (!token) return cache.data;

  let res: Response | undefined;
  let lastFetchErr: any;
  // One retry — undici's `fetch failed` is sometimes transient on cold sockets.
  for (let attempt = 0; attempt < 2 && !res; attempt++) {
    try {
      res = await http(`/get/games`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err: any) {
      lastFetchErr = err;
    }
  }
  if (!res) {
    lastError = `get/games: ${lastFetchErr?.message || lastFetchErr || "fetch failed"}`;
    return cache.data;
  }

  if (res.status === 401) {
    await invalidateToken();
    return cache.data;
  }
  if (!res.ok) {
    lastError = `get/games: HTTP ${res.status}`;
    return cache.data;
  }

  let json: any;
  try {
    json = await res.json();
  } catch (err: any) {
    lastError = `get/games: ${err?.message || err}`;
    return cache.data;
  }

  const games: any[] = Array.isArray(json) ? json : json.games ?? [];
  const map: Record<string, LiveResult> = {};
  for (const g of games) {
    const elapsed = String(g.time_elapsed ?? "").toLowerCase();
    const finished =
      String(g.finished ?? "").toUpperCase() === "TRUE" || elapsed === "finished";
    const live = !finished && elapsed !== "notstarted" && elapsed !== "";
    const home = Number(g.home_score ?? 0);
    const away = Number(g.away_score ?? 0);
    map[`wc-${g.id}`] = {
      finished,
      live,
      home,
      away,
      result: finished ? outcomeFromScore(home, away) : undefined,
    };
  }

  cache = { ts: Date.now(), data: map };
  lastSyncIso = new Date().toISOString();
  lastError = undefined;
  return map;
}

/** Snapshot of the live-scores subsystem for the UI / health checks. */
export async function liveScoresStatus(): Promise<LiveScoresStatus> {
  const source: LiveScoresStatus["source"] = EXPLICIT_TOKEN
    ? "token"
    : EMAIL && PASSWORD
      ? "credentials"
      : "none";

  let matchCount = 0;
  let liveMatches = 0;
  let finishedMatches = 0;
  for (const r of Object.values(cache.data)) {
    matchCount += 1;
    if (r.live) liveMatches += 1;
    if (r.finished) finishedMatches += 1;
  }

  return {
    enabled: source !== "none",
    source,
    base: BASE,
    email: EMAIL,
    lastSyncIso,
    lastError,
    matchCount,
    liveMatches,
    finishedMatches,
  };
}

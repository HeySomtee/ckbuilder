/**
 * Streak — dummy / simulation provider (a stand-in oracle for testing).
 *
 * Why this exists: the real World Cup 2026 feed dries up the moment the
 * tournament ends, but the engine still needs *something* that behaves like a
 * live sports API — fixtures that kick off, run, and finish on a real clock —
 * so the full lifecycle (open → live → resolved → on-chain receipt) can be
 * exercised any day of the year. It also doubles as a template for the next
 * real feed: when the Premier League resumes, drop in an `eplProvider` that
 * implements the same `MatchDataProvider` interface and select it with
 * `MATCH_PROVIDER=epl`.
 *
 * How it works:
 *   - 20 clubs, round-robin gameweeks (circle method), kickoffs staggered
 *     every `DUMMY_STAGGER_MIN` minutes from a persisted anchor.
 *   - The anchor is stored in the DB (`dummyAnchorIso`) so fixture times are
 *     stable across restarts; it defaults to "start of the current hour minus
 *     2h" so a handful of matches are already live/finished the instant you
 *     boot.
 *   - `fetchResults()` derives each fixture's live/final state from the wall
 *     clock: before kickoff → absent, in play → running score, past full time
 *     → deterministic final score (seeded by match id, so every restart agrees).
 *
 * Tunables (env):
 *   MATCH_PROVIDER=dummy    enable this provider
 *   DUMMY_GAMEWEEKS=20      number of round-robin gameweeks to generate
 *   DUMMY_STAGGER_MIN=20    minutes between consecutive kickoffs
 *   DUMMY_MATCH_MINUTES=96  match length (90 + stoppage)
 *   DUMMY_ANCHOR=<ISO>      pin the schedule anchor explicitly (advanced)
 */

import { read, update } from "../store";
import type { Match, Outcome, Team } from "../types";
import type { LiveResult, MatchDataProvider, ProviderStatus } from "./types";

// ── Config ───────────────────────────────────────────────────────────────────

const GAMEWEEKS = clampInt(process.env.DUMMY_GAMEWEEKS, 30, 1, 38);
const STAGGER_MIN = clampInt(process.env.DUMMY_STAGGER_MIN, 20, 5, 240);
const MATCH_MINUTES = clampInt(process.env.DUMMY_MATCH_MINUTES, 96, 30, 200);
const STAGGER_MS = STAGGER_MIN * 60_000;
const MATCH_MS = MATCH_MINUTES * 60_000;
/** Wall-clock span from first kickoff to the last match's full time. */
const WINDOW_MS = GAMEWEEKS * 10 * STAGGER_MS + MATCH_MS;

function clampInt(raw: string | undefined, def: number, lo: number, hi: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// ── Teams (Premier League clubs; the natural swap target) ────────────────────

const TEAMS: Team[] = [
  { code: "ARS", name: "Arsenal", flag: "🔴" },
  { code: "AVL", name: "Aston Villa", flag: "🦁" },
  { code: "BOU", name: "Bournemouth", flag: "🍒" },
  { code: "BRE", name: "Brentford", flag: "🐝" },
  { code: "BHA", name: "Brighton", flag: "🕊️" },
  { code: "CHE", name: "Chelsea", flag: "🔵" },
  { code: "CRY", name: "Crystal Palace", flag: "🦅" },
  { code: "EVE", name: "Everton", flag: "🍬" },
  { code: "FUL", name: "Fulham", flag: "⚪" },
  { code: "IPS", name: "Ipswich Town", flag: "🚜" },
  { code: "LEI", name: "Leicester City", flag: "🦊" },
  { code: "LIV", name: "Liverpool", flag: "🟥" },
  { code: "MCI", name: "Manchester City", flag: "🩵" },
  { code: "MUN", name: "Manchester United", flag: "😈" },
  { code: "NEW", name: "Newcastle United", flag: "⚫" },
  { code: "NFO", name: "Nottingham Forest", flag: "🌳" },
  { code: "SOU", name: "Southampton", flag: "⛪" },
  { code: "TOT", name: "Tottenham Hotspur", flag: "🐓" },
  { code: "WHU", name: "West Ham United", flag: "⚒️" },
  { code: "WOL", name: "Wolves", flag: "🐺" },
];

// ── Seeded PRNG (mulberry32) — deterministic per match id ────────────────────

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic full-time goal count for one side (Poisson-ish bucketing). */
function fullTimeGoals(rng: () => number, mean: number): number {
  const x = rng() * (mean + 1.5);
  if (x < 0.55) return 0;
  if (x < 1.4) return 1;
  if (x < 2.2) return 2;
  if (x < 2.9) return 3;
  return 4;
}

/** Deterministic minute (1..90) for each goal, so a live score climbs sanely. */
function goalMinutes(matchId: string, side: "h" | "a", count: number): number[] {
  const rng = mulberry32(hashSeed(`min:${side}:${matchId}`));
  const mins: number[] = [];
  for (let i = 0; i < count; i++) mins.push(1 + Math.floor(rng() * 90));
  return mins.sort((x, y) => x - y);
}

interface Scoreline {
  home: number;
  away: number;
}

/** Final scoreline for a match, seeded by id (home-biased, fewer draws). */
function finalScore(matchId: string): Scoreline {
  const rng = mulberry32(hashSeed(`ft:${matchId}`));
  return { home: fullTimeGoals(rng, 1.6), away: fullTimeGoals(rng, 1.2) };
}

/** Live scoreline `elapsedMin` into the match (goals whose minute has passed). */
function liveScore(matchId: string, elapsedMin: number): Scoreline {
  const ft = finalScore(matchId);
  const home = goalMinutes(matchId, "h", ft.home).filter((m) => m <= elapsedMin).length;
  const away = goalMinutes(matchId, "a", ft.away).filter((m) => m <= elapsedMin).length;
  return { home, away };
}

function outcomeFromScore(s: Scoreline): Outcome {
  if (s.home > s.away) return "home";
  if (s.away > s.home) return "away";
  return "draw";
}

// ── Round-robin scheduling (circle method) ───────────────────────────────────

/** Pairings for one gameweek: rotate all-but-first, fold ends together. */
function pairingsForRound(round: number): Array<[number, number]> {
  const n = TEAMS.length;
  const rest = Array.from({ length: n - 1 }, (_, i) => i + 1);
  const r = round % (n - 1);
  const rotated = rest.slice(r).concat(rest.slice(0, r));
  const circle = [0, ...rotated];
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < n / 2; i++) pairs.push([circle[i], circle[n - 1 - i]]);
  return pairs;
}

// ── Anchor (persisted so fixture times survive restarts) ─────────────────────

let anchorMs: number | null = null;

function computeDefaultAnchor(): number {
  const explicit = process.env.DUMMY_ANCHOR?.trim();
  if (explicit) {
    const t = Date.parse(explicit);
    if (Number.isFinite(t)) return t;
  }
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d.getTime() - 2 * 3_600_000; // 2h ago → some matches already live/finished
}

// ── Fixture generation (cached per anchor) ───────────────────────────────────

let cache: { anchor: number; matches: Match[] } | null = null;

function generate(anchor: number): Match[] {
  if (cache && cache.anchor === anchor) return cache.matches;
  const out: Match[] = [];
  let n = 0;
  for (let gw = 0; gw < GAMEWEEKS; gw++) {
    const pairs = pairingsForRound(gw);
    pairs.forEach(([h, a], i) => {
      // Alternate home/away each gameweek for a bit of fairness.
      const [home, away] = gw % 2 === 0 ? [h, a] : [a, h];
      const kickoffMs = anchor + n * STAGGER_MS;
      n += 1;
      const iso = new Date(kickoffMs).toISOString();
      out.push({
        id: `epl-${gw + 1}-${i + 1}`,
        date: iso.slice(0, 10),
        stage: `Gameweek ${gw + 1}`,
        home: TEAMS[home],
        away: TEAMS[away],
        kickoff: iso,
        status: "scheduled",
        venue: `${TEAMS[home].name} Stadium`,
        matchday: String(gw + 1),
      });
    });
  }
  out.sort((x, y) => x.kickoff.localeCompare(y.kickoff));
  cache = { anchor, matches: out };
  return out;
}

// ── Live-state tracking (for the status snapshot) ────────────────────────────

let lastSyncIso: string | undefined;
let lastCounts = { matchCount: 0, liveMatches: 0, finishedMatches: 0 };

// ── Provider ─────────────────────────────────────────────────────────────────

export const dummyProvider: MatchDataProvider = {
  id: "dummy",

  /** Load or persist the schedule anchor before any sync runs. */
  async init(): Promise<void> {
    if (anchorMs != null) return;
    const persisted = await read((db) => db.dummyAnchorIso);
    const persistedMs = persisted ? Date.parse(persisted) : NaN;

    // Reuse the persisted anchor while its schedule window is still live, so
    // fixture times stay stable across restarts.
    if (Number.isFinite(persistedMs) && persistedMs + WINDOW_MS > Date.now()) {
      anchorMs = persistedMs;
      return;
    }

    // First boot, or the whole schedule has already finished → roll a fresh
    // anchor so there are live/upcoming fixtures again, and drop the stale
    // dummy fixtures so the engine reseeds them at the new times.
    anchorMs = computeDefaultAnchor();
    const iso = new Date(anchorMs).toISOString();
    const hadPrevious = Number.isFinite(persistedMs);
    await update((db) => {
      db.dummyAnchorIso = iso;
      if (hadPrevious) db.matches = db.matches.filter((m) => !m.id.startsWith("epl-"));
    });
  },

  loadFixtures(): Match[] {
    // Must be sync + store-free (called under the write lock). `init()` has
    // already set `anchorMs`; fall back to a transient anchor just in case.
    const anchor = anchorMs ?? computeDefaultAnchor();
    return generate(anchor);
  },

  async fetchResults(): Promise<Record<string, LiveResult>> {
    const anchor = anchorMs ?? computeDefaultAnchor();
    const matches = generate(anchor);
    const now = Date.now();
    const map: Record<string, LiveResult> = {};
    let live = 0;
    let finished = 0;

    for (const m of matches) {
      const kickoff = Date.parse(m.kickoff);
      if (now < kickoff) continue; // not started → mirror a real feed (absent)
      const end = kickoff + MATCH_MS;
      if (now >= end) {
        const ft = finalScore(m.id);
        map[m.id] = {
          finished: true,
          live: false,
          home: ft.home,
          away: ft.away,
          result: outcomeFromScore(ft),
        };
        finished += 1;
      } else {
        const elapsedMin = Math.floor((now - kickoff) / 60_000);
        const s = liveScore(m.id, elapsedMin);
        map[m.id] = { finished: false, live: true, home: s.home, away: s.away };
        live += 1;
      }
    }

    lastSyncIso = new Date().toISOString();
    lastCounts = { matchCount: Object.keys(map).length, liveMatches: live, finishedMatches: finished };
    return map;
  },

  async status(): Promise<ProviderStatus> {
    return {
      provider: "dummy",
      league: "Premier League · simulated",
      enabled: true,
      simulated: true,
      source: "simulated",
      base: "sim://epl",
      detail: `synthetic feed · ${GAMEWEEKS} gameweeks · kickoff every ${STAGGER_MIN}m`,
      lastSyncIso,
      matchCount: lastCounts.matchCount,
      liveMatches: lastCounts.liveMatches,
      finishedMatches: lastCounts.finishedMatches,
    };
  },
};

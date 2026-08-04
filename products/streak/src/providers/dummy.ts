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
 *   - 20 clubs, round-robin pairings (circle method) mapped onto absolute
 *     wall-clock slots `DUMMY_STAGGER_MIN` minutes apart. Slot IDs are stable
 *     (`epl-s<slot>`), so the feed is an endless rolling window: a fresh
 *     upcoming fixture appears every slot and the engine never runs out of
 *     open markets — no persisted anchor, nothing to expire.
 *   - `loadFixtures()` returns a window from a short past tail (for live /
 *     just-finished matches) out to `DUMMY_AHEAD_SLOTS` upcoming fixtures.
 *   - `fetchResults()` derives each started fixture's live/final state from the
 *     wall clock: in play → running score, past full time → deterministic final
 *     score (seeded by match id, so every restart agrees).
 *
 * Tunables (env):
 *   MATCH_PROVIDER=dummy     enable this provider
 *   DUMMY_STAGGER_MIN=20     minutes between consecutive kickoffs
 *   DUMMY_MATCH_MINUTES=96   match length (90 + stoppage)
 *   DUMMY_PAST_SLOTS=6       recent slots kept live / just-finished
 *   DUMMY_AHEAD_SLOTS=48     upcoming slots to open markets for
 */

import type { Match, Outcome, Team } from "../types";
import type { LiveResult, MatchDataProvider, ProviderStatus } from "./types";

// ── Config ───────────────────────────────────────────────────────────────────

const STAGGER_MIN = clampInt(process.env.DUMMY_STAGGER_MIN, 20, 5, 240);
const MATCH_MINUTES = clampInt(process.env.DUMMY_MATCH_MINUTES, 96, 30, 200);
const STAGGER_MS = STAGGER_MIN * 60_000;
const MATCH_MS = MATCH_MINUTES * 60_000;
// A short past tail keeps a couple of matches live/just-finished; a long future
// run keeps a healthy book of OPEN markets. The feed is a rolling wall-clock
// window, so a fresh upcoming fixture appears every `DUMMY_STAGGER_MIN` minutes
// and the engine never runs out of open markets.
const PAST_SLOTS = clampInt(process.env.DUMMY_PAST_SLOTS, 6, 1, 240);
const AHEAD_SLOTS = clampInt(process.env.DUMMY_AHEAD_SLOTS, 48, 6, 600);

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

// ── Rolling fixture generation (absolute wall-clock slots) ───────────────────
//
// Every `STAGGER_MIN`-minute slot on the absolute clock maps deterministically
// to exactly one fixture with a stable id (`epl-s<slot>`). As time advances,
// new slots enter the future edge of the window and mint brand-new markets,
// while past slots keep their settled history. No anchor, nothing to expire.

const N = TEAMS.length;
const ROUNDS = N - 1;
const PER_ROUND = N / 2;

/** The absolute slot index that "now" falls in. */
function currentSlot(): number {
  return Math.floor(Date.now() / STAGGER_MS);
}

/** Deterministic fixture for one absolute time-slot. */
function fixtureForSlot(slot: number): Match {
  const cycle = Math.floor(slot / PER_ROUND); // rolling "gameweek"
  const round = ((cycle % ROUNDS) + ROUNDS) % ROUNDS;
  const pairIdx = ((slot % PER_ROUND) + PER_ROUND) % PER_ROUND;
  const [x, y] = pairingsForRound(round)[pairIdx];
  const [home, away] = cycle % 2 === 0 ? [x, y] : [y, x]; // alternate home/away
  const iso = new Date(slot * STAGGER_MS).toISOString();
  const matchday = (cycle % 38) + 1;
  return {
    id: `epl-s${slot}`,
    date: iso.slice(0, 10),
    stage: `Matchday ${matchday}`,
    home: TEAMS[home],
    away: TEAMS[away],
    kickoff: iso,
    status: "scheduled",
    venue: `${TEAMS[home].name} Stadium`,
    matchday: String(matchday),
  };
}

/** Fixtures spanning the recent past → near future around "now". */
function windowFixtures(): Match[] {
  const k0 = currentSlot();
  const out: Match[] = [];
  for (let k = Math.max(0, k0 - PAST_SLOTS); k <= k0 + AHEAD_SLOTS; k++) {
    out.push(fixtureForSlot(k));
  }
  return out;
}

// ── Live-state tracking (for the status snapshot) ────────────────────────────

let lastSyncIso: string | undefined;
let lastCounts = { matchCount: 0, liveMatches: 0, finishedMatches: 0 };

// ── Provider ─────────────────────────────────────────────────────────────────

export const dummyProvider: MatchDataProvider = {
  id: "dummy",

  loadFixtures(): Match[] {
    // Sync + store-free (called under the write lock): a rolling wall-clock
    // window, so every sync surfaces the next upcoming fixtures.
    return windowFixtures();
  },

  async fetchResults(): Promise<Record<string, LiveResult>> {
    const now = Date.now();
    const k0 = currentSlot();
    const map: Record<string, LiveResult> = {};
    let live = 0;
    let finished = 0;

    // Only started slots in the recent tail can carry a live/final result.
    for (let k = Math.max(0, k0 - PAST_SLOTS); k <= k0; k++) {
      const kickoff = k * STAGGER_MS;
      if (now < kickoff) continue; // not started → mirror a real feed (absent)
      const id = `epl-s${k}`;
      const end = kickoff + MATCH_MS;
      if (now >= end) {
        const ft = finalScore(id);
        map[id] = {
          finished: true,
          live: false,
          home: ft.home,
          away: ft.away,
          result: outcomeFromScore(ft),
        };
        finished += 1;
      } else {
        const elapsedMin = Math.floor((now - kickoff) / 60_000);
        const s = liveScore(id, elapsedMin);
        map[id] = { finished: false, live: true, home: s.home, away: s.away };
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
      detail: `synthetic rolling feed · kickoff every ${STAGGER_MIN}m · ${AHEAD_SLOTS} upcoming`,
      lastSyncIso,
      matchCount: lastCounts.matchCount,
      liveMatches: lastCounts.liveMatches,
      finishedMatches: lastCounts.finishedMatches,
    };
  },
};

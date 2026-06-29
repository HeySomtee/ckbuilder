/**
 * Streak — match engine.
 *
 * Surfaces the real World Cup 2026 schedule (via wcdata.ts) and resolves each
 * fixture after kickoff. Resolution prefers a **live result** from the
 * worldcup2026 API when available (see livescores.ts); otherwise it falls back
 * to a **deterministic simulated** scoreline seeded by the match id, so picks
 * always settle consistently even offline.
 *
 * PRODUCTION SEAM:
 *   Set `WC_API_TOKEN` to drive real results. With no token, `applyResult()`
 *   uses the seeded simulation. Nothing else in the game loop changes.
 */

import { MATCH_DURATION_MIN } from "./config";
import type { LiveResult } from "./livescores";
import type { Match, Outcome } from "./types";

export { loadAllMatches, currentSlateDate } from "./wcdata";

// ── Seeded PRNG (mulberry32) — deterministic per seed ───────────────────────

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

/** YYYY-MM-DD (UTC) for a Date. */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic simulated result, seeded by match id so every server agrees.
 * Biases slightly toward the home side and away from draws to feel realistic.
 */
function simulateResult(matchId: string): { result: Outcome; score: { home: number; away: number } } {
  const rng = mulberry32(hashSeed("result:" + matchId));
  const homeGoals = weightedGoals(rng(), 1.6);
  const awayGoals = weightedGoals(rng(), 1.2);
  let result: Outcome = "draw";
  if (homeGoals > awayGoals) result = "home";
  else if (awayGoals > homeGoals) result = "away";
  return { result, score: { home: homeGoals, away: awayGoals } };
}

function weightedGoals(r: number, mean: number): number {
  // Rough Poisson-ish bucketing.
  const x = r * (mean + 1.5);
  if (x < 0.55) return 0;
  if (x < 1.4) return 1;
  if (x < 2.2) return 2;
  if (x < 2.9) return 3;
  return 4;
}

/**
 * Compute the up-to-date status/result for a match. Pure function — caller
 * persists the change. Prefers a real live result when supplied.
 *
 * @param live optional live result for this match (from the WC API).
 */
export function applyResult(
  match: Match,
  live?: LiveResult,
  now: Date = new Date(),
): Match {
  if (match.status === "final") return match;

  const kickoff = new Date(match.kickoff).getTime();
  const end = kickoff + MATCH_DURATION_MIN * 60_000;
  const t = now.getTime();

  // Real result wins if the API says the match has finished.
  if (live?.finished && live.result) {
    return {
      ...match,
      status: "final",
      result: live.result,
      score: { home: live.home, away: live.away },
      liveResult: true,
    };
  }

  // Live (in-play) per the API → show as live with the running score.
  if (live?.live) {
    return {
      ...match,
      status: "live",
      score: { home: live.home, away: live.away },
      liveResult: true,
    };
  }

  if (t < kickoff) return { ...match, status: "scheduled" };
  if (t < end) return { ...match, status: "live" };

  // Past full time with no live data → deterministic simulated result.
  const { result, score } = simulateResult(match.id);
  return { ...match, status: "final", result, score, liveResult: false };
}

/** Back-compat alias for older call sites (no live data). */
export const settleMatch = (m: Match, now?: Date): Match => applyResult(m, undefined, now);

export function matchLabel(m: Match): string {
  return `${m.home.code} vs ${m.away.code}`;
}

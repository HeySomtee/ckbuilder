/**
 * Streak Terminal — daily-pick streak game + match-sync glue.
 *
 * The streak game is now a thin layer over the market engine:
 *   - A "streak pick" is just a bet on a market with `isStreakPick: true`.
 *   - When that bet wins → streak +1. When it loses → streak "failed"; user
 *     must renew (on-chain fee) or reset before locking the next streak pick.
 *
 * This module owns:
 *   - syncMatches() — boot/loop entry: load fixtures, settle matches & markets
 *   - renewStreak() — on-chain pay-to-revive a failed streak
 *   - resetStreak() — abandon and zero-out
 *   - leaderboard + public user view-models
 */

import { read, update } from "./store";
import {
  applyResult,
  currentSlateDate,
  dayKey,
  loadAllMatches,
} from "./matches";
import { fetchLiveResults } from "./livescores";
import {
  canAffordRenewal,
  getBalanceShannons,
  shannonsToCkb,
  transferFrom,
} from "./chain";
import { RENEW_FEE_CKB } from "./config";
import { asBig, getTreasury } from "./wallet";
import { ensureMarketsForMatches, settleMarkets, winRate } from "./markets";
import type { LeaderboardRow, Match, PublicUser, StreakDB, User } from "./types";

export { winRate } from "./markets";

// ── Match slate management ──────────────────────────────────────────────────

const MATCHES_SCHEMA_VERSION = 2;

/**
 * Boot + background loop:
 *   1. seed the full real WC2026 schedule if missing
 *   2. apply live results / time-based status to every fixture
 *   3. ensure a market row exists for every fixture
 *   4. settle markets whose match just finalised
 *   5. return today's slate (with rest-day fallbacks)
 */
export async function syncMatches(): Promise<Match[]> {
  const today = dayKey();
  const live = await fetchLiveResults();

  return update((db) => {
    if (db.matches.length === 0 || (db.matchesSchema ?? 0) < MATCHES_SCHEMA_VERSION) {
      const fresh = loadAllMatches();
      const prev = new Map(db.matches.map((m) => [m.id, m]));
      db.matches = fresh.map((m) => {
        const old = prev.get(m.id);
        return old?.status === "final"
          ? { ...m, status: old.status, result: old.result, score: old.score, liveResult: old.liveResult }
          : m;
      });
      db.matchesSchema = MATCHES_SCHEMA_VERSION;
    }
    db.matches = db.matches.map((m) => applyResult(m, live[m.id]));
    ensureMarketsForMatches(db);
    settleMarkets(db);

    const slateDate = currentSlateDate(db.matches, today);
    return db.matches
      .filter((m) => m.date === slateDate)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  });
}

// ── Streak revival ──────────────────────────────────────────────────────────

export class GameError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface RenewResult {
  txHash: string;
  newBalanceCkb: string;
  streak: number;
}

/** Pay the on-chain renewal fee (wallet → treasury) and revive the streak. */
export async function renewStreak(userId: string): Promise<RenewResult> {
  const user = await read((db) => db.users.find((u) => u.id === userId));
  if (!user) throw new GameError("no_user", "User not found.");
  if (user.streak.status !== "failed") {
    throw new GameError("not_failed", "Your streak is not in a failed state.");
  }

  const treasury = await getTreasury();
  if (!(await canAffordRenewal(user.wallet.address))) {
    throw new GameError(
      "insufficient",
      `Not enough wallet balance. Renewal costs ${RENEW_FEE_CKB} CKB (plus a small network fee).`,
    );
  }

  const txHash = await transferFrom(user.wallet.privateKey, treasury.address, RENEW_FEE_CKB);

  await update((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new GameError("no_user", "User not found.");
    u.streak.status = "active";
    u.streak.failedBetId = undefined;
    u.streak.lastPickDate = undefined; // free up today's streak pick slot
    u.stats.renews += 1;
  });

  const bal = await getBalanceShannons(user.wallet.address);
  return { txHash, newBalanceCkb: shannonsToCkb(bal), streak: user.streak.current };
}

/** Abandon a failed run: reset to zero, no payment. */
export async function resetStreak(userId: string): Promise<void> {
  await update((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new GameError("no_user", "User not found.");
    u.streak.current = 0;
    u.streak.status = "active";
    u.streak.failedBetId = undefined;
    u.streak.lastPickDate = undefined;
  });
}

// ── View-models ─────────────────────────────────────────────────────────────

export async function rankOf(userId: string): Promise<number> {
  const board = await leaderboard(userId);
  const row = board.find((r) => r.isMe);
  return row?.rank ?? board.length + 1;
}

export async function toPublicUser(user: User): Promise<PublicUser> {
  return {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    walletAddress: user.wallet.address,
    escrowCkb: shannonsToCkb(asBig(user.escrowShannons)),
    creatorFeesCkb: shannonsToCkb(asBig(user.creatorFeesShannons)),
    streak: user.streak,
    stats: user.stats,
    winRate: winRate(user),
    rank: await rankOf(user.id),
  };
}

/**
 * Global leaderboard. Sort order: net P&L ↓, then current streak, then best.
 */
export async function leaderboard(meId?: string): Promise<LeaderboardRow[]> {
  const users = await read((db) => db.users);
  const sorted = [...users].sort((a, b) => {
    const pa = asBig(a.stats.netPnlShannons);
    const pb = asBig(b.stats.netPnlShannons);
    if (pa !== pb) return pa > pb ? -1 : 1;
    if (b.streak.current !== a.streak.current) return b.streak.current - a.streak.current;
    return b.streak.best - a.streak.best;
  });
  return sorted.map((u, i) => ({
    rank: i + 1,
    username: u.username,
    current: u.streak.current,
    best: u.streak.best,
    winRate: winRate(u),
    netPnlCkb: shannonsToCkb(asBig(u.stats.netPnlShannons)),
    turnoverCkb: shannonsToCkb(asBig(u.stats.turnoverShannons)),
    isMe: u.id === meId,
  }));
}

/** Lightweight DB selector used by server diagnostics. */
export async function snapshot(): Promise<Pick<StreakDB, "markets" | "bets"> & { userCount: number }> {
  return read((db) => ({
    userCount: db.users.length,
    markets: db.markets,
    bets: db.bets,
  }));
}

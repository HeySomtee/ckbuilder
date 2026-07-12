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
import { buildReceiptPayload, publishReceipt } from "./settlement";
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

  const slate = await update((db) => {
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

  // Publish on-chain receipts for any newly-settled markets. Runs outside the
  // write lock because the CCC tx round-trip takes seconds. Failures are
  // swallowed with a log — the next sync loop will retry.
  publishPendingReceipts().catch((e) =>
    console.error("[settlement] publish loop:", (e as Error).message),
  );

  return slate;
}

// ── Receipt publisher (runs after each syncMatches) ─────────────────────────

/**
 * Serialize concurrent runs so a slow chain call can't stack. If a publish is
 * already in flight, later triggers just re-await it.
 */
let publishing: Promise<void> | null = null;
/** Suppress the "insufficient CKB" retry-flood — log at most once per hour. */
let lastUnderfundedWarn = 0;

export async function publishPendingReceipts(): Promise<void> {
  if (publishing) return publishing;
  publishing = (async () => {
    const treasury = await getTreasury();

    // Snapshot the outstanding work outside a write lock.
    const pending = await read((db) =>
      db.markets
        .filter((m) => (m.status === "resolved" || m.status === "void") && !m.receipt)
        .map((m) => m.id),
    );
    if (pending.length === 0) return;

    for (const marketId of pending) {
      try {
        // Rebuild the payload from the CURRENT DB state to avoid drift.
        const built = await read((db) => {
          const market = db.markets.find((m) => m.id === marketId);
          if (!market) return null;
          return buildReceiptPayload(db, market, treasury);
        });
        if (!built) continue;

        const { txHash, index } = await publishReceipt(treasury, built.payloadHash);

        // Persist the receipt reference + full payload.
        await update((db) => {
          const m = db.markets.find((x) => x.id === marketId);
          if (!m) return;
          m.receipt = {
            txHash,
            index,
            payloadHash: built.payloadHash,
            merkleRoot: built.payload.bets.merkleRoot,
            publishedAt: new Date().toISOString(),
          };
          // Replace any pre-existing payload (idempotent).
          db.receipts = db.receipts.filter((r) => r.marketId !== marketId);
          db.receipts.push(built.payload);
        });
        console.log(`[settlement] published ${marketId} → ${txHash}`);
      } catch (err) {
        const msg = (err as Error).message || String(err);
        // Treasury-underfunded is expected until an operator funds the wallet
        // — retry silently, but nudge once per hour so it's not invisible.
        if (/Insufficient CKB/i.test(msg)) {
          if (Date.now() - lastUnderfundedWarn > 60 * 60 * 1000) {
            lastUnderfundedWarn = Date.now();
            console.warn(
              `[settlement] treasury underfunded — ${pending.length} receipt(s) waiting. ` +
                `Fund ${treasury.address} from https://faucet.nervos.org/`,
            );
          }
          return; // stop this batch; try again next tick
        }
        console.error(`[settlement] publish ${marketId} failed:`, msg);
        return;
      }
    }
  })().finally(() => {
    publishing = null;
  });
  return publishing;
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

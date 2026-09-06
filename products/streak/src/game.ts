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

import { purge, read, update } from "./store";
import {
  applyResult,
  currentSlateDate,
  dayKey,
} from "./matches";
import { provider } from "./providers";
import {
  abbrevAddress,
  cachedBalance,
  shannonsToCkb,
  verifyPaymentToTreasury,
} from "./chain";
import { RENEW_FEE_CKB } from "./config";
import { asBig, asString, getTreasury } from "./wallet";
import { reviveRebate } from "./crews";
import { ensureMarketsForMatches, settleMarkets, winRate } from "./markets";
import { buildReceiptPayload, publishReceipt } from "./settlement";
import { syncMarketInsightSnapshots } from "./insights";
import { notifyReceipt, notifyRevive } from "./notifications";
import type { LeaderboardRow, Match, PublicUser, StreakDB, User } from "./types";

export { winRate } from "./markets";

// ── Match slate management ──────────────────────────────────────────────────

const MATCHES_SCHEMA_VERSION = 3;

/** How long a settled, untouched simulated market is kept before pruning. */
const SIM_RETENTION_MS = 2 * 24 * 60 * 60_000;

/** Rows a prune pass dropped from the draft, to be deleted after the commit. */
interface PrunedIds {
  markets: string[];
  matches: string[];
}

/**
 * Keep the rolling simulated feed from growing without bound: drop old,
 * fully-settled sim markets (and their orphaned matches) that nobody bet on.
 * Bets, on-chain receipts and the real World Cup history are always preserved.
 */
function pruneStaleSimMarkets(db: StreakDB): PrunedIds {
  const cutoff = Date.now() - SIM_RETENTION_MS;
  const beforeMarkets = new Set(db.markets.map((m) => m.id));
  const beforeMatches = new Set(db.matches.map((m) => m.id));
  const kickoffById = new Map(db.matches.map((m) => [m.id, Date.parse(m.kickoff)]));
  const betMarketIds = new Set(db.bets.map((b) => b.marketId));

  db.markets = db.markets.filter((m) => {
    if (!m.matchId.startsWith("epl-s")) return true; // real / legacy market
    if (m.status !== "resolved" && m.status !== "void") return true; // still active
    if (m.receipt) return true; // published on-chain
    if (betMarketIds.has(m.id)) return true; // someone has a position
    const ko = kickoffById.get(m.matchId) ?? Infinity;
    return ko >= cutoff; // keep while recent
  });

  const referenced = new Set(db.markets.map((m) => m.matchId));
  db.matches = db.matches.filter(
    (m) => !m.id.startsWith("epl-s") || referenced.has(m.id),
  );

  // The file store persists the filtered arrays directly, but a relational
  // store never infers a delete from absence — report the ids so the caller
  // can remove them explicitly once the write has committed.
  for (const m of db.markets) beforeMarkets.delete(m.id);
  for (const m of db.matches) beforeMatches.delete(m.id);
  return { markets: [...beforeMarkets], matches: [...beforeMatches] };
}

/**
 * Boot + background loop:
 *   1. seed the full real WC2026 schedule if missing
 *   2. apply live results / time-based status to every fixture
 *   3. ensure a market row exists for every fixture
 *   4. settle markets whose match just finalised
 *   5. return today's slate (with rest-day fallbacks)
 */
export async function syncMatches(): Promise<Match[]> {
  if (syncing) return syncing;
  syncing = performSync().finally(() => { syncing = null; });
  return syncing;
}

let syncing: Promise<Match[]> | null = null;
let warmingInsights: Promise<void> | null = null;

async function performSync(): Promise<Match[]> {
  const today = dayKey();
  const live = await provider.fetchResults();
  const fixtures = provider.loadFixtures();
  // Analytics can take several remote requests. Never let them delay closing
  // or settling markets; freeze whatever was available before kickoff.
  if (provider.prefetchInsights && !warmingInsights) {
    warmingInsights = provider.prefetchInsights(fixtures)
      .catch((error) => console.warn("[insights] warm failed:", (error as Error).message))
      .finally(() => { warmingInsights = null; });
  }

  let pruned: PrunedIds = { markets: [], matches: [] };
  const slate = await update((db) => {
    // Merge the provider's current fixtures: add any we haven't seen and refresh
    // the schedule of not-yet-final matches. A rolling feed (dummy) introduces
    // new upcoming fixtures every sync so open markets never run dry; a static
    // feed (worldcup) is idempotent after the first pass. Settled history — the
    // final matches — is never dropped here.
    const known = new Map(db.matches.map((m) => [m.id, m]));
    const marketByMatch = new Map(db.markets.map((m) => [m.matchId, m]));
    for (const fx of fixtures) {
      const old = known.get(fx.id);
      if (!old) {
        db.matches.push(fx);
      } else if (old.status !== "final") {
        const kickoffChanged = old.kickoff !== fx.kickoff;
        old.kickoff = fx.kickoff;
        old.date = fx.date;
        old.home = fx.home;
        old.away = fx.away;
        old.stage = fx.stage;
        old.venue = fx.venue;
        old.matchday = fx.matchday;
        old.sport = fx.sport;
        old.competition = fx.competition;
        old.oracle = fx.oracle
          ? { ...fx.oracle, confirmedAt: old.oracle?.confirmedAt }
          : old.oracle;
        if (fx.status === "scheduled" || fx.status === "postponed") {
          old.status = fx.status;
        }
        if (kickoffChanged) {
          const market = marketByMatch.get(old.id);
          if (market?.status === "open") market.closesAt = fx.kickoff;
          // A bet-free market that closed only because a fixture was postponed
          // can safely reopen after the API publishes its new future kickoff.
          if (
            market?.status === "closed" &&
            market.totalBets === 0 &&
            Date.parse(fx.kickoff) > Date.now()
          ) {
            market.status = "open";
            market.closesAt = fx.kickoff;
          }
        }
      }
    }
    db.matchesSchema = MATCHES_SCHEMA_VERSION;

    const now = new Date();
    db.matches = db.matches.map((m) =>
      applyResult(m, live[m.id], now, provider.allowSimulatedFallback !== false),
    );
    ensureMarketsForMatches(db);
    if (provider.peekInsights) {
      syncMarketInsightSnapshots(
        db,
        provider.ownsMatch ? (match) => provider.ownsMatch!(match) : () => true,
        (match) => provider.peekInsights!(match),
      );
    }
    settleMarkets(db);
    pruned = pruneStaleSimMarkets(db);

    const slateDate = currentSlateDate(db.matches, today);
    return db.matches
      .filter((m) => m.date === slateDate)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  });

  // Deletions are explicit under a relational store; the write above only
  // upserts. Best-effort: a failure here just leaves stale sim rows behind.
  if (pruned.markets.length || pruned.matches.length) {
    await purge(pruned).catch((e) =>
      console.warn("[game] prune failed:", (e as Error).message));
  }

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
    // Snapshot the outstanding work outside a write lock.
    const pending = await read((db) =>
      db.markets
        .filter((m) => (m.status === "resolved" || m.status === "void") && !m.receipt)
        .map((m) => m.id),
    );
    if (pending.length === 0) return;
    const treasury = await getTreasury();

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
        // notify about published receipt (best-effort)
        (async () => {
          try {
            await notifyReceipt({ marketId, txHash });
          } catch (e) {}
        })();
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
  newEscrowCkb: string;
  streak: number;
  /** Crew revive rebate credited to escrow (CKB, "0" when none). */
  rebateCkb: string;
  /** Crew-mates whose same-match streak pick earned the rebate. */
  coPickers: string[];
}

/** Confirm the user's on-chain renewal payment (wallet → treasury) and revive. */
export async function renewStreak(userId: string, txHash: string): Promise<RenewResult> {
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new GameError("bad_tx", "A valid renewal transaction hash is required.");
  }
  txHash = txHash.toLowerCase();
  const user = await read((db) => db.users.find((u) => u.id === userId));
  if (!user) throw new GameError("no_user", "User not found.");
  if (user.streak.status !== "failed") {
    throw new GameError("not_failed", "Your streak is not in a failed state.");
  }

  const usedAlready = await read((db) => (db.renewalTxs ?? []).some((hash) => hash.toLowerCase() === txHash));
  if (usedAlready) throw new GameError("dup", "This renewal transaction was already used.");

  const treasury = await getTreasury();
  try {
    await verifyPaymentToTreasury(txHash, user.wallet.address, treasury.address, RENEW_FEE_CKB);
  } catch (err) {
    throw new GameError("verify", (err as Error).message || "Could not verify the renewal transaction.");
  }

  const { newEscrowShannons, rebateCkb, coPickers } = await update((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new GameError("no_user", "User not found.");
    if ((db.renewalTxs ?? []).some((hash) => hash.toLowerCase() === txHash) ||
      db.deposits.some((d) => d.txHash.toLowerCase() === txHash)) {
      throw new GameError("dup", "This payment transaction was already used.");
    }
    if (u.streak.status !== "failed") {
      throw new GameError("not_failed", "Your streak is not in a failed state.");
    }
    if (u.wallet.address !== user.wallet.address) {
      throw new GameError("wallet_changed", "Your connected wallet changed. Please retry.");
    }
    // Compute the crew rebate BEFORE clearing the failed streak (it reads it).
    const rebate = reviveRebate(db, userId);
    u.streak.status = "active";
    u.streak.failedBetId = undefined;
    u.streak.lastPickDate = undefined; // free up today's streak pick slot
    u.stats.renews += 1;
    // Credit the rebate to escrow. It's fully backed by the RENEW_FEE the user
    // just paid the treasury on-chain (the treasury nets fee − rebate).
    if (rebate.rebateShannons > 0n) {
      u.escrowShannons = asString(asBig(u.escrowShannons) + rebate.rebateShannons);
    }
    db.renewalTxs = [...(db.renewalTxs ?? []), txHash];
    return {
      newEscrowShannons: u.escrowShannons,
      rebateCkb: shannonsToCkb(rebate.rebateShannons),
      coPickers: rebate.coPickers,
    };
  });

  const bal = cachedBalance(user.wallet.address).value;
  // best-effort notify about revive rebate
  if (Number(rebateCkb) > 0) {
    (async () => {
      try {
        await notifyRevive({
          username: user.username ?? abbrevAddress(user.wallet.address),
          rebateCkb,
          coPickers,
          chatId: user.telegramChatId,
        });
      } catch (e) {}
    })();
  }
  return {
    txHash,
    newBalanceCkb: bal === undefined ? "—" : shannonsToCkb(bal),
    newEscrowCkb: shannonsToCkb(asBig(newEscrowShannons)),
    streak: user.streak.current,
    rebateCkb,
    coPickers,
  };
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
  return read((db) => {
    const index = db.users.findIndex((u) => u.id === userId);
    if (index < 0) return db.users.length + 1;
    const user = db.users[index];
    return 1 + db.users.reduce((ahead, candidate, candidateIndex) => {
      const order = compareUsers(candidate, user);
      return ahead + (order < 0 || (order === 0 && candidateIndex < index) ? 1 : 0);
    }, 0);
  });
}

function compareUsers(a: User, b: User): number {
  const pa = asBig(a.stats.netPnlShannons);
  const pb = asBig(b.stats.netPnlShannons);
  if (pa !== pb) return pa > pb ? -1 : 1;
  return b.streak.current - a.streak.current || b.streak.best - a.streak.best;
}

export async function toPublicUser(user: User, knownRank?: number): Promise<PublicUser> {
  return {
    id: user.id,
    username: user.username ?? abbrevAddress(user.wallet.address),
    hasUsername: !!user.username,
    telegramConnected: !!user.telegramChatId,
    telegramUsername: user.telegramUsername,
    createdAt: user.createdAt,
    walletAddress: user.wallet.address,
    walletType: user.walletType,
    escrowCkb: shannonsToCkb(asBig(user.escrowShannons)),
    creatorFeesCkb: shannonsToCkb(asBig(user.creatorFeesShannons)),
    streak: user.streak,
    stats: user.stats,
    winRate: winRate(user),
    rank: knownRank ?? await rankOf(user.id),
  };
}

/**
 * Global leaderboard. Sort order: net P&L ↓, then current streak, then best.
 */
export async function leaderboard(meId?: string): Promise<LeaderboardRow[]> {
  const users = await read((db) => db.users);
  const sorted = [...users].sort(compareUsers);
  return sorted.map((u, i) => ({
    rank: i + 1,
    username: u.username ?? abbrevAddress(u.wallet.address),
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

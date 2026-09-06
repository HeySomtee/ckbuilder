/**
 * Streak Terminal — parimutuel prediction-market engine.
 *
 * One canonical market per WC2026 fixture, 3 outcomes (home/draw/away).
 *
 * Lifecycle
 *   open      — accepting bets
 *   closed    — past kickoff, awaiting result
 *   resolved  — winners can claim; payouts are credited automatically on settle
 *   void      — no bets on the winning side (or no result) → refund every bet
 *
 * Pricing (parimutuel)
 *   implied_prob[o] = pools[o] / total
 *   decimal_odds[o] = total / pools[o]                                 (if pools[o] > 0)
 *
 * Settlement (when match goes final)
 *   loserPool         = sum(pools[o] for o != winner)
 *   protocolFee       = loserPool * PROTOCOL_FEE_BPS / 10000   → treasury
 *   creatorFee        = loserPool * CREATOR_FEE_BPS  / 10000   → market creator
 *   distributable     = loserPool - protocolFee - creatorFee
 *   payout(bet)       = bet.amount + distributable * bet.amount / winnerPool   (winners)
 *                     = 0                                                       (losers)
 *
 * Inspired by calledAdo/asset-up-down-pools (parimutuel BTC up/down pools on
 * CKB) and calledAdo/lean-oracle (Pyth/Wormhole price oracle on CKB). The
 * existing worldcup2026 REST integration plays the oracle role here.
 */

import { randomUUID } from "crypto";

import { CREATOR_FEE_BPS, MARKET_HISTORY_CAP, MAX_BET_CKB, MIN_BET_CKB, PROTOCOL_FEE_BPS } from "./config";
import { abbrevAddress, ckbToShannons, shannonsToCkb } from "./chain";
import { matchLabel } from "./matches";
import { read, update } from "./store";
import { asBig, asString } from "./wallet";
import { notifyPick } from "./notifications";
import type {
  Bet,
  Market,
  MarketDetail,
  MarketStatus,
  MarketSummary,
  Match,
  Outcome,
  PayoutSummary,
  StreakDB,
  User,
} from "./types";

export const OUTCOMES: Outcome[] = ["home", "draw", "away"];

export class MarketError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

function emptyPools(): Record<Outcome, string> {
  return { home: "0", draw: "0", away: "0" };
}

function totalPool(m: Market): bigint {
  return asBig(m.pools.home) + asBig(m.pools.draw) + asBig(m.pools.away);
}

function priceMap(m: Market, total = totalPool(m)): Record<Outcome, number> {
  if (total === 0n) return { home: 0, draw: 0, away: 0 };
  const t = Number(total);
  return {
    home: Number(asBig(m.pools.home)) / t,
    draw: Number(asBig(m.pools.draw)) / t,
    away: Number(asBig(m.pools.away)) / t,
  };
}

function pushTick(m: Market): void {
  const tick = { t: Date.now(), p: priceMap(m) };
  m.history.push(tick);
  if (m.history.length > MARKET_HISTORY_CAP) {
    // Downsample by dropping every other older tick.
    const head = m.history.slice(0, m.history.length / 2);
    const kept = head.filter((_, i) => i % 2 === 0);
    m.history = kept.concat(m.history.slice(m.history.length / 2));
  }
}

function freshMarket(matchId: string, kickoff: string, creatorId: string): Market {
  return {
    id: `m-${matchId}`,
    matchId,
    creatorId,
    status: "open",
    pools: emptyPools(),
    totalBets: 0,
    uniqueBettors: 0,
    createdAt: new Date().toISOString(),
    closesAt: kickoff,
    feeBps: { protocol: PROTOCOL_FEE_BPS, creator: CREATOR_FEE_BPS },
    history: [],
  };
}

/** Ensure a market row exists for every scheduled fixture (creator="system"). */
export function ensureMarketsForMatches(db: StreakDB): void {
  const seen = new Set(db.markets.map((m) => m.matchId));
  for (const match of db.matches) {
    if (seen.has(match.id)) continue;
    db.markets.push(freshMarket(match.id, match.kickoff, "system"));
    seen.add(match.id);
  }
}

/** Sync market.status against match.status (transitions open→closed at kickoff). */
function syncStatuses(db: StreakDB, matchById: Map<string, Match>): void {
  const now = Date.now();
  for (const market of db.markets) {
    if (market.status !== "open" && market.status !== "closed") continue;
    const match = matchById.get(market.matchId);
    if (!match) continue;
    if (market.status === "open") {
      const closed = now >= Date.parse(market.closesAt) || match.status !== "scheduled";
      if (closed) {
        market.status = "closed";
        pushTick(market);
      }
    }
  }
}

// ── Settlement (called from game.ts after match goes final) ─────────────────

/**
 * Walk all markets whose match has finalised and pay out winners. Mutates db.
 * Returns the markets that were resolved (or voided) this pass.
 */
export function settleMarkets(db: StreakDB): Market[] {
  const matchById = new Map(db.matches.map((m) => [m.id, m]));
  const userById = new Map(db.users.map((u) => [u.id, u]));
  const pendingByMarket = new Map<string, Bet[]>();
  for (const bet of db.bets) {
    if (bet.settled) continue;
    const pending = pendingByMarket.get(bet.marketId);
    if (pending) pending.push(bet);
    else pendingByMarket.set(bet.marketId, [bet]);
  }
  const justResolved: Market[] = [];

  syncStatuses(db, matchById);

  for (const market of db.markets) {
    if (market.status === "resolved" || market.status === "void") continue;
    const match = matchById.get(market.matchId);
    if (match?.status === "cancelled") {
      voidMarket(market, pendingByMarket.get(market.id) ?? [], userById);
      justResolved.push(market);
      continue;
    }
    if (!match || match.status !== "final" || !match.result) continue;

    const winner = match.result;
    const winnerPool = asBig(market.pools[winner]);
    const loserPool =
      asBig(market.pools.home) +
      asBig(market.pools.draw) +
      asBig(market.pools.away) -
      winnerPool;

    // Empty-side void: no bets on the winning outcome → refund every bet.
    if (winnerPool === 0n) {
      voidMarket(market, pendingByMarket.get(market.id) ?? [], userById);
      justResolved.push(market);
      continue;
    }

    const protocolFee = (loserPool * BigInt(market.feeBps.protocol)) / 10_000n;
    const creatorFee = (loserPool * BigInt(market.feeBps.creator)) / 10_000n;
    const distributable = loserPool - protocolFee - creatorFee;

    let winnerCount = 0;
    let totalPaid = 0n;

    for (const bet of pendingByMarket.get(market.id) ?? []) {
      bet.settled = true;
      const stake = asBig(bet.amount);
      const user = userById.get(bet.userId);
      if (bet.outcome === winner) {
        const share = (distributable * stake) / winnerPool;
        const payout = stake + share;
        bet.payout = asString(payout);
        if (user) {
          user.escrowShannons = asString(asBig(user.escrowShannons) + payout);
          user.stats.wonBets += 1;
          user.stats.netPnlShannons = asString(asBig(user.stats.netPnlShannons) + share);
          if (bet.isStreakPick) onStreakPickWin(user);
        }
        winnerCount += 1;
        totalPaid += payout;
      } else {
        bet.payout = "0";
        if (user) {
          user.stats.lostBets += 1;
          user.stats.netPnlShannons = asString(asBig(user.stats.netPnlShannons) - stake);
          if (bet.isStreakPick) onStreakPickLose(user, bet.id);
        }
      }
    }

    // Pay protocol + creator fees.
    db.protocolFeesShannons = asString(asBig(db.protocolFeesShannons) + protocolFee);
    if (creatorFee > 0n) {
      const creator = userById.get(market.creatorId);
      if (creator) {
        creator.escrowShannons = asString(asBig(creator.escrowShannons) + creatorFee);
        creator.creatorFeesShannons = asString(asBig(creator.creatorFeesShannons) + creatorFee);
      } else {
        // System creator → fee accrues to protocol.
        db.protocolFeesShannons = asString(asBig(db.protocolFeesShannons) + creatorFee);
      }
    }

    market.status = "resolved";
    market.resolvedAt = new Date().toISOString();
    market.resolvedOutcome = winner;
    market.payout = {
      winnerPoolShannons: asString(winnerPool),
      loserPoolShannons: asString(loserPool),
      totalPaidShannons: asString(totalPaid),
      protocolFeeShannons: asString(protocolFee),
      creatorFeeShannons: asString(creatorFee),
      winnerCount,
    };
    pushTick(market);
    justResolved.push(market);
  }
  return justResolved;
}

function voidMarket(market: Market, pendingBets: Bet[], userById: Map<string, User>): void {
  // Refund every bet.
  for (const bet of pendingBets) {
    bet.settled = true;
    bet.payout = bet.amount;
    const user = userById.get(bet.userId);
    if (user) {
      user.escrowShannons = asString(asBig(user.escrowShannons) + asBig(bet.amount));
      // Streak pick on a voided market: leave streak unchanged (clear the date so they can re-pick today).
      if (bet.isStreakPick && user.streak.lastPickDate) {
        user.streak.lastPickDate = undefined;
      }
    }
  }
  market.status = "void";
  market.resolvedAt = new Date().toISOString();
  market.resolvedOutcome = "void";
  market.payout = {
    winnerPoolShannons: "0",
    loserPoolShannons: "0",
    totalPaidShannons: asString(totalPool(market)),
    protocolFeeShannons: "0",
    creatorFeeShannons: "0",
    winnerCount: 0,
  };
  pushTick(market);
}

// ── Streak hooks (the tagged-bet model) ─────────────────────────────────────

function onStreakPickWin(user: User): void {
  user.streak.current += 1;
  user.streak.best = Math.max(user.streak.best, user.streak.current);
  user.streak.status = "active";
  user.streak.failedBetId = undefined;
}

function onStreakPickLose(user: User, betId: string): void {
  user.streak.status = "failed";
  user.streak.failedBetId = betId;
}

// ── Bet placement ───────────────────────────────────────────────────────────

export interface PlaceBetInput {
  userId: string;
  matchId: string;
  outcome: Outcome;
  amountCkb: number;
  asStreakPick?: boolean;
}

export interface PlaceBetResult {
  bet: Bet;
  market: Market;
  newEscrowCkb: string;
}

export async function placeBet(input: PlaceBetInput): Promise<PlaceBetResult> {
  if (!OUTCOMES.includes(input.outcome)) {
    throw new MarketError("bad_outcome", "Invalid outcome.");
  }
  if (!Number.isFinite(input.amountCkb) || input.amountCkb < MIN_BET_CKB) {
    throw new MarketError("min_bet", `Minimum bet is ${MIN_BET_CKB} CKB.`);
  }
  if (input.amountCkb > MAX_BET_CKB) {
    throw new MarketError("max_bet", `Maximum bet is ${MAX_BET_CKB} CKB.`);
  }

  const result = await update((db) => {
    const user = db.users.find((u) => u.id === input.userId);
    if (!user) throw new MarketError("no_user", "User not found.");
    const match = db.matches.find((m) => m.id === input.matchId);
    if (!match) throw new MarketError("no_match", "Match not found.");

    // Block bets once kickoff is reached or match is live/final.
    if (Date.now() >= new Date(match.kickoff).getTime() || match.status !== "scheduled") {
      throw new MarketError("locked", "Market closed: match has kicked off.");
    }

    const stake = ckbToShannons(input.amountCkb);
    if (asBig(user.escrowShannons) < stake) {
      throw new MarketError(
        "insufficient_escrow",
        `Escrow too low. Deposit CKB to bet — you have ${shannonsToCkb(asBig(user.escrowShannons))} CKB.`,
      );
    }

    // Auto-create the market on first bet; first bettor becomes creator if it was "system".
    let market = db.markets.find((m) => m.matchId === input.matchId);
    if (!market) {
      market = freshMarket(match.id, match.kickoff, input.userId);
      db.markets.push(market);
    } else if (market.creatorId === "system" && market.totalBets === 0) {
      market.creatorId = input.userId;
    }
    if (market.status !== "open") {
      throw new MarketError("locked", "Market is not open for bets.");
    }

    // Streak pick rules: one tagged bet per UTC day, only when streak is active.
    const isStreakPick = !!input.asStreakPick;
    let streakAtPick: number | undefined;
    const today = new Date().toISOString().slice(0, 10);
    if (isStreakPick) {
      if (user.streak.status === "failed") {
        throw new MarketError(
          "streak_failed",
          "Your streak has failed. Renew or reset before picking again.",
        );
      }
      if (user.streak.lastPickDate === today) {
        throw new MarketError("already_picked", "You've already locked a streak pick today.");
      }
      streakAtPick = user.streak.current;
    }

    // Snapshot price BEFORE applying the bet (this is the price the user accepted).
    const prePrice = priceMap(market)[input.outcome];

    // Debit escrow, credit pool.
    user.escrowShannons = asString(asBig(user.escrowShannons) - stake);
    market.pools[input.outcome] = asString(asBig(market.pools[input.outcome]) + stake);
    user.stats.totalBets += 1;
    user.stats.turnoverShannons = asString(asBig(user.stats.turnoverShannons) + stake);

    if (isStreakPick) {
      user.streak.lastPickDate = today;
    }

    if (!db.bets.some((b) => b.marketId === market!.id && b.userId === user.id)) {
      market.uniqueBettors += 1;
    }
    market.totalBets += 1;

    const bet: Bet = {
      id: randomUUID(),
      marketId: market.id,
      matchId: match.id,
      userId: user.id,
      outcome: input.outcome,
      amount: asString(stake),
      placedAt: new Date().toISOString(),
      priceAtBet: prePrice,
      settled: false,
      isStreakPick,
      streakAtPick,
    };
    db.bets.push(bet);

    pushTick(market);

    return {
      bet,
      market,
      newEscrowCkb: shannonsToCkb(asBig(user.escrowShannons)),
    };
  });

  // notify asynchronously about picks (streak + regular bets)
  (async () => {
    try {
      const db = await read((d) => d);
      const u = db.users.find((x) => x.id === result.bet.userId);
      const username = u?.username ?? result.bet.userId;
      const match = db.matches.find((m) => m.id === result.bet.matchId);
      const matchLabel = match ? `${match.home.code}–${match.away.code}` : result.bet.matchId;
      await notifyPick({ username, matchLabel, outcome: result.bet.outcome, chatId: u?.telegramChatId });
    } catch (e) {
      console.warn("[notifications] bet notify failed", e);
    }
  })();

  return result;
}

// ── View models ─────────────────────────────────────────────────────────────

/** Read-time closure stays accurate while a remote oracle sync is delayed. */
export function effectiveMarketStatus(market: Market, match?: Match, now = Date.now()): MarketStatus {
  if (market.status !== "open") return market.status;
  return now >= Date.parse(market.closesAt) || (match && match.status !== "scheduled")
    ? "closed"
    : "open";
}

export function toMarketSummary(market: Market, match: Match): MarketSummary {
  const total = totalPool(market);
  return {
    id: market.id,
    match: {
      id: match.id,
      label: matchLabel(match),
      kickoff: match.kickoff,
      stage: match.stage,
      status: match.status,
      sport: match.sport,
      competition: match.competition,
      home: match.home,
      away: match.away,
      score: match.score,
    },
    status: effectiveMarketStatus(market, match),
    prices: priceMap(market, total),
    pools: market.pools,
    totalPoolCkb: shannonsToCkb(total),
    totalBets: market.totalBets,
    uniqueBettors: market.uniqueBettors,
    closesAt: market.closesAt,
    resolvedOutcome: market.resolvedOutcome,
    spark: market.history.slice(-32),
  };
}

// Committed store arrays are immutable. Reuse their indexes across requests;
// WeakMaps release the previous indexes when a new database snapshot commits.
const idIndexes = new WeakMap<object, Map<string, { id: string }>>();
function byId<T extends { id: string }>(rows: T[]): Map<string, T> {
  let index = idIndexes.get(rows) as Map<string, T> | undefined;
  if (!index) {
    index = new Map(rows.map((row) => [row.id, row]));
    idIndexes.set(rows, index);
  }
  return index;
}

const betIndexes = new WeakMap<Bet[], { market: Map<string, Bet[]>; user: Map<string, Bet[]> }>();
function indexedBets(bets: Bet[], kind: "market" | "user", id: string): Bet[] {
  let indexes = betIndexes.get(bets);
  if (!indexes) {
    indexes = { market: new Map(), user: new Map() };
    // Sort once per snapshot, preserving the public reverse-chronological order
    // even when legacy imports were not appended in placement order.
    const ordered = [...bets].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
    for (const bet of ordered) {
      for (const [index, key] of [[indexes.market, bet.marketId], [indexes.user, bet.userId]] as const) {
        const group = index.get(key);
        if (group) group.push(bet);
        else index.set(key, [bet]);
      }
    }
    betIndexes.set(bets, indexes);
  }
  return indexes[kind].get(id) ?? [];
}

export async function listMarkets(opts: {
  status?: MarketStatus;
  matchId?: string;
  competitionId?: string;
  matchFilter?: (match: Match) => boolean;
} = {}): Promise<MarketSummary[]> {
  return read((db) => {
    const matchById = byId(db.matches);
    return db.markets
      .filter((m) => (opts.matchId ? m.matchId === opts.matchId : true))
      .map((m) => {
        const match = matchById.get(m.matchId);
        if (opts.status && effectiveMarketStatus(m, match) !== opts.status) return null;
        if (match && opts.matchFilter && !opts.matchFilter(match)) return null;
        if (opts.competitionId && match?.competition?.id !== opts.competitionId) return null;
        return match ? toMarketSummary(m, match) : null;
      })
      .filter((x): x is MarketSummary => x !== null)
      .sort((a, b) => {
        // Open first, then closed, then resolved; within group by kickoff.
        const rank = (s: MarketStatus) =>
          s === "open" ? 0 : s === "closed" ? 1 : s === "resolved" ? 2 : 3;
        const dr = rank(a.status) - rank(b.status);
        if (dr !== 0) return dr;
        return a.match.kickoff.localeCompare(b.match.kickoff);
      });
  });
}

export async function getMarketDetail(
  marketId: string,
  meId?: string,
): Promise<MarketDetail | null> {
  return read((db) => {
    const market = byId(db.markets).get(marketId);
    if (!market) return null;
    const match = byId(db.matches).get(market.matchId);
    if (!match) return null;

    const summary = toMarketSummary(market, match);
    const userById = byId(db.users);
    const creator = userById.get(market.creatorId) ?? null;

    const marketBets = indexedBets(db.bets, "market", market.id);
    const myBets = meId ? marketBets.filter((b) => b.userId === meId) : [];
    const feedBets = marketBets.slice(0, 50);

    return {
      ...summary,
      createdAt: market.createdAt,
      creator: creator ? { id: creator.id, username: creator.username ?? abbrevAddress(creator.wallet.address) } : null,
      history: market.history,
      feeBps: market.feeBps,
      payout: market.payout,
      myPositions: myBets.map((b) => ({
        id: b.id,
        outcome: b.outcome,
        amountCkb: shannonsToCkb(asBig(b.amount)),
        priceAtBet: b.priceAtBet,
        placedAt: b.placedAt,
        settled: b.settled,
        payoutCkb: b.payout ? shannonsToCkb(asBig(b.payout)) : undefined,
        isStreakPick: b.isStreakPick,
      })),
      feed: feedBets.map((b) => ({
        id: b.id,
        user: userById.get(b.userId)?.username ?? "—",
        outcome: b.outcome,
        amountCkb: shannonsToCkb(asBig(b.amount)),
        priceAtBet: b.priceAtBet,
        placedAt: b.placedAt,
      })),
    };
  });
}

// ── Portfolio ───────────────────────────────────────────────────────────────

export interface PortfolioPosition {
  betId: string;
  marketId: string;
  matchId: string;
  matchLabel: string;
  outcome: Outcome;
  amountCkb: string;
  priceAtBet: number;
  placedAt: string;
  settled: boolean;
  payoutCkb?: string;
  pnlCkb?: string;
  result?: "won" | "lost" | "void";
  isStreakPick?: boolean;
  marketStatus: MarketStatus;
  resolvedOutcome?: Outcome | "void";
  kickoff: string;
}

export async function portfolio(userId: string): Promise<PortfolioPosition[]> {
  return read((db) => {
    const marketById = byId(db.markets);
    const matchById = byId(db.matches);
    return indexedBets(db.bets, "user", userId)
      .map((b): PortfolioPosition => {
        const market = marketById.get(b.marketId);
        const match = matchById.get(b.matchId);
        const stake = asBig(b.amount);
        const payout = b.payout ? asBig(b.payout) : 0n;
        let result: "won" | "lost" | "void" | undefined;
        if (b.settled && market?.resolvedOutcome === "void") result = "void";
        else if (b.settled && market?.resolvedOutcome === b.outcome) result = "won";
        else if (b.settled && payout === 0n) result = "lost";
        else if (b.settled && payout > stake) result = "won";
        else if (b.settled && payout === stake) result = "void";
        return {
          betId: b.id,
          marketId: b.marketId,
          matchId: b.matchId,
          matchLabel: match ? matchLabel(match) : b.matchId,
          outcome: b.outcome,
          amountCkb: shannonsToCkb(stake),
          priceAtBet: b.priceAtBet,
          placedAt: b.placedAt,
          settled: b.settled,
          payoutCkb: b.settled ? shannonsToCkb(payout) : undefined,
          pnlCkb: b.settled ? shannonsToCkb(payout - stake) : undefined,
          result,
          isStreakPick: b.isStreakPick,
          marketStatus: market ? effectiveMarketStatus(market, match) : "open",
          resolvedOutcome: market?.resolvedOutcome,
          kickoff: match?.kickoff ?? "",
        };
      });
  });
}

// ── Stats helpers used by view-models ───────────────────────────────────────

export function winRate(u: User): number {
  const settled = u.stats.wonBets + u.stats.lostBets;
  return settled === 0 ? 0 : Math.round((u.stats.wonBets / settled) * 100);
}

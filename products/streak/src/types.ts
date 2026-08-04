/**
 * Streak Terminal — shared types.
 *
 * Flat JSON shape (data/db.json). shannon amounts are decimal strings to
 * dodge JSON's 53-bit integer limit. Convert to/from bigint at the seams.
 */

export type Outcome = "home" | "draw" | "away";
export type MatchStatus = "scheduled" | "live" | "final";
export type StreakStatus = "active" | "failed";

/** A single World Cup fixture. */
export interface Match {
  id: string;
  /** Stadium-local calendar day (YYYY-MM-DD). */
  date: string;
  stage: string;
  group?: string;
  home: Team;
  away: Team;
  /** True UTC ISO-8601 kickoff. Markets close at this instant. */
  kickoff: string;
  status: MatchStatus;
  result?: Outcome;
  score?: { home: number; away: number };
  venue?: string;
  matchday?: string;
  /** True when result came from the live API (vs. demo simulator). */
  liveResult?: boolean;
}

export interface Team {
  code: string;
  name: string;
  flag: string;
}

// ── Prediction market ──────────────────────────────────────────────────────

export type MarketStatus = "open" | "closed" | "resolved" | "void";

/**
 * Parimutuel market on a single fixture. Three outcomes (home/draw/away);
 * winners split the losing pool pro-rata after fees, principal returned.
 * shannons stored as decimal strings.
 */
export interface Market {
  id: string;
  matchId: string;
  /** Creator userId, or "system" for auto-seeded markets. */
  creatorId: string;
  status: MarketStatus;
  pools: Record<Outcome, string>;
  totalBets: number;
  uniqueBettors: number;
  createdAt: string;
  /** Kickoff: bets reject at this instant. */
  closesAt: string;
  resolvedAt?: string;
  resolvedOutcome?: Outcome | "void";
  feeBps: { protocol: number; creator: number };
  /** Implied-probability ticks; capped at MARKET_HISTORY_CAP. */
  history: PriceTick[];
  payout?: PayoutSummary;
  /** Set once the on-chain settlement receipt for this market has been published. */
  receipt?: MarketReceiptRef;
}

export interface PriceTick {
  t: number;
  p: Record<Outcome, number>;
}

export interface PayoutSummary {
  winnerPoolShannons: string;
  loserPoolShannons: string;
  totalPaidShannons: string;
  protocolFeeShannons: string;
  creatorFeeShannons: string;
  winnerCount: number;
}

// ── On-chain settlement receipt ─────────────────────────────────────────────

/**
 * Reference to the on-chain receipt cell published for a settled market.
 * Stored on the Market once `settlement.ts` succeeds; the actual receipt
 * payload lives in `StreakDB.receipts` keyed by marketId.
 */
export interface MarketReceiptRef {
  /** Pudge tx hash that produced the receipt cell. */
  txHash: string;
  /** Output index of the receipt cell within that tx. */
  index: number;
  /** sha256 hex of the canonical payload bytes (matches on-chain data). */
  payloadHash: string;
  /** Merkle root over the market's bets (cached for quick UI display). */
  merkleRoot: string;
  publishedAt: string;
}

/**
 * Full off-chain settlement receipt. Its canonical UTF-8 JSON serialization
 * (`canonicalize()` in settlement.ts) is what the on-chain cell hashes.
 */
export interface SettlementReceipt {
  /** Payload schema version — bump for any breaking layout change. */
  v: number;
  marketId: string;
  matchId: string;
  match: {
    home: { code: string; name: string };
    away: { code: string; name: string };
    stage: string;
    kickoff: string;
    score?: { home: number; away: number };
  };
  winner: Outcome | "void";
  pools: Record<Outcome, string>;
  totalPoolShannons: string;
  fees: { protocolBps: number; creatorBps: number };
  distributableShannons: string;
  protocolFeeShannons: string;
  creatorFeeShannons: string;
  winnerCount: number;
  totalPaidShannons: string;
  oracle: { source: string; live: boolean };
  bets: {
    count: number;
    /** sha256 root of per-bet leaves (see settlement.ts). */
    merkleRoot: string;
  };
  treasuryAddress: string;
  settledAt: string;
}

export interface Bet {
  id: string;
  marketId: string;
  matchId: string;
  userId: string;
  outcome: Outcome;
  amount: string; // shannons
  placedAt: string;
  priceAtBet: number;
  settled: boolean;
  payout?: string;
  isStreakPick?: boolean;
  streakAtPick?: number;
}

// ── Custody ────────────────────────────────────────────────────────────────

export interface UserWallet {
  address: string;
  /** Testnet-only custodial key. See README "Security model". */
  privateKey: string;
}

export interface UserStreak {
  current: number;
  best: number;
  status: StreakStatus;
  /** YYYY-MM-DD of the most recent streak pick. */
  lastPickDate?: string;
  /** Set when the failed streak pick still owes a renewal. */
  failedBetId?: string;
}

export interface UserStats {
  totalBets: number;
  wonBets: number;
  lostBets: number;
  renews: number;
  netPnlShannons: string;   // may be "-12345"
  turnoverShannons: string;
}

export interface User {
  id: string;
  /** Verified wallet identity from the login signature — the stable account key. */
  walletIdentity: string;
  /** CCC signer type that produced the identity (e.g. "ckb", "evm", "joyId"). */
  walletType: string;
  /** Optional display handle, set after signup; used for leaderboard/feeds. */
  username?: string;
  /** Optional Telegram chat id or @username for direct notifications */
  telegramChatId?: string;
  /** Optional Telegram username captured during bot connect flow */
  telegramUsername?: string;
  createdAt: string;
  /** The user's connected on-chain wallet (deposit source / withdrawal target). */
  wallet: { address: string };
  escrowShannons: string;
  creatorFeesShannons: string;
  streak: UserStreak;
  stats: UserStats;
}

export interface Deposit {
  id: string;
  userId: string;
  amountShannons: string;
  txHash: string;
  at: string;
}

export interface Withdraw {
  id: string;
  userId: string;
  amountShannons: string;
  txHash: string;
  at: string;
}

// ── Social (crews) ───────────────────────────────────────────────────────────

/**
 * A friend crew: a small named group joined by invite code. Crews add a
 * social layer over settlements — head-to-head streaks, shared co-picks, and
 * a revive rebate when crew-mates back the same match.
 */
export interface Crew {
  id: string;
  name: string;
  /** Creator userId; inherits to the next member if the owner leaves. */
  ownerId: string;
  /** Short shareable code used to join. */
  inviteCode: string;
  memberIds: string[];
  createdAt: string;
}

// ── Store ──────────────────────────────────────────────────────────────────

export interface StreakDB {
  schema: number;
  users: User[];
  matches: Match[];
  markets: Market[];
  bets: Bet[];
  deposits: Deposit[];
  withdraws: Withdraw[];
  treasury?: UserWallet;
  protocolFeesShannons: string;
  liveScores?: LiveScoresAuth;
  matchesSchema?: number;
  /** Off-chain full payloads for every published on-chain receipt. */
  receipts: SettlementReceipt[];
  /** Friend crews (social layer). */
  crews: Crew[];
  /** Persisted schedule anchor for the dummy match-data provider. */
  dummyAnchorIso?: string;
  /** Pending Telegram deep-link connect tokens keyed to users. */
  telegramLinks?: TelegramLink[];
  /** On-chain tx hashes already consumed by streak renewals (replay guard). */
  renewalTxs?: string[];
}

export interface TelegramLink {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  usedAt?: string;
}

export interface LiveScoresAuth {
  base: string;
  email: string;
  token: string;
  obtainedAt: string;
}

// ── API view-models ────────────────────────────────────────────────────────

export interface PublicUser {
  id: string;
  /** Display name — the chosen username, or an abbreviated address if unset. */
  username: string;
  /** Whether the user has set a real username (vs. the address fallback). */
  hasUsername: boolean;
  telegramConnected?: boolean;
  telegramUsername?: string;
  createdAt: string;
  walletAddress: string;
  walletType?: string;
  escrowCkb: string;
  creatorFeesCkb: string;
  streak: UserStreak;
  stats: UserStats;
  winRate: number;
  rank: number;
}

export interface LeaderboardRow {
  rank: number;
  username: string;
  current: number;
  best: number;
  winRate: number;
  netPnlCkb: string;
  turnoverCkb: string;
  isMe?: boolean;
}

export interface MarketSummary {
  id: string;
  match: {
    id: string;
    label: string;
    kickoff: string;
    stage: string;
    status: MatchStatus;
    home: Team;
    away: Team;
    score?: { home: number; away: number };
  };
  status: MarketStatus;
  prices: Record<Outcome, number>;
  pools: Record<Outcome, string>;
  totalPoolCkb: string;
  totalBets: number;
  uniqueBettors: number;
  closesAt: string;
  resolvedOutcome?: Outcome | "void";
  /** Last ~32 ticks for sparkline display. */
  spark: PriceTick[];
}

export interface MarketDetail extends MarketSummary {
  createdAt: string;
  creator: { id: string; username: string } | null;
  history: PriceTick[];
  feeBps: { protocol: number; creator: number };
  payout?: PayoutSummary;
  myPositions: Array<{
    id: string;
    outcome: Outcome;
    amountCkb: string;
    priceAtBet: number;
    placedAt: string;
    settled: boolean;
    payoutCkb?: string;
    isStreakPick?: boolean;
  }>;
  feed: Array<{
    id: string;
    user: string;
    outcome: Outcome;
    amountCkb: string;
    priceAtBet: number;
    placedAt: string;
  }>;
}

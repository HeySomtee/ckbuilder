/**
 * Streak Terminal — runtime configuration & constants.
 *
 * Streak is a parimutuel prediction-market terminal for the FIFA World Cup
 * 2026 on Nervos CKB Pudge. The daily "streak pick" game is one feature
 * layered on top of the market engine.
 */

import { resolve } from "path";

export const PORT = Number(process.env.PORT ?? 4100);

export const DATA_DIR = resolve(__dirname, "..", "data");
export const DB_FILE = resolve(DATA_DIR, "db.json");
export const PUBLIC_DIR = resolve(__dirname, "..", "public");

/** 1 CKB = 10^8 shannons. */
export const SHANNONS_PER_CKB = 100_000_000n;

/** Bump on incompatible DB shape changes; loader will reset non-wallet state. */
export const DB_SCHEMA = 4;

export const SESSION_COOKIE = "streak_sid";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

// ── Streak (daily-pick) game ────────────────────────────────────────────────

/** Cost to revive a failed streak, paid wallet → treasury on-chain. */
export const RENEW_FEE_CKB = 63;

// ── Market engine ───────────────────────────────────────────────────────────

/** Minimum single bet (virtual escrow). */
export const MIN_BET_CKB = 10;

/** Sanity cap on a single bet. */
export const MAX_BET_CKB = 100_000;

/** Cell-floor minimum for real on-chain deposit/withdraw. */
export const MIN_ONCHAIN_CKB = 100;

/** Parimutuel fee split (basis points; 1 bp = 0.01%). */
export const PROTOCOL_FEE_BPS = 200; // 2.00% → treasury
export const CREATOR_FEE_BPS = 100;  // 1.00% → market creator

/** Background settlement loop interval (ms). */
export const SETTLE_INTERVAL_MS = 20_000;

/** Demo fall-back: minutes after kickoff a fixture auto-finalises without live data. */
export const MATCH_DURATION_MIN = 110;

/** Max price-history ticks kept per market. */
export const MARKET_HISTORY_CAP = 480;

// ── Social (crews) ──────────────────────────────────────────────────────────

/** Max members in a single crew. */
export const CREW_MAX_MEMBERS = 12;
/** Max crews one user can belong to. */
export const CREW_MAX_PER_USER = 6;
export const CREW_NAME_MIN = 2;
export const CREW_NAME_MAX = 30;

/**
 * Revive rebate: when you revive a failed streak, every crew-mate who also
 * made a streak pick on the same match earns you a rebate credited to escrow.
 *
 * It's a rebate (not a cheaper on-chain payment) because the renewal transfer
 * already sits just above the 61 CKB cell-floor — there's no room to shrink it
 * on-chain. The rebate is fully backed by the CKB the renewal just paid in.
 */
export const CREW_REVIVE_REBATE_CKB = 20;
export const CREW_REVIVE_REBATE_CAP_CKB = 40;

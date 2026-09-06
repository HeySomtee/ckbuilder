/**
 * Streak Terminal — JSON store.
 *
 * Single-writer persistence with committed read snapshots and a serialised
 * write queue. Mutations use private drafts and become visible only after
 * persistence succeeds. Concurrent readers share one source fetch.
 *
 * On schema mismatch the loader resets transient state (matches, markets,
 * bets, deposits, withdraws) but preserves users (so custodial wallet keys
 * survive) and the treasury.
 */

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname } from "path";

import { DB_FILE, DB_SCHEMA } from "./config";
import type { SettlementReceipt, StreakDB } from "./types";
import { supaLoadDB, supaSaveDB, supaEnabled } from "./store_supabase";
import {
  pgEnabled, pgLoadDB, pgSaveDB,
  getReceipt as pgGetReceipt, listReceipts as pgListReceipts,
  deleteMarkets as pgDeleteMarkets, deleteMatches as pgDeleteMatches,
} from "./store_pg";

const EMPTY: StreakDB = {
  schema: DB_SCHEMA,
  users: [],
  matches: [],
  markets: [],
  bets: [],
  deposits: [],
  withdraws: [],
  protocolFeesShannons: "0",
  receipts: [],
  crews: [],
  telegramLinks: [],
  renewalTxs: [],
};

let writeQueue: Promise<unknown> = Promise.resolve();

const configuredTtl = Number(process.env.STORE_READ_TTL_MS ?? 1500);
const READ_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl >= 0 ? configuredTtl : 1500;
interface Snapshot {
  db: StreakDB;
  serialized: string;
  at: number;
}
let cache: Snapshot | null = null;
let loading: Promise<Snapshot> | null = null;
let revision = 0;

function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeSnapshot(child);
  }
  return value;
}

async function loadSnapshot(): Promise<Snapshot> {
  if (cache && Date.now() - cache.at < READ_TTL_MS) return cache;
  if (loading) return loading;
  const startedAtRevision = revision;
  const pending = (async () => {
    const db = await loadFromSource();
    // A fetch started before a committed mutation must not publish stale data.
    if (revision !== startedAtRevision) return cache ?? loadSnapshot();
    cache = { db: freezeSnapshot(db), serialized: JSON.stringify(db), at: Date.now() };
    return cache;
  })().finally(() => { if (loading === pending) loading = null; });
  loading = pending;
  return pending;
}

/** Cached snapshot for reads; falls back to a fresh fetch when stale. */
export async function loadDB(): Promise<StreakDB> {
  return (await loadSnapshot()).db;
}

async function loadFromSource(): Promise<StreakDB> {
  if (pgEnabled()) {
    // Same rule as Supabase below: never fall back to a different ledger.
    const parsed = await pgLoadDB();
    return parsed ? normalizeDB(parsed) : structuredClone(EMPTY);
  }

  if (supaEnabled()) {
    // Never switch financial ledgers during an outage. The caller can retry;
    // writing to a fallback file would lose those balances on recovery.
    const parsed = await supaLoadDB();
    return parsed ? normalizeDB(parsed) : structuredClone(EMPTY);
  }

  let raw: string;
  try {
    raw = await readFile(DB_FILE, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return structuredClone(EMPTY);
    throw err;
  }
  // Malformed data must remain recoverable, never silently reset and overwrite.
  return normalizeDB(JSON.parse(raw));
}

function normalizeDB(parsed: any): StreakDB {
  if (parsed?.schema !== DB_SCHEMA) {
    return {
      ...structuredClone(EMPTY),
      users: Array.isArray(parsed?.users) ? parsed.users.map((u: any) => upgradeUser(u)) : [],
      treasury: parsed?.treasury,
      liveScores: parsed?.liveScores,
      crews: Array.isArray(parsed?.crews) ? parsed.crews : [],
      telegramLinks: Array.isArray(parsed?.telegramLinks) ? parsed.telegramLinks : [],
      renewalTxs: Array.isArray(parsed?.renewalTxs) ? parsed.renewalTxs : [],
    } as StreakDB;
  }

  return {
    schema: DB_SCHEMA,
    users: (parsed.users ?? []).map((u: any) => upgradeUser(u)),
    matches: parsed.matches ?? [],
    markets: parsed.markets ?? [],
    bets: parsed.bets ?? [],
    deposits: parsed.deposits ?? [],
    withdraws: parsed.withdraws ?? [],
    treasury: parsed.treasury,
    protocolFeesShannons: parsed.protocolFeesShannons ?? "0",
    liveScores: parsed.liveScores,
    matchesSchema: parsed.matchesSchema,
    receipts: parsed.receipts ?? [],
    crews: parsed.crews ?? [],
    dummyAnchorIso: parsed.dummyAnchorIso,
    telegramLinks: parsed.telegramLinks ?? [],
    renewalTxs: parsed.renewalTxs ?? [],
  } as StreakDB;
}

/** Backfill any missing fields on a legacy User row. */
function upgradeUser(u: any): any {
  return {
    id: u.id,
    walletIdentity: u.walletIdentity ?? "",
    walletType: u.walletType ?? "",
    username: u.username,
    telegramChatId: u.telegramChatId,
    telegramUsername: u.telegramUsername,
    createdAt: u.createdAt,
    wallet: { address: u.wallet?.address },
    escrowShannons: u.escrowShannons ?? "0",
    creatorFeesShannons: u.creatorFeesShannons ?? "0",
    streak: {
      current: u.streak?.current ?? 0,
      best: u.streak?.best ?? 0,
      status: u.streak?.status ?? "active",
      lastPickDate: u.streak?.lastPickDate,
      failedBetId: u.streak?.failedBetId,
    },
    stats: {
      totalBets: u.stats?.totalBets ?? 0,
      wonBets: u.stats?.wonBets ?? 0,
      lostBets: u.stats?.lostBets ?? 0,
      renews: u.stats?.renews ?? 0,
      netPnlShannons: u.stats?.netPnlShannons ?? "0",
      turnoverShannons: u.stats?.turnoverShannons ?? "0",
    },
  };
}

async function saveDB(db: StreakDB, serialized: string, prev: StreakDB | null): Promise<void> {
  if (pgEnabled()) {
    // Only the rows that actually changed are sent, in one transaction.
    await pgSaveDB(prev, db);
    return;
  }

  if (supaEnabled()) {
    await supaSaveDB(db, serialized);
    return;
  }
  await mkdir(dirname(DB_FILE), { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, serialized, { flush: true });
  await rename(tmp, DB_FILE);
}

/**
 * Serialised mutation: callback may be async; its return value is forwarded
 * to the caller after the write completes.
 */
export function update<T>(fn: (db: StreakDB) => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const snapshot = await loadSnapshot();
    const db: StreakDB = JSON.parse(snapshot.serialized);
    const result = await fn(db);
    const serialized = JSON.stringify(db);
    if (serialized === snapshot.serialized) return result;
    try {
      await saveDB(db, serialized, snapshot.db);
    } catch (error) {
      // A remote timeout can mean the write committed but its response was lost.
      // Refresh before any subsequent write instead of trusting an old balance.
      cache = null;
      revision += 1;
      loading = null;
      throw error;
    }
    revision += 1;
    // Detach from callback arguments/results so callers cannot change committed
    // state after the write (or accidentally mutate provider fixture objects).
    cache = { db: freezeSnapshot(JSON.parse(serialized)), serialized, at: Date.now() };
    return result;
  });
  writeQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

/** Read-only access to the last committed, frozen snapshot; does not wait on writes. */
export async function read<T>(fn: (db: StreakDB) => T | Promise<T>): Promise<T> {
  const db = await loadDB();
  return await fn(db);
}

/**
 * Receipts are archive data — ~1.5 MB of payloads that only two endpoints read,
 * always by marketId. Under Postgres they are fetched on demand instead of
 * riding along with every snapshot; the file store still keeps them inline.
 * Writes are unchanged: push onto `db.receipts` inside update() as before.
 */
export async function readReceipt(marketId: string): Promise<SettlementReceipt | undefined> {
  if (pgEnabled()) return pgGetReceipt(marketId);
  return read((db) => db.receipts.find((r) => r.marketId === marketId));
}

/**
 * Explicit removal. A diffed relational write never infers a delete from a
 * row's absence (see store_pg.ts), so anything a caller filters out of a
 * collection has to be named here. No-op for the file store, where the
 * filtered array already is the persisted state.
 */
export async function purge(target: { markets?: string[]; matches?: string[] }): Promise<void> {
  if (!pgEnabled()) return;
  // Markets first: matches are referenced by markets.match_id.
  await pgDeleteMarkets(target.markets ?? []);
  await pgDeleteMatches(target.matches ?? []);
}

/** Newest-first receipt payloads for the gallery. */
export async function readReceipts(limit = 200): Promise<SettlementReceipt[]> {
  if (pgEnabled()) return pgListReceipts(limit);
  return read((db) =>
    db.receipts
      .slice()
      .sort((a, b) => b.settledAt.localeCompare(a.settledAt))
      .slice(0, limit));
}

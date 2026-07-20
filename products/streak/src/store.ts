/**
 * Streak Terminal — JSON store.
 *
 * Single-file persistence with a serialised write queue: concurrent API calls
 * can't interleave and corrupt data/db.json. Every mutation goes through
 * `update()`, which loads → mutates → atomically renames the temp file.
 *
 * On schema mismatch the loader resets transient state (matches, markets,
 * bets, deposits, withdraws) but preserves users (so custodial wallet keys
 * survive) and the treasury.
 */

import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname } from "path";

import { DB_FILE, DB_SCHEMA } from "./config";
import type { StreakDB } from "./types";

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
};

let writeQueue: Promise<unknown> = Promise.resolve();

export async function loadDB(): Promise<StreakDB> {
  let raw: string;
  try {
    raw = await readFile(DB_FILE, "utf8");
  } catch (err: any) {
    if (err?.code === "ENOENT") return structuredClone(EMPTY);
    throw err;
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Corrupt file — start fresh; old contents stay on disk as .bak below if we ever choose to.
    return structuredClone(EMPTY);
  }

  // Schema reset: keep wallet-bearing state, wipe market/ledger state.
  if (parsed?.schema !== DB_SCHEMA) {
    return {
      ...structuredClone(EMPTY),
      users: Array.isArray(parsed?.users)
        ? parsed.users.map((u: any) => upgradeUser(u))
        : [],
      treasury: parsed?.treasury,
      liveScores: parsed?.liveScores,
      // Crews reference user ids (preserved), so they can survive a reset.
      crews: Array.isArray(parsed?.crews) ? parsed.crews : [],
    };
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
  };
}

/** Backfill any missing fields on a legacy User row. */
function upgradeUser(u: any): any {
  return {
    id: u.id,
    username: u.username,
    passwordHash: u.passwordHash,
    passwordSalt: u.passwordSalt,
    createdAt: u.createdAt,
    wallet: u.wallet,
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

async function saveDB(db: StreakDB): Promise<void> {
  await mkdir(dirname(DB_FILE), { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, DB_FILE);
}

/**
 * Serialised mutation: callback may be async; its return value is forwarded
 * to the caller after the write completes.
 */
export function update<T>(fn: (db: StreakDB) => T | Promise<T>): Promise<T> {
  const run = writeQueue.then(async () => {
    const db = await loadDB();
    const result = await fn(db);
    await saveDB(db);
    return result;
  });
  writeQueue = run.then(
    () => {},
    () => {},
  );
  return run;
}

/** Read-only access. */
export async function read<T>(fn: (db: StreakDB) => T | Promise<T>): Promise<T> {
  const db = await loadDB();
  return await fn(db);
}

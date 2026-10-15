/** Real PostgreSQL integration checks using disposable synthetic fixtures. */
import assert from "assert/strict";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { Client } from "pg";
import type { Match, User } from "./types";

function testDatabaseUrl(): URL {
  assert.ok(
    process.env.PG_TEST_URL,
    "PG_TEST_URL is required. Start a disposable local PostgreSQL database named streak_test; this integration suite never skips.",
  );
  let url: URL;
  try {
    url = new URL(process.env.PG_TEST_URL);
  } catch {
    throw new Error(
      "PG_TEST_URL must be a valid PostgreSQL URL (value omitted).",
    );
  }
  assert.ok(
    ["postgres:", "postgresql:"].includes(url.protocol),
    "PG_TEST_URL must use PostgreSQL.",
  );
  assert.ok(
    ["127.0.0.1", "localhost"].includes(url.hostname),
    "PostgreSQL tests only accept a loopback host, never a hosted or production database.",
  );
  assert.match(
    url.pathname,
    /^\/[a-zA-Z0-9_]+_test$/,
    "PostgreSQL tests require a database name ending in _test.",
  );
  // Do not allow supplied connection parameters to override the guarded host,
  // database or per-run search_path. Credentials are never logged.
  assert.ok(!url.search, "PG_TEST_URL must not contain query parameters.");
  return url;
}

function fixtureUser(id: string): User {
  return {
    id,
    username: id,
    walletIdentity: id,
    walletType: "synthetic",
    wallet: { address: `test-only-${id}` },
    createdAt: "2026-01-01T00:00:00.000Z",
    escrowShannons: "900719925474099312345",
    creatorFeesShannons: "0",
    streak: { current: 0, best: 0, status: "active" },
    stats: {
      totalBets: 0,
      wonBets: 0,
      lostBets: 0,
      renews: 0,
      netPnlShannons: "0",
      turnoverShannons: "0",
    },
  };
}

async function run(): Promise<void> {
  const url = testDatabaseUrl();
  const schema = `streak_test_${randomUUID().replace(/-/g, "")}`;
  assert.match(schema, /^streak_test_[a-f0-9]{32}$/);
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let closePool: (() => Promise<void>) | undefined;
  let connected = false;
  let created = false;
  const probe = new Client({
    connectionString: url.toString(),
    ssl: false,
    connectionTimeoutMillis: 3_000,
  });
  process.env.STREAK_SKIP_ENV_FILE = "1";
  process.env.STORE_READ_TTL_MS = "0";
  process.env.MATCH_PROVIDER = "worldcup";
  process.env.SUPABASE_URL = "";
  process.env.SUPABASE_KEY = "";
  process.env.API_SPORTS_KEY = "";
  process.env.TELEGRAM_BOT_TOKEN = "";
  process.env.NOTIFIER = "none";
  globalThis.fetch = async () => {
    throw new Error("External HTTP is forbidden in PostgreSQL tests.");
  };

  try {
    try {
      await probe.connect();
      connected = true;
    } catch {
      throw new Error(
        "PostgreSQL integration database is unavailable. Start the local test service and check PG_TEST_URL (credentials omitted).",
      );
    }
    await probe.query(`create schema "${schema}"`);
    created = true;
    await probe.query(`set search_path to "${schema}"`);
    await probe.query(
      await readFile(
        resolve(__dirname, "../scripts/sql/001_schema.sql"),
        "utf8",
      ),
    );
    url.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    const store = await import("./store");
    const pgStore = await import("./store_pg");
    closePool = pgStore.closePool;
    const { ensureMarketsForMatches } = await import("./markets");
    const { buildReceiptPayload } = await import("./settlement");
    const scalar = async (sql: string, params: unknown[] = []): Promise<any> =>
      (await probe.query(sql, params)).rows[0];
    assert.equal(
      (await pgStore.getPool().query("select current_schema() as name")).rows[0]
        .name,
      schema,
      "The real store pool must stay in the disposable schema.",
    );

    await store.update((db) => {
      db.users = [fixtureUser("alice"), fixtureUser("bob")];
      db.treasury = { address: "synthetic-treasury", privateKey: "not-a-key" };
      db.matches = Array.from({ length: 6 }, (_, i): Match => ({
        id: `fixture-${i}`,
        kickoff: `2030-01-0${i + 1}T12:00:00.000Z`,
        date: `2030-01-0${i + 1}`,
        stage: "Synthetic integration fixture",
        status: "scheduled",
        home: { code: "HOM", name: "Home", flag: "" },
        away: { code: "AWY", name: "Away", flag: "" },
      }));
      ensureMarketsForMatches(db);
      db.markets.forEach((market, i) => {
        market.resolvedAt = `2026-01-0${i + 1}T12:00:00.000Z`;
        db.receipts.push(buildReceiptPayload(db, market, db.treasury!).payload);
      });
      db.deposits.push({
        id: "deposit-original",
        userId: "alice",
        amountShannons: "12345",
        txHash: "0x" + "a".repeat(64),
        at: "2026-01-01T12:00:00.000Z",
      });
      (db.renewalTxs ??= []).push("0x" + "b".repeat(64));
    });

    const db = await store.loadDB();
    assert.equal(
      db.receipts.length,
      0,
      "Archive receipts stay outside the working snapshot.",
    );
    assert.equal(db.users.length, 2);
    assert.equal(db.markets.length, 6);
    assert.equal(
      (await store.readReceipt("m-fixture-0"))?.marketId,
      "m-fixture-0",
    );
    assert.equal(await store.readReceipt("not-a-market"), undefined);
    const listed = await store.readReceipts(5);
    assert.equal(listed.length, 5, "Receipt listing honors its limit.");
    assert.deepEqual(
      listed.map((receipt) => receipt.marketId),
      [5, 4, 3, 2, 1].map((i) => `m-fixture-${i}`),
      "Receipt listing is newest first.",
    );
    assert.deepEqual(
      db.renewalTxs,
      ["0x" + "b".repeat(64)],
      "Renewal replay history survives reload.",
    );

    const before = await scalar(
      "select escrow_shannons from users where id = 'alice'",
    );
    const bumped = (BigInt(before.escrow_shannons) + 12345n).toString();
    // PostgreSQL xmin changes on UPDATE even when row counts do not change.
    const untouched = (
      await probe.query(
        "select id, xmin::text as version from markets order by id",
      )
    ).rows;
    const metaBefore = await scalar(
      "select xmin::text as version from streak_meta where id = 'singleton'",
    );
    await store.update((draft) => {
      draft.users[0].escrowShannons = bumped;
    });
    assert.equal(
      (await scalar("select escrow_shannons from users where id = 'alice'"))
        .escrow_shannons,
      bumped,
    );
    assert.equal(
      await store.read((draft) => draft.users[0].escrowShannons),
      bumped,
      "Amounts beyond Number.MAX_SAFE_INTEGER round-trip exactly.",
    );
    assert.deepEqual(
      (
        await probe.query(
          "select id, xmin::text as version from markets order by id",
        )
      ).rows,
      untouched,
      "Changing one user must not rewrite untouched markets.",
    );
    assert.equal(
      (
        await scalar(
          "select xmin::text as version from streak_meta where id = 'singleton'",
        )
      ).version,
      metaBefore.version,
      "Changing one user must not rewrite unchanged metadata.",
    );

    await Promise.all(
      Array.from({ length: 12 }, () =>
        store.update((draft) => {
          draft.users[0].escrowShannons = (
            BigInt(draft.users[0].escrowShannons) + 1n
          ).toString();
        }),
      ),
    );
    const committed = (BigInt(bumped) + 12n).toString();
    assert.equal(
      await store.read((draft) => draft.users[0].escrowShannons),
      committed,
      "Concurrent mutations in the supported single writer lose no updates.",
    );

    await store.update((draft) => {
      draft.markets = draft.markets.slice(0, 3);
    });
    assert.equal(
      (await scalar("select count(*)::int as n from markets")).n,
      6,
      "Absent rows are preserved unless explicitly deleted.",
    );

    // Fail after the user row was updated. Both the balance and replay record
    // must roll back together when a later collection violates a constraint.
    await assert.rejects(
      store.update((draft) => {
        draft.users[0].escrowShannons = "1";
        draft.deposits.push({ ...draft.deposits[0], id: "duplicate-payment" });
      }),
      (error: any) => error.code === "23505",
      "Duplicate payment hashes must reject.",
    );
    assert.equal(
      (await scalar("select escrow_shannons from users where id = 'alice'"))
        .escrow_shannons,
      committed,
      "A late transaction failure must roll back earlier balance writes.",
    );
    assert.equal(
      (await scalar("select count(*)::int as n from deposits")).n,
      1,
    );
    await assert.rejects(
      store.update((draft) => {
        draft.users[0].escrowShannons = "-1";
      }),
      (error: any) => error.code === "23514",
      "Negative balances must fail at the database boundary.",
    );
    assert.equal(
      await store.read((draft) => draft.users[0].escrowShannons),
      committed,
      "Failed writes invalidate the cache without exposing a rejected draft.",
    );
    await store.update((draft) => {
      draft.users[0].escrowShannons = (BigInt(committed) + 1n).toString();
    });
    assert.equal(
      await store.read((draft) => draft.users[0].escrowShannons),
      (BigInt(committed) + 1n).toString(),
      "The write queue and PostgreSQL pool recover after a rejected transaction.",
    );
    console.log(
      "Real PostgreSQL integration passed: isolated schema, exact money, archive reads, partial writes, concurrent writes, replay rejection, atomic rollback and recovery.",
    );
  } finally {
    try {
      await closePool?.();
    } finally {
      try {
        if (created) {
          assert.match(schema, /^streak_test_[a-f0-9]{32}$/);
          await probe.query("rollback");
          await probe.query(`drop schema "${schema}" cascade`);
        }
      } finally {
        if (connected) await probe.end();
        globalThis.fetch = originalFetch;
        for (const key of Object.keys(process.env))
          if (!(key in originalEnv)) delete process.env[key];
        Object.assign(process.env, originalEnv);
      }
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

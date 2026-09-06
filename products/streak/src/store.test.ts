import assert from "assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import type { StreakDB } from "./types";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function run(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "streak-store-test-"));
  const dbFile = join(directory, "db.json");
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  const originalEnv = { ...process.env };
  let now = originalNow();
  Date.now = () => now;
  // Set before importing config/store; the suite never loads the real .env or DB.
  process.env.STREAK_DB_FILE = dbFile;
  process.env.STORE_READ_TTL_MS = "1000";
  process.env.SUPABASE_URL = "https://streak-store.invalid";
  process.env.SUPABASE_KEY = "test-only";
  let persisted: StreakDB = {
    schema: 4, users: [], matches: [], markets: [], bets: [], deposits: [],
    withdraws: [], protocolFeesShannons: "0", receipts: [], crews: [],
    telegramLinks: [], renewalTxs: ["already-used-renewal"],
  };
  let reads = 0;
  let writes = 0;
  let nextReadGate: ReturnType<typeof deferred> | undefined;
  let failRead = false;
  let loseWriteResponse = false;
  globalThis.fetch = async (url, options) => {
    assert.ok(String(url).startsWith("https://streak-store.invalid/"));
    assert.ok(options?.signal, "remote requests have a deadline");
    if (options?.method === "POST") {
      writes += 1;
      assert.equal((options.headers as Record<string, string>).Prefer,
        "resolution=merge-duplicates,return=minimal");
      persisted = JSON.parse(String(options.body))[0].data;
      if (loseWriteResponse) {
        loseWriteResponse = false;
        throw new Error("response lost after commit");
      }
      return new Response(null, { status: 204 });
    }
    reads += 1;
    if (failRead) throw new Error("remote unavailable");
    const captured = structuredClone(persisted);
    const gate = nextReadGate;
    nextReadGate = undefined;
    await gate?.promise;
    return Response.json([{ data: captured }]);
  };

  try {
    const { loadDB, read, update } = await import("./store");
    const snapshots = await Promise.all(Array.from({ length: 24 }, () => loadDB()));
    assert.equal(reads, 1, "a cold read burst shares one remote fetch");
    assert.ok(snapshots.every((db) => db === snapshots[0]));
    assert.throws(() => { snapshots[0].protocolFeesShannons = "999"; }, TypeError);
    assert.deepEqual(snapshots[0].renewalTxs, ["already-used-renewal"]);

    await Promise.all(Array.from({ length: 24 }, () => update((db) => {
      db.protocolFeesShannons = String(Number(db.protocolFeesShannons) + 1);
    })));
    assert.equal(persisted.protocolFeesShannons, "24", "concurrent mutations never overwrite each other");
    assert.equal(reads, 1, "fresh writes do not each fetch the entire remote ledger");
    assert.equal(writes, 24, "each acknowledged mutation is persisted");
    const result = await update((db) => db.protocolFeesShannons);
    assert.equal(result, "24");
    assert.equal(writes, 24, "unchanged state does not write");

    await assert.rejects(update((db) => {
      db.protocolFeesShannons = "1000";
      throw new Error("mutation rejected");
    }), /mutation rejected/);
    assert.equal(await read((db) => db.protocolFeesShannons), "24");
    assert.equal(writes, 24);

    const detached = await update((db) => { db.protocolFeesShannons = "25"; return db; });
    detached.protocolFeesShannons = "999";
    assert.equal(await read((db) => db.protocolFeesShannons), "25",
      "returned draft references cannot alter committed state");

    const mutationStarted = deferred();
    const finishMutation = deferred();
    const updating = update(async (db) => {
      db.protocolFeesShannons = "26";
      mutationStarted.resolve();
      await finishMutation.promise;
    });
    await mutationStarted.promise;
    assert.equal(await read((db) => db.protocolFeesShannons), "25",
      "readers never observe an unfinished draft");
    now += 2000;
    const staleRead = deferred();
    nextReadGate = staleRead;
    const reading = loadDB();
    finishMutation.resolve();
    await updating;
    staleRead.resolve();
    assert.equal((await reading).protocolFeesShannons, "26",
      "a read started before commit cannot replace the new snapshot");

    loseWriteResponse = true;
    await assert.rejects(update((db) => { db.protocolFeesShannons = "27"; }), /response lost/);
    await assert.rejects(readFile(dbFile), { code: "ENOENT" },
      "remote failures never silently fork the financial ledger to a local file");
    await update((db) => { db.protocolFeesShannons = String(Number(db.protocolFeesShannons) + 1); });
    assert.equal(persisted.protocolFeesShannons, "28",
      "an ambiguous remote failure refreshes state before the next mutation");

    now += 2000;
    failRead = true;
    await assert.rejects(loadDB(), /remote unavailable/);
    failRead = false;
    assert.equal((await loadDB()).protocolFeesShannons, "28", "failed reads can retry");
    assert.deepEqual(persisted.renewalTxs, ["already-used-renewal"]);

    // Exercise the file backend with the same isolated path after cache expiry.
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;
    now += 2000;
    await writeFile(dbFile, "{broken-json");
    await assert.rejects(update((db) => { db.protocolFeesShannons = "0"; }), SyntaxError);
    assert.equal(await readFile(dbFile, "utf8"), "{broken-json", "corrupt data is never overwritten");
    await writeFile(dbFile, JSON.stringify(persisted));
    await update((db) => { db.protocolFeesShannons = "29"; });
    const saved = JSON.parse(await readFile(dbFile, "utf8"));
    assert.equal(saved.protocolFeesShannons, "29");
    assert.deepEqual(saved.renewalTxs, ["already-used-renewal"]);
    console.log("Store regression checks passed (coalescing, durability, rollback, races, replay history).");
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });

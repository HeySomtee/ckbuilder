import assert from "assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import type { AddressInfo } from "net";
import type { Match, User } from "./types";
import { AsyncSnapshotCache } from "./async-cache";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const nextTurn = () => new Promise<void>((done) => setImmediate(done));
const deadline = <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Local operation waited for blocked remote I/O")), 1_000);
  })]).finally(() => clearTimeout(timer));
};

async function main() {
  const temp = mkdtempSync(join(tmpdir(), "streak-backend-"));
  process.env.STREAK_DB_FILE = join(temp, "db.json");
  process.env.MATCH_PROVIDER = "worldcup";
  for (const name of ["SUPABASE_URL", "SUPABASE_KEY", "SUPABASE_DB_URL", "TELEGRAM_BOT_TOKEN", "API_SPORTS_KEY"])
    process.env[name] = "";
  // No test can reach a remote provider, chain, notification account or database.
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: any, init: any) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? input.toString());
    if (url.hostname !== "127.0.0.1") throw new Error("Unexpected external request during isolated test");
    return realFetch(input, init);
  }) as typeof fetch;

  const store = require("./store") as typeof import("./store");
  const chain = require("./chain");
  const { provider } = require("./providers") as typeof import("./providers");
  const markets = require("./markets") as typeof import("./markets");
  const settlement = require("./settlement");
  const wallet = require("./wallet") as typeof import("./wallet");
  const game = require("./game") as typeof import("./game");
  const fixture: Match = {
    id: "performance-fixture", date: new Date().toISOString().slice(0, 10),
    kickoff: new Date(Date.now() + 3_600_000).toISOString(), status: "scheduled",
    home: { code: "HOM", name: "Home" }, away: { code: "AWY", name: "Away" }, stage: "Test",
  } as Match;
  const user: User = {
    id: "user-test", walletIdentity: "test", walletType: "test", username: "tester",
    createdAt: new Date().toISOString(), wallet: { address: "test-address" },
    escrowShannons: "20000000000", creatorFeesShannons: "0",
    streak: { current: 2, best: 2, status: "active" },
    stats: { totalBets: 0, wonBets: 0, lostBets: 0, renews: 0, netPnlShannons: "0", turnoverShannons: "0" },
  };
  await store.update((db) => {
    db.treasury = { address: "test-treasury", privateKey: "test-key" };
    db.users = [user]; db.matches = [fixture];
    markets.ensureMarketsForMatches(db);
  });
  const marketId = await store.read((db) => db.markets[0].id);
  let resultsCalls = 0;
  const results = deferred<any>();
  const insights = deferred<any>();
  let insightCalls = 0;
  const verification = deferred<any>();
  let verificationCalls = 0;
  provider.fetchResults = () => { resultsCalls++; return results.promise; };
  provider.status = () => new Promise(() => {});
  provider.loadFixtures = () => [structuredClone(fixture)];
  provider.fetchInsights = () => { insightCalls++; return insights.promise; };
  provider.prefetchInsights = () => new Promise(() => {});
  chain.cachedBalance = () => ({ value: undefined, refreshing: true });
  chain.getBalanceShannons = () => Promise.resolve(12300000000n);
  settlement.verifyReceiptOnChain = () => { verificationCalls++; return verification.promise; };
  const { server } = require("./server") as typeof import("./server");
  const { createSession } = require("./auth") as typeof import("./auth");
  const cookie = `streak_sid=${createSession(user.id)}`;
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (path: string) => {
    const response = await deadline(fetch(base + path, { headers: { cookie } }));
    assert.equal(response.status, 200, path);
    return response.json() as Promise<any>;
  };
  try {
    const timings: Record<string, number> = {};
    for (const path of ["/api/dashboard", "/api/markets", `/api/markets/${marketId}`,
      "/api/portfolio", "/api/crews", "/api/matches", "/api/status", "/api/wallet", "/api/me"]) {
      const start = performance.now();
      await get(path);
      timings[path] = Math.round(performance.now() - start);
    }
    assert.equal(resultsCalls, 0, "Reading pages must not run a provider sync or settlement write");
    assert.equal((await get("/api/wallet/balance")).chainBalanceCkb, "123");

    const firstInsight = await get(`/api/markets/${marketId}/insights`);
    assert.equal(firstInsight.refreshing, true);
    assert.equal(firstInsight.insights.crowd.totalBets, 0);
    await get(`/api/markets/${marketId}/insights`);
    assert.equal(insightCalls, 1, "Concurrent insight page loads must share remote work");
    insights.resolve(null);

    await store.update((db) => {
      const built = settlement.buildReceiptPayload(db, db.markets[0], db.treasury!);
      db.receipts.push(built.payload);
      db.markets[0].receipt = { txHash: "0x" + "1".repeat(64), index: 0,
        payloadHash: built.payloadHash, merkleRoot: built.payload.bets.merkleRoot, publishedAt: new Date().toISOString() };
    });
    const receipt = await get(`/api/receipts/${marketId}`);
    assert.equal(receipt.onChain.pending, true);
    assert.ok(receipt.canonical.length > 0);
    await get(`/api/receipts/${marketId}`);
    assert.equal(verificationCalls, 1);
    verification.resolve({ ok: true });
    const checked = await get(`/api/receipts/${marketId}?verify=1`);
    assert.equal(checked.onChain.ok, true);
    assert.ok(checked.onChain.checkedAt);
    await store.update((db) => { db.markets[0].receipt!.txHash = "0x" + "9".repeat(64); });
    settlement.verifyReceiptOnChain = async () => ({ ok: false, reason: "rpc error: temporarily offline" });
    const unavailableReceipt = await get(`/api/receipts/${marketId}?verify=1`);
    assert.equal(unavailableReceipt.onChain.pending, true,
      "A temporary chain outage must not appear as a verified payload mismatch");

    const asset = await fetch(base + "/app.js", { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get("content-encoding"), "gzip");
    assert.ok((await asset.text()).length > 1_024);
    const unchanged = await fetch(base + "/app.js", { headers: { "If-None-Match": asset.headers.get("etag")! } });
    assert.equal(unchanged.status, 304, "Revisited assets should transfer no body");
    assert.equal((await unchanged.text()).length, 0);
    const uncompressed = await fetch(base + "/app.js", { headers: { "Accept-Encoding": "gzip;q=0" } });
    assert.equal(uncompressed.headers.get("content-encoding"), null);
    await uncompressed.arrayBuffer();
    assert.equal((await fetch(base + "/missing.js")).status, 404);

    const syncOne = game.syncMatches();
    const syncTwo = game.syncMatches();
    assert.equal(resultsCalls, 1, "Overlapping background ticks must share one sync");
    results.resolve({});
    await deadline(Promise.all([syncOne, syncTwo]));
    assert.equal(resultsCalls, 1, "Blocked optional analytics must not hold settlement open");

    const prepared = deferred<any>();
    const preparationStarted = deferred<void>();
    chain.prepareTransfer = () => { preparationStarted.resolve(); return prepared.promise; };
    const withdrawing = wallet.withdraw(user.id, 150);
    await deadline(preparationStarted.promise);
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "5000000000");
    await wallet.recoverUnsentWithdrawals();
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "5000000000",
      "Periodic recovery must leave a live preparation's reservation intact");
    await assert.rejects(wallet.withdraw(user.id, 150), /too low|pending/);
    await assert.rejects(markets.placeBet({ userId: user.id, matchId: fixture.id,
      outcome: "home", amountCkb: 100, asStreakPick: false }), /balance|escrow|CKB/i);
    await deadline(store.update((db) => { db.users[0].username = "responsive"; }));
    const txHash = "0x" + "2".repeat(64);
    prepared.resolve({ txHash, signedTransaction: "signed-test-bytes", broadcast: async () => txHash });
    assert.equal((await withdrawing).newEscrowCkb, "50");
    assert.equal(await store.read((db) => db.withdraws[0].status), "submitted");

    await store.update((db) => { db.users[0].escrowShannons = "20000000000"; });
    chain.prepareTransfer = async () => { throw new Error("Preparation failed"); };
    await assert.rejects(wallet.withdraw(user.id, 100), /Preparation failed/);
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "20000000000");
    assert.equal(await store.read((db) => db.withdraws.at(-1)!.status), "failed");

    chain.prepareTransfer = async () => ({ txHash, signedTransaction: "signed-test-bytes",
      broadcast: async () => { throw new Error("Dropped RPC response"); } });
    await assert.rejects(wallet.withdraw(user.id, 100), /awaiting confirmation/);
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "10000000000");
    assert.equal(await store.read((db) => db.withdraws.at(-1)!.status), "pending");
    assert.equal(await store.read((db) => db.withdraws.at(-1)!.txHash), txHash);
    await assert.rejects(wallet.withdraw(user.id, 100), /pending/);
    let retries = 0;
    chain.getClient = () => ({ getTransaction: async () => undefined });
    chain.rebroadcastTransfer = async (bytes: string, hash: string) => {
      assert.equal(bytes, "signed-test-bytes"); assert.equal(hash, txHash); retries++; return hash;
    };
    await wallet.reconcilePendingWithdrawals();
    assert.equal(retries, 1, "Crash recovery must rebroadcast the exact persisted transaction");
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "10000000000");
    chain.getClient = () => ({ getTransaction: async () => ({ status: "committed" }) });
    await wallet.reconcilePendingWithdrawals();
    assert.equal(await store.read((db) => db.withdraws.at(-1)!.status), "submitted");
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "10000000000");
    await store.update((db) => {
      db.users[0].escrowShannons = "0";
      db.withdraws.push({ id: "interrupted-before-broadcast", userId: user.id,
        amountShannons: "10000000000", txHash: "", status: "pending", at: new Date().toISOString() });
    });
    await wallet.recoverUnsentWithdrawals();
    await wallet.recoverUnsentWithdrawals();
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "10000000000");

    // A remotely committed metadata write can lose its response. It must not
    // trigger a refund while recovery can see and broadcast the signed bytes.
    const originalUpdate = store.update;
    let writes = 0;
    (store as any).update = async (fn: any) => {
      const result = await originalUpdate(fn);
      if (++writes === 2) throw new Error("Lost persistence response after commit");
      return result;
    };
    try {
      await assert.rejects(wallet.withdraw(user.id, 100), /persistence is awaiting/);
    } finally {
      (store as any).update = originalUpdate;
    }
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "0");
    assert.equal(await store.read((db) => db.withdraws.at(-1)!.signedTransaction), "signed-test-bytes");
    await wallet.reconcilePendingWithdrawals();
    assert.equal(await store.read((db) => db.withdraws.at(-1)!.status), "submitted");
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "0");

    await store.update((db) => { db.users[0].escrowShannons = "10000000000"; });
    (store as any).update = async (fn: any) => {
      await originalUpdate(fn);
      throw new Error("Lost reservation response after commit");
    };
    try {
      await assert.rejects(wallet.withdraw(user.id, 100), /Lost reservation/);
    } finally {
      (store as any).update = originalUpdate;
    }
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "0");
    await wallet.reconcilePendingWithdrawals();
    assert.equal(await store.read((db) => db.users[0].escrowShannons), "10000000000",
      "An inactive reservation with a lost response must recover without a restart");

    await store.update((db) => { db.users[0].streak.status = "failed"; });
    const payment = deferred<bigint>();
    const bothVerifying = deferred<void>();
    let paymentChecks = 0;
    chain.verifyPaymentToTreasury = () => { if (++paymentChecks === 2) bothVerifying.resolve(); return payment.promise; };
    const renewalHash = "0x" + "a".repeat(64);
    const renewals = [game.renewStreak(user.id, renewalHash), game.renewStreak(user.id, renewalHash)];
    await deadline(bothVerifying.promise);
    payment.resolve(6300000000n);
    const renewResults = await Promise.allSettled(renewals);
    assert.equal(renewResults.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await store.read((db) => db.users[0].stats.renews), 1);
    chain.verifyPaymentToTreasury = async () => 10000000000n;
    await assert.rejects(wallet.deposit(user.id, "0x" + "A".repeat(64)), /already used/);
    assert.equal(await game.rankOf(user.id), (await game.leaderboard(user.id))[0].rank);

    await store.update((db) => {
      db.markets[0].closesAt = new Date(Date.now() - 1).toISOString();
      db.matches[0].kickoff = db.markets[0].closesAt;
    });
    await assert.rejects(markets.placeBet({ userId: user.id, matchId: fixture.id,
      outcome: "home", amountCkb: 10, asStreakPick: false }), /closed|kickoff|started/i);

    const cache = new AsyncSnapshotCache<string, number>(1, 2, 1_000);
    const remote = deferred<number>();
    let calls = 0;
    const loader = () => { calls++; return remote.promise; };
    assert.deepEqual(cache.read("key", loader), { value: undefined, refreshing: true });
    cache.read("key", loader);
    await nextTurn();
    assert.equal(calls, 1);
    remote.resolve(42);
    await cache.refresh("key", loader);
    assert.equal(cache.peek("key"), 42);
    await assert.rejects(cache.refresh("key", async () => { throw new Error("offline"); }));
    assert.equal(cache.peek("key"), 42, "Failed refreshes retain the last usable snapshot");

    console.log("backend performance and payment regressions: passed");
    console.log("Isolated HTTP latency with blocked remote services (ms):", JSON.stringify(timings));
  } finally {
    await new Promise<void>((done) => { server.close(() => done()); server.closeAllConnections(); });
    globalThis.fetch = realFetch;
    assert.ok(resolve(temp).startsWith(resolve(tmpdir(), "streak-backend-")));
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

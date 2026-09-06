import assert from "assert/strict";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import type { Match, User } from "./types";

const ckb = (amount: number) => String(BigInt(amount) * 100_000_000n);
function user(id: string): User {
  return {
    id, username: id, walletIdentity: id, walletType: "test", wallet: { address: id },
    createdAt: "2026-01-01T00:00:00.000Z", escrowShannons: ckb(200), creatorFeesShannons: "0",
    streak: { current: 0, best: 0, status: "active" },
    stats: { totalBets: 0, wonBets: 0, lostBets: 0, renews: 0, netPnlShannons: "0", turnoverShannons: "0" },
  };
}
function match(id: string): Match {
  const kickoff = new Date(Date.now() + 86_400_000).toISOString();
  return {
    id, kickoff, date: kickoff.slice(0, 10), stage: "Test", status: "scheduled",
    home: { code: "HOM", name: "Home", flag: "" }, away: { code: "AWY", name: "Away", flag: "" },
  };
}

async function run(): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "streak-markets-test-"));
  const originalEnv = { ...process.env };
  process.env.STREAK_DB_FILE = join(directory, "db.json");
  process.env.STORE_READ_TTL_MS = "60000";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_KEY;
  try {
    const { read, update } = await import("./store");
    const { ensureMarketsForMatches, getMarketDetail, listMarkets, placeBet, portfolio, settleMarkets } = await import("./markets");
    await update((db) => {
      db.users = [user("alice"), user("bob"), user("carol")];
      db.matches = [match("normal"), match("empty-side"), match("cancelled"), match("principal-only")];
      ensureMarketsForMatches(db);
      ensureMarketsForMatches(db);
      assert.equal(db.markets.length, 4);
    });
    const bets = await Promise.all([
      placeBet({ userId: "alice", matchId: "normal", outcome: "home", amountCkb: 10, asStreakPick: true }),
      placeBet({ userId: "bob", matchId: "normal", outcome: "away", amountCkb: 20 }),
      placeBet({ userId: "alice", matchId: "normal", outcome: "home", amountCkb: 20 }),
      placeBet({ userId: "carol", matchId: "empty-side", outcome: "away", amountCkb: 10 }),
      placeBet({ userId: "bob", matchId: "cancelled", outcome: "draw", amountCkb: 10 }),
      placeBet({ userId: "carol", matchId: "principal-only", outcome: "home", amountCkb: 10 }),
    ]);
    const normal = await getMarketDetail("m-normal", "alice");
    assert.equal(normal?.totalBets, 3);
    assert.equal(normal?.uniqueBettors, 2, "repeat bets do not inflate unique bettor count");
    assert.equal(normal?.myPositions.length, 2);
    assert.equal(normal?.totalPoolCkb, "50");
    assert.equal((await portfolio("bob")).length, 2);
    assert.equal((await listMarkets({ matchId: "normal" })).length, 1);

    // Force non-append order to exercise imported histories and cache invalidation.
    await update((db) => {
      db.bets.find((bet) => bet.id === bets[0].bet.id)!.placedAt = "2026-01-03T00:00:00.000Z";
      db.bets.find((bet) => bet.id === bets[1].bet.id)!.placedAt = "2026-01-01T00:00:00.000Z";
      db.bets.find((bet) => bet.id === bets[2].bet.id)!.placedAt = "2026-01-02T00:00:00.000Z";
    });
    const refreshed = await getMarketDetail("m-normal", "alice");
    assert.deepEqual(refreshed?.feed.map((bet) => bet.id), [bets[0].bet.id, bets[2].bet.id, bets[1].bet.id]);
    assert.deepEqual(refreshed?.myPositions.map((bet) => bet.id), [bets[0].bet.id, bets[2].bet.id]);

    const originalNow = Date.now;
    const afterKickoff = await read((db) => Math.max(...db.matches.map((fixture) => Date.parse(fixture.kickoff))) + 1);
    Date.now = () => afterKickoff;
    try {
      assert.equal((await listMarkets({ status: "open" })).length, 0);
      assert.equal((await listMarkets({ status: "closed" })).length, 4);
      assert.equal((await getMarketDetail("m-normal", "alice"))?.status, "closed");
      assert.ok((await portfolio("alice")).every((position) => position.marketStatus === "closed"));
      assert.ok(await read((db) => db.markets.every((market) => market.status === "open")),
        "read-time closure does not write or settle the stored ledger");
    } finally {
      Date.now = originalNow;
    }

    await update((db) => {
      for (const fixture of db.matches) {
        fixture.status = fixture.id === "cancelled" ? "cancelled" : "final";
        fixture.result = fixture.id === "cancelled" ? undefined : "home";
      }
      assert.equal(settleMarkets(db).length, 4);
    });
    const snapshot = await read((db) => db);
    const alice = snapshot.users.find((row) => row.id === "alice")!;
    const bob = snapshot.users.find((row) => row.id === "bob")!;
    const carol = snapshot.users.find((row) => row.id === "carol")!;
    assert.equal(alice.escrowShannons, "21959999999");
    assert.equal(alice.creatorFeesShannons, "20000000");
    assert.equal(alice.stats.wonBets, 2);
    assert.equal(alice.streak.current, 1);
    assert.equal(bob.escrowShannons, ckb(180));
    assert.equal(bob.stats.lostBets, 1);
    assert.equal(carol.escrowShannons, ckb(200));
    assert.equal(snapshot.protocolFeesShannons, "40000000");
    const accounted = snapshot.users.reduce((sum, row) => sum + BigInt(row.escrowShannons), 0n)
      + BigInt(snapshot.protocolFeesShannons);
    assert.equal(accounted, BigInt(ckb(600)) - 1n,
      "escrow and fees preserve the existing one-shannon pro-rata rounding remainder");
    assert.ok(snapshot.bets.every((bet) => bet.settled));
    assert.equal(snapshot.markets.find((row) => row.matchId === "empty-side")?.status, "void");
    assert.equal(snapshot.markets.find((row) => row.matchId === "cancelled")?.status, "void");
    const carolPositions = await portfolio("carol");
    assert.equal(carolPositions.find((row) => row.matchId === "principal-only")?.result, "won",
      "a winner with no losing pool remains a winning position");
    assert.equal(carolPositions.find((row) => row.matchId === "empty-side")?.result, "void");
    const before = JSON.stringify(snapshot);
    await update((db) => { assert.equal(settleMarkets(db).length, 0); });
    assert.equal(await read((db) => JSON.stringify(db)), before, "repeated settlement never pays twice");
    await assert.rejects(placeBet({ userId: "alice", matchId: "normal", outcome: "home", amountCkb: 10 }),
      (error: any) => error.code === "locked");
    console.log("Market regression checks passed (concurrent bets, indexed views, fees, refunds, idempotent settlement).");
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });

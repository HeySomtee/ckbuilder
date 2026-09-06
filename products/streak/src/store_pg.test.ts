/**
 * Streak Terminal — Postgres store regression checks.
 *
 * Runs against a real Postgres (PG_TEST_URL, or a local docker container on
 * 55432) already loaded by scripts/migrate-to-tables.cjs. Skips if unreachable
 * so the default `npm test` stays offline-friendly.
 *
 * What it proves:
 *   - a mutation writes only the rows it touched, not the whole ledger
 *   - money survives a load -> mutate -> reload round trip exactly
 *   - a wholesale collection reassignment does NOT delete the absent rows
 *   - receipts stay out of the snapshot but remain readable by id
 *   - a failed write leaves the committed state untouched
 */

import assert from "assert/strict";

const PG_URL = process.env.PG_TEST_URL ?? "postgresql://postgres:streak@127.0.0.1:55432/streak";

async function reachable(): Promise<boolean> {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: PG_URL, ssl: false, connectionTimeoutMillis: 3000 });
  try {
    await c.connect();
    await c.query("select 1 from streak_meta limit 1");
    await c.end();
    return true;
  } catch {
    try { await c.end(); } catch {}
    return false;
  }
}

async function run(): Promise<void> {
  if (!(await reachable())) {
    console.log("Postgres store checks SKIPPED (no database at " + PG_URL + ")");
    return;
  }

  process.env.DATABASE_URL = PG_URL;
  process.env.STORE_READ_TTL_MS = "0";
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_KEY;

  const { Client } = await import("pg");
  const { loadDB, read, readReceipt, readReceipts, update } = await import("./store");
  const { closePool } = await import("./store_pg");

  const probe = new Client({ connectionString: PG_URL, ssl: false });
  await probe.connect();
  const scalar = async (sql: string, params: unknown[] = []): Promise<any> =>
    (await probe.query(sql, params)).rows[0];

  try {
    // ── snapshot excludes receipts, includes everything else ────────────────
    const db = await loadDB();
    assert.equal(db.receipts.length, 0, "receipts must not ride along with the snapshot");
    assert.ok(db.users.length > 0, "users load");
    assert.ok(db.markets.length > 0, "markets load");
    assert.ok(db.treasury?.privateKey, "treasury key loads");

    const totalMarkets = Number((await scalar("select count(*)::int n from markets")).n);
    assert.equal(db.markets.length, totalMarkets, "every market is materialised");

    // ── receipts remain reachable by id, and are real payloads ──────────────
    const anyReceipt = await scalar("select market_id from receipts limit 1");
    const fetched = await readReceipt(anyReceipt.market_id);
    assert.ok(fetched, "receipt fetched by marketId");
    assert.equal(fetched!.marketId, anyReceipt.market_id);
    const listed = await readReceipts(5);
    assert.equal(listed.length, 5, "gallery listing is limited and non-empty");
    for (let i = 1; i < listed.length; i++) {
      assert.ok(listed[i - 1].settledAt >= listed[i].settledAt, "gallery is newest-first");
    }

    // ── a mutation writes only what it touched ──────────────────────────────
    const target = db.users[0].id;
    const before = await scalar("select escrow_shannons from users where id = $1", [target]);
    const bumped = (BigInt(before.escrow_shannons) + 12345n).toString();

    const marketsBefore = await scalar("select count(*)::int n from markets");
    const metaBefore = await scalar("select updated_at from streak_meta where id = 'singleton'");

    await update((d) => {
      const u = d.users.find((x) => x.id === target)!;
      u.escrowShannons = bumped;
    });

    const after = await scalar("select escrow_shannons from users where id = $1", [target]);
    assert.equal(after.escrow_shannons, bumped, "the touched row is persisted");

    const marketsAfter = await scalar("select count(*)::int n from markets");
    assert.equal(marketsAfter.n, marketsBefore.n, "untouched collections are not rewritten");
    const metaAfter = await scalar("select updated_at from streak_meta where id = 'singleton'");
    assert.equal(
      metaAfter.updated_at.toISOString(), metaBefore.updated_at.toISOString(),
      "unchanged meta is not rewritten",
    );

    // reload proves it round-trips through the materialiser
    const reloaded = await read((d) => d.users.find((x) => x.id === target)!.escrowShannons);
    assert.equal(reloaded, bumped, "mutation survives a reload");

    // ── deletes are never inferred from absence ─────────────────────────────
    // pruneStaleSimMarkets reassigns db.markets wholesale; under a diffed write
    // that must not be read as "delete everything that is missing".
    const keep = (await loadDB()).markets.slice(0, 3).map((m) => ({ ...m }));
    await update((d) => {
      d.markets = keep as typeof d.markets;
    });
    const survived = await scalar("select count(*)::int n from markets");
    assert.equal(survived.n, totalMarkets, "absent rows are preserved, not deleted");

    // ── a failing write leaves committed state alone ────────────────────────
    const escrowBefore = (await scalar("select escrow_shannons from users where id = $1", [target]))
      .escrow_shannons;
    await assert.rejects(
      update((d) => {
        const u = d.users.find((x) => x.id === target)!;
        u.escrowShannons = "-1"; // violates users_escrow_non_negative
      }),
      "a constraint violation must reject",
    );
    const escrowAfter = (await scalar("select escrow_shannons from users where id = $1", [target]))
      .escrow_shannons;
    assert.equal(escrowAfter, escrowBefore, "rejected write did not partially apply");

    // ── restore ─────────────────────────────────────────────────────────────
    await update((d) => {
      const u = d.users.find((x) => x.id === target)!;
      u.escrowShannons = before.escrow_shannons;
    });
    const restored = await scalar("select escrow_shannons from users where id = $1", [target]);
    assert.equal(restored.escrow_shannons, before.escrow_shannons, "restored");

    console.log(
      "Postgres store checks passed (archive split, partial writes, no implicit deletes, rollback).",
    );
  } finally {
    await probe.end();
    await closePool();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

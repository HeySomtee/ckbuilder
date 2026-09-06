#!/usr/bin/env node
/**
 * Streak Terminal — migrate the singleton jsonb blob into relational tables.
 *
 *   node scripts/migrate-to-tables.cjs --from <state.json> --to <postgres-url> [--apply]
 *
 * Safety model:
 *   * INSERT-ONLY into new tables. The source blob is never modified or
 *     deleted; it remains the rollback.
 *   * A pre-flight integrity check runs first and reports every referential
 *     violation the blob silently tolerated. Nothing is written when the source
 *     is inconsistent unless --force is passed.
 *   * Without --apply the whole transaction is rolled back (dry run).
 *   * After loading, the tables are re-materialised back into StreakDB shape
 *     and deep-compared against the source. A commit only happens when that
 *     comparison is clean.
 */

const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);

const APPLY = has("--apply");
const FORCE = has("--force");
const SRC = arg("--from", path.resolve(__dirname, "..", "data", "db.json"));

// ── env ──────────────────────────────────────────────────────────────────────
for (const p of [path.resolve(__dirname, "..", ".env"), path.resolve(__dirname, "..", "..", "..", ".env")]) {
  let raw;
  try { raw = fs.readFileSync(p, "utf8"); } catch { continue; }
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq < 0) continue;
    const k = s.slice(0, eq).trim();
    if (!k || k in process.env) continue;
    let v = s.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
const PG_URL = arg("--to", process.env.MIGRATE_PG_URL || process.env.SUPABASE_DB_URL);

// ── helpers ──────────────────────────────────────────────────────────────────
const ckb = (s) => (Number(BigInt(s ?? 0)) / 1e8).toFixed(4);
const ts = (v) => (v == null || v === "" ? null : new Date(v));
const num = (v) => {
  if (v == null || v === "") return "0";
  const s = String(v);
  // Reject anything that is not an exact integer literal rather than defaulting
  // to 0 — a silently-zeroed balance is the worst possible failure here.
  if (!/^-?\d+$/.test(s)) throw new Error(`non-integer amount: ${JSON.stringify(v)}`);
  return s;
};
const numOrNull = (v) => (v == null || v === "" ? null : num(v));
const j = (v) => (v == null ? null : JSON.stringify(v));

/** Canonical JSON: sorted keys, undefined dropped. Used for the diff. */
function canon(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(canon);
  const out = {};
  for (const k of Object.keys(v).sort()) {
    if (v[k] === undefined) continue;
    out[k] = canon(v[k]);
  }
  return out;
}
const cs = (v) => JSON.stringify(canon(v));

// ── pre-flight integrity ─────────────────────────────────────────────────────
function preflight(db) {
  const problems = [];
  const add = (kind, detail) => problems.push({ kind, detail });
  const userIds = new Set((db.users ?? []).map((u) => u.id));
  const matchIds = new Set((db.matches ?? []).map((m) => m.id));
  const marketIds = new Set((db.markets ?? []).map((m) => m.id));

  const dup = (rows, key, label) => {
    const seen = new Set();
    for (const r of rows ?? []) {
      const k = r[key];
      if (k == null) continue;
      if (seen.has(k)) add("duplicate", `${label}: ${k}`);
      seen.add(k);
    }
  };
  dup(db.users, "id", "duplicate user id");
  dup(db.matches, "id", "duplicate match id");
  dup(db.markets, "id", "duplicate market id");
  dup(db.markets, "matchId", "two markets on one match");
  dup(db.bets, "id", "duplicate bet id");
  dup(db.deposits, "txHash", "duplicate deposit txHash");
  dup(db.receipts, "marketId", "duplicate receipt marketId");

  for (const m of db.markets ?? []) {
    if (!matchIds.has(m.matchId)) add("orphan", `market ${m.id} -> missing match ${m.matchId}`);
  }
  for (const b of db.bets ?? []) {
    if (!marketIds.has(b.marketId)) add("orphan", `bet ${b.id} -> missing market ${b.marketId}`);
    if (!userIds.has(b.userId)) add("orphan", `bet ${b.id} -> missing user ${b.userId}`);
  }
  for (const d of db.deposits ?? []) {
    if (!userIds.has(d.userId)) add("orphan", `deposit ${d.id} -> missing user ${d.userId}`);
  }
  for (const w of db.withdraws ?? []) {
    if (!userIds.has(w.userId)) add("orphan", `withdraw ${w.id} -> missing user ${w.userId}`);
  }
  for (const c of db.crews ?? []) {
    if (!userIds.has(c.ownerId)) add("orphan", `crew ${c.id} -> missing owner ${c.ownerId}`);
    for (const mid of c.memberIds ?? []) {
      if (!userIds.has(mid)) add("orphan", `crew ${c.id} -> missing member ${mid}`);
    }
  }
  for (const t of db.telegramLinks ?? []) {
    if (!userIds.has(t.userId)) add("orphan", `telegramLink ${t.token} -> missing user ${t.userId}`);
  }

  // Amounts must parse exactly; a malformed string must never become 0.
  const amt = (rows, field, label) => {
    for (const r of rows ?? []) {
      try { num(r[field]); } catch (e) { add("amount", `${label} ${r.id}: ${e.message}`); }
    }
  };
  amt(db.users, "escrowShannons", "user");
  amt(db.users, "creatorFeesShannons", "user");
  amt(db.bets, "amount", "bet");
  amt(db.deposits, "amountShannons", "deposit");
  amt(db.withdraws, "amountShannons", "withdraw");
  try { num(db.protocolFeesShannons); } catch (e) { add("amount", `protocolFeesShannons: ${e.message}`); }

  // One tagged streak pick per user per UTC day.
  const picks = new Map();
  for (const b of db.bets ?? []) {
    if (!b.isStreakPick) continue;
    const k = `${b.userId}|${String(b.placedAt).slice(0, 10)}`;
    if (picks.has(k)) add("streak", `two streak picks same day: ${k} (${picks.get(k)}, ${b.id})`);
    picks.set(k, b.id);
  }
  return problems;
}

// ── load ─────────────────────────────────────────────────────────────────────
/**
 * Multi-row INSERT in chunks. One statement per row costs one network
 * round-trip each, which is ~11s locally but many minutes against a hosted
 * database; batching makes the load latency-bound on chunks, not rows.
 * Chunks stay well under Postgres' 65535-parameter statement limit.
 */
async function insertMany(client, table, columns, rows, suffix = "") {
  if (rows.length === 0) return;
  const perChunk = Math.max(1, Math.floor(20000 / columns.length));
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const params = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${placeholders.join(",")})`;
    });
    await client.query(
      `insert into ${table} (${columns.join(", ")}) values ${tuples.join(", ")} ${suffix}`,
      params,
    );
  }
}

async function load(client, db) {
  await client.query(
    `insert into streak_meta (id, schema, matches_schema, treasury, live_scores, protocol_fees, dummy_anchor_iso)
     values ('singleton', $1, $2, $3, $4, $5, $6)`,
    [db.schema, db.matchesSchema ?? null, j(db.treasury), j(db.liveScores),
     num(db.protocolFeesShannons), db.dummyAnchorIso ?? null],
  );

  await insertMany(client, "users",
    ["id", "wallet_identity", "wallet_type", "username", "telegram_chat_id", "telegram_username",
     "created_at", "wallet_address", "escrow_shannons", "creator_fees_shannons", "streak", "stats"],
    (db.users ?? []).map((u) => [
      u.id, u.walletIdentity ?? "", u.walletType ?? "", u.username ?? null, u.telegramChatId ?? null,
      u.telegramUsername ?? null, ts(u.createdAt), u.wallet?.address ?? null,
      num(u.escrowShannons), num(u.creatorFeesShannons), j(u.streak), j(u.stats),
    ]));

  await insertMany(client, "matches",
    ["id", "sport", "competition", "oracle", "date", "stage", `"group"`, "home", "away",
     "kickoff", "status", "result", "score", "venue", "matchday", "live_result"],
    (db.matches ?? []).map((m) => [
      m.id, m.sport ?? null, j(m.competition), j(m.oracle), m.date, m.stage ?? null, m.group ?? null,
      j(m.home), j(m.away), ts(m.kickoff), m.status, m.result ?? null, j(m.score),
      m.venue ?? null, m.matchday ?? null, m.liveResult ?? null,
    ]));

  await insertMany(client, "markets",
    ["id", "match_id", "creator_id", "status", "pool_home", "pool_draw", "pool_away",
     "total_bets", "unique_bettors", "created_at", "closes_at", "resolved_at",
     "resolved_outcome", "fee_bps", "payout", "receipt_ref"],
    (db.markets ?? []).map((m) => [
      m.id, m.matchId, m.creatorId, m.status, num(m.pools?.home), num(m.pools?.draw), num(m.pools?.away),
      m.totalBets ?? 0, m.uniqueBettors ?? 0, ts(m.createdAt), ts(m.closesAt), ts(m.resolvedAt),
      m.resolvedOutcome ?? null, j(m.feeBps), j(m.payout), j(m.receipt),
    ]));

  await insertMany(client, "market_history", ["market_id", "ticks"],
    (db.markets ?? []).filter((m) => m.history?.length).map((m) => [m.id, j(m.history)]));

  await insertMany(client, "market_insights", ["market_id", "latest", "snapshot"],
    (db.markets ?? []).filter((m) => m.insightsLatest || m.insightSnapshot)
      .map((m) => [m.id, j(m.insightsLatest), j(m.insightSnapshot)]));

  await insertMany(client, "bets",
    ["id", "market_id", "match_id", "user_id", "outcome", "amount", "placed_at",
     "price_at_bet", "settled", "payout", "is_streak_pick", "streak_at_pick"],
    (db.bets ?? []).map((b) => [
      b.id, b.marketId, b.matchId, b.userId, b.outcome, num(b.amount), ts(b.placedAt),
      b.priceAtBet, !!b.settled, numOrNull(b.payout), b.isStreakPick ?? null, b.streakAtPick ?? null,
    ]));

  await insertMany(client, "deposits", ["id", "user_id", "amount_shannons", "tx_hash", "at"],
    (db.deposits ?? []).map((d) => [d.id, d.userId, num(d.amountShannons), d.txHash, ts(d.at)]));

  await insertMany(client, "withdraws",
    ["id", "user_id", "amount_shannons", "tx_hash", "at", "status", "signed_transaction"],
    (db.withdraws ?? []).map((w) => [
      w.id, w.userId, num(w.amountShannons), w.txHash ?? null, ts(w.at),
      w.status ?? null, w.signedTransaction ?? null,
    ]));

  await insertMany(client, "receipts", ["market_id", "settled_at", "payload"],
    (db.receipts ?? []).map((r) => [r.marketId, ts(r.settledAt), j(r)]));

  await insertMany(client, "crews", ["id", "name", "owner_id", "invite_code", "member_ids", "created_at"],
    (db.crews ?? []).map((c) => [c.id, c.name, c.ownerId, c.inviteCode, j(c.memberIds ?? []), ts(c.createdAt)]));

  await insertMany(client, "telegram_links", ["token", "user_id", "created_at", "expires_at", "used_at"],
    (db.telegramLinks ?? []).map((t) => [t.token, t.userId, ts(t.createdAt), ts(t.expiresAt), ts(t.usedAt)]));

  await insertMany(client, "renewal_txs", ["tx_hash"],
    (db.renewalTxs ?? []).map((h) => [h]), "on conflict do nothing");
}

// ── re-materialise (the round-trip proof) ────────────────────────────────────
const drop = (o) => {
  for (const k of Object.keys(o)) if (o[k] === null || o[k] === undefined) delete o[k];
  return o;
};
const iso = (d) => (d == null ? undefined : new Date(d).toISOString());

async function materialize(client) {
  const all = async (sql) => (await client.query(sql)).rows;
  const meta = (await all(`select * from streak_meta where id = 'singleton'`))[0];

  const users = (await all(`select * from users order by id`)).map((r) => drop({
    id: r.id, walletIdentity: r.wallet_identity, walletType: r.wallet_type,
    username: r.username ?? undefined, telegramChatId: r.telegram_chat_id ?? undefined,
    telegramUsername: r.telegram_username ?? undefined, createdAt: iso(r.created_at),
    wallet: { address: r.wallet_address }, escrowShannons: r.escrow_shannons,
    creatorFeesShannons: r.creator_fees_shannons, streak: r.streak, stats: r.stats,
  }));

  const matches = (await all(`select * from matches order by id`)).map((r) => drop({
    id: r.id, sport: r.sport ?? undefined, competition: r.competition ?? undefined,
    oracle: r.oracle ?? undefined, date: r.date, stage: r.stage ?? undefined,
    group: r.group ?? undefined, home: r.home, away: r.away, kickoff: iso(r.kickoff),
    status: r.status, result: r.result ?? undefined, score: r.score ?? undefined,
    venue: r.venue ?? undefined, matchday: r.matchday ?? undefined,
    liveResult: r.live_result === null ? undefined : r.live_result,
  }));

  const histories = new Map((await all(`select * from market_history`)).map((r) => [r.market_id, r.ticks]));
  const insights = new Map((await all(`select * from market_insights`)).map((r) => [r.market_id, r]));
  const markets = (await all(`select * from markets order by id`)).map((r) => {
    const ins = insights.get(r.id);
    return drop({
      id: r.id, matchId: r.match_id, creatorId: r.creator_id, status: r.status,
      pools: { home: r.pool_home, draw: r.pool_draw, away: r.pool_away },
      totalBets: r.total_bets, uniqueBettors: r.unique_bettors,
      createdAt: iso(r.created_at), closesAt: iso(r.closes_at), resolvedAt: iso(r.resolved_at),
      resolvedOutcome: r.resolved_outcome ?? undefined, feeBps: r.fee_bps,
      history: histories.get(r.id) ?? [], payout: r.payout ?? undefined,
      receipt: r.receipt_ref ?? undefined,
      insightsLatest: ins?.latest ?? undefined, insightSnapshot: ins?.snapshot ?? undefined,
    });
  });

  const bets = (await all(`select * from bets order by id`)).map((r) => drop({
    id: r.id, marketId: r.market_id, matchId: r.match_id, userId: r.user_id,
    outcome: r.outcome, amount: r.amount, placedAt: iso(r.placed_at),
    priceAtBet: r.price_at_bet, settled: r.settled, payout: r.payout ?? undefined,
    isStreakPick: r.is_streak_pick === null ? undefined : r.is_streak_pick,
    streakAtPick: r.streak_at_pick === null ? undefined : r.streak_at_pick,
  }));

  const deposits = (await all(`select * from deposits order by id`)).map((r) => drop({
    id: r.id, userId: r.user_id, amountShannons: r.amount_shannons, txHash: r.tx_hash, at: iso(r.at),
  }));
  const withdraws = (await all(`select * from withdraws order by id`)).map((r) => drop({
    id: r.id, userId: r.user_id, amountShannons: r.amount_shannons, txHash: r.tx_hash ?? undefined,
    at: iso(r.at), status: r.status ?? undefined, signedTransaction: r.signed_transaction ?? undefined,
  }));
  const receipts = (await all(`select payload from receipts order by market_id`)).map((r) => r.payload);
  const crews = (await all(`select * from crews order by id`)).map((r) => drop({
    id: r.id, name: r.name, ownerId: r.owner_id, inviteCode: r.invite_code,
    memberIds: r.member_ids, createdAt: iso(r.created_at),
  }));
  const telegramLinks = (await all(`select * from telegram_links order by token`)).map((r) => drop({
    token: r.token, userId: r.user_id, createdAt: iso(r.created_at),
    expiresAt: iso(r.expires_at), usedAt: iso(r.used_at),
  }));
  const renewalTxs = (await all(`select tx_hash from renewal_txs order by tx_hash`)).map((r) => r.tx_hash);

  return drop({
    schema: meta.schema, users, matches, markets, bets, deposits, withdraws,
    treasury: meta.treasury ?? undefined, protocolFeesShannons: meta.protocol_fees,
    liveScores: meta.live_scores ?? undefined,
    matchesSchema: meta.matches_schema === null ? undefined : meta.matches_schema,
    receipts, crews, dummyAnchorIso: meta.dummy_anchor_iso ?? undefined,
    telegramLinks, renewalTxs,
  });
}

// ── compare ──────────────────────────────────────────────────────────────────
function compare(src, out) {
  const diffs = [];
  const byId = (arr, key) => new Map((arr ?? []).map((r) => [r[key], r]));

  const collections = [
    ["users", "id"], ["matches", "id"], ["markets", "id"], ["bets", "id"],
    ["deposits", "id"], ["withdraws", "id"], ["receipts", "marketId"],
    ["crews", "id"], ["telegramLinks", "token"],
  ];
  for (const [name, key] of collections) {
    const a = byId(src[name], key);
    const b = byId(out[name], key);
    for (const k of a.keys()) if (!b.has(k)) diffs.push(`${name}: MISSING after migration -> ${k}`);
    for (const k of b.keys()) if (!a.has(k)) diffs.push(`${name}: UNEXPECTED after migration -> ${k}`);
    for (const [k, av] of a) {
      const bv = b.get(k);
      if (!bv || cs(av) === cs(bv)) continue;
      const fields = new Set([...Object.keys(canon(av)), ...Object.keys(canon(bv))]);
      for (const f of fields) {
        if (cs(av[f]) !== cs(bv[f])) diffs.push(`${name}[${k}].${f}: ${cs(av[f])} -> ${cs(bv[f])}`);
      }
    }
  }
  for (const f of ["schema", "treasury", "protocolFeesShannons", "liveScores", "matchesSchema", "dummyAnchorIso"]) {
    if (cs(src[f]) !== cs(out[f])) diffs.push(`${f}: ${cs(src[f])} -> ${cs(out[f])}`);
  }
  const sa = new Set(src.renewalTxs ?? []);
  const sb = new Set(out.renewalTxs ?? []);
  for (const h of sa) if (!sb.has(h)) diffs.push(`renewalTxs: MISSING -> ${h}`);
  return diffs;
}

// ── main ─────────────────────────────────────────────────────────────────────
(async () => {
  if (!PG_URL) {
    console.error("No target Postgres URL (--to, MIGRATE_PG_URL or SUPABASE_DB_URL).");
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(SRC, "utf8"));
  console.log(`source: ${SRC}`);
  console.log(`target: ${new URL(PG_URL).hostname}`);
  console.log(`mode:   ${APPLY ? "APPLY (commit)" : "DRY RUN (rollback)"}\n`);

  console.log("-- pre-flight integrity ------------------");
  const problems = preflight(db);
  if (problems.length === 0) {
    console.log("  clean: no orphans, duplicates, or malformed amounts\n");
  } else {
    const byKind = {};
    for (const p of problems) (byKind[p.kind] ??= []).push(p.detail);
    for (const [kind, list] of Object.entries(byKind)) {
      console.log(`  ${kind}: ${list.length}`);
      for (const d of list.slice(0, 12)) console.log(`    - ${d}`);
      if (list.length > 12) console.log(`    ... and ${list.length - 12} more`);
    }
    console.log();
    if (!FORCE) {
      console.error("Refusing to migrate an inconsistent source. Fix it, or re-run with --force.");
      process.exit(3);
    }
    console.warn("--force: proceeding despite the above.\n");
  }

  const { Client } = require("pg");
  const local = /localhost|127\.0\.0\.1/.test(PG_URL);
  const client = new Client({ connectionString: PG_URL, ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();

  let diffs = [];
  try {
    await client.query("begin");
    const ddl = fs.readFileSync(path.resolve(__dirname, "sql", "001_schema.sql"), "utf8")
      .replace(/^\s*(begin|commit)\s*;\s*$/gim, "");
    await client.query(ddl);

    const t0 = Date.now();
    await load(client, db);
    console.log(`-- loaded in ${Date.now() - t0}ms -----------------`);

    const counts = await client.query(`
      select 'users' t, count(*) n from users
      union all select 'matches', count(*) from matches
      union all select 'markets', count(*) from markets
      union all select 'market_history', count(*) from market_history
      union all select 'market_insights', count(*) from market_insights
      union all select 'bets', count(*) from bets
      union all select 'deposits', count(*) from deposits
      union all select 'withdraws', count(*) from withdraws
      union all select 'receipts', count(*) from receipts
      union all select 'crews', count(*) from crews
      union all select 'telegram_links', count(*) from telegram_links
      union all select 'renewal_txs', count(*) from renewal_txs
      order by 1`);
    for (const r of counts.rows) console.log(`  ${r.t.padEnd(16)} ${r.n}`);

    const money = await client.query(
      `select (select coalesce(sum(escrow_shannons), 0) from users) escrow,
              (select coalesce(sum(creator_fees_shannons), 0) from users) fees,
              (select protocol_fees from streak_meta where id = 'singleton') protocol`);
    let srcEscrow = 0n;
    let srcFees = 0n;
    for (const u of db.users ?? []) {
      srcEscrow += BigInt(u.escrowShannons ?? 0);
      srcFees += BigInt(u.creatorFeesShannons ?? 0);
    }
    console.log("\n-- money reconciliation ------------------");
    const line = (label, a, b) => console.log(
      `  ${label.padEnd(15)} source ${ckb(a).padStart(12)}  migrated ${ckb(b).padStart(12)}  ${BigInt(a) === BigInt(b) ? "OK" : "*** MISMATCH ***"}`);
    line("user escrow", srcEscrow, money.rows[0].escrow);
    line("creator fees", srcFees, money.rows[0].fees);
    line("protocol fees", BigInt(db.protocolFeesShannons ?? 0), money.rows[0].protocol);

    console.log("\n-- round-trip comparison -----------------");
    const out = await materialize(client);
    diffs = compare(db, out);
    if (diffs.length === 0) {
      console.log("  IDENTICAL - every record round-trips exactly\n");
    } else {
      console.log(`  ${diffs.length} difference(s):`);
      for (const d of diffs.slice(0, 40)) console.log(`    - ${d}`);
      if (diffs.length > 40) console.log(`    ... and ${diffs.length - 40} more`);
      console.log();
    }

    if (APPLY && diffs.length === 0) {
      await client.query("commit");
      console.log("COMMITTED.");
    } else if (APPLY) {
      await client.query("rollback");
      console.error("Round-trip differs - rolled back, nothing written.");
    } else {
      await client.query("rollback");
      console.log("Dry run complete - rolled back, nothing written.");
    }
  } catch (e) {
    try { await client.query("rollback"); } catch {}
    console.error("\nmigration failed:", e.message);
    if (e.detail) console.error("detail:", e.detail);
    if (e.constraint) console.error("constraint:", e.constraint);
    await client.end();
    process.exit(1);
  }
  await client.end();
  process.exit(diffs.length === 0 ? 0 : 4);
})();

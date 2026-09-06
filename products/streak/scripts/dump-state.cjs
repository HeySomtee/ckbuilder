#!/usr/bin/env node
/**
 * Dump the authoritative Streak state row straight from Postgres.
 *
 * Bypasses PostgREST (which is 402-gated when the project exceeds its egress
 * quota) by connecting with SUPABASE_DB_URL. Read-only: it never writes to the
 * source. Output goes to data/backups/ (gitignored) and the printed summary
 * deliberately never includes key material.
 */

const fs = require("fs");
const path = require("path");

// Minimal .env loader — mirrors src/env.ts, kept dependency-free.
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

const url = process.env.SUPABASE_DB_URL;
if (!url) { console.error("SUPABASE_DB_URL is not set — cannot reach Postgres directly."); process.exit(1); }

const table = process.env.SUPABASE_TABLE || "streak_state";
const rowId = process.env.SUPABASE_ROW_ID || "singleton";
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) { console.error(`Unsafe table name: ${table}`); process.exit(1); }

const ckb = (s) => (Number(BigInt(s ?? 0)) / 1e8).toFixed(4);

/**
 * Supabase retired IPv4 for `db.<ref>.supabase.co`, so the direct URL only
 * resolves on an IPv6-capable host. Fall back to the Supavisor pooler, which
 * is IPv4-reachable. Region is probed once and can be pinned via SUPABASE_REGION.
 */
async function connect() {
  const { Client } = require("pg");
  const src = new URL(url);
  const ref = process.env.SUPABASE_URL
    ? new URL(process.env.SUPABASE_URL).hostname.split(".")[0]
    : src.hostname.replace(/^db\./, "").split(".")[0];
  const pw = decodeURIComponent(src.password);

  const regions = process.env.SUPABASE_REGION
    ? [process.env.SUPABASE_REGION]
    : ["eu-west-1", "eu-central-1", "us-east-1", "us-west-1", "ap-southeast-1"];

  const candidates = [{ label: "direct", config: { connectionString: url } }];
  for (const prefix of ["aws-0", "aws-1"]) {
    for (const r of regions) {
      candidates.push({
        label: `pooler ${prefix}-${r}`,
        config: {
          host: `${prefix}-${r}.pooler.supabase.com`, port: 5432,
          user: `postgres.${ref}`, password: pw, database: "postgres",
        },
      });
    }
  }

  for (const c of candidates) {
    const client = new Client({
      ...c.config, ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 20000, statement_timeout: 120000,
    });
    try {
      await client.connect();
      console.log(`connected via ${c.label}`);
      return client;
    } catch (e) {
      console.log(`  ${c.label.padEnd(24)} ${e.message.slice(0, 80)}`);
      try { await client.end(); } catch {}
    }
  }
  throw new Error("no reachable Postgres endpoint (project may still be restricted)");
}

(async () => {
  const client = await connect();

  const { rows } = await client.query(
    `select data, updated_at from ${table} where id = $1`, [rowId],
  );
  await client.end();

  if (rows.length === 0) { console.error(`No row id=${rowId} in ${table}.`); process.exit(2); }

  const db = rows[0].data;
  const updatedAt = rows[0].updated_at;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = path.resolve(__dirname, "..", "data", "backups", `${stamp}-supabase-${rowId}.json`);
  const serialized = JSON.stringify(db);
  fs.writeFileSync(out, serialized);

  console.log(`\nwrote ${out}`);
  console.log(`bytes: ${serialized.length.toLocaleString()}  |  row updated_at: ${updatedAt ? updatedAt.toISOString() : "(none)"}`);

  console.log("\n── contents ─────────────────────────────");
  console.log("schema:", db.schema);
  for (const k of ["users", "matches", "markets", "bets", "deposits", "withdraws", "receipts", "crews", "telegramLinks", "renewalTxs"]) {
    console.log(`  ${k.padEnd(14)} ${Array.isArray(db[k]) ? db[k].length : "(absent)"}`);
  }

  console.log("\n── money ────────────────────────────────");
  let escrow = 0n, fees = 0n;
  for (const u of db.users ?? []) { escrow += BigInt(u.escrowShannons ?? 0); fees += BigInt(u.creatorFeesShannons ?? 0); }
  console.log("  user escrow total :", ckb(escrow), "CKB");
  console.log("  creator fees      :", ckb(fees), "CKB");
  console.log("  protocol fees     :", ckb(db.protocolFeesShannons), "CKB");
  console.log("  treasury address  :", db.treasury?.address ?? "(none)");
  console.log("  treasury key      :", db.treasury?.privateKey ? `present (${db.treasury.privateKey.length} chars)` : "absent");

  // Compare against the on-disk snapshot to quantify how stale it was.
  try {
    const local = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "data", "db.json"), "utf8"));
    console.log("\n── vs local data/db.json ────────────────");
    console.log("  treasury address match:", local.treasury?.address === db.treasury?.address);
    let lEscrow = 0n;
    for (const u of local.users ?? []) lEscrow += BigInt(u.escrowShannons ?? 0);
    console.log(`  users        local ${String((local.users ?? []).length).padStart(5)}  remote ${String((db.users ?? []).length).padStart(5)}`);
    console.log(`  escrow CKB   local ${ckb(lEscrow).padStart(12)}  remote ${ckb(escrow).padStart(12)}`);
    for (const k of ["bets", "deposits", "withdraws", "receipts", "markets", "matches"]) {
      const l = (local[k] ?? []).length, r = (db[k] ?? []).length;
      console.log(`  ${k.padEnd(12)} local ${String(l).padStart(5)}  remote ${String(r).padStart(5)}${l !== r ? "   <-- differs" : ""}`);
    }
    const localIds = new Set((local.users ?? []).map((u) => u.id));
    const missing = (db.users ?? []).filter((u) => !localIds.has(u.id));
    console.log(`  users present remotely but NOT in local file: ${missing.length}`);
  } catch (e) {
    console.log("\n(no local db.json to compare:", e.message + ")");
  }
})().catch((e) => { console.error("\ndump failed:", e.message); process.exit(1); });

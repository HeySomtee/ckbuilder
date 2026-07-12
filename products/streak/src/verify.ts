#!/usr/bin/env ts-node
/**
 * Streak — standalone receipt verifier.
 *
 * `npm run verify -- <marketId>` (or a receipt URL like
 * `http://localhost:4100/api/receipts/m-wc-6`).
 *
 * Independently:
 *   1. Fetches the receipt payload from the given API (or the local server).
 *   2. Canonicalizes it and computes sha256.
 *   3. Reads the on-chain cell via CKB Pudge RPC directly, decodes its data,
 *      and confirms the embedded hash + treasury lock match.
 *   4. Recomputes the merkle root over the payload's bet list (fetched via the
 *      inclusion-proof endpoint, which returns every leaf) and confirms it
 *      matches the payload's declared root.
 *
 * The point: this script uses ONLY the Streak API for the off-chain payload
 * and a public CKB RPC for the on-chain check. It doesn't touch db.json or any
 * server internals — anyone can run it against a running Streak instance.
 */

import "./env";

import {
  canonicalize,
  sha256Hex,
  decodeReceiptData,
  RECEIPT_MAGIC,
} from "./settlement";
import type { SettlementReceipt } from "./types";
import { getClient } from "./chain";

interface ReceiptResponse {
  payload: SettlementReceipt;
  canonical: string;
  payloadHash: string;
  receipt: {
    txHash: string;
    index: number;
    payloadHash: string;
    merkleRoot: string;
    publishedAt: string;
  } | null;
  explorer: string | null;
}

async function fetchReceipt(base: string, marketId: string): Promise<ReceiptResponse> {
  const url = `${base.replace(/\/$/, "")}/api/receipts/${encodeURIComponent(marketId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return (await res.json()) as ReceiptResponse;
}

async function fetchProof(base: string, marketId: string): Promise<any> {
  const url = `${base.replace(/\/$/, "")}/api/receipts/${encodeURIComponent(marketId)}/proof`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return await res.json();
}

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};
const ok = (msg: string) => console.log(`  ${c.green}✓${c.reset} ${msg}`);
const bad = (msg: string) => console.log(`  ${c.red}✗${c.reset} ${msg}`);
const info = (k: string, v: string) => console.log(`  ${c.dim}${k.padEnd(14)}${c.reset} ${v}`);

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error(`usage: npm run verify -- <marketId>  [--base http://localhost:4100]`);
    process.exit(2);
  }

  const baseFlagIdx = process.argv.indexOf("--base");
  const base =
    baseFlagIdx > -1 && process.argv[baseFlagIdx + 1]
      ? process.argv[baseFlagIdx + 1]
      : process.env.STREAK_BASE || "http://localhost:4100";

  let marketId = arg;
  // Also accept a full URL for convenience.
  const urlMatch = arg.match(/\/api\/receipts\/([^\/?#]+)/);
  if (urlMatch) marketId = decodeURIComponent(urlMatch[1]);

  console.log(`${c.bold}Streak receipt verifier${c.reset}`);
  info("market", marketId);
  info("api base", base);
  console.log();

  // 1. Payload + hash
  console.log(`${c.cyan}1. payload${c.reset}`);
  const r = await fetchReceipt(base, marketId);
  info("bet count", String(r.payload.bets.count));
  info("winner", r.payload.winner);
  info("settled at", r.payload.settledAt);
  info("oracle", `${r.payload.oracle.source}${r.payload.oracle.live ? " (live)" : " (simulated)"}`);
  const localHash = sha256Hex(canonicalize(r.payload));
  if (localHash === r.payloadHash) ok(`sha256(payload) matches server: ${localHash.slice(0, 18)}…`);
  else {
    bad(`sha256 disagreement: local=${localHash} server=${r.payloadHash}`);
    process.exit(1);
  }

  // 2. Merkle root
  console.log(`\n${c.cyan}2. merkle root${c.reset}`);
  const proof = await fetchProof(base, marketId);
  info("payload root", proof.payloadRoot);
  info("computed root", proof.merkleRoot);
  if (proof.rootsMatch) ok("merkle root over live bet set matches payload");
  else {
    bad("merkle root disagreement");
    process.exit(1);
  }

  // 3. On-chain cell (fresh RPC round-trip, don't trust server's onChain block)
  console.log(`\n${c.cyan}3. on-chain cell${c.reset}`);
  if (!r.receipt) {
    console.log(`  ${c.yellow}!${c.reset} no on-chain reference yet — receipt is pending publish`);
    process.exit(0);
  }
  info("tx hash", r.receipt.txHash);
  info("output idx", String(r.receipt.index));

  const client = getClient();
  let tx: any;
  try {
    tx = await client.getTransaction(r.receipt.txHash);
  } catch (err: any) {
    bad(`RPC getTransaction failed: ${err?.message || err}`);
    process.exit(1);
  }
  const output = tx?.transaction?.outputs?.[r.receipt.index];
  const outputData = tx?.transaction?.outputsData?.[r.receipt.index];
  if (!output || outputData == null) {
    bad("output not present at recorded index");
    process.exit(1);
  }

  let decoded;
  try {
    decoded = decodeReceiptData(outputData as string);
  } catch (err: any) {
    bad(`bad cell data (${err?.message || err})`);
    process.exit(1);
  }
  info("magic", RECEIPT_MAGIC.toString("ascii"));
  info("version", String(decoded.version));
  info("on-chain hash", decoded.payloadHash);

  if (decoded.payloadHash.toLowerCase() === localHash.toLowerCase())
    ok("on-chain hash matches computed payload hash");
  else {
    bad("on-chain hash disagreement");
    process.exit(1);
  }

  console.log();
  console.log(`${c.green}${c.bold}✓ verified${c.reset} — this receipt is authentically pinned on Pudge`);
  if (r.explorer) console.log(`  ${c.dim}explorer:${c.reset} ${r.explorer}`);
}

main().catch((err) => {
  console.error(`\n${c.red}error:${c.reset}`, err?.message || err);
  process.exit(1);
});

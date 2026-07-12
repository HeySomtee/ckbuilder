/**
 * Streak Terminal — on-chain settlement receipts.
 *
 * When a market settles, the engine publishes a **receipt cell** on Pudge to
 * anchor the outcome. Because publishing a large payload as cell data would
 * demand many hundreds of CKB in occupied capacity, only a compact fingerprint
 * lives on-chain — the full payload lives off-chain and is served by the API.
 *
 *   ┌──────────────────── Off-chain (this DB / API) ────────────────────┐
 *   │  SettlementReceipt payload (JSON, canonical UTF-8 bytes)          │
 *   │  → served at /api/receipts/:marketId                              │
 *   └──────────────────┬────────────────────────────────────────────────┘
 *                      │  sha256(canonical bytes)
 *                      ▼
 *   ┌──────────────────── On-chain (Pudge cell) ────────────────────────┐
 *   │  Lock:  treasury (so only the treasury key can publish)           │
 *   │  Type:  none                                                      │
 *   │  Data:  magic(4) "STKR" | version(1) | sha256(32) = 37 bytes      │
 *   │  Cap :  100 CKB  (min 98; = 8 + 53 lock + 37 data)                │
 *   └──────────────────────────────────────────────────────────────────┘
 *
 * Anyone can verify a receipt end-to-end without touching this server:
 *   1. Fetch the payload from anywhere (mirror, gist, /api/receipts/:id).
 *   2. Canonicalize + sha256 it.
 *   3. Look up the on-chain cell by tx-hash + index (in market.receipt) and
 *      confirm bytes 5..37 of its data equal that sha256.
 *   4. Confirm the cell's lock is the treasury lock.
 *
 * A merkle root over every bet lets a bettor prove inclusion of their own bet
 * in the resolved set (see `buildMerkleTree` + `inclusionProof`).
 */

import { createHash } from "crypto";
import { ccc } from "@ckb-ccc/core";

import { ckbToShannons, getClient } from "./chain";
import type {
  Bet,
  Market,
  Match,
  MarketReceiptRef,
  SettlementReceipt,
  StreakDB,
  UserWallet,
} from "./types";
import { asBig, asString } from "./wallet";
import { liveScoresBase } from "./livescores";

/** ASCII "STKR" — magic that identifies a Streak receipt cell. */
export const RECEIPT_MAGIC = Buffer.from("STKR", "ascii");
export const RECEIPT_VERSION = 0x01;
/** Total on-chain data length: 4 magic + 1 version + 32 sha256 = 37 bytes. */
export const RECEIPT_DATA_LEN = 37;
/** Capacity we allocate for each receipt cell (min ~98 CKB; 100 buys a small buffer). */
export const RECEIPT_CELL_CKB = 100;

// ── Canonical JSON (byte-identical publisher ↔ verifier) ────────────────────

/**
 * Deterministic JSON serializer: recursively sorts object keys and preserves
 * arrays. Publisher and verifier must produce byte-identical output — a
 * different key order would change the sha256 and break verification.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ":" + canonicalize((value as any)[k]),
  );
  return "{" + parts.join(",") + "}";
}

export function sha256Hex(input: string | Buffer): string {
  const h = createHash("sha256");
  h.update(typeof input === "string" ? Buffer.from(input, "utf8") : input);
  return "0x" + h.digest("hex");
}

// ── Merkle tree over the market's bets ──────────────────────────────────────

/**
 * Per-bet leaf. `userHash` is `sha256(userId + ":" + marketId)` so identity
 * doesn't leak across markets while a user can still prove ownership of their
 * own leaves inside a single market.
 */
export interface BetLeaf {
  betId: string;
  userHash: string;
  outcome: string;
  amountShannons: string;
}

export function leafHash(l: BetLeaf): string {
  return sha256Hex(canonicalize(l));
}

/** sha256(a || b) with 0x-prefixed hex on both sides. */
function hashPair(a: string, b: string): string {
  const buf = Buffer.concat([Buffer.from(a.slice(2), "hex"), Buffer.from(b.slice(2), "hex")]);
  return sha256Hex(buf);
}

/**
 * Build a binary merkle tree from ordered leaf hashes. Returns every level
 * (bottom-up) so we can walk it later to produce inclusion proofs. Odd nodes
 * duplicate themselves (Bitcoin-style).
 */
export function buildMerkleTree(leaves: string[]): string[][] {
  if (leaves.length === 0) {
    // Empty market: define the root as sha256("") so we always have a value.
    return [[sha256Hex("")]];
  }
  const levels: string[][] = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const cur = levels[levels.length - 1];
    const next: string[] = [];
    for (let i = 0; i < cur.length; i += 2) {
      const l = cur[i];
      const r = i + 1 < cur.length ? cur[i + 1] : cur[i];
      next.push(hashPair(l, r));
    }
    levels.push(next);
  }
  return levels;
}

export function merkleRoot(leaves: string[]): string {
  const t = buildMerkleTree(leaves);
  return t[t.length - 1][0];
}

/** Inclusion proof: sibling hashes bottom-up plus their side ("L" or "R"). */
export interface MerkleProofStep {
  hash: string;
  side: "L" | "R";
}
export function inclusionProof(
  tree: string[][],
  index: number,
): MerkleProofStep[] {
  const steps: MerkleProofStep[] = [];
  let idx = index;
  for (let lvl = 0; lvl < tree.length - 1; lvl++) {
    const level = tree[lvl];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
    steps.push({ hash: sibling, side: isRight ? "L" : "R" });
    idx = Math.floor(idx / 2);
  }
  return steps;
}

export function verifyInclusion(
  leafHashStr: string,
  proof: MerkleProofStep[],
  expectedRoot: string,
): boolean {
  let acc = leafHashStr;
  for (const step of proof) {
    acc = step.side === "L" ? hashPair(step.hash, acc) : hashPair(acc, step.hash);
  }
  return acc === expectedRoot;
}

// ── Payload assembly ────────────────────────────────────────────────────────

/**
 * Deterministic per-market userId hash. Same user in two different markets
 * gets two different hashes, so a public receipt doesn't leak an activity
 * timeline. Same user in one market gets the same hash (so aggregate their
 * bets is possible for anyone with the userId).
 */
export function userHashFor(userId: string, marketId: string): string {
  return sha256Hex(userId + ":" + marketId);
}

export function betsToLeaves(bets: Bet[], marketId: string): BetLeaf[] {
  // Sort by placedAt (stable ordering shared by publisher + verifier).
  const ordered = bets
    .filter((b) => b.marketId === marketId)
    .slice()
    .sort((a, b) => (a.placedAt === b.placedAt ? a.id.localeCompare(b.id) : a.placedAt.localeCompare(b.placedAt)));
  return ordered.map((b) => ({
    betId: b.id,
    userHash: userHashFor(b.userId, marketId),
    outcome: b.outcome,
    amountShannons: b.amount,
  }));
}

export interface BuiltReceipt {
  payload: SettlementReceipt;
  canonicalStr: string;
  payloadHash: string;
  leaves: BetLeaf[];
  tree: string[][];
}

/** Assemble the full off-chain receipt payload from settled DB state. */
export function buildReceiptPayload(
  db: StreakDB,
  market: Market,
  treasury: UserWallet,
): BuiltReceipt {
  const match = db.matches.find((m) => m.id === market.matchId);
  if (!match) throw new Error(`build receipt: match ${market.matchId} not found`);
  const bets = db.bets.filter((b) => b.marketId === market.id);
  const leaves = betsToLeaves(bets, market.id);
  const leafHashes = leaves.map(leafHash);
  const tree = buildMerkleTree(leafHashes);
  const root = tree[tree.length - 1][0];

  const totalPool =
    asBig(market.pools.home) + asBig(market.pools.draw) + asBig(market.pools.away);
  const distributable =
    asBig(market.payout?.loserPoolShannons ?? "0") -
    asBig(market.payout?.protocolFeeShannons ?? "0") -
    asBig(market.payout?.creatorFeeShannons ?? "0");

  const payload: SettlementReceipt = {
    v: 1,
    marketId: market.id,
    matchId: market.matchId,
    match: {
      home: { code: match.home.code, name: match.home.name },
      away: { code: match.away.code, name: match.away.name },
      stage: match.stage,
      kickoff: match.kickoff,
      score: match.score,
    },
    winner: market.resolvedOutcome ?? "void",
    pools: market.pools,
    totalPoolShannons: asString(totalPool),
    fees: { protocolBps: market.feeBps.protocol, creatorBps: market.feeBps.creator },
    distributableShannons: asString(distributable < 0n ? 0n : distributable),
    protocolFeeShannons: market.payout?.protocolFeeShannons ?? "0",
    creatorFeeShannons: market.payout?.creatorFeeShannons ?? "0",
    winnerCount: market.payout?.winnerCount ?? 0,
    totalPaidShannons: market.payout?.totalPaidShannons ?? "0",
    oracle: {
      source: match.liveResult ? liveScoresBase() : "simulated",
      live: !!match.liveResult,
    },
    bets: { count: leaves.length, merkleRoot: root },
    treasuryAddress: treasury.address,
    settledAt: market.resolvedAt ?? new Date().toISOString(),
  };

  const canonicalStr = canonicalize(payload);
  const payloadHash = sha256Hex(canonicalStr);

  return { payload, canonicalStr, payloadHash, leaves, tree };
}

// ── On-chain publish ────────────────────────────────────────────────────────

/**
 * Encode the on-chain data blob for a receipt cell.
 *   [ 4 bytes magic "STKR" | 1 byte version | 32 bytes sha256 ]
 */
export function encodeReceiptData(payloadHashHex: string): Buffer {
  const hashBytes = Buffer.from(payloadHashHex.replace(/^0x/, ""), "hex");
  if (hashBytes.length !== 32) throw new Error("payload hash must be 32 bytes");
  return Buffer.concat([RECEIPT_MAGIC, Buffer.from([RECEIPT_VERSION]), hashBytes]);
}

/**
 * Parse on-chain data bytes back into `{version, payloadHash}`. Throws for
 * anything that isn't a well-formed STKR receipt.
 */
export function decodeReceiptData(data: Buffer | string): {
  version: number;
  payloadHash: string;
} {
  const buf = typeof data === "string"
    ? Buffer.from(data.replace(/^0x/, ""), "hex")
    : data;
  if (buf.length !== RECEIPT_DATA_LEN) {
    throw new Error(`receipt data must be ${RECEIPT_DATA_LEN} bytes, got ${buf.length}`);
  }
  if (buf.subarray(0, 4).toString("ascii") !== "STKR") {
    throw new Error("bad receipt magic");
  }
  return {
    version: buf[4],
    payloadHash: "0x" + buf.subarray(5).toString("hex"),
  };
}

/**
 * Publish a receipt cell on-chain: one output at the treasury lock with the
 * receipt-data blob. Returns `{txHash, index}`.
 */
export async function publishReceipt(
  treasury: UserWallet,
  payloadHashHex: string,
): Promise<{ txHash: string; index: number }> {
  const client = getClient();
  const signer = new ccc.SignerCkbPrivateKey(client, treasury.privateKey);
  const { script: treasuryLock } = await ccc.Address.fromString(treasury.address, client);

  const data = encodeReceiptData(payloadHashHex);
  const tx = ccc.Transaction.from({
    outputs: [{ lock: treasuryLock, capacity: ckbToShannons(RECEIPT_CELL_CKB) }],
    outputsData: ["0x" + data.toString("hex")],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000n);
  const txHash = await signer.sendTransaction(tx);
  return { txHash, index: 0 };
}

// ── Fresh on-chain verification (used by /api/receipts/:id and CLI) ─────────

export interface OnChainCheck {
  ok: boolean;
  txHash: string;
  index: number;
  found: boolean;
  onChainPayloadHash?: string;
  expectedPayloadHash: string;
  onChainLockArgs?: string;
  expectedTreasuryLockArgs?: string;
  reason?: string;
}

/**
 * Fetch the receipt cell live from Pudge and confirm:
 *   - it exists at the recorded outpoint
 *   - its data decodes as a STKR receipt
 *   - its embedded hash matches the given payload hash
 *   - its lock is the treasury lock
 */
export async function verifyReceiptOnChain(
  ref: MarketReceiptRef,
  expectedPayloadHash: string,
  treasury: UserWallet,
): Promise<OnChainCheck> {
  const client = getClient();
  const { script: treasuryLock } = await ccc.Address.fromString(treasury.address, client);
  const expectedTreasuryLockArgs = treasuryLock.args as unknown as string;

  const base: OnChainCheck = {
    ok: false,
    txHash: ref.txHash,
    index: ref.index,
    found: false,
    expectedPayloadHash,
    expectedTreasuryLockArgs,
  };

  let cellData: string | undefined;
  let cellLockArgs: string | undefined;
  try {
    const tx = await client.getTransaction(ref.txHash);
    const output = (tx as any)?.transaction?.outputs?.[ref.index];
    const outputData = (tx as any)?.transaction?.outputsData?.[ref.index];
    if (!output || outputData == null) {
      return { ...base, reason: "output not found in tx" };
    }
    cellData = outputData as string;
    cellLockArgs = (output.lock?.args ?? output.lock?.Args) as string;
  } catch (err: any) {
    return { ...base, reason: `rpc error: ${err?.message || err}` };
  }

  let onChainPayloadHash: string;
  try {
    onChainPayloadHash = decodeReceiptData(cellData!).payloadHash;
  } catch (err: any) {
    return { ...base, found: true, reason: `decode error: ${err?.message || err}` };
  }

  const hashOk = onChainPayloadHash.toLowerCase() === expectedPayloadHash.toLowerCase();
  const lockOk = (cellLockArgs ?? "").toLowerCase() === expectedTreasuryLockArgs.toLowerCase();

  return {
    ok: hashOk && lockOk,
    txHash: ref.txHash,
    index: ref.index,
    found: true,
    onChainPayloadHash,
    expectedPayloadHash,
    onChainLockArgs: cellLockArgs,
    expectedTreasuryLockArgs,
    reason: hashOk ? (lockOk ? undefined : "lock does not match treasury") : "payload hash mismatch",
  };
}

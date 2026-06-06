/**
 * Week 5 — CKB Scroll: on-chain helpers.
 *
 * Each post is stored as a raw CKB cell:
 *
 *   lock:  faucet wallet's secp256k1_blake160 lock (owner can later reclaim)
 *   type:  null (no type script — keeps it simple and avoids script deployment)
 *   data:  SCROLL_V1:<JSON payload>
 *
 * The magic prefix lets anyone recognise Scroll posts by scanning cell data,
 * even without a registry. The minimum capacity follows the standard rule:
 *
 *   minCap = (61 bytes lock overhead + data length) × 10^8 shannons/byte
 *
 * where 61 = 8 (capacity field) + 32 (code_hash) + 1 (hash_type) + 20 (args).
 *
 * Sources:
 *   CCC core API    – https://docs.ckbccc.com/
 *   Capacity rules  – https://docs.nervos.org/docs/essays/rules-of-capacity
 */

import { ccc } from "@ckb-ccc/core";
import { getClient, getSigner } from "../../week2/wallet/client";
import { lockFromAddress, transfer, MIN_TRANSFER_SHANNONS } from "../../week2/wallet/wallet";

// ── Constants ──────────────────────────────────────────────────────────────

/** Magic prefix written at the start of every scroll post's cell data. */
export const SCROLL_MAGIC = "SCROLL_V1:";

/**
 * Occupied bytes for a cell that uses the standard secp256k1_blake160 lock
 * and no type script (not counting the cell data itself):
 *   8  bytes — capacity field
 *  32  bytes — lock.code_hash
 *   1  byte  — lock.hash_type
 *  20  bytes — lock.args (blake160 of public key)
 */
const LOCK_OVERHEAD_BYTES = 61n;

/** Minimum tip in shannons (63 CKB — a little above the 61 CKB floor). */
export const MIN_TIP_SHANNONS = 63n * 100_000_000n;

/** Pudge testnet explorer base URL. */
const PUDGE_BASE = "https://pudge.explorer.nervos.org";

// ── Public helpers ─────────────────────────────────────────────────────────

export interface PublishPayload {
  content: string;
  authorAddress: string;
  createdAt: string;
}

/**
 * Broadcast a scroll post as a real CKB cell on the Pudge testnet.
 * Returns once the transaction has been accepted by the node.
 */
export async function publishScrollPost(payload: PublishPayload): Promise<{
  txHash: string;
  capacity: string; // shannons, decimal string
}> {
  const signer = getSigner();
  const myAddress = await signer.getRecommendedAddress();
  const myLock = await lockFromAddress(myAddress);

  const dataStr = SCROLL_MAGIC + JSON.stringify(payload);
  const dataBytes = ccc.bytesFrom(dataStr, "utf8");

  const minCapacity = (LOCK_OVERHEAD_BYTES + BigInt(dataBytes.length)) * 100_000_000n;

  const tx = ccc.Transaction.from({
    outputs: [{ lock: myLock, capacity: minCapacity }],
    outputsData: [ccc.hexFrom(dataBytes)],
  });

  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000n);
  const txHash = await signer.sendTransaction(tx);

  return { txHash, capacity: minCapacity.toString() };
}

/**
 * Send CKBs from the faucet wallet to any address as a tip.
 * Minimum is 63 CKB (slightly above the cell floor for safety).
 */
export async function tipAddress(
  toAddress: string,
  ckbAmount: number,
): Promise<string> {
  const shannons = BigInt(Math.round(ckbAmount * 100_000_000));
  if (shannons < MIN_TIP_SHANNONS) {
    throw new Error(`Tip too small. Minimum is 63 CKB.`);
  }
  return await transfer(toAddress, shannons);
}

/**
 * Poll the node for the status of a transaction.
 * Returns "pending" if the tx is not yet in any block, "confirmed" when
 * committed, and "failed" if it was rejected.
 */
export async function checkTxStatus(
  txHash: string,
): Promise<"pending" | "confirmed" | "failed"> {
  const client = getClient();
  try {
    const result = await client.getTransaction(txHash);
    if (!result) return "pending";
    // CCC wraps the RPC response; status lives at result.status or txStatus
    const rawStatus: string =
      (result as any).status?.status ??
      (result as any).txStatus?.status ??
      "";
    if (rawStatus === "committed") return "confirmed";
    if (rawStatus === "rejected") return "failed";
    return "pending";
  } catch {
    return "pending";
  }
}

/** Return the faucet wallet's available balance in shannons. */
export async function getFaucetBalance(): Promise<bigint> {
  return await getSigner().getBalance();
}

/** Convert shannons (bigint or string) to a human-readable CKB string. */
export function shannonsToCkb(shannons: bigint | string): string {
  const s = BigInt(shannons);
  const whole = s / 100_000_000n;
  const frac = (s % 100_000_000n).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/**
 * Estimate the minimum capacity (in CKBs) required for a post of a given
 * content byte length. Used by the UI to show the cost before submitting.
 */
export function estimatePostCostCkb(contentBytes: number): number {
  // JSON wrapper around the payload adds roughly 60 chars of overhead
  // (keys: content, authorAddress, createdAt + punctuation + magic prefix).
  const overhead = SCROLL_MAGIC.length + 80;
  const totalDataBytes = contentBytes + overhead;
  const shannons = (LOCK_OVERHEAD_BYTES + BigInt(totalDataBytes)) * 100_000_000n;
  return Number(shannons / 100_000_000n);
}

/** Full Pudge explorer URL for a transaction hash. */
export function pudgeTxUrl(txHash: string): string {
  return `${PUDGE_BASE}/transaction/${txHash}`;
}

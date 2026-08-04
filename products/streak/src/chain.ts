/**
 * Streak — CKB chain layer (Pudge testnet via CCC).
 *
 * Responsibilities:
 *   - generate a fresh secp256k1_blake160 wallet for each new user
 *   - read live balances straight from the chain
 *   - move CKB from a user's wallet to the treasury when they renew a streak
 *
 * Security model (testnet only):
 *   Each user's private key is generated server-side and stored in the JSON
 *   store so the server can sign renewal transactions on the user's behalf —
 *   a custodial model that keeps onboarding to a single click. This is
 *   acceptable for a testnet product where coins have no value. Do NOT reuse
 *   this pattern for mainnet; there you would hand the key to the user (or use
 *   a non-custodial wallet connector) instead.
 */

import { randomBytes } from "crypto";
import { ccc } from "@ckb-ccc/core";

import { SHANNONS_PER_CKB } from "./config";
import type { UserWallet } from "./types";

/** Minimum capacity (CKB) for a standard lock-only cell. */
const MIN_CELL_CKB = 61n;

// A single shared testnet client is fine — it is stateless over RPC.
let client: ccc.ClientPublicTestnet | null = null;
export function getClient(): ccc.ClientPublicTestnet {
  if (!client) client = new ccc.ClientPublicTestnet();
  return client;
}

function signerFor(privateKey: string): ccc.SignerCkbPrivateKey {
  return new ccc.SignerCkbPrivateKey(getClient(), privateKey);
}

function newPrivateKey(): string {
  // 32 random bytes; probability of being outside the secp256k1 order is ~2^-128.
  return "0x" + randomBytes(32).toString("hex");
}

/** Create a brand-new wallet (address + key) for a signing-up user. */
export async function createWallet(): Promise<UserWallet> {
  const privateKey = newPrivateKey();
  const signer = signerFor(privateKey);
  const address = await signer.getRecommendedAddress();
  return { address, privateKey };
}

/** Live available balance for an address, in shannons. */
export async function getBalanceShannons(address: string): Promise<bigint> {
  const c = getClient();
  const { script } = await ccc.Address.fromString(address, c);
  return await c.getBalanceSingle(script);
}

/** Pretty CKB string from shannons. */
export function shannonsToCkb(shannons: bigint): string {
  const whole = shannons / SHANNONS_PER_CKB;
  const frac = (shannons % SHANNONS_PER_CKB)
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function ckbToShannons(ckb: number): bigint {
  return BigInt(Math.round(ckb * Number(SHANNONS_PER_CKB)));
}

/**
 * Transfer `amountCkb` from a user wallet to a destination address.
 * Returns the broadcast transaction hash. Used by the renewal flow.
 */
export async function transferFrom(
  fromPrivateKey: string,
  toAddress: string,
  amountCkb: number,
): Promise<string> {
  if (BigInt(Math.floor(amountCkb)) < MIN_CELL_CKB) {
    throw new Error(`Transfer must be at least ${MIN_CELL_CKB} CKB.`);
  }
  const signer = signerFor(fromPrivateKey);
  const c = getClient();
  const { script: toLock } = await ccc.Address.fromString(toAddress, c);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: toLock, capacity: ckbToShannons(amountCkb) }],
  });
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000n);
  return await signer.sendTransaction(tx);
}

/** Verify a wallet-login signature (from CCC's signMessage) against a message. */
export async function verifyWalletSignature(
  message: string,
  signature: { signature: string; identity: string; signer: string },
): Promise<boolean> {
  try {
    return await ccc.Signer.verifyMessage(message, signature as unknown as ccc.Signature);
  } catch {
    return false;
  }
}

/**
 * Verify that `txHash` is a committed Pudge tx paying at least `minCkb` to the
 * treasury, with at least one input from `fromAddress`. Returns the total
 * shannons paid to the treasury. Backs non-custodial deposits and streak
 * renewals: the user signs the transfer in their own wallet, and the server
 * only credits escrow / revives a streak once the payment is confirmed.
 */
export async function verifyPaymentToTreasury(
  txHash: string,
  fromAddress: string,
  treasuryAddress: string,
  minCkb: number,
): Promise<bigint> {
  const c = getClient();
  const res = await c.getTransaction(txHash);
  if (!res || !res.transaction) throw new Error("Transaction not found on-chain yet.");
  const status = String((res as { status?: string }).status ?? "");
  if (status !== "committed") {
    throw new Error(`Transaction not committed yet (status: ${status || "unknown"}).`);
  }
  const tx = res.transaction;
  const { script: treasuryLock } = await ccc.Address.fromString(treasuryAddress, c);
  const { script: userLock } = await ccc.Address.fromString(fromAddress, c);
  const treasuryHash = treasuryLock.hash();

  let paid = 0n;
  for (const out of tx.outputs) {
    if (out.lock.hash() === treasuryHash) paid += out.capacity;
  }
  if (paid < ckbToShannons(minCkb)) {
    throw new Error(
      `Transaction pays ${shannonsToCkb(paid)} CKB to the treasury; need at least ${minCkb} CKB.`,
    );
  }

  const userHash = userLock.hash();
  let fromUser = false;
  for (const input of tx.inputs) {
    const prev = input.previousOutput;
    if (!prev) continue;
    const prevRes = await c.getTransaction(prev.txHash);
    const prevOut = prevRes?.transaction?.outputs?.[Number(prev.index)];
    if (prevOut && prevOut.lock.hash() === userHash) {
      fromUser = true;
      break;
    }
  }
  if (!fromUser) throw new Error("This transaction was not sent from your connected wallet.");

  return paid;
}

export const PUDGE_EXPLORER = "https://pudge.explorer.nervos.org";
export function txUrl(hash: string): string {
  return `${PUDGE_EXPLORER}/transaction/${hash}`;
}
export function addressUrl(address: string): string {
  return `${PUDGE_EXPLORER}/address/${address}`;
}

/** Short, human display of a CKB address (used when a username is unset). */
export function abbrevAddress(a: string): string {
  if (!a) return "player";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

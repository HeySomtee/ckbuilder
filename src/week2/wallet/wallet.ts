/**
 * Wallet operations: address, balance, transfer.
 *
 * All amounts in this module use **shannons** (bigint). 1 CKB = 10^8 shannons.
 * Use `ckbToShannons` / `shannonsToCkb` at the CLI boundary.
 */

import { ccc } from "@ckb-ccc/core";
import { getClient, getSigner } from "./client";

export const SHANNONS_PER_CKB = 100_000_000n;

/**
 * Minimum capacity for a cell using the standard secp256k1_blake160 lock,
 * with no type script and no data. CKB requires every cell to carry enough
 * capacity to pay for its own bytes (8 capacity + 32 codeHash + 1 hashType
 * + 20 args + 32 lockHash slot + ... = 61 bytes → 61 CKB).
 *
 * Used for a friendly client-side error before bothering the node.
 */
export const MIN_TRANSFER_CKB = 61n;
export const MIN_TRANSFER_SHANNONS = MIN_TRANSFER_CKB * SHANNONS_PER_CKB;

export function ckbToShannons(ckb: string): bigint {
  // Accept "12", "12.5", "0.001" etc. without floating-point loss.
  const [whole, frac = ""] = ckb.split(".");
  if (!/^\d+$/.test(whole) || (frac && !/^\d+$/.test(frac))) {
    throw new Error(`Invalid CKB amount: "${ckb}"`);
  }
  if (frac.length > 8) {
    throw new Error(`Too many decimal places (max 8): "${ckb}"`);
  }
  const padded = (frac + "00000000").slice(0, 8);
  return BigInt(whole) * SHANNONS_PER_CKB + BigInt(padded || "0");
}

export function shannonsToCkb(shannons: bigint): string {
  const whole = shannons / SHANNONS_PER_CKB;
  const frac = (shannons % SHANNONS_PER_CKB).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Resolve an address string to its lock script under the testnet HRP. */
export async function lockFromAddress(address: string): Promise<ccc.Script> {
  const client = getClient();
  const { script } = await ccc.Address.fromString(address, client);
  return script;
}

/** Get the balance (in shannons) of any testnet address. */
export async function getBalanceOf(address: string): Promise<bigint> {
  const client = getClient();
  const lock = await lockFromAddress(address);
  return await client.getBalanceSingle(lock);
}

/** Get my own address (recommended secp256k1_blake160 lock). */
export async function getMyAddress(): Promise<string> {
  const signer = getSigner();
  return await signer.getRecommendedAddress();
}

/** Get my own balance (in shannons). */
export async function getMyBalance(): Promise<bigint> {
  const signer = getSigner();
  return await signer.getBalance();
}

/**
 * Build, sign, and broadcast a CKB transfer. Returns the tx hash.
 *
 * `amount` is in shannons. CCC will:
 *   - collect enough live cells from the signer to cover `amount` + fee,
 *   - add change back to the signer,
 *   - compute fee at `feeRate` shannons/kB,
 *   - sign with the secp256k1_blake160 sighash-all lock.
 */
export async function transfer(
  toAddress: string,
  amount: bigint,
  feeRate: bigint = 1000n,
): Promise<string> {
  if (amount < MIN_TRANSFER_SHANNONS) {
    throw new Error(
      `Amount too small: ${shannonsToCkb(amount)} CKB. ` +
        `The recipient cell needs at least ${MIN_TRANSFER_CKB} CKB to cover its own storage ` +
        `(secp256k1_blake160 lock with no data).`,
    );
  }

  const signer = getSigner();
  const toLock = await lockFromAddress(toAddress);

  const tx = ccc.Transaction.from({
    outputs: [{ lock: toLock, capacity: amount }],
  });

  // Make sure each output has at least the minimum capacity for its lock.
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, feeRate);

  return await signer.sendTransaction(tx);
}

/**
 * Streak Terminal — wallet & escrow.
 *
 * Custodial bridge between a user's on-chain CKB wallet (Pudge testnet) and
 * their virtual escrow balance on the platform.
 *
 *   deposit   — real Pudge tx wallet → treasury, credits escrow.
 *   withdraw  — real Pudge tx treasury → wallet, debits escrow.
 *   bet/claim — fast virtual-ledger ops against escrow (see markets.ts).
 *
 * Mirrors how Polymarket works (USDC into a custodial smart account) so
 * trading is fast while every CKB on the platform corresponds to a real
 * on-chain Pudge tx in or out.
 */

import { randomUUID } from "crypto";

import {
  ckbToShannons,
  getBalanceShannons,
  shannonsToCkb,
  transferFrom,
} from "./chain";
import { MIN_ONCHAIN_CKB } from "./config";
import { read, update } from "./store";
import type { Deposit, UserWallet, Withdraw } from "./types";

// ── Treasury (singleton; created on first boot) ─────────────────────────────

import { createWallet, getClient } from "./chain";
import { ccc } from "@ckb-ccc/core";

/**
 * Return the platform treasury wallet.
 *
 * Precedence:
 *   1. If a persisted treasury exists in the store, use it.
 *   2. Else, if TREASURY_PRIVATE_KEY is set in the env, derive the treasury
 *      from that key and persist it. This lets a fresh boot reuse a wallet
 *      the operator has already funded from the Pudge faucet — critical for
 *      publishing on-chain receipts (each one costs ~100 CKB of capacity).
 *   3. Else, generate a brand-new wallet.
 */
export async function getTreasury(): Promise<UserWallet> {
  const existing = await read((db) => db.treasury);
  if (existing) return existing;

  let wallet: UserWallet;
  const envKey = process.env.TREASURY_PRIVATE_KEY?.trim();
  if (envKey) {
    const key = envKey.startsWith("0x") ? envKey : "0x" + envKey;
    const signer = new ccc.SignerCkbPrivateKey(getClient(), key);
    const address = await signer.getRecommendedAddress();
    wallet = { address, privateKey: key };
  } else {
    wallet = await createWallet();
  }

  return update((db) => {
    if (!db.treasury) db.treasury = wallet;
    return db.treasury;
  });
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class WalletError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function asBig(s: string | bigint | undefined | null): bigint {
  if (s == null || s === "") return 0n;
  if (typeof s === "bigint") return s;
  return BigInt(s);
}

export function asString(b: bigint): string {
  return b.toString();
}

// ── Deposit ─────────────────────────────────────────────────────────────────

export interface DepositResult {
  txHash: string;
  amountCkb: string;
  newEscrowCkb: string;
}

/**
 * Move `amountCkb` from the user's on-chain wallet to the platform treasury
 * and credit their virtual escrow.
 */
export async function deposit(userId: string, amountCkb: number): Promise<DepositResult> {
  if (!Number.isFinite(amountCkb) || amountCkb < MIN_ONCHAIN_CKB) {
    throw new WalletError(
      "min",
      `Deposit must be at least ${MIN_ONCHAIN_CKB} CKB (cell-floor minimum).`,
    );
  }
  const user = await read((db) => db.users.find((u) => u.id === userId));
  if (!user) throw new WalletError("no_user", "User not found.");

  const balance = await getBalanceShannons(user.wallet.address);
  const need = ckbToShannons(amountCkb) + ckbToShannons(1);
  if (balance < need) {
    throw new WalletError(
      "insufficient_chain",
      `Wallet balance too low — need at least ${amountCkb + 1} CKB.`,
    );
  }

  const treasury = await getTreasury();
  const txHash = await transferFrom(user.wallet.privateKey, treasury.address, amountCkb);

  const newEscrowShannons = await update((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new WalletError("no_user", "User vanished mid-deposit.");
    u.escrowShannons = asString(asBig(u.escrowShannons) + ckbToShannons(amountCkb));
    const rec: Deposit = {
      id: randomUUID(),
      userId,
      amountShannons: asString(ckbToShannons(amountCkb)),
      txHash,
      at: new Date().toISOString(),
    };
    db.deposits.push(rec);
    return u.escrowShannons;
  });

  return {
    txHash,
    amountCkb: shannonsToCkb(ckbToShannons(amountCkb)),
    newEscrowCkb: shannonsToCkb(asBig(newEscrowShannons)),
  };
}

// ── Withdraw ────────────────────────────────────────────────────────────────

export interface WithdrawResult {
  txHash: string;
  amountCkb: string;
  newEscrowCkb: string;
}

/**
 * Move `amountCkb` from the platform treasury back to the user's on-chain
 * wallet and debit their virtual escrow.
 */
export async function withdraw(userId: string, amountCkb: number): Promise<WithdrawResult> {
  if (!Number.isFinite(amountCkb) || amountCkb < MIN_ONCHAIN_CKB) {
    throw new WalletError(
      "min",
      `Withdraw must be at least ${MIN_ONCHAIN_CKB} CKB (cell-floor minimum).`,
    );
  }
  const user = await read((db) => db.users.find((u) => u.id === userId));
  if (!user) throw new WalletError("no_user", "User not found.");

  const need = ckbToShannons(amountCkb);
  if (asBig(user.escrowShannons) < need) {
    throw new WalletError(
      "insufficient_escrow",
      `Escrow balance too low — you have ${shannonsToCkb(asBig(user.escrowShannons))} CKB.`,
    );
  }

  const treasury = await getTreasury();
  const txHash = await transferFrom(treasury.privateKey, user.wallet.address, amountCkb);

  const newEscrowShannons = await update((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new WalletError("no_user", "User vanished mid-withdraw.");
    u.escrowShannons = asString(asBig(u.escrowShannons) - need);
    const rec: Withdraw = {
      id: randomUUID(),
      userId,
      amountShannons: asString(need),
      txHash,
      at: new Date().toISOString(),
    };
    db.withdraws.push(rec);
    return u.escrowShannons;
  });

  return {
    txHash,
    amountCkb: shannonsToCkb(need),
    newEscrowCkb: shannonsToCkb(asBig(newEscrowShannons)),
  };
}

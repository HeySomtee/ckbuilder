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
  shannonsToCkb,
  prepareTransfer,
  rebroadcastTransfer,
  verifyPaymentToTreasury,
} from "./chain";
import { MIN_ONCHAIN_CKB } from "./config";
import { read, update } from "./store";
import type { Deposit, User, UserWallet, Withdraw } from "./types";

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
 * Credit a user's escrow from a deposit they already signed and broadcast in
 * their own wallet. The client sends the transaction hash; the server verifies
 * it is a committed payment to the treasury from the user's address, then
 * credits the exact amount that reached the treasury.
 */
export async function deposit(userId: string, txHash: string): Promise<DepositResult> {
  if (typeof txHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    throw new WalletError("bad_tx", "A valid transaction hash is required.");
  }
  txHash = txHash.toLowerCase();
  const user = await read((db) => db.users.find((u) => u.id === userId));
  if (!user) throw new WalletError("no_user", "User not found.");

  const already = await read((db) => db.deposits.some((d) => d.txHash.toLowerCase() === txHash));
  if (already) throw new WalletError("dup", "This deposit was already credited.");

  const treasury = await getTreasury();
  let paid: bigint;
  try {
    paid = await verifyPaymentToTreasury(
      txHash,
      user.wallet.address,
      treasury.address,
      MIN_ONCHAIN_CKB,
    );
  } catch (err) {
    throw new WalletError("verify", (err as Error).message || "Could not verify the deposit.");
  }

  const newEscrowShannons = await update((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new WalletError("no_user", "User vanished mid-deposit.");
    if (db.deposits.some((d) => d.txHash.toLowerCase() === txHash) ||
      (db.renewalTxs ?? []).some((hash) => hash.toLowerCase() === txHash)) {
      throw new WalletError("dup", "This payment transaction was already used.");
    }
    if (u.wallet.address !== user.wallet.address) {
      throw new WalletError("wallet_changed", "Your connected wallet changed. Please retry.");
    }
    u.escrowShannons = asString(asBig(u.escrowShannons) + paid);
    const rec: Deposit = {
      id: randomUUID(),
      userId,
      amountShannons: asString(paid),
      txHash,
      at: new Date().toISOString(),
    };
    db.deposits.push(rec);
    return u.escrowShannons;
  });

  return {
    txHash,
    amountCkb: shannonsToCkb(paid),
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
const activeWithdrawalIds = new Set<string>();

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
  const withdrawalId = randomUUID();
  activeWithdrawalIds.add(withdrawalId);
  try {
    return await executeWithdrawal(user, treasury, need, amountCkb, withdrawalId);
  } finally {
    activeWithdrawalIds.delete(withdrawalId);
  }
}

async function executeWithdrawal(
  user: User, treasury: UserWallet, need: bigint, amountCkb: number, withdrawalId: string,
): Promise<WithdrawResult> {
  const userId = user.id;
  // Reserve funds atomically BEFORE any chain I/O. Bets and concurrent cash-outs
  // now see the reduced balance without waiting on a network operation.
  await update((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) throw new WalletError("no_user", "User vanished mid-withdraw.");
    if (db.withdraws.some((w) => w.userId === userId && w.status === "pending")) {
      throw new WalletError("pending", "A previous withdrawal is still pending confirmation.");
    }
    if (asBig(u.escrowShannons) < need) {
      throw new WalletError("insufficient_escrow", "Your available escrow balance is too low.");
    }
    u.escrowShannons = asString(asBig(u.escrowShannons) - need);
    const rec: Withdraw = {
      id: withdrawalId,
      userId,
      amountShannons: asString(need),
      txHash: "",
      at: new Date().toISOString(),
      status: "pending",
    };
    db.withdraws.push(rec);
  });

  let prepared: Awaited<ReturnType<typeof prepareTransfer>>;
  try {
    prepared = await prepareTransfer(treasury.privateKey, user.wallet.address, amountCkb);
  } catch (error) {
    // No broadcast has been attempted, so returning the reservation is safe.
    await update((db) => {
      const record = db.withdraws.find((w) => w.id === withdrawalId);
      const u = db.users.find((candidate) => candidate.id === userId);
      if (record?.status === "pending" && u) {
        record.status = "failed";
        u.escrowShannons = asString(asBig(u.escrowShannons) + need);
      }
    });
    throw error;
  }

  try {
    await update((db) => {
      const record = db.withdraws.find((w) => w.id === withdrawalId)!;
      record.txHash = prepared.txHash;
      record.signedTransaction = prepared.signedTransaction;
    });
  } catch {
    // Persistence may have committed before its response was lost. Recovery
    // could already see and broadcast those bytes, so never refund here.
    throw new WalletError("pending", "Withdrawal persistence is awaiting confirmation. Your funds remain reserved.");
  }

  let txHash: string;
  try {
    txHash = await prepared.broadcast();
  } catch {
    // A dropped RPC response does not prove that the transaction was rejected.
    // Retain the durable hash and reservation so the same CKB cannot be spent
    // twice. The transaction can be reconciled against the chain by its hash.
    throw new WalletError("pending", `Withdrawal ${prepared.txHash} is awaiting confirmation. Your funds remain reserved.`);
  }
  const newEscrowShannons = await update((db) => {
    const record = db.withdraws.find((w) => w.id === withdrawalId)!;
    record.status = "submitted";
    record.txHash = txHash;
    return db.users.find((u) => u.id === userId)!.escrowShannons;
  });

  return {
    txHash,
    amountCkb: shannonsToCkb(need),
    newEscrowCkb: shannonsToCkb(asBig(newEscrowShannons)),
  };
}

/** Recover inactive reservations that never produced broadcastable bytes. */
export async function recoverUnsentWithdrawals(): Promise<void> {
  const exists = await read((db) => db.withdraws.some((w) =>
    w.status === "pending" && !w.txHash && !w.signedTransaction && !activeWithdrawalIds.has(w.id)));
  if (!exists) return;
  await update((db) => {
    for (const record of db.withdraws) {
      if (record.status !== "pending" || record.txHash || record.signedTransaction || activeWithdrawalIds.has(record.id)) continue;
      const user = db.users.find((u) => u.id === record.userId);
      if (!user) continue;
      user.escrowShannons = asString(asBig(user.escrowShannons) + asBig(record.amountShannons));
      record.status = "failed";
    }
  });
}

let reconcilingWithdrawals: Promise<void> | null = null;

/** Recover successful sends whose RPC response or final persistence was lost. */
export function reconcilePendingWithdrawals(): Promise<void> {
  if (reconcilingWithdrawals) return reconcilingWithdrawals;
  reconcilingWithdrawals = (async () => {
    await recoverUnsentWithdrawals();
    const pending = await read((db) => db.withdraws.filter((w) => w.status === "pending" && w.txHash));
    for (const record of pending) {
      try {
        const transaction = await getClient().getTransaction(record.txHash);
        if ((!transaction || transaction.status === "unknown") && record.signedTransaction) {
          await rebroadcastTransfer(record.signedTransaction, record.txHash);
        }
        if (transaction?.status !== "committed") continue;
        await update((db) => {
          const current = db.withdraws.find((w) => w.id === record.id);
          if (current?.status === "pending" && current.txHash === record.txHash) current.status = "submitted";
        });
      } catch {
        // Keep reservations on uncertain chain state; the next tick retries.
      }
    }
  })().finally(() => { reconcilingWithdrawals = null; });
  return reconcilingWithdrawals;
}

/**
 * CCC testnet client + key persistence.
 *
 * The private key is stored in `.ckb-wallet.key` at the repo root (gitignored).
 * NEVER commit this file or use it for mainnet funds.
 */

import { existsSync, readFileSync, writeFileSync, chmodSync } from "fs";
import { resolve } from "path";
import { ccc } from "@ckb-ccc/core";

export const KEY_FILE = resolve(process.cwd(), ".ckb-wallet.key");

export function getClient(): ccc.Client {
  return new ccc.ClientPublicTestnet();
}

/** Load the saved private key, or throw with a helpful message. */
export function loadPrivateKey(): string {
  if (!existsSync(KEY_FILE)) {
    throw new Error(
      `No wallet key found at ${KEY_FILE}.\n` +
        `Run \`npm run wallet -- init\` to create one.`,
    );
  }
  const raw = readFileSync(KEY_FILE, "utf8").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(`Key file ${KEY_FILE} is malformed (expected 0x + 64 hex chars).`);
  }
  return raw;
}

/** Generate a new random private key and persist it. Refuses to overwrite. */
export function createPrivateKey(): string {
  if (existsSync(KEY_FILE)) {
    throw new Error(
      `Refusing to overwrite existing key at ${KEY_FILE}. ` +
        `Delete it manually if you really mean to discard it.`,
    );
  }
  const key = generatePrivateKeyHex();
  writeFileSync(KEY_FILE, key + "\n", { mode: 0o600 });
  try {
    chmodSync(KEY_FILE, 0o600);
  } catch {
    // best-effort on Windows
  }
  return key;
}

/** Build a CCC signer bound to the testnet client. */
export function getSigner(): ccc.SignerCkbPrivateKey {
  return new ccc.SignerCkbPrivateKey(getClient(), loadPrivateKey());
}

function generatePrivateKeyHex(): string {
  // Use Node's crypto for a 32-byte random scalar. The probability of
  // landing outside the secp256k1 group order is negligible (~2^-128).
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return "0x" + randomBytes(32).toString("hex");
}

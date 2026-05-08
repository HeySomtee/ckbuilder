#!/usr/bin/env ts-node
/**
 * CKB testnet wallet — CLI entry point.
 *
 * Usage:
 *   npm run wallet -- init
 *   npm run wallet -- address
 *   npm run wallet -- balance [address]
 *   npm run wallet -- send <to-address> <amount-ckb>
 *
 * Network: CKB testnet (Pudge). HRP: ckt.
 * Faucet:  https://faucet.nervos.org/
 * Explorer: https://pudge.explorer.nervos.org/
 */

import { createPrivateKey, KEY_FILE } from "./client";
import {
  getBalanceOf,
  getMyAddress,
  getMyBalance,
  ckbToShannons,
  shannonsToCkb,
  transfer,
  lockFromAddress,
} from "./wallet";
import { c, style } from "./colors";

const EXPLORER = "https://pudge.explorer.nervos.org";

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case "init":
      return cmdInit();
    case "address":
      return cmdAddress();
    case "balance":
      return cmdBalance(args[0]);
    case "send":
      return cmdSend(args[0], args[1]);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return printHelp();
    default:
      console.error(`${style.err("Unknown command:")} ${cmd}\n`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`${style.heading("CKB testnet wallet")}

${c.bold("Commands:")}
  ${c.cyan("init")}                          Generate a new private key (one-time setup)
  ${c.cyan("address")}                       Show your testnet address
  ${c.cyan("balance")} ${c.dim("[address]")}             Show balance for an address (defaults to yours)
  ${c.cyan("send")} ${c.dim("<to-address> <amount>")}    Send CKB (amount in CKB, e.g. 100 or 12.5)

${style.label("Network:")}  CKB testnet (Pudge)
${style.label("Key file:")} ${KEY_FILE}
${style.label("Faucet:")}   ${style.url("https://faucet.nervos.org/")}
`);
}

async function cmdInit() {
  const key = createPrivateKey();
  console.log(`${style.ok("✓")} Generated new private key and saved to:\n  ${style.label(KEY_FILE)}`);
  console.log(
    `${style.warn("⚠ Private key (KEEP SECRET, TESTNET ONLY):")} ${style.hash(key)}\n`,
  );
  const address = await getMyAddress();
  console.log(`${c.bold("Your testnet address:")}\n  ${style.address(address)}\n`);
  console.log(`Fund it from the faucet:\n  ${style.url("https://faucet.nervos.org/")}`);
}

async function cmdAddress() {
  const address = await getMyAddress();
  console.log(style.address(address));
}

async function cmdBalance(address?: string) {
  const target = address ?? (await getMyAddress());
  if (address) await lockFromAddress(address); // validate format
  const shannons = address ? await getBalanceOf(address) : await getMyBalance();
  console.log(
    `${style.address(target)}\n  ${style.amount(shannonsToCkb(shannons))} ${c.dim("CKB")}  ${c.gray(`(${shannons} shannons)`)}`,
  );
}

async function cmdSend(to?: string, amountCkb?: string) {
  if (!to || !amountCkb) {
    console.error(`${style.err("Usage:")} send <to-address> <amount-ckb>`);
    process.exit(1);
  }
  const amount = ckbToShannons(amountCkb);
  const from = await getMyAddress();
  console.log(
    `Sending ${style.amount(shannonsToCkb(amount))} ${c.dim("CKB")} to ${style.address(to)} ${c.dim("...")}`,
  );
  const txHash = await transfer(to, amount);
  console.log(`\n${style.ok("✓ Submitted:")} ${style.hash(txHash)}`);
  console.log(`\n${c.bold("Explorer links:")}`);
  console.log(`  ${style.label("Transaction:")} ${style.url(`${EXPLORER}/transaction/${txHash}`)}`);
  console.log(`  ${style.label("From:       ")} ${style.url(`${EXPLORER}/address/${from}`)}`);
  console.log(`  ${style.label("To:         ")} ${style.url(`${EXPLORER}/address/${to}`)}`);
}

main().catch((err) => {
  console.error(`${style.err("Error:")} ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

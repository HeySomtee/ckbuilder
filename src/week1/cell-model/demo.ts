/**
 * Week 1 demo: walk the Cell Model lifecycle described in
 * https://docs.nervos.org/docs/ckb-fundamentals/cell-model
 *
 * Storyline:
 *   1. Alice owns a Live Cell containing "hello".
 *   2. She spends it in a transaction that creates a new Cell with "hello, ckb"
 *      owned by Bob — demonstrating immutability + Consumption.
 *   3. Bob attaches a Type Script that enforces "data length must grow".
 *   4. We attempt a double-spend and watch the chain reject it.
 *   5. We let a third party pay the fee, illustrating flexible fee coverage.
 */

import { Chain } from "./chain";
import { codeHashOf, registerScript } from "./scripts";
import { Cell, Script, Transaction } from "./types";

// ---- "Scripts" --------------------------------------------------------------

const ALWAYS_SUCCESS = codeHashOf("always-success");
registerScript(ALWAYS_SUCCESS, () => true);

// A Lock Script that only unlocks when the witness equals the args (toy "sig").
const SECRET_LOCK = codeHashOf("secret-lock");
registerScript(SECRET_LOCK, ({ script, tx, index }) => {
  return tx.witnesses[index] === script.args;
});

// A Type Script: data length of an output carrying this type must be strictly
// greater than the data length of any input carrying the same type.
const GROW_ONLY = codeHashOf("grow-only");
registerScript(GROW_ONLY, ({ tx, inputCells }) => {
  const sameType = (s?: Script) => s?.codeHash === GROW_ONLY;
  const inMax = Math.max(0, ...inputCells.filter((c) => sameType(c.type)).map((c) => c.data.length));
  const outMin = Math.min(
    Infinity,
    ...tx.outputs.filter((c) => sameType(c.type)).map((c) => c.data.length),
  );
  return outMin > inMax;
});

// ---- Helpers ----------------------------------------------------------------

const lockFor = (secret: string): Script => ({
  codeHash: SECRET_LOCK,
  hashType: "type",
  args: secret,
});

const cell = (capacity: bigint, lock: Script, data: string, type?: Script): Cell => ({
  capacity,
  lock,
  type,
  data: new TextEncoder().encode(data),
});

const decode = (b: Uint8Array) => new TextDecoder().decode(b);

// ---- Story ------------------------------------------------------------------

const chain = new Chain();
const alice = lockFor("alice-secret");
const bob = lockFor("bob-secret");
const fred = lockFor("fred-secret"); // third-party fee payer

console.log("--- Genesis ---");
const aliceOp = chain.mint(cell(1000n, alice, "hello", { codeHash: GROW_ONLY, hashType: "type", args: "0x" }));
const fredOp = chain.mint(cell(200n, fred, "fred-funds"));
console.log("alice cell live? ", chain.status(aliceOp));
console.log("fred  cell live? ", chain.status(fredOp));

console.log("\n--- Tx 1: Alice -> Bob, fee paid by Fred ---");
const tx1: Transaction = {
  inputs: [aliceOp, fredOp],
  outputs: [
    // Bob receives the upgraded cell. Capacity slightly less than alice's
    // input — the difference (10 shannons) is the miner fee.
    cell(990n, bob, "hello, ckb", { codeHash: GROW_ONLY, hashType: "type", args: "0x" }),
    // Fred gets change back (kept his own funds, paid 10 shannons of fee).
    cell(190n, fred, "fred-funds"),
  ],
  witnesses: ["alice-secret", "fred-secret"],
};
const tx1Hash = chain.submit(tx1);
console.log("tx1 accepted:", tx1Hash);
console.log("alice cell now:", chain.status(aliceOp), "(consumed = Dead)");

console.log("\n--- Tx 2: try to double-spend Alice's already-Dead cell ---");
try {
  chain.submit({
    inputs: [aliceOp],
    outputs: [cell(1000n, bob, "stolen")],
    witnesses: ["alice-secret"],
  });
} catch (e) {
  console.log("rejected:", (e as Error).message);
}

console.log("\n--- Tx 3: Bob shrinks data, violating GROW_ONLY type script ---");
const bobLive = chain.liveCells((c) => c.cell.lock.args === "bob-secret")[0];
try {
  chain.submit({
    inputs: [bobLive.outPoint],
    outputs: [cell(990n, bob, "hi", { codeHash: GROW_ONLY, hashType: "type", args: "0x" })],
    witnesses: ["bob-secret"],
  });
} catch (e) {
  console.log("rejected:", (e as Error).message);
}

console.log("\n--- Final live set ---");
for (const co of chain.liveCells()) {
  console.log(
    `  ${co.outPoint.txHash.slice(0, 10)}…#${co.outPoint.index}`,
    `cap=${co.cell.capacity}`,
    `data="${decode(co.cell.data)}"`,
  );
}

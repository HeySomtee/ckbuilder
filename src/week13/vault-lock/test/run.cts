/**
 * Week 13 - unit tests for the hash-lock, run on the real CKB-VM via ckb-testtool.
 *
 * Proves two things end to end:
 *   1. revealing the correct preimage unlocks the cell (script exits 0);
 *   2. any other preimage is rejected (script exits 2).
 *
 * This file is CommonJS (.cts) on purpose: ckb-testtool's ESM build has a
 * `__dirname` bug, so it must be consumed via its CommonJS entry.
 *
 * Requires `ckb-debugger` on PATH (ckb-testtool spawns it). See README.md.
 * Run: npm run build && npm test
 */
import { Resource, Verifier, DEFAULT_SCRIPT_CKB_JS_VM } from "ckb-testtool";
import {
  hexFrom,
  Transaction,
  WitnessArgs,
  hashTypeToBytes,
  hashCkb,
  type Hex,
} from "@ckb-ccc/core";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BYTECODE = join(__dirname, "..", "dist", "index.bc");

/**
 * Build a transaction that spends one cell locked by our ckb-js-vm hash-lock,
 * committing to `commitment` and revealing `preimage` in the witness.
 */
function buildVaultTx(commitment: Hex, preimage: Hex): { resource: Resource; tx: Transaction } {
  const resource = Resource.default();

  // Cell holding our compiled lock bytecode.
  const jsCell = resource.mockCell(
    resource.createScriptUnused(),
    undefined,
    hexFrom(readFileSync(BYTECODE)),
  );
  const jsScript = resource.createScriptByData(jsCell, "0x");

  // Cell holding the ckb-js-vm interpreter (ships with ckb-testtool).
  const vmCell = resource.mockCell(
    resource.createScriptUnused(),
    undefined,
    hexFrom(readFileSync(DEFAULT_SCRIPT_CKB_JS_VM)),
  );

  // ckb-js-vm lock args = 0x0000 (loader) + JS code hash + JS hash type + our commitment.
  const lockArgs = hexFrom(
    "0x0000" +
      jsScript.codeHash.slice(2) +
      hexFrom(hashTypeToBytes(jsScript.hashType)).slice(2) +
      commitment.slice(2),
  );
  const vaultLock = resource.createScriptByData(vmCell, lockArgs);

  const inputCell = resource.mockCell(vaultLock, undefined, "0x");

  const tx = Transaction.from({
    cellDeps: [
      Resource.createCellDep(vmCell, "code"),
      Resource.createCellDep(jsCell, "code"),
    ],
    inputs: [Resource.createCellInput(inputCell)],
    outputs: [Resource.createCellOutput(vaultLock)],
    outputsData: ["0x"],
    witnesses: [hexFrom(WitnessArgs.from({ lock: preimage }).toBytes())],
  });

  return { resource, tx };
}

async function main(): Promise<void> {
  const preimage = hexFrom(new TextEncoder().encode("open-sesame · streak vault v1"));
  const commitment = hashCkb(preimage);

  // 1) Correct preimage unlocks.
  {
    const { resource, tx } = buildVaultTx(commitment, preimage);
    const cycles = await Verifier.from(resource, tx).verifySuccess();
    console.log(`ok  correct preimage unlocked the vault (cycles: ${cycles})`);
  }

  // 2) Wrong preimage is rejected with our exit code 2.
  {
    const wrong = hexFrom(new TextEncoder().encode("not the secret"));
    const { resource, tx } = buildVaultTx(commitment, wrong);
    await Verifier.from(resource, tx).verifyFailure(2);
    console.log("ok  wrong preimage was rejected (script exit code 2)");
  }

  console.log("\nAll vault-lock tests passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

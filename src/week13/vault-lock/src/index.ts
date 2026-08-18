/**
 * Week 13 - a hash-lock ("preimage lock") CKB lock script, written in TypeScript
 * and executed on-chain by ckb-js-vm.
 *
 * Rule: the cell unlocks only when the spender reveals a preimage whose CKB
 * blake2b hash equals the 32-byte commitment stored in the lock args. This is
 * the atom of a hash-time-locked contract (HTLC) and the first step in replacing
 * Streak's server-held treasury with custody enforced by code. See
 * reports/week-13.md.
 *
 * Return 0 to unlock (success); any non-zero code rejects the transaction.
 */
import * as bindings from "@ckb-js-std/bindings";
import { HighLevel, bytesEq, hashCkb } from "@ckb-js-std/core";

// ckb-js-vm prepends a 35-byte loader header to the script args:
// 2 bytes loader + 32 bytes JS code hash + 1 byte hash type. Our args follow it.
const LOADER_PREFIX_LEN = 35;
const HASH_LEN = 32;

// Exit codes surfaced to the transaction verifier.
const ERR_MALFORMED_ARGS = 1;
const ERR_BAD_PREIMAGE = 2;

function main(): number {
  const commitment = HighLevel.loadScript().args.slice(LOADER_PREFIX_LEN);
  if (commitment.byteLength !== HASH_LEN) {
    return ERR_MALFORMED_ARGS;
  }

  // The spender reveals the preimage in the lock field of this input's witness.
  const witness = HighLevel.loadWitnessArgs(0, bindings.SOURCE_GROUP_INPUT);
  const preimage = witness.lock ?? new ArrayBuffer(0);

  return bytesEq(hashCkb(preimage), commitment) ? 0 : ERR_BAD_PREIMAGE;
}

bindings.exit(main());

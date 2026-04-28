/**
 * Minimal TypeScript replica of the CKB Cell Model primitives.
 *
 * Source: https://docs.nervos.org/docs/ckb-fundamentals/cell-model
 *
 * This file intentionally mirrors only the *shape* of the real CKB types —
 * it is for learning, not production use.
 */

/** A 32-byte hash, represented as a hex string for readability. */
export type Hash = string;

/**
 * A Script in CKB is `(code_hash, hash_type, args)`. It is executed by CKB-VM
 * to decide whether a Cell may be unlocked (Lock Script) or whether the state
 * transition involving it is valid (Type Script).
 *
 * Here we model "execution" as a plain JS predicate so we can play with it
 * without spinning up an actual VM.
 */
export interface Script {
  readonly codeHash: Hash;
  readonly hashType: "data" | "type";
  readonly args: string;
}

/**
 * A Cell — the fundamental unit of state in CKB.
 *
 * `capacity` is measured in shannons (1 CKByte = 10^8 shannons) and must be
 * at least large enough to hold the Cell's own bytes (state rent in action).
 */
export interface Cell {
  readonly capacity: bigint;
  readonly lock: Script;
  readonly type?: Script;
  readonly data: Uint8Array;
}

/** A pointer into the chain identifying exactly one Cell output. */
export interface OutPoint {
  readonly txHash: Hash;
  readonly index: number;
}

/** A Cell that exists on-chain, paired with the OutPoint that locates it. */
export interface CellOutput {
  readonly outPoint: OutPoint;
  readonly cell: Cell;
}

/**
 * A transaction: consume a set of Live Cells (inputs) and create new Cells
 * (outputs). Validation runs every input's Lock Script and every referenced
 * Type Script.
 */
export interface Transaction {
  readonly inputs: readonly OutPoint[];
  readonly outputs: readonly Cell[];
  /** Witnesses are the unlocking data fed to Lock Scripts (e.g. signatures). */
  readonly witnesses: readonly string[];
}

/** Status of a Cell in the chain's UTXO set. */
export type CellStatus = "live" | "dead";

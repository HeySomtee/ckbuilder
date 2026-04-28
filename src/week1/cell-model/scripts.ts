import { createHash } from "crypto";
import { Cell, Script, Transaction } from "./types";

/**
 * Toy "VM": a registry mapping a Script's codeHash to a JS predicate.
 *
 * Real CKB scripts are RISC-V binaries executed by CKB-VM. Here a script
 * just runs a function we register at the same `codeHash`. That keeps the
 * mental model honest — scripts are pure functions over the transaction.
 */
export type ScriptFn = (ctx: ScriptContext) => boolean;

export interface ScriptContext {
  readonly script: Script;
  readonly tx: Transaction;
  /** Resolved input cells (the chain looked these up via their OutPoints). */
  readonly inputCells: readonly Cell[];
  /** Index of the input or output this script is being executed for. */
  readonly index: number;
  readonly group: "input" | "output";
}

const registry = new Map<string, ScriptFn>();

export function registerScript(codeHash: string, fn: ScriptFn): void {
  registry.set(codeHash, fn);
}

export function runScript(ctx: ScriptContext): boolean {
  const fn = registry.get(ctx.script.codeHash);
  if (!fn) throw new Error(`Unknown script code_hash: ${ctx.script.codeHash}`);
  return fn(ctx);
}

/** Convenience helper: hash any string into a stable hex "code_hash". */
export function codeHashOf(label: string): string {
  return "0x" + createHash("sha256").update(label).digest("hex");
}

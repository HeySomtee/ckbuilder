import { createHash } from "crypto";
import {
  Cell,
  CellOutput,
  CellStatus,
  Hash,
  OutPoint,
  Transaction,
} from "./types";
import { runScript } from "./scripts";

/**
 * A tiny in-memory "chain" that tracks Live and Dead cells and validates
 * transactions the same way CKB does conceptually:
 *
 *   1. Resolve every input OutPoint to a Live Cell.
 *   2. Check capacity conservation (sum(inputs) >= sum(outputs)).
 *   3. Run every input's Lock Script.
 *   4. Run every Type Script appearing in inputs or outputs (script groups).
 *   5. Mark inputs Dead, insert outputs as Live.
 */
export class Chain {
  private readonly cells = new Map<string, { cell: Cell; status: CellStatus }>();

  /** Genesis-style helper: drop a Cell straight into the live set. */
  mint(cell: Cell): OutPoint {
    const txHash = hash(`mint:${this.cells.size}:${cell.capacity}`);
    const outPoint: OutPoint = { txHash, index: 0 };
    this.cells.set(key(outPoint), { cell, status: "live" });
    return outPoint;
  }

  status(op: OutPoint): CellStatus | "unknown" {
    return this.cells.get(key(op))?.status ?? "unknown";
  }

  getLive(op: OutPoint): Cell {
    const entry = this.cells.get(key(op));
    if (!entry) throw new Error(`Unknown OutPoint ${key(op)}`);
    if (entry.status === "dead") throw new Error(`Cell already consumed: ${key(op)}`);
    return entry.cell;
  }

  submit(tx: Transaction): Hash {
    // 1. Resolve inputs (must all be live).
    const inputCells = tx.inputs.map((op) => this.getLive(op));

    // 2. Capacity conservation.
    const inSum = inputCells.reduce((s, c) => s + c.capacity, 0n);
    const outSum = tx.outputs.reduce((s, c) => s + c.capacity, 0n);
    if (outSum > inSum) {
      throw new Error(`Capacity not conserved: in=${inSum} out=${outSum}`);
    }

    // 3. Lock scripts (one per input).
    inputCells.forEach((cell, index) => {
      const ok = runScript({
        script: cell.lock,
        tx,
        inputCells,
        index,
        group: "input",
      });
      if (!ok) throw new Error(`Lock script failed for input #${index}`);
    });

    // 4. Type scripts appear once per script group (we keep it simple: run
    // each unique type script exactly once over the whole tx).
    const seen = new Set<string>();
    const runType = (cell: Cell, index: number, group: "input" | "output") => {
      if (!cell.type) return;
      const sig = `${cell.type.codeHash}:${cell.type.hashType}:${cell.type.args}`;
      if (seen.has(sig)) return;
      seen.add(sig);
      const ok = runScript({ script: cell.type, tx, inputCells, index, group });
      if (!ok) throw new Error(`Type script failed (${group} #${index})`);
    };
    inputCells.forEach((c, i) => runType(c, i, "input"));
    tx.outputs.forEach((c, i) => runType(c, i, "output"));

    // 5. Apply state transition.
    const txHash = hashTx(tx);
    tx.inputs.forEach((op) => {
      const e = this.cells.get(key(op))!;
      this.cells.set(key(op), { cell: e.cell, status: "dead" });
    });
    tx.outputs.forEach((cell, index) => {
      this.cells.set(key({ txHash, index }), { cell, status: "live" });
    });
    return txHash;
  }

  /** Return all live cells matching a predicate — handy for inspection. */
  liveCells(filter: (c: CellOutput) => boolean = () => true): CellOutput[] {
    const out: CellOutput[] = [];
    for (const [k, { cell, status }] of this.cells) {
      if (status !== "live") continue;
      const [txHash, idxStr] = k.split(":");
      const co: CellOutput = { cell, outPoint: { txHash, index: Number(idxStr) } };
      if (filter(co)) out.push(co);
    }
    return out;
  }
}

function key(op: OutPoint): string {
  return `${op.txHash}:${op.index}`;
}

function hash(s: string): Hash {
  return "0x" + createHash("sha256").update(s).digest("hex");
}

function hashTx(tx: Transaction): Hash {
  const repr = JSON.stringify(tx, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v instanceof Uint8Array ? Array.from(v) : v,
  );
  return hash(repr);
}

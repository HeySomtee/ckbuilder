# Week 1 — CKB Fundamentals: The Cell Model

**Source:** https://docs.nervos.org/docs/ckb-fundamentals/cell-model
**Code replica:** [src/week1/cell-model](../src/week1/cell-model)

## Goal of the week

Build a working mental model of how state lives on Nervos CKB and reproduce
the lifecycle in TypeScript.

## What I learned

### 1. Cells are a generalized UTXO
A **Cell** is the atomic piece of state on CKB. Like a Bitcoin UTXO, it carries
value (`capacity` in shannons), but it also carries arbitrary `data` and two
scripts:

- **Lock Script** — answers *"who can spend me?"*
- **Type Script** — answers *"what state transitions am I allowed to take part in?"*

### 2. Cells are immutable; updates happen via Consumption
You never edit a Cell. To change its data you build a transaction that
**consumes** the existing Live Cell (it becomes Dead) and **creates** a new
Cell with the updated data. This is exactly the pattern modelled in
[chain.ts](../src/week1/cell-model/chain.ts) — `submit()` flips inputs to
`dead` and inserts outputs as `live`.

A Cell can only be consumed once; the chain rejects double-spends because the
referenced OutPoint is no longer Live (see Tx 2 in the demo).

### 3. Validation = running every Lock + Type Script
On `submit()` the toy chain:

1. resolves all inputs (they must be Live),
2. checks capacity conservation (`sum(inputs) ≥ sum(outputs)`; the difference
   is the miner fee),
3. runs each input's Lock Script,
4. runs each unique Type Script (the "script group" idea),
5. atomically applies the state change.

The real CKB-VM is RISC-V; my replica swaps that for a JS function registry so
the validation *flow* stays honest while the execution is trivially debuggable.

### 4. First-class assets
Because assets live in user-owned Cells (guarded by the user's Lock Script),
a buggy contract cannot drain them — the contract has no custody. This is the
opposite of the account model, where token balances live inside contract
storage.

### 5. Flexible fee coverage
Any input can supply the fee — it doesn't have to come from the sender. In the
demo, **Fred** pays the 10-shannon fee for **Alice → Bob** by including one
of his own Live Cells and taking the change back. This is impossible to
express cleanly in an account model.

### 6. Scalability comes from the structure
- **Off-chain computation, on-chain validation** — clients build the new state;
  nodes only verify scripts return `true`.
- **Parallel script execution** — independent transactions touch disjoint
  OutPoints, so they validate in parallel.
- **Batchable transactions** — many state transitions in one tx amortise
  overhead.

## Replica walkthrough

```
src/week1/cell-model/
├── types.ts     # Cell, Script, OutPoint, Transaction
├── scripts.ts   # Toy "CKB-VM": codeHash → JS predicate registry
├── chain.ts     # Live/Dead bookkeeping + tx validation pipeline
└── demo.ts      # Story: mint → transfer (fee paid by 3rd party) →
                 #   reject double-spend → reject GROW_ONLY violation
```

Run it:

```bash
npm install
npm run week1
```

Expected output highlights:
- `tx1 accepted: 0x…` and Alice's cell flips to Dead.
- Tx 2 rejected: *"Cell already consumed"* (double-spend prevention).
- Tx 3 rejected: *"Type script failed"* (Bob tried to shrink data; GROW_ONLY says no).
- Final live set shows Bob's `"hello, ckb"` cell and Fred's change cell.

## Open questions to chase next week

- How exactly do **script groups** batch lock/type executions in real CKB?
- What does a `cell_deps` reference look like and why does the VM need it to
  load script code?
- Where does **state rent** show up numerically — what's the minimum capacity
  for a cell of N bytes?
- How does **NervosDAO** use the Cell Model to lock CKBytes for interest?

## Plan for Week 2

Move one layer down to **CKB-VM** and **Script execution**: write a tiny
"assembler" that emits a script binary, then a JS interpreter that runs it
against a transaction context — replacing this week's JS-function registry
with something closer to the real thing.

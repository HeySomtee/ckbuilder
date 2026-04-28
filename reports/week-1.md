# Week 1: CKB Fundamentals

This week covered three core fundamentals:

1. **Cell Model**: https://docs.nervos.org/docs/ckb-fundamentals/cell-model
2. **Consensus (NC-Max)**: https://docs.nervos.org/docs/ckb-fundamentals/consensus
3. **CKB Address**: https://docs.nervos.org/docs/ckb-fundamentals/ckb-address

**Code replica:** [src/week1/cell-model](../src/week1/cell-model)

## Goal of the week

Build a working mental model of how state lives on Nervos CKB, how the
network agrees on it, and how users address it. Reproduce the Cell Model
lifecycle in TypeScript.

## Part 1: The Cell Model

**Source:** https://docs.nervos.org/docs/ckb-fundamentals/cell-model

### What I learned

#### 1. Cells are a generalized UTXO
A **Cell** is the atomic piece of state on CKB. Like a Bitcoin UTXO, it carries
value (`capacity` in shannons), but it also carries arbitrary `data` and two
scripts:

- **Lock Script**: answers *"who can spend me?"*
- **Type Script**: answers *"what state transitions am I allowed to take part in?"*

#### 2. Cells are immutable; updates happen via Consumption
You never edit a Cell. To change its data you build a transaction that
**consumes** the existing Live Cell (it becomes Dead) and **creates** a new
Cell with the updated data. This is exactly the pattern modelled in
[chain.ts](../src/week1/cell-model/chain.ts), where `submit()` flips inputs to
`dead` and inserts outputs as `live`.

A Cell can only be consumed once; the chain rejects double-spends because the
referenced OutPoint is no longer Live (see Tx 2 in the demo).

#### 3. Validation = running every Lock + Type Script
On `submit()` the toy chain:

1. resolves all inputs (they must be Live),
2. checks capacity conservation (`sum(inputs) ≥ sum(outputs)`; the difference
   is the miner fee),
3. runs each input's Lock Script,
4. runs each unique Type Script (the "script group" idea),
5. atomically applies the state change.

The real CKB-VM is RISC-V; my replica swaps that for a JS function registry so
the validation *flow* stays honest while the execution is trivially debuggable.

#### 4. First-class assets
Because assets live in user-owned Cells (guarded by the user's Lock Script),
a buggy contract cannot drain them: the contract has no custody. This is the
opposite of the account model, where token balances live inside contract
storage.

#### 5. Flexible fee coverage
Any input can supply the fee; it doesn't have to come from the sender. In the
demo, **Fred** pays the 10-shannon fee for **Alice → Bob** by including one
of his own Live Cells and taking the change back. This is impossible to
express cleanly in an account model.

#### 6. Scalability comes from the structure
- **Off-chain computation, on-chain validation**: clients build the new state;
  nodes only verify scripts return `true`.
- **Parallel script execution**: independent transactions touch disjoint
  OutPoints, so they validate in parallel.
- **Batchable transactions**: many state transitions in one tx amortise
  overhead.

### Replica walkthrough

```
src/week1/cell-model/
├── types.ts     # Cell, Script, OutPoint, Transaction
├── scripts.ts   # Toy "CKB-VM": codeHash → JS predicate registry
├── chain.ts     # Live/Dead bookkeeping + tx validation pipeline
└── demo.ts      # Story: mint, transfer (fee paid by 3rd party),
                 #   reject double-spend, reject GROW_ONLY violation
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

## Part 2: Consensus (NC-Max)

**Source:** https://docs.nervos.org/docs/ckb-fundamentals/consensus

Consensus is how thousands of nodes, exchanging messages over an unreliable
internet, agree on the same history of cells and balances. CKB picks **Proof
of Work** and runs a tuned variant of Bitcoin's Nakamoto Consensus called
**NC-Max**.

### Why PoW (not PoS)

- **Decentralization**: PoW requires ongoing reinvestment in hardware and
  energy, which discourages long-term monopolization. PoS rewards capital that
  is already in the system.
- **Security**: Fewer cryptoeconomic assumptions to get wrong. The model is
  battle-tested by Bitcoin.
- **Fairness**: PoW does not deterministically reward early holders the way
  PoS does, so distribution stays more equitable over time.

### NC-Max: three improvements over vanilla Nakamoto Consensus

1. **Two-step confirmation (propose then commit).** A transaction is first
   *proposed* in a block, then *committed* in a later block. This guarantees
   that the whole network has seen the transaction before it counts, which
   removes the propagation bottleneck that bigger blocks normally cause.
2. **Dynamic block interval.** NC-Max measures how fast blocks are actually
   propagating and adjusts the target block time to keep the orphan rate at a
   target value. Throughput rises when the network is healthy and falls when
   it is not, automatically.
3. **Resistance to selfish mining.** By measuring real network hashpower
   (including orphaned blocks), NC-Max prices selfish-mining strategies out of
   profitability.

### Eaglesong

CKB does not use SHA-256 for PoW. It uses **Eaglesong**, a custom hash
function. The reason is hardware sovereignty: reusing SHA-256 would mean
inheriting Bitcoin's ASIC fleet, any fraction of which could be rented to
attack a smaller chain. A novel hash function forces purpose-built mining
hardware, decoupling CKB's security from Bitcoin's mining market.

### Why this matters for the replica

My toy chain has **no consensus layer at all**: `submit()` accepts a tx
instantly and writes to a single in-memory map. In real CKB the same tx would
have to be (a) relayed, (b) included in a *proposed* block by a miner who
found a valid Eaglesong PoW solution, then (c) committed in a later block.
The Cell Model rules I implemented are exactly the rules every node
re-evaluates when validating those blocks.

## Part 3: CKB Address

**Source:** https://docs.nervos.org/docs/ckb-fundamentals/ckb-address

### Accounts vs. addresses

CKB follows Bitcoin's split, not Ethereum's:

- An **account** is a key pair.
- An **address** is derived from a **Lock Script**.
- One key can produce many addresses by combining with different lock
  scripts (different `code_hash` / `hash_type` / `args`).

This is why `ckb-address` lives in the Fundamentals section right after
the Cell Model: an address *is* an encoded Lock Script. The thing you copy
and paste into a wallet literally tells the network which script will guard
the cell sent to you.

### Anatomy of a Full address

```
payload  = 0x00 || code_hash (32 bytes) || hash_type (1 byte) || args
address  = bech32m(hrp, convertBits(payload, 8 -> 5))
```

- **HRP** (human-readable prefix): `ckb` for mainnet, `ckt` for testnet.
- **Separator**: literal `1`.
- **Data**: payload re-packed from 8-bit groups into 5-bit groups, base32
  encoded with the bech32m alphabet.
- **Checksum**: last 6 characters, BCH code with the bech32m constant
  (`0x2bc830a3`) so single-character typos are detectable.

A prefix of `0x00` on the payload identifies the "Full" format. (CKB used
to have a shorter legacy format too, but Full is the recommended one today.)

### Type hash vs. data hash references

When building a Lock Script, `hash_type` decides *how* the chain locates the
script code on-chain:

- **`type` (upgradable)**: code is referenced via a `Type ID`. The script can
  be upgraded later while preserving the same address. Convenient, but you
  trust the upgrader.
- **`data` (immutable)**: code is referenced by the exact hash of its bytes,
  pinning the address to one specific binary. Safer, but you must change
  address to adopt a new version.

This is the trust knob users get to turn for every address they create.

### Worked example from the docs

```
code_hash : 9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8
hash_type : 01      (= "type")
args      : b39bbc0b3673c7d36450bc14cfcdad2d559c6c64
→ address  : ckb1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdnnw7qkdnnclfkg59uzn8umtfd2kwxceqxwquc4
```

Reading the address back gives you exactly the original three fields, which
is the whole point: addresses are reversible encodings of locks, not random
identifiers.

### How this connects to the Cell Model replica

In [demo.ts](../src/week1/cell-model/demo.ts) I built lock scripts directly:

```ts
const alice = lockFor("alice-secret");  // { codeHash, hashType, args }
```

If I were to encode `alice` with the address scheme above, that hex blob
would collapse into a single `ckb1...` string. Sending CKBytes to Alice
from a wallet means: decode the address → recover the lock script → set it
as the `lock` field of the new output cell. The address is the wire format
for "please attach this lock to my output."

## Open questions to chase next week

- How exactly do **script groups** batch lock/type executions in real CKB?
- What does a `cell_deps` reference look like and why does the VM need it to
  load script code?
- Where does **state rent** show up numerically? What's the minimum capacity
  for a cell of N bytes?
- How does **NervosDAO** use the Cell Model to lock CKBytes for interest?

## Plan for Week 2

Move one layer down to **CKB-VM** and **Script execution**: write a tiny
"assembler" that emits a script binary, then a JS interpreter that runs it
against a transaction context, replacing this week's JS-function registry
with something closer to the real thing.

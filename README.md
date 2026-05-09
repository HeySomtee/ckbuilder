# CKB Learning Journey

A weekly study of [Nervos CKB](https://docs.nervos.org/). Each week pairs a
focused topic with TypeScript code — first as a from-scratch replica that
mirrors the mental model, then as a real interaction with the live network.

## Structure

```
src/
  week1/
    cell-model/      # Generalized UTXO: Cells, OutPoints, Transactions, Scripts
    ckb-address/     # (scaffold) bech32m + address codec
  week2/
    wallet/          # CCC-based testnet CLI wallet
reports/
  week-1.md          # Cell Model + Consensus + Address fundamentals
  week-2.md          # First real testnet transaction
```

## Weekly Index

| Week | Theme | Report | Code |
|------|-------|--------|------|
| 1 | Fundamentals — Cell Model, Consensus, Address | [reports/week-1.md](reports/week-1.md) | [src/week1/cell-model](src/week1/cell-model) |
| 2 | First testnet wallet & transfer (CCC) | [reports/week-2.md](reports/week-2.md) | [src/week2/wallet](src/week2/wallet) |

## Setup

```bash
npm install
```

## Run

### Week 1 — Cell Model demo (in-memory toy chain)

```bash
npm run week1
```

Walks through Genesis → transfer-with-third-party-fee → rejected
double-spend → rejected type-script violation, all against an in-memory
replica.

### Week 2 — Testnet wallet CLI

```bash
# 1a. Generate a new testnet key (one-time)
npm run wallet -- init

# 1b. ...or restore a wallet from an existing private key
npm run wallet -- import 0xabc123...

# 2. Fund the printed address from https://faucet.nervos.org/

# 3. Check balance (yours, or any other address)
npm run wallet -- balance
npm run wallet -- balance ckt1q...

# 4. Send native CKB (minimum 61 due to cell capacity floor)
npm run wallet -- send ckt1q...recipient... 100
```

The wallet runs against the **CKB Pudge testnet**. The private key is stored
locally in `.ckb-wallet.key` (gitignored, mode `0600`) and never leaves disk.
Successful sends print direct links to the [Pudge explorer](https://pudge.explorer.nervos.org/).

## Stack

- **TypeScript** + **ts-node** — no build step for demos.
- **[CCC](https://docs.ckbccc.com/)** (`@ckb-ccc/core`) — the modern,
  recommended TS SDK for CKB. Used from week 2 onward.
- **Zero runtime dependencies** in week 1 — the toy chain is self-contained
  to keep the cell-model logic readable.

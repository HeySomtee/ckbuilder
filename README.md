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
  week3/
    nft-faucet/      # Browser dApp: mint Spore NFTs to any testnet address
  week4/
    nft-dao/         # NFT-gated DAO: proposals + live holder-weighted voting
reports/
  week-1.md          # Cell Model + Consensus + Address fundamentals
  week-2.md          # First real testnet transaction
  week-3.md          # NFT faucet (Spore) — server-paid mint, browser UI
  week-4.md          # NFT-gated DAO, faucet registry, JSON proposal store
```

## Weekly Index

| Week | Theme | Report | Code |
|------|-------|--------|------|
| 1 | Fundamentals — Cell Model, Consensus, Address | [reports/week-1.md](reports/week-1.md) | [src/week1/cell-model](src/week1/cell-model) |
| 2 | First testnet wallet & transfer (CCC) | [reports/week-2.md](reports/week-2.md) | [src/week2/wallet](src/week2/wallet) |
| 3 | NFT faucet dApp — Spore mint + display | [reports/week-3.md](reports/week-3.md) | [src/week3/nft-faucet](src/week3/nft-faucet) |
| 4 | NFT-gated DAO — proposals + live voting | [reports/week-4.md](reports/week-4.md) | [src/week4/nft-dao](src/week4/nft-dao) |

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

### Week 3 — NFT faucet dApp

A minimal browser dApp that mints [Spore](https://docs.spore.pro/) NFTs
(fully on-chain SVG art) to any testnet address you paste in, and lists the
Spores currently held by any address. No wallet connect — the server-side
faucet (the same `.ckb-wallet.key` from week 2) pays cell capacity and fee.

```bash
# Prereq: a funded week-2 wallet (~150 CKB per mint).
npm run wallet -- balance

# Start the faucet — open http://localhost:4000
npm run week3
```

### Week 4 — NFT-gated DAO

The DAO reuses the Week 3 faucet NFTs as membership tokens. The faucet records
minted Spore IDs locally in `src/week3/nft-faucet/data/mints.json`, and the DAO
checks that a voter currently holds one of those faucet-minted NFTs. Anyone can
create proposals, but voting requires a `ckt1...` address with at least one
faucet NFT. Votes are weighted by the number of faucet NFTs held by that
address. Proposal and vote state is stored locally in
`src/week4/nft-dao/data/dao.json`. Proposals include expiration times, and the
server rejects votes after a proposal closes.

Architecture diagram: [reports/assets/week-4-architecture.svg](reports/assets/week-4-architecture.svg).
Editable draw.io source: [reports/assets/week-4-architecture.drawio](reports/assets/week-4-architecture.drawio).

```bash
# Terminal 1: keep the faucet running so users can mint membership NFTs.
npm run week3

# Terminal 2: open http://localhost:4001
npm run week4
```

## Stack

- **TypeScript** + **ts-node** — no build step for demos.
- **[CCC](https://docs.ckbccc.com/)** (`@ckb-ccc/core`) — the modern,
  recommended TS SDK for CKB. Used from week 2 onward.
- **[`@ckb-ccc/spore`](https://github.com/ckb-devrel/ccc/tree/master/packages/spore)** —
  Spore protocol bindings for week 3's NFT mint.
- **Zero runtime dependencies** in week 1 — the toy chain is self-contained
  to keep the cell-model logic readable. Week 3's HTTP server uses only
  Node built-ins (`http`, `fs`, `crypto`) — no Express, no frontend
  framework.

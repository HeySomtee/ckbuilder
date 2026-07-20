# CKB Learning Journey

A weekly study of [Nervos CKB](https://docs.nervos.org/). Each week pairs a
focused topic with TypeScript code — first as a from-scratch replica that
mirrors the mental model, then as a real interaction with the live network.

## Structure

```
src/
  week1/
    cell-model/      # Generalised UTXO: Cells, OutPoints, Transactions, Scripts
    ckb-address/     # (scaffold) bech32m + address codec
  week2/
    wallet/          # CCC-based testnet CLI wallet
  week3/
    nft-faucet/      # Browser dApp: mint Spore NFTs to any testnet address
  week4/
    nft-dao/         # NFT-gated DAO: proposals + live holder-weighted voting
  week5/
    scroll/          # Permanent on-chain microblog: every post is a real CKB cell
products/
  streak/            # Parimutuel prediction-market terminal (weeks 6–9)
reports/
  week-1.md          # Cell Model + Consensus + Address fundamentals
  week-2.md          # First real testnet transaction
  week-3.md          # NFT faucet (Spore) — server-paid mint, browser UI
  week-4.md          # NFT-gated DAO, faucet registry, JSON proposal store
  week-5.md          # CKB Scroll — raw cell storage, no scripts, permanent data
  week-6.md          # Streak Terminal — parimutuel prediction-market engine
  week-7.md          # Streak Terminal — on-chain custody bridge + live oracle
  week-8.md          # Streak Terminal — on-chain settlement receipts (publish · verify · share)
  week-9.md          # Streak Terminal — pluggable oracle (dummy/EPL) + social crews
```

## Weekly Index

| Week | Theme | Report | Code |
|------|-------|--------|------|
| 1 | Fundamentals — Cell Model, Consensus, Address | [reports/week-1.md](reports/week-1.md) | [src/week1/cell-model](src/week1/cell-model) |
| 2 | First testnet wallet & transfer (CCC) | [reports/week-2.md](reports/week-2.md) | [src/week2/wallet](src/week2/wallet) |
| 3 | NFT faucet dApp — Spore mint + display | [reports/week-3.md](reports/week-3.md) | [src/week3/nft-faucet](src/week3/nft-faucet) |
| 4 | NFT-gated DAO — proposals + live voting | [reports/week-4.md](reports/week-4.md) | [src/week4/nft-dao](src/week4/nft-dao) |
| 5 | CKB Scroll — permanent on-chain microblog | [reports/week-5.md](reports/week-5.md) | [src/week5/scroll](src/week5/scroll) |
| 6 | Streak Terminal — parimutuel prediction-market engine | [reports/week-6.md](reports/week-6.md) | [products/streak](products/streak) |
| 7 | Streak Terminal — on-chain custody bridge + live oracle | [reports/week-7.md](reports/week-7.md) | [products/streak](products/streak) |
| 8 | Streak Terminal — on-chain settlement receipts (publish · verify · share) | [reports/week-8.md](reports/week-8.md) | [products/streak](products/streak) |
| 9 | Streak Terminal — pluggable oracle (dummy/EPL) + social crews | [reports/week-9.md](reports/week-9.md) | [products/streak](products/streak) |

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

### Week 5 — CKB Scroll (permanent on-chain microblog)

Every post submitted through the UI creates a real CKB cell on the Pudge
testnet. The cell's `data` field holds the message; its `capacity` locks a
proportional amount of CKBs to pay for storage — permanently. No type script,
no protocol contract, no off-chain database required. The chain is the
persistence layer.

Cost formula: **(61 + data bytes) CKB** per post (~150–300 testnet CKB for a
typical message).

```bash
# Prereq: a funded week-2 wallet (300+ CKB per post recommended).
npm run wallet -- balance

# Start the server — open http://localhost:4002
npm run week5
```

Features:
- Live cost estimate updates as you type
- Posts show a **pending** badge until the transaction is committed (polled every 15 s)
- Every confirmed post links to the [Pudge explorer](https://pudge.explorer.nervos.org/) transaction
- Tip button to send CKB directly to an author's address
- Parchment-toned UI — serif font, aged-paper grain background

**Deploy to Render**: see [render.yaml](render.yaml). Set `CKB_PRIVATE_KEY` as
an environment variable in the Render dashboard — never commit the raw key.

### Weeks 6–9 — Streak Terminal (prediction-market product)

A Polymarket-style parimutuel prediction-market terminal, settled on the Pudge
testnet. Week 6 is the market engine (parimutuel pricing, automatic settlement,
the daily streak game as a tagged bet); week 7 is the on-chain custody bridge
(per-user Pudge wallet, real deposit/withdraw transactions via CCC) and the
live results oracle; week 8 publishes a verifiable on-chain settlement receipt
for every resolved market; week 9 puts the data feed behind a pluggable
provider (swap the World Cup oracle for a built-in simulator or a future EPL
feed) and adds a social layer — crews, head-to-head streaks, co-picks, and a
revive rebate when a crew-mate backs the same match.

```bash
# Start the terminal — open http://localhost:4100
npm run streak

# ...or run it on the built-in simulator (no live feed needed)
MATCH_PROVIDER=dummy npm run streak
```

Sign up (a Pudge wallet is generated automatically), fund the printed address
from the [Pudge faucet](https://faucet.nervos.org/), then **Deposit** to credit
your escrow and start betting. The data feed is selectable: `MATCH_PROVIDER=dummy`
runs a self-contained EPL simulator (matches live at boot), while the default
`worldcup` provider uses the worldcup26.ir oracle when `WC_API_EMAIL` +
`WC_API_PASSWORD` (or `WC_API_TOKEN`) are set, falling back to a deterministic
simulator otherwise. See
[products/streak/README.md](products/streak/README.md) for full configuration.

## Stack

- **TypeScript** + **ts-node** — no build step for demos.
- **[CCC](https://docs.ckbccc.com/)** (`@ckb-ccc/core`) — the modern,
  recommended TS SDK for CKB. Used from week 2 onward.
- **[`@ckb-ccc/spore`](https://github.com/ckb-devrel/ccc/tree/master/packages/spore)** —
  Spore protocol bindings for week 3's NFT mint.
- **Zero runtime dependencies** in week 1 — the toy chain is self-contained
  to keep the cell-model logic readable. Weeks 3–5's HTTP servers use only
  Node built-ins (`http`, `fs`, `crypto`) — no Express, no frontend framework.


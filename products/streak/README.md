# STREAK TERMINAL

> _On-chain parimutuel prediction-market terminal for the FIFA World Cup 2026,
> settled on the **Nervos CKB Pudge testnet**._

Streak is a Polymarket-style prediction market with a Bloomberg-flavoured
terminal UI. Anyone can open a market on a World Cup fixture, anyone can take
any side, and every market settles automatically against the live oracle feed
at full-time. The original daily-pick streak game is preserved as one feature
on top of the new market engine.

The on-chain design is modelled after two CKB references:

- **[calledAdo/asset-up-down-pools](https://github.com/calledAdo/asset-up-down-pools)** — parimutuel BTC up/down pools on CKB. Players stake into
  one of two sides, the pool resolves at `close_time` from an authenticated
  oracle, and winners redeem pro-rata against the losing side. Streak applies
  the same pool model to 3-way match outcomes (Home / Draw / Away).
- **[calledAdo/lean-oracle](https://github.com/calledAdo/lean-oracle)** — Pyth /
  Wormhole price oracle on CKB. Streak's `livescores.ts` plays the equivalent
  role for football results, with the existing `worldcup26.ir` REST feed acting
  as the oracle source.

---

## Quick start

```bash
cd products/streak
npm install
npm start
```

Open <http://localhost:4100>.

Sign up → a Pudge wallet is generated automatically. Fund it from the
[Nervos Pudge faucet](https://faucet.nervos.org/) (address is on the **Wallet**
page), then **Deposit** to credit your platform escrow and start betting.

---

## How the market engine works (parimutuel)

```
implied_prob[o]  = pools[o] / total_pool
decimal_odds[o]  = total_pool / pools[o]
```

When a match finalises, the winning outcome takes the whole losing pool minus
fees:

```
loserPool      = sum(pools[o] for o != winner)
protocolFee    = loserPool * 2.00%          → treasury
creatorFee     = loserPool * 1.00%          → market creator
distributable  = loserPool - protocolFee - creatorFee

payout(winning bet)  = stake + distributable * stake / winnerPool
payout(losing bet)   = 0
```

A market **voids** (and refunds every bet) if no one took the winning side.

### Market lifecycle

| Status     | Trigger                                                        |
| ---------- | -------------------------------------------------------------- |
| `open`     | Created (on first bet, or auto-seeded as `creator="system"`)   |
| `closed`   | Kickoff reached — bets rejected, awaiting result               |
| `resolved` | Match `final` from oracle → payouts credited to winner escrow  |
| `void`     | No bet on the winning side, or no result available             |

The first user to bet on an auto-seeded market becomes its **creator** and
earns the 1% creator fee at resolution. If no human creator exists, the fee
accrues to the protocol pot instead.

### Custody (deposit / withdraw on-chain, bets virtual)

Bets are virtual ledger ops against a per-user **escrow balance**, but every
CKB on the platform corresponds to a real on-chain Pudge transaction:

- **Deposit** = real Pudge tx `wallet → treasury`, credits escrow.
- **Bet / claim** = fast virtual ops against escrow.
- **Withdraw** = real Pudge tx `treasury → wallet`, debits escrow.
- **Streak revive** = real Pudge tx `wallet → treasury` (63 CKB).

This mirrors how Polymarket actually works (USDC into a custodial smart
account) and keeps betting snappy without paying a cell-floor on every micro
stake. Minimum on-chain transfer is **100 CKB** (cell floor + fee headroom);
minimum single bet against escrow is **10 CKB**.

---

## The streak game (a layer on top)

A **streak pick** is just a regular bet with `isStreakPick: true`. You can lock
exactly one tagged bet per UTC day.

| Outcome   | Effect on streak                                                |
| --------- | --------------------------------------------------------------- |
| ✅ Won    | `streak += 1` (best high-water mark updates)                    |
| ❌ Lost   | streak enters **failed** state, frozen at its value             |
| ⚪ Void   | streak unchanged, today's pick slot is freed                    |

A failed streak must be resolved before the next pick:

- **Revive** → pay **63 CKB** from your wallet to the treasury (real Pudge tx)
  and keep your streak value.
- **Reset** → wipe to zero. No payment. Best streak is preserved.

---

## Architecture

```
Browser (vanilla SPA)                       Node http server (no framework)
  index.html / styles.css                     src/server.ts    — routing, static, sessions
  app.js   — router, views, charts    ⇄ JSON  src/markets.ts   — parimutuel engine
                                              src/game.ts      — match sync, streak revival
                                              src/wallet.ts    — deposit / withdraw
                                              src/matches.ts   — applyResult (oracle ↔ simulator)
                                              src/livescores.ts — worldcup26.ir client (oracle role)
                                              src/wcdata.ts    — real WC2026 fixture loader
                                              src/auth.ts      — scrypt + session tokens
                                              src/chain.ts     — CCC: wallets, balances, transfers
                                              src/store.ts     — atomic JSON store (data/db.json)
                                                      │
                                              CKB Pudge testnet (CCC public RPC)
```

- **No build step to run** — `ts-node` executes the TypeScript directly.
- **No external services** — state lives in `data/db.json` (git-ignored).
- **Inline SVG charts** — no chart library; the implied-probability lines and
  sparklines are rendered as `<svg><polyline>` directly in `app.js`.

---

## UI / design language

Strict financial-terminal aesthetic. Solid graphite surfaces, 1px hairline
borders, IBM Plex Mono numerals, restrained two-tone accents (green / red for
P&L, amber for highlights and odds, soft blue for draw / neutral data). No
gradient walls, no neon glow, no scanlines, no grain.

Layout:

- **Top status bar** — brand, network, live-oracle indicator, balance, streak,
  clock.
- **Ticker tape** — live marquee of the most recent platform bets.
- **Left rail** — Overview · Markets · Schedule · Portfolio · Streak · Wallet ·
  Leaderboard.
- **Main pane** — page content.
- **Footer bar** — aggregate pool size and market state counts.

Pages: `Overview`, `Markets` (sortable table with price-cells and sparklines),
`Market detail` (large implied-prob chart, order-book-style bet feed, place-bet
panel, pool composition), `Schedule`, `Streak`, `Portfolio`, `Wallet`,
`Leaderboard`.

---

## Live WC2026 data (worldcup26.ir)

Real fixtures (teams, matches, stadiums) ship vendored in `src/data/` from the
open-source [rezarahiminia/worldcup2026](https://github.com/rezarahiminia/worldcup2026)
dataset (ISC). To enable **live in-play scores and final results** (the oracle
that resolves markets), set either:

| Env                                  | Notes                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| `WC_API_TOKEN`                       | Paste an existing JWT. Skips bootstrap.                               |
| `WC_API_EMAIL` + `WC_API_PASSWORD`   | Server auto-registers, logs in, caches the JWT in `data/db.json`.     |
| `WC_API_NAME`                        | Display name used during auto-registration (default `Streak Terminal`).|
| `WC_API_BASE`                        | Override the API base URL (default `https://worldcup26.ir`).          |

With nothing configured the game falls back to a deterministic simulated result
keyed by match id (`src/matches.ts`), so markets still settle consistently.

Inspect the live-scores wiring at runtime:

```bash
curl http://localhost:4100/api/status
```

---

## API surface

```
POST /api/signup                 → create user + Pudge wallet
POST /api/login                  → start session
POST /api/logout
GET  /api/me                     → current user (public view)
GET  /api/dashboard              → one-shot terminal payload (user, headline,
                                   counts, leaderboard top, tape)
GET  /api/markets[?status=open]  → market list
GET  /api/markets/:id            → market detail (chart, feed, my positions)
POST /api/markets/:id/bet        → { outcome, amountCkb, asStreakPick? }
GET  /api/portfolio              → all my positions + open stake + realised P&L
GET  /api/wallet                 → on-chain + escrow balances, recent ledger
POST /api/wallet/deposit         → { amountCkb }   real Pudge tx wallet→treasury
POST /api/wallet/withdraw        → { amountCkb }   real Pudge tx treasury→wallet
POST /api/renew                  → revive a failed streak (on-chain fee)
POST /api/reset                  → abandon a failed streak (zero, free)
GET  /api/leaderboard            → top 100 by realised P&L
GET  /api/matches                → full WC2026 schedule
GET  /api/status                 → live-oracle status + economic constants
```

---

## Security model (read before reusing)

This is a **custodial testnet** design: each user's private key is generated
server-side and stored in `data/db.json` so the terminal can sign deposit,
withdraw, and revival transactions on the user's behalf (one-tap UX). This is
acceptable because Pudge testnet coins have **no monetary value**.

**Do not reuse this pattern on mainnet.** For real funds, hand the key to the
user or integrate a non-custodial wallet connector (e.g. CCC's signer /
connectors) so the server never holds keys.

---

## Configuration

All economic constants live in [src/config.ts](src/config.ts):

| Constant            | Default | Purpose                                          |
| ------------------- | ------- | ------------------------------------------------ |
| `MIN_BET_CKB`       | 10      | Smallest single bet against escrow               |
| `MAX_BET_CKB`       | 100000  | Sanity cap on a single bet                       |
| `MIN_ONCHAIN_CKB`   | 100     | Cell-floor minimum for on-chain deposit/withdraw |
| `PROTOCOL_FEE_BPS`  | 200     | 2.00% of loser pool → protocol treasury          |
| `CREATOR_FEE_BPS`   | 100     | 1.00% of loser pool → market creator             |
| `RENEW_FEE_CKB`     | 63      | Streak revival fee (real on-chain)               |
| `SETTLE_INTERVAL_MS`| 20000   | Background slate-refresh / settlement cadence    |
| `MARKET_HISTORY_CAP`| 480     | Max implied-prob ticks retained per market       |

Environment variables (all optional):

| Var    | Default | Purpose   |
| ------ | ------- | --------- |
| `PORT` | `4100`  | HTTP port |
| `WC_API_TOKEN` / `WC_API_EMAIL` + `WC_API_PASSWORD` | — | Enable live oracle. |
| `WC_API_BASE` | `https://worldcup26.ir` | Override oracle base URL. |
| `WC_API_NAME` | `Streak Terminal` | Display name during auto-registration. |

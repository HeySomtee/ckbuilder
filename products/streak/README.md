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
[Nervos Pudge faucet](https://faucet.nervos.org/) (address is on the **Account**
page), then **Deposit** to credit your platform escrow and start betting.

Independently verify any settled market:

```bash
npm run verify -- m-wc-6            # against local http://localhost:4100
STREAK_BASE=https://your.host npm run verify -- m-wc-6
```

---

## Notifications (Telegram)

Streak supports pluggable notification providers. To enable Telegram
notifications set environment variables in `products/streak/.env` or your
process environment:

```
NOTIFY_PROVIDER=telegram
TELEGRAM_BOT_TOKEN=<your-bot-token>
TELEGRAM_CHAT_ID=<numeric-chat-id-or-@username>
```

When configured the server will post short messages for streak picks, published
receipts and revive rebates. Use `NOTIFY_PROVIDER=telegram npm start` to run.

Users can connect Telegram from the Account page with one click (no manual chat
id copy/paste):

- App creates a short-lived deep link token.
- User opens Telegram and taps **Start** on the bot.
- Webhook links `chat.id` to the signed-in user automatically.

You can also set your personal Telegram chat id from the app (Settings) or via
API to receive direct messages. POST `/api/me/notify` with JSON `{ "telegramChatId": "@you_or_numeric_id" }`.

---

## Optional: Supabase-backed persistence

Streak supports using Supabase as the primary store instead of the local
`data/db.json`. To enable, create a table (suggested schema) and set the
environment variables below. When Supabase is configured the app will upsert
the entire state into a single row — the existing file store remains as a
fallback when Supabase is unavailable.

Required `.env` variables:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=eyJ...your-service-role-or-anon-key
SUPABASE_DB_URL=postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
SUPABASE_TABLE=streak_state   # optional (default: streak_state)
SUPABASE_ROW_ID=singleton     # optional (default: singleton)
```

Table layout (example SQL):

```sql
create table streak_state (
  id text primary key,
  data jsonb
);
```

If `SUPABASE_DB_URL` is set, Streak now auto-creates this table on startup
(`create table if not exists ...`).

With Supabase enabled the following env vars are relevant for notifications
and providers as well: `NOTIFY_PROVIDER`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `MATCH_PROVIDER`.

For one-tap Telegram connect flow add:

```
TELEGRAM_BOT_USERNAME=your_bot_username_without_@
TELEGRAM_WEBHOOK_SECRET=long-random-secret
APP_PUBLIC_URL=https://your-public-app-url
```

`APP_PUBLIC_URL` must be reachable by Telegram (public HTTPS). On boot, Streak
will attempt to call Telegram `setWebhook` automatically.


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
  index.html / styles.css                     src/server.ts      — routing, static, sessions
  app.js   — router, views, charts    ⇄ JSON  src/markets.ts     — parimutuel engine
                                              src/game.ts        — match sync, streak revival
                                              src/wallet.ts      — deposit / withdraw
                                              src/settlement.ts  — on-chain receipt cells (publish/verify/merkle)
                                              src/matches.ts     — applyResult (oracle ↔ simulator)
                                              src/livescores.ts  — worldcup26.ir client (oracle role)
                                              src/wcdata.ts      — real WC2026 fixture loader
                                              src/auth.ts        — scrypt + session tokens
                                              src/chain.ts       — CCC: wallets, balances, transfers
                                              src/store.ts       — atomic JSON store (data/db.json)
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
- **Left rail** — Overview · Markets · Schedule · Receipts · Portfolio · Streak
  · Account · Leaderboard.
- **Main pane** — page content.
- **Footer bar** — aggregate pool size and market state counts.

Pages: `Overview`, `Markets` (sortable table with price-cells and sparklines),
`Market detail` (large implied-prob chart, order-book-style bet feed, place-bet
panel, pool composition, **on-chain settlement panel with share links**),
`Schedule`, `Streak`, `Portfolio`, `Account` (`#/wallet`), `Leaderboard`, `Receipts`
(chronological wall of every published settlement receipt), and a public,
unauthenticated `#/receipt/:marketId` page for sharing individual results.

---

## On-chain settlement receipts

Every resolved market publishes a **receipt cell** on Pudge so anyone — with no
account, no server access, no trust in this codebase — can verify a settlement
independently.

### Design

To keep testnet costs low the on-chain cell only holds a compact fingerprint;
the full receipt payload lives off-chain and is served by the API.

```
┌─── Off-chain (this DB / API) ───────────────────────────────────────┐
│ SettlementReceipt payload (canonical UTF-8 JSON)                    │
│ → served at /api/receipts/:marketId                                 │
└────────────────────┬────────────────────────────────────────────────┘
                     │ sha256(canonical bytes)
                     ▼
┌─── On-chain (Pudge cell) ───────────────────────────────────────────┐
│ Lock:  treasury (only the treasury key can publish)                 │
│ Type:  none                                                         │
│ Data:  magic "STKR" (4) | version (1) | sha256 (32) = 37 bytes      │
│ Cap :  100 CKB  (min ~98; = 8 + 53 lock + 37 data)                  │
└─────────────────────────────────────────────────────────────────────┘
```

A **merkle root over every bet** is embedded in the payload so a bettor can
produce an inclusion proof for their own bet. Leaves are ordered by `placedAt`
and hashed as `sha256({betId, userHash, outcome, amountShannons})`, where
`userHash = sha256(userId + ":" + marketId)` — identity doesn't leak across
markets while a user can still prove ownership of their own leaves inside a
single market.

### Verifying, three ways

1. **In the app** — the Market Detail page shows a green "✓ VERIFIED ON-CHAIN"
   chip when the on-chain cell exists and its hash matches. Click **Public
   receipt ›** for a shareable page (`#/receipt/:marketId`) that works without
   signing in.
2. **Via API** — `GET /api/receipts/:marketId` performs a fresh Pudge RPC
   round-trip and returns `{onChain: {ok, onChainPayloadHash, ...}}`.
3. **Standalone CLI** — `npm run verify -- <marketId>` doesn't touch the
   server internals at all. It fetches the payload from the HTTP API,
   canonicalises + sha256s it, rebuilds the merkle root over the bet set, and
   queries public CKB RPC directly to compare the on-chain hash + treasury
   lock:

   ```
   $ npm run verify -- m-wc-6
   Streak receipt verifier
     market         m-wc-6
     api base       http://localhost:4100
   1. payload
     ✓ sha256(payload) matches server: 0xcd5fb6a3c82637c7…
   2. merkle root
     ✓ merkle root over live bet set matches payload
   3. on-chain cell
     magic          STKR
     version        1
     ✓ on-chain hash matches computed payload hash
   ✓ verified — this receipt is authentically pinned on Pudge
   ```

   Point the CLI at a remote instance with `STREAK_BASE=https://…` or
   `--base https://…`.

Every published receipt shows up in the **Receipts** gallery in the left rail
(and at `#/receipts`):

![Receipts gallery](../../reports/assets/week-8-gallery.png)

And each one has an unauthenticated shareable page at
`#/receipt/:marketId` — designed to be pasted into a group chat:

![Public receipt page](../../reports/assets/week-8-public-receipt.png)

### Treasury funding

Each receipt cell locks up ~100 CKB of capacity. In practice this means the
treasury wallet has to be pre-funded — set `TREASURY_PRIVATE_KEY` in `.env` to
reuse a wallet you've already funded from the [Pudge faucet][faucet], or leave
it blank and fund the address printed at boot. If the treasury runs low, the
engine keeps the receipt in a `PENDING` state and retries silently until it can
pay, logging a nudge once per hour.

[faucet]: https://faucet.nervos.org/

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

## Match-data providers (pluggable feed)

Fixtures + results come through a single seam, `MatchDataProvider`
([src/providers/types.ts](src/providers/types.ts)). Pick one with
`MATCH_PROVIDER`; nothing in the engine changes when you swap feeds.

| `MATCH_PROVIDER` | Feed                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| `worldcup` (default) | Real WC2026 fixtures + the worldcup26.ir oracle above.           |
| `dummy`          | A self-contained simulator: 20 Premier League clubs, round-robin gameweeks, matches that kick off / run / finish on a real clock. |

The `dummy` provider exists so the full lifecycle (open → live → resolved →
on-chain receipt) stays testable after the World Cup ends, and doubles as the
template for the next real feed — when the Premier League resumes, drop in an
`eplProvider` implementing the same interface and register it in
[src/providers/index.ts](src/providers/index.ts).

```bash
MATCH_PROVIDER=dummy npm run streak    # simulated EPL fixtures, live now
```

The simulator anchors its schedule to a persisted timestamp
(`dummyAnchorIso`) so kickoff times survive restarts, and auto-rolls to a fresh
anchor once the whole schedule has finished. Tunables:
`DUMMY_GAMEWEEKS` (30), `DUMMY_STAGGER_MIN` (20), `DUMMY_MATCH_MINUTES` (96),
`DUMMY_ANCHOR` (pin the anchor explicitly).

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
GET  /api/crews                  → my crews (H2H streaks, co-picks, feed)
POST /api/crews                  → { name }        create a crew
POST /api/crews/join             → { code }        join by invite code
POST /api/crews/:id/leave        → leave (ownership hands over / crew deleted)
GET  /api/leaderboard            → top 100 by realised P&L
GET  /api/matches                → full fixture schedule (active provider)
GET  /api/status                 → live-oracle status + economic constants
GET  /api/receipts               → every published settlement receipt (public)
GET  /api/receipts/:id           → full payload + fresh on-chain verification
GET  /api/receipts/:id/proof     → merkle inclusion proof(s) for ?bet= or ?mine=1
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
| `CREW_REVIVE_REBATE_CKB` | 20 | Escrow rebate per crew-mate who co-picked the revived match (cap 40) |
| `SETTLE_INTERVAL_MS`| 20000   | Background slate-refresh / settlement cadence    |
| `MARKET_HISTORY_CAP`| 480     | Max implied-prob ticks retained per market       |

Environment variables (all optional):

| Var    | Default | Purpose   |
| ------ | ------- | --------- |
| `PORT` | `4100`  | HTTP port |
| `MATCH_PROVIDER` | `worldcup` | Active fixture/result feed (`worldcup` or `dummy`). |
| `DUMMY_GAMEWEEKS` / `DUMMY_STAGGER_MIN` / `DUMMY_MATCH_MINUTES` / `DUMMY_ANCHOR` | `30` / `20` / `96` / *now−2h* | Shape the simulated schedule (dummy provider). |
| `WC_API_TOKEN` / `WC_API_EMAIL` + `WC_API_PASSWORD` | — | Enable live oracle. |
| `WC_API_BASE` | `https://worldcup26.ir` | Override oracle base URL. |
| `WC_API_NAME` | `Streak Terminal` | Display name during auto-registration. |
| `TREASURY_PRIVATE_KEY` | *auto-generated* | Reuse a funded Pudge wallet as the treasury (needed to publish on-chain settlement receipts). |

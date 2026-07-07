# Week 6: Streak Terminal — A Parimutuel Prediction Market

Weeks 1-5 built up the CKB primitives one at a time: addresses, wallet
transfers, Spore NFT minting, NFT-gated governance, and raw on-chain storage.
Week 6 puts those primitives to work inside a real product. **Streak** is a
Polymarket-style prediction-market terminal for the FIFA World Cup 2026,
settled on the Nervos CKB Pudge testnet.

This report covers the **market engine** — the pricing, betting, and settlement
core. Week 7 covers the on-chain custody bridge and the live oracle that feeds
it.

**Code:** [products/streak](../products/streak)
**Run:** `npm run streak` → [http://localhost:4100](http://localhost:4100)

## Goal of the week

Build a self-contained prediction market where:

1. Every WC2026 fixture has one canonical market with three outcomes
   (Home / Draw / Away).
2. Anyone can take any side; prices move as money flows into each pool.
3. Markets close automatically at kickoff and settle automatically at
   full-time.
4. Winners split the losing pool pro-rata after fees, with principal returned.
5. The original daily-pick streak game is preserved — but now as a *tagged bet*
   on top of the same engine, not a separate system.

The design is modelled on two CKB reference projects:

- **calledAdo/asset-up-down-pools** — parimutuel BTC up/down pools on CKB.
  Players stake into one of two sides; the pool resolves at `close_time` from an
  authenticated oracle; winners redeem pro-rata against the losing side. Streak
  applies the same pool model to 3-way match outcomes.
- **calledAdo/lean-oracle** — a Pyth/Wormhole price oracle on CKB. Streak's live
  scores client plays the equivalent role for football results (covered in
  Week 7).

## Parimutuel pricing

There is no order book and no market maker. Money pooled on each outcome *is*
the price. Implied probability and decimal odds fall straight out of the pool
balances:

$$
\text{impliedProb}[o] = \frac{\text{pools}[o]}{\text{total}}
\qquad
\text{decimalOdds}[o] = \frac{\text{total}}{\text{pools}[o]}
$$

Because there is no counterparty to quote against, a bettor's "price" is simply
the implied probability of their chosen outcome *at the instant they bet*. The
engine snapshots that value (`priceAtBet`) before the stake is added to the
pool, so the number shown to the user is the number they actually accepted. See
[products/streak/src/markets.ts](../products/streak/src/markets.ts#L64).

Every bet also pushes a `PriceTick` (`{ t, p }`) onto the market's history.
That history is what the UI renders as the implied-probability line chart and
the sparklines in the markets table. History is capped at `MARKET_HISTORY_CAP`
(480 ticks) and downsampled — old ticks are thinned by dropping every other one
— so a hot market never grows the JSON store without bound.

## Settlement math

When a match goes final, the winning outcome's pool takes the entire losing
pool, minus two fees, and pays it out in proportion to stake:

$$
\text{loserPool} = \sum_{o \neq w} \text{pools}[o]
$$

$$
\text{protocolFee} = \text{loserPool} \cdot \frac{200}{10000}
\qquad
\text{creatorFee} = \text{loserPool} \cdot \frac{100}{10000}
$$

$$
\text{distributable} = \text{loserPool} - \text{protocolFee} - \text{creatorFee}
$$

$$
\text{payout}(\text{bet}) = \text{stake} + \text{distributable} \cdot
\frac{\text{stake}}{\text{winnerPool}}
$$

Losing bets pay zero. The 2% protocol fee accrues to the treasury; the 1%
creator fee goes to whoever created the market (the first person to bet on an
auto-seeded fixture becomes the creator). If the creator is the `system`
account, that fee rolls into the protocol pot instead.

An important edge case: if **nobody** backed the winning outcome, there is no
one to pay, so the market **voids** and every bet is refunded. This is the
`winnerPool === 0n` branch in `settleMarkets()`; a voided streak pick leaves the
streak untouched and frees today's pick slot. See
[products/streak/src/markets.ts](../products/streak/src/markets.ts#L129).

## Market lifecycle

Markets move through four states, driven by the match status rather than by any
manual action:

| Status     | Trigger                                                        |
| ---------- | ------------------------------------------------------------- |
| `open`     | Created on first bet, or auto-seeded with `creator="system"`  |
| `closed`   | Kickoff reached — bets rejected, awaiting result              |
| `resolved` | Match `final` from the oracle → payouts credited              |
| `void`     | No bet on the winning side (or no result) → all bets refunded |

`ensureMarketsForMatches()` guarantees a market row exists for every fixture in
the schedule, so the whole tournament is tradable from boot.
`syncStatuses()` transitions `open → closed` the instant kickoff passes.
`settleMarkets()` walks every unsettled market whose match has finalised and
does the payout in one pass. All three run inside the background settlement loop
described in Week 7.

## The streak game as a tagged bet

The headline realisation of this week is that the entire Week-5-era "daily
streak" game collapses into a single boolean on a normal bet. A streak pick is
just a `Bet` with `isStreakPick: true`, subject to two extra rules enforced at
placement time:

- You can lock **exactly one** tagged bet per UTC day (`lastPickDate`).
- You cannot tag a pick while your streak is in a `failed` state.

Settlement then reuses the same win/lose path, with two hooks:

- **Won** → `streak.current += 1`, `best` high-water mark updates.
- **Lost** → streak enters `failed`, frozen at its value until the user renews
  (an on-chain fee, Week 7) or resets (free).

No parallel data model, no separate settlement code. The streak game is a *view*
over the market engine. See
[products/streak/src/markets.ts](../products/streak/src/markets.ts#L253) and
the streak hooks in [products/streak/src/game.ts](../products/streak/src/game.ts).

## Money representation

Every amount in the store is a **decimal string of shannons**, not a JavaScript
number. CKB uses $1\,\text{CKB} = 10^8\,\text{shannons}$, and pool totals can
easily exceed JavaScript's 53-bit safe-integer limit. The engine converts to
`bigint` at every seam via the `asBig` / `asString` helpers and only converts
back to a human CKB string at the view-model boundary. This is the single most
important correctness decision in the whole product — getting it wrong would
silently corrupt payouts. See the type notes in
[products/streak/src/types.ts](../products/streak/src/types.ts).

## Configuration

All economic constants live in one file,
[products/streak/src/config.ts](../products/streak/src/config.ts):

| Constant             | Default | Purpose                             |
| -------------------- | ------- | ----------------------------------- |
| `MIN_BET_CKB`        | 10      | Smallest single bet against escrow  |
| `MAX_BET_CKB`        | 100000  | Sanity cap on a single bet          |
| `PROTOCOL_FEE_BPS`   | 200     | 2.00% of loser pool → treasury      |
| `CREATOR_FEE_BPS`    | 100     | 1.00% of loser pool → creator       |
| `SETTLE_INTERVAL_MS` | 20000   | Background settlement cadence       |
| `MARKET_HISTORY_CAP` | 480     | Max implied-prob ticks per market   |

## What this week proved

- A parimutuel market is genuinely simple: the pool balances are the price, and
  settlement is one proportional division. No matching engine, no liquidity
  provider, no oracle-signed price feed *on-chain* — just arithmetic over pools.
- Layering a "game" on top of a market engine as a tagged record is far cleaner
  than maintaining two systems. The streak feature added one boolean and two
  settlement hooks.
- Representing money as bigint shannons behind decimal-string storage is
  non-negotiable once real capacity values are involved.

## What's next (Week 7)

The market engine here is entirely virtual — bets debit and credit an in-memory
escrow balance. Week 7 wires that escrow to the **actual chain**: a custodial
Pudge wallet per user, real deposit/withdraw transactions through CCC, and the
live worldcup26.ir oracle that decides which outcome actually won.

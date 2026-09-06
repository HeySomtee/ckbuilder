# Performance and responsiveness

Page reads use committed local snapshots. They no longer fetch results, warm
analytics, settle markets or write the database before responding. A coalesced
20-second background loop does that work; optional analytics warming runs
independently so it cannot delay market settlement. Read models close betting
at kickoff even when the oracle is slow, and bet placement rechecks the clock.

Chain balances, provider health, analytics and receipt checks share in-flight
requests and retain their last successful values. Dashboard and wallet reads
return immediately; `/api/wallet/balance` refreshes the displayed chain balance.
Receipt pages return the local signed payload before their separate
`?verify=1` check completes. Optional balance/receipt waits stop after eight
seconds. Payment verification still requires a live, committed transaction.

Static assets use gzip, cached file buffers and conditional ETags. JSON payloads
larger than 2 KB are compressed. Startup establishes database and treasury
identity before listening; oracle and notification services initialize in the
background.

`npm run test:backend` exercises the HTTP server against a temporary database
with deliberately blocked remote services. A local Windows run returned the
dashboard in 38 ms on its first request, markets in 4 ms, market detail in 3 ms,
and portfolio, crews, matches, status, wallet and profile in 2 ms each. These
are isolated regression measurements, not deployed latency guarantees. The
suite also checks gzip/304 handling, coalesced refreshes, cutoff enforcement,
and concurrent payment operations. No real balances or provider accounts are
used.

## Browser and storage

The browser's 8-second, 80-entry read cache shares concurrent requests and
invalidates across mutations and session changes. Navigation mounts its view
immediately; late responses cannot paint over a newer route. Polling waits for
completion, skips hidden tabs and updates live market fields without replacing
the selected side, stake input or focused element. Wallet, analytics and receipt
data hydrate separately from the core page. No external font or wallet script
is required for the first screen.

Persistence coalesces concurrent reads and uses immutable committed snapshots.
Mutations operate on private drafts; unchanged drafts cause no write. Reusable
market/user/bet indexes avoid repeated full-array scans. A synthetic settlement
comparison against the previous implementation (500 markets, 2,000 users,
20,000 bets; median of five runs) measured **203.13 ms → 12.26 ms**, with identical
user balances, bet payouts, fees and market outcomes. This is an in-memory engine
benchmark, not a claim about deployed page load time.

## Running checks

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

The browser suite launches an isolated real HTTP server with synthetic users,
fixtures and receipts. It checks every main route, mobile overflow, live form
preservation, a confirmed test bet, stale navigation and public receipts.
External requests are blocked; it never uses the live database or signs a real
transaction. Screenshots are written to ignored `data/qa/` by default. Set
`STREAK_SCREENSHOTS` to change the output directory. To use an installed Chrome
or Edge instead of downloading Chromium, set `STREAK_BROWSER_PATH` to its
executable path before running `npm run test:browser`.

## Withdrawal recovery

Withdrawals reserve escrow durably before chain work, preventing concurrent
bets or cash-outs from spending the same funds. A failed preparation restores
the reservation. Signed transaction bytes and their hash are persisted before
broadcast; after a restart, the exact transaction can be retried safely.
Unsent reservations without a hash are restored at startup and by periodic
recovery once their originating request has ended. Background
reconciliation marks pending withdrawals submitted once committed on-chain.

A rejected transaction or an unavailable chain does not prove that another
node never accepted a broadcast. These withdrawals remain pending, with funds
reserved. An operator must investigate permanently rejected transactions using
the stored hash before changing their reservation; never refund a potentially
committed spend. The store and startup recovery retain the application's
existing single-server assumption.

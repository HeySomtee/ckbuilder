# Five deadline and short rehearsal, 24 October 2026

The owner approved the official FPL deadline for both picks and sponsorship bids,
retained existing polling intervals, and authorized the deadline correction,
short isolated rehearsal and release to main for Render.

## Deadline

Automatic catalogues require exactly one matching official FPL event and a valid
string deadline before the earliest fixture kickoff. Missing, duplicate or invalid
event data cannot open a round using an invented one-minute cutoff. The official
timestamp is retained rather than recomputing a fixed offset. Existing published
rounds retain their terms. Squad/captain saves and signed bid admission use the
same database-time `lockAt`. Confirmation grace cannot admit a new bid or top-up.

## Interactive rehearsal

The local rehearsal runs the actual funding, scoring and rewards services against
a disposable PostgreSQL schema and an owned local CKB chain. Public dummy keys,
demo players and test-only time advancement are explicit. It does not connect
MetaMask, read live keys, contact FPL, change real gameweeks or send public-testnet
payments. Each run starts fresh. The rewards wallet and records in the ordinary
local app remain separate.

After building the product and starting the disposable PostgreSQL container from
the [quality guide](quality.md), run from the repository root:

```powershell
$env:PG_TEST_URL = 'postgresql://postgres:streak-ci-local@127.0.0.1:55432/streak_test'
node products/streak/scripts/five-devnet-run.cjs --rehearsal
```

Open `http://127.0.0.1:4190`. Six buttons walk through Alice's bid, Bob's competing
bid, Alice's top-up, deadline locking and automatic refund, synthetic scores and
finalization, then prize collection. Signed transaction hashes and confirmed
returns appear on the page. Each payment receives 24 local confirmations.
Closing advances only a test storage clock, not published terms or the system
clock. Stop with Ctrl+C; the launcher stops its node and the runner removes its
random schema on normal shutdown. A forced shutdown may leave a test schema for
later cleanup, but cannot overwrite live records. Ports 8218/8219 and 4190 must
be free; never stop a different node to make room.

`--rehearsal-check` drives all six controls in Chromium at phone width, checks
exact refund/prize amounts, verifies both late-pick and late-bid rejection and
simulates an expired worker heartbeat before collection. Recovery restarts the
rewards object after durable signing and before broadcast. This check joins the
required contract lane. The interactive page is a test tool, not a hosted
administrative backdoor or evidence of a physical wallet approval.

24 October verification: official-deadline regressions and the six-step Chromium
rehearsal passed locally, including the expired-heartbeat collection case. A
Windows-to-WSL readiness race on an intermediate run was corrected with a bounded
read-only readiness probe. Independent source review accepted the deadline and
rehearsal changes with no remaining scoped blocker. Evidence is in
`.quality-artifacts/five-rehearsal-check.log` and
`.quality-artifacts/five-rehearsal/completed-mobile.png`. The exact-candidate
commit gate subsequently passed all 68 checks at **21:04:44 UTC on 24 October**
(22:04:44 Africa/Lagos). Runtime commit `74ee5e3` was pushed to main, reusing the
successful exact-tree hook receipt. Evidence: `.quality-artifacts/all.json`,
`.quality-artifacts/five-release-commit.log` and the matching receipt under
`.quality-artifacts/hook-receipts/`. No required suite was skipped.

## Render setup

The source blueprint now lists the Five settings. Existing manually configured
services still need dashboard updates. Keep the build command
`npm ci --include=dev && npm --prefix products/streak run build` and start command
`node products/streak/scripts/direct-host.cjs`.

```text
STREAK_FIVE_FPL_ENABLED=1
STREAK_FIVE_NETWORK=testnet
STREAK_FIVE_ADMIN_WALLETS=<full connected ckt1 address>
STREAK_SURVIVOR_ADMIN_WALLETS=<full connected ckt1 address>
STREAK_FIVE_REWARDS_ENABLED=1
STREAK_FIVE_REWARDS_ADDRESS=<dedicated hosted rewards address>
STREAK_FIVE_REWARDS_PRIVATE_KEY=<matching dedicated private key>
APP_PUBLIC_URL=https://streak-terminal.onrender.com
```

Existing `DATABASE_URL` supplies durable Five state to both API and worker.
Separate Five/Survivor database variables are optional and must resolve to the
same selected database in both processes. Do not point a hosted signer at a
different database while reusing the active local rewards wallet. Prefer a fresh
hosted rewards wallet with its own funded operating reserve; faucet funds do not
count as a sponsored pool. Never paste its key in chat or commit it.

The owner chose to enter Render settings manually. Source changes and successful
local gates are published; hosted configuration and deployment verification remain
separate. The new dedicated hosted rewards address is:

```text
ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsq2ranlf7f3ly428h0jwhe4ajfycjfc8pggcd7san
```

Its 10,000 tCKB faucet operating reserve was independently verified after 28
canonical confirmations, transaction
`0x6179fe69a865dfa26daf54934945bcb9c862a5076fa5f798e9ab4b58379a0f14`.
This was an authorized public-testnet operational action, not a synthetic test
or a sponsored prize. The key is in the owner's protected ignored
`.quality-artifacts/five-hosted-private/rewards.key`, paired with that address.
It was not printed, committed or loaded into tests. The dashboard-ready settings
guide is `.quality-artifacts/five-render-settings.txt`.

A fresh rehearsal was started at its first step after release verification;
the ordinary local API was reloaded with its original records. A real completed
auction and physical-wallet prize/refund acceptance remain separate from the
disposable-chain rehearsal. No hosted rewards activation is claimed.

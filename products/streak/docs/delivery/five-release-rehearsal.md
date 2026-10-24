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
commit gate still runs the complete suite before publication; its result is not
implied by these focused checks.

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

The Render integration was discovered but was not connected when preparation
began. Source changes, successful local gates, Git publication and actual Render
activation are distinct milestones. Check the current work tracker and final
release report for the observed result, rather than treating this setup guide as
proof of deployment. A real completed auction and physical-wallet prize/refund
acceptance remain separate from the disposable-chain rehearsal.

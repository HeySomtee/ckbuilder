# Streak Five implementation, 20 October 2026

24 October update: [sponsor auctions](five-sponsor-auction.md) supersede shared
contributions for newly created automatic rounds. Existing gameweeks retain
their original community-gift terms. Highest cumulative funded bid wins the
sponsor spot; other bids return automatically through the rewards worker.

23 October update: [dedicated rewards activation](five-local-rewards-activation.md)
is complete locally with a faucet-funded wallet and isolated worker. Earlier
statements below about no configured wallet describe the original implementation.
Owner sponsorship and actual live reward collection still need verification.

21 October update: [automatic EPL gameweeks and player scouting](five-automatic-gameweeks.md)
supersede the manual first-gameweek flow below when FPL is enabled. No JSON import
or admin publication is needed for normal automatic play.

Owner authorized development after designing optional community-sponsored gameweeks.
The runtime is a separate `modules/five` application feature, not the private
port-4195 prototype. The Season route is `?view=five`.

## Current implementation boundary

Admin drafts and publication, frozen EPL player catalogues/prices, private
five-player entries, captain selection, persistent PostgreSQL state, scoring
revisions and final standings are implemented. Unsponsored rounds are valid.
The format is 1 GK, 1 DEF, 2 MID, 1 FWD, 40 credits, at most two players per
club, and a double-points captain. Entries are free.

The approved incentive direction replaces fixed rewards at point thresholds:
each gameweek may have a fixed funded pool, a configurable winning percentile,
and rewards proportional to each qualifying entrant's final points. Admins and
community members may sponsor. A configurable minimum applies; public names,
logos and website links are optional. Anonymous recognition must not expose
the account or wallet in the public projection. Branding approval is separate
from confirmation of funds. No new token or financial yield is promised.

The owner approved a **dedicated custodial testnet rewards wallet** on 20 October.
Contribution review, signed delivery, confirmation, optional branding moderation,
fixed-pool credits, cancellation refunds and winner collection are implemented.
The API never receives the rewards signing key. A separate worker owns it.
Neither prediction contract reserves nor legacy treasury balances fund Five.
These paths are opt-in and are not activated by installing the frontend.
No live funds have been transferred and no sponsored round has been created.

## Configuration and data

- `STREAK_FIVE_DATABASE_URL`: optional dedicated PostgreSQL URL. Falls back to
  the existing `STREAK_SURVIVOR_DATABASE_URL`, then the main PostgreSQL pool.
  Tables are separate; there is no fallback to file-backed game records.
- `STREAK_FIVE_ADMIN_WALLETS`: comma-separated public testnet wallet addresses.
  Falls back to the existing Survivor admin allowlist. Server-authenticated
  wallet identity controls permissions, never a browser flag.
- `STREAK_FIVE_NETWORK`: only `testnet` is supported. Mainnet is rejected.
- `STREAK_FIVE_FPL_ENABLED=1`: FPL player catalogue, scouting, history and automatic
  gameweek progression. The owner authorized local integration on 21 October.
  Enable only after confirming permission for the intended reuse. Public feed
  availability is not a license. The ignored private research snapshot is
  never imported into runtime automatically.
- `STREAK_FIVE_REWARDS_ADDRESS`: public address of a dedicated native testnet
  rewards wallet. Do not use the prediction operator or legacy treasury wallet.
- `STREAK_FIVE_REWARDS_PRIVATE_KEY`: only the separate rewards worker receives
  this secret. Never expose it to frontend configuration or store it in Git.
- `STREAK_FIVE_REWARDS_ENABLED=1`: the hosted launcher starts the optional
  rewards child. It requires `STREAK_FIVE_NETWORK=testnet`, validates a distinct
  key and routes only its database and rewards settings to that process.
  On local development, run `node products/streak/dist/modules/five/worker.js`
  with only that process's configuration. It refuses inherited prediction or
  treasury keys. The launcher rejects reuse of either key.

The dedicated wallet needs a separate testnet fee/change reserve, recommended
at least 100 tCKB in addition to sponsored prizes. There is no automatic transfer
from another operator wallet. Only a recent matching worker heartbeat enables
new sponsorship or collection; existing saved signatures remain recoverable.
No wallet or funded budget was created by development.

### First local gameweek

With FPL enabled, open `http://127.0.0.1:4100/season/?view=five`. The next official
gameweek opens automatically. Any authenticated player can save a free squad;
no admin or import step is needed. An unsponsored week needs no rewards wallet.
Entries and scores belong to the configured PostgreSQL database. The manual
admin flow described below remains available only with automation disabled.

For sponsorship, configure a new dedicated testnet wallet with the settings
above, fund its separate fee reserve, and start its rewards worker. The page
enables sponsorship only after that worker reports healthy. Set the minimum
contribution and qualifying percentile before publication. Sponsors can leave
their public name, logo and link blank; branding is optional and separately
moderated. A gameweek's published terms cannot be changed retroactively.

With automation disabled, an admin can import a catalogue from an approved
source. With FPL enabled, the scheduler owns routine catalogue creation. The
fallback manifest has `name`, ISO `lockAt` and
`finalizeAfter`, `limit` (2–1000), `qualifyingBps` (100–5000), `sponsorship`,
`minimumShannons` (at least 100 tCKB), `source`, and `players`. Each player has
`id`, `name`, `teamId`, `team`, position `GK|DEF|MID|FWD`, `cost` in tenths of
a credit, and `fixtureId`. Import creates an unpublished draft.

FPL prices are frozen at import. One fixture per player is supported; double
gameweek players are excluded. Scores reject a changed fixture slate instead
of silently scoring additional matches. The adapter now publishes labelled
provisional observations during fixtures, then complete records. Missing records stay pending. An interrupted or
rescheduled slate requires administrator review, not invented points.

Manual score imports require a named source and explicit complete-record
acknowledgement. The host is a trusted scoring oracle. Raw normalized
statistics, source timestamp and scoring rule version 1 are retained with
derived explanations. Stats include `minutes`, `goals`, `assists`, `conceded`,
`saves`, `penaltySaves`, `yellow`, `red`, `ownGoals`, `penaltyMisses`.
The correction window must close and a complete snapshot must be refreshed
after that time before finalization. Final rounds reject score changes.

## Persistence, privacy and allocation

PostgreSQL row locks serialize entries and administrative changes. Deadline
checks use the database clock after acquiring the row lock. Published terms
cannot be edited. A draft revision and publication hash prevent stale changes.
One entry per account and wallet is enforced, without claiming proof of unique
human participation.

Other entrants' squads remain hidden before lock, including from the admin's
public projection. Public entrant identifiers are round-specific hashes.
Account changes isolate query caches and reset the visible draft component.
Unsaved edits survive background refresh; official saves are server-owned.

The percentile counts all valid entries, rounds up, includes boundary ties,
and requires a positive score. Only complete final scores can be allocated.
Amounts use integer shannons. Floor division cannot exceed the funded pool;
the sub-shannon remainder stays explicitly unallocated. No qualifying winner
returns every confirmed contribution as a balance to its original sponsor
wallet. Admin cancellation has the same refund behavior, including contributions
that finish confirming after cancellation. Contributions are otherwise gifts,
not deposits promising a financial return.

Awards and refunds accumulate across gameweeks. Collection requires enough
capacity for the recipient's actual lock script, which is shown in the UI.
Balances below that amount remain saved without expiry. Streak pays the network
fee separately. A signed payout and the credits it reserves commit to PostgreSQL
before broadcast; retries use exactly the same bytes and never create another
debit. A global worker advisory lock prevents concurrent wallet input selection.
Confirmed backing is revalidated for the credit rounds used by a new payout.

Sponsorship transactions have an intent-specific 32-byte marker, exact amount,
owner-only ordinary inputs and owner change. Script dry-run precedes durable
acceptance; input reservations prevent two contributions using the same inputs.
Self-sponsorship from the rewards wallet is rejected. Only canonical transactions
with 24 confirmations enter the pool. Signed contributions stop being accepted
at the gameweek deadline; already accepted contributions keep reconciling.
An unresolved submitted contribution blocks finalization, not other gameweeks.
A donor can supply a competing transaction hash; only a canonical spend of a
reserved input with 24 confirmations permits a durable conflict resolution.
Unknown status or a missing live cell alone is never grounds to replace a spend.

The worker rotates through at most four gameweeks and five submitted contributions
per gameweek per pass. It does not rescan historical confirmed deposits each pass.
Contribution failures are isolated; final credits are idempotent. The worker
retains unresolved payout bytes and pauses new wallet spends if their inputs
cannot be verified. Operator interference with this dedicated wallet requires
manual reconciliation; never delete payout rows or release reserved credits to
force another payment. This is disclosed custody, not a fantasy escrow contract.

Gameweeks are bounded to 100, each catalogue and participant list to 1,000, and
score revisions to 100. The provider shares requests for 60 seconds, caps its
cache at 80 paths, imposes a 10-second timeout and 5 MB response limit.
Public page polling is 30 seconds while visible and never triggers provider
fetches or score mutation. No traffic capacity is claimed from those bounds.

## Verification and remaining acceptance

Focused checks:

```text
node --require ./scripts/quality/test-env.cjs products/streak/dist/five.test.js
node products/streak/scripts/five-postgres.cjs
node products/streak/scripts/five-browser.cjs
node products/streak/scripts/five-devnet-run.cjs
npm run quality:major
```

The PostgreSQL script requires disposable loopback `PG_TEST_URL` ending in
`_test`; it owns and removes only its random schema. Browser journeys use
synthetic data and the production service at 320, 390 and 1440 pixels in
Chromium and WebKit. No real accounts, provider credentials or chain calls
are used in these checks.

The signed devnet test uses public disposable-chain keys and its own PostgreSQL
schema. It covers invalid witnesses, self-funding rejection, duplicate input
reservations, lost-response retries, restarts before broadcast, exact payout,
24-confirmation checks and canonical conflicting-spend recovery. It also checks
that unpaid intents cannot reserve the pool and that late confirmation after
cancellation produces one exact sponsor refund.

Independent source review accepted the money, identity and recovery boundaries
after corrections to prepared-amount display, signed-submission pool limits,
database-clock deadlines, successful-processing heartbeat and queued claim
status. The review did not exercise a physical wallet or hosted deployment.
Unresolved payout-input conflicts still require operator reconciliation.

Remaining operational acceptance: configure the dedicated funded testnet wallet,
confirm provider reuse and coverage, and exercise the real MetaMask journey.
Synthetic chain/browser checks do not establish hosted activation or real-wallet
reliability. Mainnet remains rejected.

The final major run started at 14:40:21 UTC on 20 October and finished at
14:59:44 UTC with 63 passing checks and one failed check. The final Five chain
test could not reach the newly started WSL node from Windows (`ECONNREFUSED`).
The unchanged isolated test then passed with exit 0, including actual signed
contributions, payout restart recovery and cancellation refunds. All 64 required
checks have passing coverage across those runs; the full-run receipt itself
remains failed and was not rewritten. Evidence: `.quality-artifacts/all.json`,
`five-major.log` and `five-chain-final.log`.

Six Five admin/squad journeys passed across Chromium and WebKit at 320, 390
and 1440 pixels. Desktop/mobile screenshots were visually reviewed in
`.quality-artifacts/five-implementation/`. The local API was reloaded and
`/api/five` returned 200, zero rounds, funding disabled and feed disabled.
No live player source, rewards worker, gameweek or budget was activated.
No commit, push or hosted deployment was performed.

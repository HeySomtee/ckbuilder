# Event-driven wallet Activity

28 October 2026. Implemented locally with all 75 required checks covered by passing results.
No commit, deployment or live payment is included in this change.

Activity reads a saved list from PostgreSQL after sign-in. It does not need an
active wallet provider or a browser scan across every market. Startup prefetch
shares the same request without delaying the splash or shell.

## Updates and authority

The isolated operator relays public payment and lifecycle observations from its
durable journals. Signatures and keys never enter the index. The API commits each
event receipt and affected jobs before acknowledging delivery. Replays do not
duplicate positions. One canonical read updates every participant in a changed
market, preserving original deposit identities through settlement and collection.

Submitted payments, accepted bets, reported results, funded claims and collected
returns remain distinct. A football result does not itself create a claim. Reads
use the authenticated wallet's full lock hash, recent-first cursor pagination and
whole-wallet totals. Collection retains all live cell, recipient, amount, fee-input
and wallet-lifetime checks. Indexed amounts never authorize spending.

## Recovery and bounds

Published catalogues bootstrap once. Events are the normal update path. A
30-second relay check recovers missed notifications without scanning the chain;
backlogs continue in bounded batches with a short yield. Known pending/refundable
tickets and uncollected claims get targeted recovery at two minutes, open markets
at five minutes. Failed reads back off from 15 seconds to ten minutes. Collected
history gets a daily canonical checkpoint check, replaying only if its block
changed. The idle database queue issues no chain reads.

Each changed market is reconstructed once for all owners, up to 512 transactions.
This version does not incrementally replay only its newest transactions. Missing
evidence, excess history or RPC failure keeps previous rows visibly stale. New
events fence both successful and failed older reads. Expired leases recover after
crashes. Signed unresolved payments retain recovery rather than being declared lost.

Damaged public events are preserved in the operator's `activity-outbox/quarantine`;
healthy events continue with degraded coverage. Source journals stay untouched.
Repair/replay from those journals and review quarantine before archiving its files
or clearing source-review markers. Never erase signed recovery to clear a warning.

## Configuration

Uses existing `DATABASE_URL`, direct registry directories, `STREAK_SPONSOR_URL`
and `STREAK_SPONSOR_IPC_SECRET`. No new secret, wallet or contract is required.
Additive `activity_*` tables initialize automatically. The API does not receive
the private journal directory. Rebuild/restart both API and sponsor service when
publishing; the existing hosted launcher starts both. Keep database and operator
disk persistent. Without PostgreSQL, explicit direct-chain recovery remains.
Local and hosted databases remain separate.

29 October local correction: the older development wrapper blocked the Activity
routes with HTTP 403 and never started the index. Its route allowlist and startup
now include Activity. Optional `STREAK_ACTIVITY_DATABASE_URL` lets this local
instance use its existing loopback PostgreSQL database while preserving file-backed
accounts and ledger data. Hosted instances continue using `DATABASE_URL`; no extra
Render setting is needed. This override owns only the additive `activity_*` tables.

The failure view now uses one retry card and expandable recovery options instead
of three Unavailable totals. Cached records remain visible, with a dismissible
refresh notice. Retry stays in the same card while pending. Live collection
checks and authenticated wallet ownership are unchanged.

Verified at 06:03 UTC on 29 October: local read-only operational checks found all
23 registered markets indexed, 135 durable event receipts, six wallet/market
records and no retrying markets. The API routes now reach authentication (HTTP
401 without a session), instead of being rejected by the wrapper. No signature
or fund movement was performed. Existing file accounts and operator records were
preserved; API process 34576 uses the corrected local wrapper.

The dedicated-database regression passed against disposable PostgreSQL, preserving
file-backed identity and reading 24 synthetic markets in 12.3ms with no chain
calls. All four Chromium/WebKit Activity/payment/recovery journeys at 390/1440px,
backend TypeScript, frontend build and lint passed. Independent identity/recovery
review accepted. Browser evidence: `.quality-artifacts/activity-retry-browser-followup.log`.
The initial failure log remains: retry briefly replaced its card with skeletons;
the corrected pending state retains its layout and passed the follow-up. These
focused checks are not a new full release-gate receipt. No commit or deployment.

## Verification

Isolated synthetic evidence, not hosted or physical-wallet acceptance:

- Ten canonical-reader groups cover four protocols, repeated stakes, admission,
  refunds, settlement, external claims, reserve cleanup, gaps and reorgs.
- Four relay groups cover crash replay, atomic offsets, deduplication, restart,
  reorg notifications, corruption isolation and private-data exclusion.
- PostgreSQL checks cover atomic writes, owner isolation, leases, generation
  fences, pending recovery, exact totals, pagination and nonblocking page reads.
  A 24-market page measured 17.6 to 33.6 ms locally with zero chain reads.
- Four Chromium/WebKit journeys at 390/1440px cover signer-free history, delayed
  and failed reads, navigation, account switches and synthetic claim/conflict/
  recovery flows. Latest first display measured 1.19 to 1.29 seconds including a deliberate
  300 ms API delay. Fourteen focused frontend tests pass.
- Independent reviews covered reader, relay, database/API identity and recovery,
  and frontend. Their failure-fencing, backlog, corruption and UX findings were fixed.

`npm run quality:major` passed 61 checks before an outdated historical sponsored
recovery selector failed. That test now explicitly selects direct recovery and
passes all four browser journeys without weakening its financial assertions.
The two remaining preview suites passed. The contract lane passed nine checks,
then its Five runner lacked `PG_TEST_URL`; both remaining Five local-chain checks
passed with the disposable database supplied. The original failed reports remain.
This is complete required coverage across the run and scoped follow-ups, not a
claim that the original full command exited successfully.

Final database follow-ups verify outage backoff and notice preservation. Final
Activity browser checks at 14:24:04 UTC cover explicit stale-record recovery and
submitted counts before the first verified snapshot. Evidence is saved under
`.quality-artifacts/activity-major-initial.json`, `activity-contracts-initial.json`,
`activity-sponsored-browser-followup.log`, `activity-preview-results.json`,
`activity-five-results.json`, `activity-final-postgres.log` and
`activity-index-recovery-browser.log`. The sponsored-browser log transparently
transcribes captured tool output; the final Activity log captures stdout directly.

Final `npm run quality:static` passed all seven checks at 14:28:19 UTC, including
formatting, policies, strict builds and lint. The disposable Activity PostgreSQL
container and its volume were removed afterward; the working app database was
untouched. No application services were restarted as part of verification.

The linked-block loader remains preview-only. Earlier publication commitments,
physical wallets and production weekend acceptance remain open.

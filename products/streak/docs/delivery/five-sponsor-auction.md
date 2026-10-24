# Five sponsor auction, 24 October 2026

The owner requested a highest-bidder sponsorship auction after completing a
100 tCKB contribution to Gameweek 9. Repeat payments combine into one bid,
explicitly approved by the owner. Existing published rounds retain their
community-gift terms; the confirmed Gameweek 9 payment is not reclassified.

## Published rules

- Newly created automatic EPL rounds use `sponsorshipMode: auction`. Missing
  mode retains legacy community sponsorship, including the original terms hash.
  Manual drafts can choose either format before publication.
- Squad entry remains free. Optional sponsorship branding, minimum payments,
  player prices and player reward allocation remain part of the round terms.
- Confirmed top-ups combine by wallet. The largest total wins the single sponsor
  spot and funds the player prize pool. Equal totals favour the first total
  reached, using server-assigned signed-admission sequence under the round lock.
  Intent creation, browser timestamps and chain polling order cannot buy priority.
- Signed bid admission closes at the official squad deadline. There is a fixed
  30-minute confirmation window. Eligibility requires 24 canonical confirmations
  by its end, measured by the timestamp of the transaction's 24th block.
- The auction may settle after the deadline once all accepted payments resolve.
  After the confirmation window, unresolved payments are excluded and refunded
  if they later confirm. Exact saved signatures remain recoverable.
- Worker downtime is not evidence that a bid failed. Every still-submitted bid
  needs a successful status observation after the chain tip crosses the cutoff
  before exclusion. RPC failure or a lagging chain delays closure. This can make
  settlement take longer than 30 minutes without extending eligibility.
- Only the winning total is the prize pool. Before closure, the page labels the
  highest funded bid separately. Losing deposits are never counted as prizes.
- Losing and excluded deposits return automatically to their original wallets.
  Streak pays refund network fees; the original bid transaction fee is not
  refunded. Balances below the recipient lock's cell minimum remain saved.
- Cancellation or no qualifying player returns the winning deposits too. Each
  payment has the same refund identifier across these paths, preventing a
  second refund after cancellation. No mainnet funds or new financial yield.

## State and recovery

PostgreSQL owns the signed-admission order, frozen winner wallet/payment IDs,
winning amount and closure timestamp. Closure is revision-checked after chain
backing verification and recorded in the audit table. Canonical confirmation
timestamps are rechecked before closing or paying; changed evidence pauses
delivery for reconciliation rather than using stale eligibility.

The worker rotates through bounded groups of rounds and payments. It settles
auctions, credits refunds and uses the existing durable signed-payout journal.
Refund requests have `refund_only=true`; automatic refunds cannot silently
collect unrelated unclaimed prizes. An explicit collection can upgrade scope.
Producers lock/upsert the queue before credit insertion; the consumer locks the
queue inside its transaction before reading credits. A concurrent refund cannot
be lost when an older queue request is consumed. Refunds remain serialized by
the existing wallet lock and confirmation policy, not promised as instant.

Anonymous bids remain available. Public projections show only approved winning
branding after closure, using the winner's latest funded preference. Neither
losing wallet identities nor the private winner-wallet snapshot is exposed.
The UI shows leading/outbid/won states, top-up review, confirmation-window rules
and per-payment refund pending/queued/confirming/returned states.

## Evidence and limits

The existing live Gameweek 9 contribution reached confirmed status for
100 tCKB, transaction
`0x1fc68a65de602226d401af5ffddb878ea0d0ad1b35f19138c3fe51e7deaa9dd5`.
That verifies the old sponsorship flow, not a live auction refund.

Focused synthetic checks passed for top-ups, ties, deadlines, late confirmations,
six-bid catch-up, failed reads, chain lag, reorg evidence and legacy terms.
Disposable PostgreSQL checks passed for concurrent refund queue production,
manual scope retention and closure audit. The signed local CKB journey covers
two bidders, a top-up, exact automatic refund, worker restart, unrelated prize
isolation and cancellation deduplication. No live keys or existing app database
are used by these tests.

All 67 required steps have passing coverage: 39 pre-browser checks from the
major run, the entire 18-check browser group and the entire 10-check contract
group. The full run passed 47 steps before an unrelated date-dependent calendar
assertion failed: choosing today correctly omits `?date`. The assertion now
checks that canonical route as well as explicit other dates; no calendar runtime
was changed and no check was removed. The complete browser group passed at
20:03 UTC and the complete contract group passed at 19:53 UTC on 24 October.
The original failed full-run receipt is retained, not relabelled as passed.

Evidence: `.quality-artifacts/five-auction-major-final.log`,
`.quality-artifacts/five-auction-browser-final.log`,
`.quality-artifacts/five-auction-contracts-final.log`, and their `all.json`,
`browser.json`, `contracts.json` receipts. Auction screenshots for Chromium and
WebKit at 320, 390 and 1440 pixels are under
`.quality-artifacts/five-implementation/auction-*.png`; desktop and narrow-phone
screenshots were visually reviewed.

The local API and isolated worker were reloaded with tested code. Post-reload
inspection found Gameweek 9 still in legacy mode with exactly one confirmed
100 tCKB contribution and rewards available. Desktop/mobile read-only checks
found no page errors or horizontal overflow. API PID was 18360 and worker PID
11700 at verification; these are dated evidence, not permanent identifiers.

Independent money/recovery review accepted the corrected source and tests.
No current round was migrated, no live auction was fabricated, and no actual
auction winner or loser was paid during development. Live auction settlement
and hosted deployment remain separate acceptance. No commit or push requested.

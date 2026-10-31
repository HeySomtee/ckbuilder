# Survivor deadlines, season rounds and creator prizes

31 October 2026. The owner approved using the existing dedicated testnet rewards
wallet for Survivor prizes. This is custodial funding, not a CKB escrow contract.

- New competitions use the official FPL event deadline, normally 90 minutes before
  the first kickoff. The team board shows the closing date and local time.
- Admins can type a round count up to the available complete remaining gameweeks,
  bounded by 38. A separate hourly cached EPL season request supplies the schedule.
  Missing or incomplete rounds are not invented. Existing published schedules stay fixed.
- Teams cannot be reused. A long competition can end early when survivors have no
  legal next choice, using the existing joint-winner rule.
- A creator funds any positive prize before publishing. Zero-prize games remain
  free to publish. The review shows exact prize and network fee, custody and refunds.
- Only the creator wallet can fund the exact saved prize. The API persists signed
  bytes before the worker broadcasts. Twenty-four canonical confirmations and a
  fresh backing check are required before entries open.
- Signed drafts cannot be edited or deleted. Cancellation before anyone joins
  retains the record and returns confirmed funds. Unpublished funded drafts also
  cancel at their deadline. Canonical conflicting-spend proof remains available
  after cancellation; unresolved payments never authorize another payment.
- Winners share equally. Smallest-unit remainder returns to the creator. Credits
  and payout transactions use the existing Five reward journal. Small credits stay
  saved until the wallet cell minimum is met. Streak pays payout fees; the creator's
  original funding fee is not returned. Five and Survivor share a rewards balance.
- Older published competitions retain their announced-prize policy. They do not
  acquire a funded badge or payout entitlement merely by deploying this change.

## Configuration and recovery

Reuse `STREAK_FIVE_REWARDS_ADDRESS`, its separate worker and private-key settings.
No private key enters the API or browser. Survivor and Five rewards must use the
same database, role and schema. A mismatched configuration disables creator
funding with an admin-facing explanation; existing competition data is not moved.
FPL deadlines use the existing `STREAK_FIVE_FPL_ENABLED=1` setting. The local
dummy mode uses its separate database and rewards wallet with the same components.

Survivor stores the contribution in its own aggregate. A payment-only adapter
reuses Five's validated transaction, confirmation and credit engine; it creates no
Five squad or gameweek. The `survivor.` credit namespace cannot collide with legal
Five identifiers. Both games reserve inputs in the same database table. Automatic
payout requests are created only for new credit IDs, preventing an already-paid
or undersized wallet from repeatedly delaying later winners.

## Verification

Final release result, 31 October: all 77 required checks passed in one full run
at 13:38:27 UTC. Runtime commit `948fb1c` reused the exact-tree hook receipt for
`d0bf4b7149bf`. Evidence: `.quality-artifacts/oct31-release-gate.log`, `all.json`
and the hook receipt. Not pushed or deployed. The earlier diagnostic attempts
below explain the verification history; the full release gate is now complete.

Focused synthetic domain tests cover 30-round schedules, official deadline cutoff,
creator-only funding, rejection before persistence, exact retries, signed-draft
immutability, reorg blocking, equal-share conservation and expired-draft refunds.
Disposable PostgreSQL checks cover automatic credit queue idempotence, input
reservation conflicts and rollback, alongside existing admission and refund races.
Independent money/recovery review accepted the final controls after the queue and
database configuration corrections. TypeScript, frontend build and lint pass.

The major command passed static, unit and PostgreSQL stages before a WebKit
loader timeout. The complete loader rerun passed without changing its assertions.
All six enhanced Survivor browser journeys pass at 320, 390 and 1440 pixels in
Chromium and WebKit, including 30-round creation, funding consent, blocked unfunded
publication and submitted-payment recovery after cancellation. The complete browser
lane also passed. The final consent-panel spacing correction has a fresh build,
lint and responsive Survivor check; its mobile screenshot was visually inspected.

All nine prediction contract/chain checks passed. The two remaining Five signed
chain checks passed separately with the disposable PostgreSQL URL supplied. Their
auction examples now use 100, 150 and a 100 top-up to respect the approved strictly
higher total rule. Equal/lower bids are explicitly rejected; losing refunds,
restart recovery, scoring and prize collection remain covered. These separate
reruns are evidence of their named checks, not a single successful release receipt.
Physical MetaMask/Zerion funding, confirmation, creator refund and winner payout
acceptance remain separate. No live funds were moved by these tests.

Evidence is under `.quality-artifacts/survivor-prizes-major.log`, `browser.json`,
`survivor-prizes-contracts.log`, `survivor-five-devnet.log`,
`survivor-five-rehearsal.log`, `survivor-final-build.log` and
`survivor-final-browser.log`. The owner's production checklist was preserved and
restored byte-for-byte. Physical wallet and hosted acceptance remain outstanding.

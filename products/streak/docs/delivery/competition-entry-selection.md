# Explicit competition entries

Owner approved the [selector preview](../../design/competition-entry-review/README.md)
on 7 November 2026. Implementation and local verification are complete. Not pushed
or deployed.

## Player experience

- New prediction competitions let each paid pick count in zero, one or several
  competitions the wallet has joined. Choosing Regular preserves ordinary payment,
  settlement, winnings and storage-return behavior.
- Picking from a competition initially selects that competition. Global market
  picks start regular. A saved explicit choice survives navigation, edits and reload.
- Used entries lose their competition badge on later bets. Pending entries cannot
  be selected again. When no eligible choices remain, the slip shows a regular
  prediction without an unnecessary selector.
- The compact choice sheet supports cancel, save, keyboard focus and mobile layouts.
  The slip, saved-slip dock, payment review and competition cards share these choices.

## Payment and scoring boundaries

The API records an immutable intent before returning the unsigned payment for
review. The record binds the authenticated wallet, exact transaction hash, output
index, fixture, outcome, amount and selected competition IDs. Empty selections
are recorded too. Later registration cannot turn regular bets into entries.

PostgreSQL serializes this wallet's intent changes and locks selected competitions
in sorted order. It reserves all selected entries together, rereads the database
clock after lock waits and rejects a changed/closed entry before payment continues.
Submit and resume persist the started state before contacting the existing signer.
Retries reuse the original intent. These locks do not change CKB funding capacity.

Only independently verified canonical prediction evidence produces points. Scoring
matches the full saved identity, not an API success message or browser badge.
Reorgs remove provisional points while retaining the original choice. Later regular
bets cannot replace it or change its tie-break. Final award protection remains.

## Compatibility and recovery

New publications use `explicit-entry-v3`. Published v1/v2 competitions retain their
automatic-entry rules and show that explanation in the slip. To test optional
entry, create a new rehearsal; existing published competitions are not migrated.

Unsigned reviews can be explicitly released before submission, or expire safely.
A released review cannot later submit or resume. Wallet rejection and failed
post-offer validation retain enough identity to release the abandoned review.
A trusted operator status proving an expired, unsigned offer also releases a
conservatively reserved failed attempt. HTTP errors alone never do this.

Signed, unknown and canonically conflicted payments keep their entries reserved.
A conflict can itself reorg, so this release does not automatically reassign that
entry. Existing payment recovery remains available; administrative conflict
resolution is a remaining limitation, not evidence that funds were lost.

Releasing a competition review does not cancel the private operator's market
reservation. A brand-new market can remain unavailable until that unsigned offer
expires. After safe release/expiry, a new offer may reuse identical CKB bytes with
new competition choices; the old offer identity remains permanently blocked.

The shared sponsor-funding bottleneck remains deferred to the
[post-grant refactor](../architecture/concurrent-payments.md#post-grant-priority-pending-payments-blocking-other-users-7-november).
This work adds no signing key, smart-contract migration, extra payment, polling
worker or hosted CI requirement.

## Verification

For a manual rehearsal, publish two new prediction competitions with an overlapping
fixture, then join both. Pick that fixture from one competition and select both in
the slip. Cancel and reopen the selector, reload, then review the payment. After
acceptance, a repeat pick should be regular for both. In a fresh fixture, pay with
Regular selected and confirm it leaves both competition slots available. Existing
published automatic-entry competitions are not suitable for this new-policy check.

Focused domain, draft, label, batch-client, actual HTTP handler and disposable
PostgreSQL checks pass locally. They cover immutable opt-out, exact evidence,
multi-competition rollback, competing slot claims, submit/release races, expiry,
wallet rejection, reorgs and cutoffs crossed while waiting for locks.

Six built-app browser journeys pass across Chromium and WebKit at 320, 390 and
1440px. They cover selection, cancel, multiple entries, opt-out, reload, used and
pending slots, mixed eligibility and account isolation. Screenshots are under
`.quality-artifacts/campaigns-runtime/`; mobile and desktop captures were inspected.

Independent review covered payment identity, atomic reservations, submit/release
races, unsigned cleanup, canonical scoring, reorgs and safe reuse of identical
unsigned transaction bytes. No blocking concern remains in that reviewed scope.
An all-history hash index was added following review to keep retry lookups indexed.

Five major-gate attempts stopped before completion. The first exposed a historical
automatic-entry test that needed an explicit v2 fixture. The second exposed a
short expiry test using Windows time against PostgreSQL time. The test now waits
for the actual database deadline, with the same cutoff assertions retained.
The third stopped on a sign-out test's delayed account refresh. Its setup now waits
for sign-in reads to finish before advancing the stale clock, retaining the
late-response account-isolation assertion. Focused regressions pass; failure logs
remain in `.quality-artifacts/`.

The fourth caught an oversized fixed checkout footer after adding review labels.
The frozen choice summary now renders in the scrollable picks area, preserving the
existing footer/list size assertions. Checkout explicitly checks that every reviewed
pick appears there.

The fifth reached the Five signed lifecycle and exposed another host-clock test
deadline: Windows was measured 1.6 seconds ahead of the disposable database, so a
deadline set one host-second ago was still open to database-clock admission.
The synthetic fixture now uses the storage clock. The unchanged late-bid rejection
and signed Five lifecycle pass independently.

The final `npm run quality:major` run passed all 96 stages on 7 November, finishing
at 20:14 UTC. It includes PostgreSQL, Chromium/WebKit, Rust VM checks and signed
disposable-chain lifecycles. Evidence is archived in
`.quality-artifacts/entry-final-major.json` and `entry-final-major.log`; all 43
changed runtime/test files match `entry-runtime-manifest.json`. The owner's hosted
checklist was restored byte-for-byte. Independent review and final responsive
screenshot inspection are complete.

Synthetic checks do not establish physical-wallet, production database or hosted
chain acceptance. No deployment is claimed. The shared funding bottleneck remains
deferred as described above.

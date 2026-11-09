# Competition entry choice

7 November 2026. Interactive design proposal with synthetic fixtures and entries.
No production payment, scoring, registration or wallet behavior changes here.

Run `node products/streak/design/competition-entry-review/serve.cjs`, then open
<http://127.0.0.1:4205/>. The preview-state menu shows regular, single/multiple
competitions, used slots, mixed eligibility, pending entries and funding waits.

## The experience

- Put the choice on each prediction, below its stake. Choose **Regular prediction**
  or one or more eligible competitions. A multi-select sheet handles overlapping
  competitions without a confusing row of switches.
- Entering from a competition preselects that competition when eligible. Entering
  from global markets defaults to regular. Show the choice again before payment.
- An already-used slot cannot be selected again. If all relevant slots are used,
  show only **Regular prediction**, with a short explanation and no selector.
- If one competition is used and another remains eligible, offer only the latter.
  A pending signed entry reserves its slot; delayed indexing must not offer it again.
- Closing the slip retains choices. Cancelling the selector discards its edits.
  Every paid prediction still settles normally, including regular and losing picks.

Approved behavior: the same paid prediction may count in multiple explicitly selected
competitions where their published rules allow it. This does not create extra bets
or change the on-chain return.

## Why the screenshots happened

`src/modules/direct/batch.ts` calls `operatorFundingBarrier` before preparing a
new offer. `src/modules/direct/cli.ts` reconciles shared operator/sponsor jobs;
unresolved funding, uncertain canonical state and relevant operations with fewer
than four confirmations can block new preparation. `canonicalSponsorConflicts`
also checks signed sponsor records. The reported timing fits this shared barrier,
but the screenshot alone cannot identify the exact blocking transaction.

The restriction can affect different users and different markets. CKB prevents
two transactions spending the same cell; our current service-wide safety barrier
is broader. The existing concurrency proposal replaces it with reservations of
specific inputs and independent funding cells while retaining signed recovery.
Changing wording or increasing market shards alone will not fix that bottleneck.

`web/src/features/predictions/campaign-labels.ts` currently labels registered
fixture membership, even for already-counted picks. `slip.tsx` adds an explanatory
label but keeps the competition badge. Qualification also comes from a reconciled
read model, so a delayed update can leave membership looking like eligibility.

## Implementation boundaries after approval

Use one entry projection for the selector, saved-slip bar, fixture cards and
leaderboard. Distinguish draft intent, reserved/pending, accepted and used states.
Regular bets must not occupy competition slots on another screen. Paid-prediction
records still exist for normal settlement; only selected competitions receive
entry records and points.
Regular bets must not change an existing competition entry's points or tie-break
timestamp. Only the selected qualifying entries contribute to that competition.

| Concern                     | Required behavior                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable intent              | Store selected competition IDs, or an explicit empty selection, per wallet and immutable payment line. Bind server validation to the actual accepted prediction/outpoint. Preserve through reload and recovery.                                                                                         |
| Concurrent submissions      | Reserve `(competition, wallet, fixture)` atomically. Two tabs or devices cannot both obtain the entry. Multiple selected competitions must succeed together or return to review.                                                                                                                        |
| Pending and failed payments | Keep a reservation while signed transaction status is uncertain. Release an abandoned unsigned reservation safely, or after failure/cancellation is proven. Never release solely because a timer expired after signing.                                                                                 |
| Eligibility changes         | Recheck joining, fixture whitelist, cutoff, canonical admission and used/pending status before payment. If the selected entry is no longer possible, explain and require another review. Do not silently charge it as regular.                                                                          |
| Freeze and recovery         | Freeze the accepted selection once payment authorization starts. An idempotent retry uses the same intent and transaction identity. Changes require safe cancellation first. Reconcile reorgs without granting duplicate points.                                                                        |
| Scoring                     | Existing policy automatically takes the first qualifying paid prediction and may backfill pre-registration bets. A new explicit-entry policy must select only opted-in accepted predictions; display labels alone cannot enforce this. Keep 3/0 scoring and established final-pick tie-break semantics. |
| Later registration          | New-policy regular bets remain regular after joining. Do not let users opt old bets in after learning outcomes. Joining alone still creates a zero-point ranked entry.                                                                                                                                  |
| Existing competitions       | Preserve historical calls, awards and published rules. Version the new policy. Do not silently rewrite live competitions; any migration needs an explicit reviewed transition and audit record.                                                                                                         |
| Scope                       | Competition eligibility affects points only. Payment, claim, refund and storage-return rules remain unchanged. Sponsorship funding concurrency stays a separate protocol/service task.                                                                                                                  |

The preview's shared-funding message preserves the slip and offers **Check again**.
It does not promise a completion time, automatically sign, broadcast, or pretend
the underlying concurrency work is complete. The preview's sample check stays
pending deliberately.

Use the server's actual reason when integrating this state: show "Another payment
is confirming" only for a known pending payment. For uncertain chain reads or
recovery, use "Checking funding availability". Do not infer a pending payment
solely from today's generic warning.

## Review evidence

Approved on 7 November. Runtime integration and its verification are tracked in
the [delivery record](../../docs/delivery/competition-entry-selection.md). This
directory remains the isolated design preview.

Local browser checks and screenshots are recorded under
`.quality-artifacts/competition-entry-preview/`. They exercise the isolated design,
not the hosted app, actual wallets, on-chain acceptance or production scoring.

# Queued payment reviews

9 November 2026. Implemented and verified locally; published to GitHub `main` as
`bb152d2`. Hosted deployment and real-wallet acceptance remain unverified.

## What users experience

Busy reviews wait automatically instead of becoming a payment error. The slip keeps
its picks and competition choices. A compact three-cell status shows queue position;
closing the slip leaves progress in the existing movable payment bubble. Leave queue
cancels the unsigned review and keeps the draft. An available review still requires
the user to press Pay and approve the wallet. Nothing is signed automatically.

There is one active slip per wallet. Browsing remains available while queued;
editing requires Leave queue. A signed unresolved payment retains its input and
fixture reservations. This increment does not add multiple concurrent payment drafts.

Only explicitly acknowledged temporary waits retry. Network ambiguity, invalid
inputs, insufficient funds, expired deadlines and signed payment recovery retain
their separate handling. A first payment creating a market is followed until that
market becomes available, before entering the review queue.

## Boundaries

- This queues reviews; it does **not** create simultaneous on-chain payments.
  The shared funding guard, four-confirmation policy and 32-position market limit
  remain. Independent sponsor inputs and per-cell reservations remain future work.
- The operator lease protects a bounded file queue on its existing persistent disk.
  It retains request identity, request digest and a wallet hash, with one waiter per
  wallet, up to 128 waiters. FIFO applies after a request reaches this queue.
- Active browser checks run every eight seconds while waiting. Hidden tabs pause;
  returning resumes checks. A disconnected or hidden waiter loses its place after
  90 seconds without a heartbeat. Waiting stops after ten minutes and before the
  existing two-minute kickoff safety boundary. No market slot is promised.
- Cancellation is authenticated and wallet-scoped. It can cancel an unsigned offer;
  it cannot release signed inputs or cancel a payment. Late replies and identity
  changes release unsigned competition metadata and private offers together.
- No extra worker, new PostgreSQL polling job or change to payouts/refunds.
  Queue expiry only removes waiting metadata, never a transaction reservation.

## Hosted rehearsal diagnosis

Read-only public API observations on 9 November, around 07:37 to 07:47 UTC:

- GW10 Predictions Test: `finalizing`, scores `final`. The administrator must use
  Review final standings and confirm finalization to freeze awards and show Finished.
- GW10 Five Test: provisional scores. The underlying Five detail is locked and
  `scoresComplete=false`. Its published `finalizeAfter` is 9 November at 22:30 UTC,
  or 23:30 Lagos. That is the earliest permitted finalization, not a promise that
  provider results will be complete then. Complete scores and checked provider
  results are still required before the administrator can finish the competition.

The stored gameweek summary says open because it captures publication metadata;
it is not proof that picks remain editable. The authoritative round detail is locked.
No hosted competition was modified or finalized during this investigation.

The public FPL fixture feed for GW10 still marked all ten matches
`finished=false`, with `finished_provisional=true`, during the investigation.
This explains why Five has provisional scores even though the matches have played.

## Preparation and stuck-payment recovery

Independent fresh input reads now run in groups of four. Backend market inspection
shares creation-transaction and canonical-header reads only within that observation.
The browser overlaps two market inspections and deduplicates identical reads within
one verification. Signing creates a new verification session, so a faster review
never substitutes old liveness for current spend authority. Mutation and signing
remain serialized under the existing locks.

The operator already discovers some canonical conflicting spends during recovery.
Its status now exposes that hash as a hint. The browser must independently prove an
exact shared input, canonical inclusion and four confirmations, and check that the
original has not committed, before resolving the old payment. Signed bytes remain
saved. If the proof is reorganized away, the original reservations apply again.
No automatic replacement payment or second signature is introduced.

Offers cancelled or expired before the server accepted a signature never entered
its background recovery loop. The browser now checks this case while following the
saved payment: one ascending indexer page of 32 rows, starting at the sponsor input's
creation block, and at most 32 candidate transactions. It checks at most once per
minute per payment, with at most 32 cached hints per client. Hints are never cached
proof. The existing authenticated resolution endpoint must acknowledge recovery;
canonical proof is rechecked afterward. Missing history or RPC failures retain the
reservation and manual recovery path. Normal payment preparation performs none of
this historical search. No new worker or database polling task is introduced.

The private operator explicitly labels cancellations where neither signature was
ever accepted. Only that acknowledgement, or the existing unsigned expiry proof,
can clear a conservatively started competition entry. A signed conflict cannot use
this shortcut, since its proof can be reorganized away. Resolved payments display
a dismissible neutral result instead of continuing to request attention.

For the owner's transaction
`0x8810f1278cc17062af11b251fd14c4142671403ff4f703eeaec2efdbb5263109`,
the public testnet RPC returned `unknown` and the explorer API returned 404 on
9 November. The owner's subsequent Render diagnostic found two saved offers,
cancelled and expired, with no accepted owner or sponsor signature. Public input
inspection at 08:36 UTC found both owner inputs still live. The sponsor input was
spent by canonical transaction
`0xd38b803da946a1a3d606ecd621c1a8ddaf895ee67390c9ba0db03b2fd99274f0`,
with 14,115 confirmations at observation. The owner was given that hash for the
existing Verify conflict action. Discovery is verified; the owner's completion
of that action and deployment of automatic recovery remain separate evidence.

Confirmation depth and the shared sponsor-funding barrier are unchanged. Reduced
RPC work is not a promise of a particular hosted checkout time. Measure preparation,
wallet approval and canonical confirmation separately after deployment.

## Announcement sequence

1. Deploy the verified Home, competition choices and queued-review changes.
2. Rehearse with three funded wallets at once: one pays; others wait, review and
   pay in turn. Try both the same match and different matches, and Leave queue.
3. Finalize the prediction rehearsal; finish Five once final scores are verified.
4. Create the real competitions with the agreed prizes and upcoming fixtures.
   Check actual Five deadline before publishing: the current API lists GW11 as
   21 November at 12:00 Lagos, not the immediately following weekend.
5. Announce the competition links after checking entry, points and mobile checkout
   on the deployed version. A queue improves waiting but cannot support an unlimited
   launch burst; retain the published market-capacity indicators.

## Evidence

Focused backend and 21 browser-client unit checks pass, using isolated synthetic
fixtures. They cover FIFO with three wallets, cancellation, retry, late wallet
preparation, bounded reads, fresh signing reads, unrelated/shallow conflict hints
and restoration after reorg. A five-cell market with one creation transaction uses
one creation lookup and one canonical-header lookup, while retaining five fresh
live-cell checks with at most four in flight. Browser verification stays bounded
to eight live-cell reads in flight across two markets.

Independent recovery review identified cancellation gaps, now fixed, and found no
concrete blocker in batching, conflict discovery, operator acknowledgement and
unsigned competition-slot release. Focused PostgreSQL regressions pass. Chromium
and WebKit checkout pass at 390, 900 and 1440px. WebKit exposed a timing-sensitive
sign-in fixture; it now holds the response explicitly while asserting progress.
The earlier gate was intentionally stopped to include the speed changes.
A later run caught an accidental legacy busy-response change. The typed queue
response is now restricted to atomic offers; the legacy regression passes again.
A subsequent run passed full checkout but stopped at the combined-slip test's
timeout recorder: cancellation now combines signals, which the recorder did not
follow. Its instrumentation now preserves the earliest known child timeout;
the unchanged 15-second and 60-second assertions pass in Chromium and WebKit.
No application timeout or recovery rule was weakened.

Final verification completed at 10:44 UTC on 9 November. The final
`npm run quality:major` run passed 87 stages, then Windows denied WSL startup
before the contract tests could execute. The remaining `quality:contracts` lane
was rerun with WSL permission: all 11 stages passed, including signed local-chain
payments, conflict/reorg recovery, Five refunds and prize collection. This gives
98 passing required stages across two runs, not a successful uninterrupted major
command. The PowerShell wrapper also surfaced Rust stderr as NativeCommandError;
the contract runner's report records all 11 successful child results.

Evidence is retained in `.quality-artifacts/review-major-wsl-permission.json`,
`review-final-contracts.json` and `review-final-coverage.json`. The final manifest
matches all 62 changed runtime/test files; the owner's hosted checklist retains
its original bytes. No production payment was resent or resolved by these tests.

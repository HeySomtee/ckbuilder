# Streak work tracker

9 November owner authorized commit and push of the completed release. Revalidate
the 62 runtime/test hashes against the fresh combined 98-stage evidence, run scoped
checks for publication notes and preserve the owner's checklist byte-for-byte.
Include the already approved Home and competition-entry work. Keep hosted CI
paused and private correspondence out of Git. After publication, verify the remote
commit; hosted recovery and the three-wallet queue rehearsal remain acceptance work.

9 November final recovery verification: implementation and independent review are
complete. The final major run passed 87 stages, including every browser journey,
then Windows denied WSL startup. All 11 remaining contract/local-chain stages
passed with WSL access at 10:44 UTC. Required coverage is 98 passing stages across
two runs; do not describe the interrupted major command as passed. The PowerShell
wrapper surfaced Rust stderr as NativeCommandError, while the contract runner
records all 11 child stages passed. Evidence: `review-major-wsl-permission.json`,
`review-final-contracts.json`, `review-final-coverage.json` and the matching
62-file `review-runtime-manifest.json`. Owner checklist bytes are preserved.
No commit, push, deployment or production recovery action. Next: publish when
authorized, confirm the owner's tracker clears on the deployed version, rehearse
three wallets waiting/paying in turn and complete hosted competition finalization.
Earlier incomplete checkpoints below are historical.

9 November verification checkpoint: the complete run passed full checkout but
stopped at combined-slip timeout instrumentation. The test recorder now follows
combined cancellation signals without changing its timeout assertions. All four
focused Chromium/WebKit combined-slip journeys pass. Application code is unchanged;
the complete gate is rerunning with the corrected test. The failed report is retained
as `review-major-timeout-recorder-failed.json`. Owner checklist bytes are preserved.

9 November confirmed recovery gap: the owner's Render diagnostic found cancelled
and expired offers for the supplied hash, with neither signature accepted. Public
chain reads prove sponsor input `0xfa5f4661d89a9c4b5d9962c0f519c1c12f782b51332e7db72b56f878930ecc7f:1`
was spent by canonical transaction
`0xd38b803da946a1a3d606ecd621c1a8ddaf895ee67390c9ba0db03b2fd99274f0`.
Both owner inputs were live at 08:36 UTC. Supplied the existing Verify conflict
recovery path, without moving funds. Owner explicitly requested closing this gap.
Added bounded browser discovery for expired/cancelled unsigned offers, authenticated
operator acknowledgement, fresh canonical proof and neutral terminal UI. Only an
operator-confirmed cancellation that never accepted either signature can release
a started competition slot; signed conflicts retain the reorg safeguard.
The major gate caught a changed legacy busy response; restored that response and
its focused regression passes. Final independent review and complete gate pending.

Final focused checkpoint: independent review found no concrete blocker in recovery
acknowledgement or unsigned cancellation lifetime after reorg. Disposable PostgreSQL
checks pass, as do all six Chromium/WebKit checkout cases at 390/900/1440px. Public
read-only validation found the actual sponsor conflict as the ninth candidate;
discovery now examines up to 32 candidates in its single bounded 32-row page.
Synthetic recovery fixtures include a ninth-candidate conflict and enforce the
one-minute throttle. Full gate must cover the final runtime tree before delivery.

9 November payment-speed steering: the owner reports one minute to prepare and
two minutes to confirm, asks about new picks while queued, and supplies transaction
`0x8810f1278cc17062af11b251fd14c4142671403ff4f703eeaec2efdbb5263109`.
Public RPC reports unknown and explorer API returns 404; neither establishes a safe
retry. Added bounded independent input/market reads and per-observation canonical
header deduplication. Signing still rechecks fresh authority. Operator-discovered
conflicts now reach the browser as hints, independently proven against exact inputs
and four canonical confirmations before clearing reservations. Reorg recovery remains.
Focused backend and 18 web checks pass; independent recovery review found no blocker.
The earlier full gate was intentionally stopped to include these changes; a fresh
complete gate is required. One active slip per wallet remains, not multiple queued
payments. No production payment was resolved, signed or resent by this work.

9 November announcement readiness: owner requests at least two or three concurrent
predictions, or a graceful queue while current funding remains serialized, plus
polished waiting/recovery and investigation of rehearsals still showing live.
Implement the bounded queued-review increment first, retaining the existing money
guard and explicit wallet approval. Never describe queued reviews as parallel chain
payments. Preserve the verified but unpublished Home/explicit-entry work below.
Read-only hosted evidence: Predictions rehearsal is finalizing with final scores;
Five rehearsal is live with provisional scores. Investigate Five source finality;
do not fabricate results or finalize production awards. Independent recovery review
and runtime gates remain required before delivery.

7 November implementation checkpoint: explicit-entry-v3 now binds per-pick choices
to the exact unsigned payment before review, reserves all selected competitions
atomically and guards submit/resume. Regular bets cannot later backfill. Shared
slip choices, dock labels, account-bound drafts, review and used/pending cards are
wired. Focused domain/client/HTTP/disposable-PG tests and responsive browser
journeys pass. Independent review is complete; cutoff-lock timing and unsigned
cleanup gaps were fixed with regressions. Full checkout caught an oversized footer;
the frozen choices now scroll with the picks and all six checkout cases pass.
All 96 stages of the final major gate passed on 7 November at 20:14 UTC. Evidence:
`.quality-artifacts/entry-final-major.json`, `entry-final-major.log` and
`entry-runtime-manifest.json` (43 matching runtime/test files). The owner's hosted
checklist is preserved byte-for-byte, along with earlier Home work. Implementation
and local verification are complete. No commit, push or deployment; hosted
acceptance remains separate and shared funding remains deferred.

7 November owner approved the competition-entry preview for implementation.
Build explicit per-pick regular/multi-competition intent through the existing
payment flow, durable reservation/recovery and versioned scoring. Preserve used
entries and published legacy rules; regular predictions must never consume an
explicit-entry slot. Update slip, dock, fixture cards and review together. Require
independent review for payment binding/recovery and the full major gate. The
shared sponsor-funding concurrency refactor remains deferred until after the grant.

7 November owner deferred the pending-payment/global sponsor-funding bottleneck
to the **post-grant refactor**. Record independent funding cells, atomic per-input
reservations, same-market lane allocation and isolated signed recovery in
`docs/architecture/concurrent-payments.md`. Retain current safety checks and
market limits until that work is implemented and independently reviewed. The
competition-selector preview remains separate; it does not fix this bottleneck.

7 November final verification: the Home split layout passed all 96 stages of
`npm run quality:major`, including the corrected WebKit navigation/artwork
journeys, PostgreSQL, browser checkout and signed disposable-chain lifecycles.
The final runtime/test hashes match `.quality-artifacts/home-runtime-manifest.json`;
full evidence is archived as `home-final-major.json` and `home-final-major.log`.
The owner checklist was restored to its original bytes. Earlier failed attempts
below remain part of the record. Home is verified locally, not committed or pushed.

Owner asked whether pending confirmation blocking another user is fixed: **no**.
The shared sponsor-funding guard remains in production code. This increment
investigates it and previews clearer feedback, but does not implement per-input
reservations or independent funding capacity. Keep the payment-concurrency work
open and do not describe the preview or passing regression gate as that fix.

7 November competition-entry proposal is ready at
`design/competition-entry-review/`, served locally on port 4205. It previews
per-pick regular/multiple-competition selection, already-used automatic regular
bets, mixed eligibility, reserved pending entries and a compact shared-funding
wait. Six local Chromium/WebKit journeys at 320/390/1440px passed choice, cancel,
focus, close/reopen, review and pending-state checks. Screenshots are under
`.quality-artifacts/competition-entry-preview/`; all data is synthetic. No live
scoring or payment change has been made. The README records durable intent,
atomic slot reservation, late-join opt-out and versioned rule migration before
implementation approval.

7 November payment/competition steering: investigate the shared sponsor-funding
warning and misleading competition badges on repeat predictions. Prepare an
isolated proposal preview for explicit per-pick scoring choices across multiple
competitions. Already-used slots must be regular-only for that competition;
preserve ordinary settlement and describe durable opt-out, pending reservation,
late-join and published-rule migration boundaries before implementation approval.
No scoring/payment implementation is authorized by this preview request.

Home split layout is implemented and passes focused carousel and navigation
checks. Its final major run stopped on a WebKit sidebar focus/visibility assertion
at `account-navigation-browser.cjs:326`; the focused suite passed earlier. Diagnose
and verify this separately rather than reporting a complete gate. Owner checklist
bytes were restored. Nothing from this Home increment has been pushed.

The focus assertion now waits for WebKit's actual scroll position before retaining
the same visibility bounds; all six focused navigation cases passed. The next full
gate stopped on WebKit intercepted campaign refreshes during a forced document
navigation. The fixture now waits for in-flight API reads before its explicit
reloads; browser errors are still fatal. Focused verification is running, and a
successful full gate is still required. Both failed runs are archived under
`.quality-artifacts/home-major-split-first.*` and `home-major-split-second.*`.

The next full attempt reproduced the refresh failure in the nested artwork
journey, which still called raw `page.goto`/`page.reload`. Its navigation now uses
the same in-flight read helper. The third failure is archived as
`home-major-split-third.*`; another focused run and full verification remain open.

7 November follow-up: split Home into two distinct carousel sections, one for
Predictions/Five/Survivor and one for active competitions. With no active events,
show "Watch out for competitions coming soon." Keep loading/outage states
distinct from that confirmed empty state. The earlier mixed-carousel full gate
was stopped after this steering; rerun verification for the final layout.

7 November Home request: rename the visible Overview navigation/breadcrumb to
Home while preserving existing URLs. Replace the Five-only hero with a compact,
manually navigated carousel for active competitions, Predictions, Five and
Survivor. Reuse the app's account-scoped competition query; preserve normal
navigation and payment flows. Keep mobile swipe/keyboard access, reduced motion,
optional artwork/fallbacks and clear loading/error behavior. Verify responsive
states, existing navigation and the required major gate before completion.

7 November banner correction implemented locally: competition title, status,
description and prize overlay dimmed artwork in one compact header. Cards also
overlay their artwork without added height. The owner then selected the Streak
logo as the default for missing banners; this is a presentation fallback, with
no database backfill. Custom uploads replace it and removal restores it. The
final CSS passes strict frontend compilation/build, static/format checks and
six focused Chromium/WebKit layout journeys at 320/390/1440px. Long-title testing
found and resolved WebKit intrinsic sizing; missing images keep the default.
Screenshots are in `.quality-artifacts/banner-overlay/`. At the owner's request,
`e3b2e20` was pushed to GitHub `main` on 7 November. Scoped formatting, static,
frontend TypeScript and production-build gates passed; push reused that receipt.
The owner's checklist and private state were excluded. Hosted rollout remains separate.

7 November owner requested publication. Artwork and navigation implementation
`6ad5368` is pushed to GitHub `main`. All 42 release file hashes matched the
6 November evidence; commit and push reused its successful 96-stage gate within
24 hours on Node 24.14.0. The owner's checklist and nested private state were
excluded. Hosted rollout, image persistence and physical-wallet acceptance are
still separate; retain all earlier open commitments below.

6 November owner approved navigation/artwork integration. Implement the reviewed
desktop rail and mobile dock/menu, plus optional icon/banner selection during
creation and editing of existing competitions. Existing records, including
rehearsals, must receive no generated artwork automatically. Admins can add,
replace or remove either image without changing frozen terms or participation.
Preserve ordinary payment/scoring flows and the owner's hosted checklist. Work
includes bounded persistent uploads, image optimization, focused regressions,
independent security/terms review and the required major gate before completion.

Implementation and local verification are complete. Optional admin uploads are
separate from frozen terms; existing records retain no artwork, failed creation
uploads resume the saved draft, and finished competitions remain editable.
Independent review resolved image CSP and upload identity-log concerns. Focused
HTTP/domain, disposable PostgreSQL, navigation/wallet/startup checks passed.
All 96 major-gate stages passed at 18:39 UTC, including expanded artwork browser
journeys and signed local-chain checks. Responsive screenshots were inspected.
See `docs/delivery/competition-artwork-navigation.md` and the ignored
`.quality-artifacts/artwork-release-2026-11-06.json` evidence. The owner's checklist
was restored byte-for-byte. Publication was subsequently requested and completed
as recorded above; hosted image persistence and physical-wallet acceptance remain separate.

Earlier preview checkpoints below are historical; approval and integration are
recorded above. Existing hosted acceptance, measured savings and prediction
concurrency commitments remain open.

6 November competition artwork and navigation design requested: prepare a
standalone desktop/mobile preview with clearer navigation sections, optional
competition icons and banners, and four reusable generated assets for Five and
Predictions. Show artwork-present and fallback states plus the admin controls.
This is preview work only; production media storage and navigation integration
await design approval. Preserve the owner's hosted checklist and all outstanding
acceptance, efficiency measurement and prediction concurrency commitments below.

Preview complete at `http://127.0.0.1:4204/`, documented in
`design/navigation-artwork-review/README.md`. Four original generated PNGs and
their prompts are saved beside the preview. All 24 scenario/interaction groups
passed in Chromium (1440/390/320) and WebKit (390), with an independent mobile
review. Optional upload/remove, finished labels, fallbacks, custom selectors and
focus return were verified without app/API/wallet access. Next: owner design
review, then implement optional media separately from frozen competition terms
and integrate approved navigation. No publication or deployment for this work.

6 November competition release complete: `938078c` was pushed to `main` and the
remote revision verified. All 95 stages passed on its exact tree at 16:48 UTC,
including the expanded competition/mixed-slip journeys and signed local-chain
claims, sponsorships and refunds. Push reused that successful receipt. The earlier
Five browser timeout is retained as failed evidence; all six isolated journeys and
the subsequent full run passed unchanged. Local artifacts are listed in
`.quality-artifacts/competition-ux-release-2026-11-06.json`. Hosted deployment and
physical-wallet acceptance are not claimed. Restore the owner's checklist after
publication; preserve the open hosted acceptance, measured savings and prediction
concurrency commitments below.

6 November further owner steering before push: competition context must remain
visible in a saved or mixed slip outside the competition page. Registered players'
first qualifying listed prediction may precede registration; regular wagers still
settle normally and unregistered accounts get no competition entries. Show each
entrant's chosen outcomes, disable repeat competition selection while retaining
ordinary market access, and add team logos plus real recent form. The in-progress
release gate was deliberately stopped before commit to include these requirements.
Version the new eligibility rule; preserve existing published non-rehearsal terms
and frozen awards. Active rehearsals may upgrade with an audit event and complete
canonical recheck. Payment and draft metadata remain separate from scoring authority.
The owner's checklist has been restored for continued testing; its backup and
stash remain private. Rerun the complete final-tree gate before the authorized push.

Expanded implementation is ready: owner-scoped summary membership drives saved
and mixed-slip labels without persisting new payment metadata; competition cards
show real logos/form, draft locks and verified choices. Canonical scoring accepts
pre-registration predictions under v2 and retains published v1 community terms.
Twenty-two domain checks, source/HTTP/profile checks, nine slip-label/navigation
checks, eight fixture-presentation checks and the disposable PostgreSQL audited
upgrade regression passed. Independent identity/scoring reviews found no blocker.
The expanded built-app browser run covers mixed slips, reloads and ordinary extra
bets. No hosted or physical-wallet result is inferred from those synthetic checks.

6 November competition testing feedback: keep the shared slip's Add matches inside
its source competition and show selected Home/Draw/Away outcomes. Refine composite
input focus, join-dialog hierarchy and compact standings freshness. Replace
competition alert banners with dismissible bottom-center toasts that slide upward
without changing page height; respect dialogs, mobile navigation and payment
controls. Prediction standings use shortened addresses, Five standings use saved
FPL names with a shortened-address fallback. Preserve payment/scoring authority
and the owner's existing test-checklist edits. Owner authorizes push after checks.
The earlier release is published as `c0a1199`; its exact-tree 94-stage gate passed.
Hosted wallet/refund acceptance, measured savings and concurrency work remain open.

Implementation is complete, including the competition-route fallback after reload,
route-scoped publication notices and account guards for delayed picks. Independent
UI/identity reviews found no blocker. Focused built-app evidence and screenshots
are under `.quality-artifacts/campaigns-runtime`; exact-candidate publication is
the next step, recorded in
`.quality-artifacts/competition-ux-release-2026-11-06.json`. Do not include the
owner's checked-off hosted acceptance guide in this UI commit. Preserve prior
hosted acceptance, savings measurement and concurrency commitments after push.

6 November publication gate stopped twice on the unchanged WebKit late-controller
startup recovery case: the CSS watchdog did not expose the retry link within its
existing deadline. Add an independent 10-second entry-script watchdog, cancelled
when the shell is ready and inactive after controller setup. Preserve the CSS
fallback when the entry script is also unavailable, and preserve the existing
browser assertions. All 64 startup groups now pass in Chromium and WebKit; an
independent lifecycle review found no blocker. Recheck the complete staged
candidate before publication. Failed logs and the focused pass remain under
`.quality-artifacts/streak-release-*`.

6 November owner authorizes commit and push of the prepared Streak release:
competitions, background efficiency, Five manager/pitch/refund changes and Zerion
optional-RPC compatibility. Publication review preserves the public screenshot
pack, restores newer published Week 23 facts, and excludes private correspondence
and generated nested test state. Run the normal exact-candidate commit gate, then
reuse its successful receipt for push. Hosted CI remains paused via the commit's
skip marker. The local publication result is recorded separately in
`.quality-artifacts/streak-release-2026-11-06.json`; deployed wallet/refund
acceptance, Render/Neon measurements and prediction concurrency remain follow-up
work regardless of Git publication.

6 November implementation update: approved Five names/pitch UI and refund fixes
passed all 94 major-gate stages at 11:07:41 UTC, including signed local-chain
refund/prize journeys. Independent identity/money review resolved session-response
fencing and truthful delayed-refund copy. The later Zerion optional account-picker
fix is independently reviewed with unit checks passed; final static/build and
built-app wallet regressions passed separately (seven static stages, five permission
tests and four Chromium/WebKit journeys). Keep this combined coverage
distinct from an exact final-tree publication receipt. No push/deployment or live
refund confirmation. Resume hosted acceptance, efficiency measurement and earlier
campaign/payment-concurrency commitments after rollout.

The task-owned disposable PostgreSQL container was stopped after successful tests;
the owner's existing local database and preview remain untouched. Final code and
screenshots are local. Deployment and real Zerion/refund confirmation remain the
next acceptance steps, with no new Render variables required by these fixes.

6 November owner confirms the refund issue is on streakpitch.com and reports
Zerion mobile sign-in failing with "rpc method is not whitelisted." Keep the
approved Five implementation and verification work; investigate the wallet RPC
sequence and add only a justified compatibility fallback, preserving explicit
rejection and account/signature checks. Independent identity review and focused
provider/browser regressions are required. Public read-only diagnosis at
10:45 UTC returned fundingAvailable=true, Gameweek 9 final and auction settled;
the new refund field is absent from the hosted response. This does not establish
whether the owner's individual refund was paid. No authenticated production
records, keys or funds were accessed.

6 November owner approves the Five standings preview and requests implementation,
plus investigation of a sponsor refund stuck on "Your refund is being returned."
Work in progress: persistent scoped FPL names before entry, named standings with
short wallet labels, shared live/standings pitch and mobile navigation. The
auction banner currently derives refunding only from losing the auction, ignoring
confirmed payout records; delivery review also found repeated paid-refund queueing
and a failed request capable of starving other wallets. Connect owner-only status
to durable refund credits and payout journals, retain signed-payment recovery,
and add bounded retry scheduling. Independent review and the major gate remain
required. Preserve the completed local efficiency work and earlier campaign,
hosted acceptance and payment-concurrency commitments. No production diagnosis
of this particular payment or fund movement is claimed.

6 November owner requests a design preview before implementation: Five standings
should show required FPL display names and shortened wallet labels; selecting a
manager opens a positioned squad pitch instead of an expanded footballer list.
The [interactive preview](../design/five-standings-review/README.md) is ready on
loopback port 4199: first-entry name gate, final/live points, captain scoring and
mobile back navigation. It preserves pre-deadline squad privacy, pending-score
semantics and separate allocation/payment status. Focused Chromium desktop/mobile
and WebKit mobile checks passed; screenshots were inspected. Runtime name
validation/public wallet-label projection remain proposed work pending design
approval. No app integration or publication. Continue preserving the
completed local efficiency refactor and earlier hosted/campaign commitments.

6 November owner approved the efficiency refactor. Implementation is complete locally:
targeted fixture/receipt SQL, unchanged Activity/campaign write suppression,
durable due-work queues and event wakes, authenticated local rewards health,
bounded provider/chain caches and Linux scheduling locks. Independent SQL and
financial/recovery reviews resolved legacy user defaults, payout queue fairness,
provider-failure scheduling and concurrent first-start schema creation. The
91-stage major gate passed at 08:41:26 UTC; after the final schema fix, static
(7 stages), unit (40) and disposable PostgreSQL (10) passed by 08:51:30 UTC.
Pinned Linux Node 24.14.0 lock tests passed separately. This is combined coverage,
not a single-run final-tree publication receipt. Runbooks and the
[delivery record](delivery/background-efficiency.md) are current. No commit, push,
deployment, live fund movement or measured hosting savings are claimed.
Next: coordinated API/supervisor/worker rollout and hosted idle/live/settlement
memory and Neon activity measurements. Preserve hosted campaign acceptance, PostHog setup and
prediction placement concurrency work. Earlier proposal-only entries below are
historical.

6 November owner asks for implementation specifics in a short summary. Proposed
steps: replace whole-store fixture synchronization with indexed, transactional
queries for affected fixtures/markets/bets and consistent cache invalidation;
diff Activity owners and campaign semantic state before writing, separating
freshness from audit revisions; persist due times and deduplicated jobs, wake
existing workers by authenticated local notifications and rebuild timers from
durable state on startup. Preserve bounded chain/provider polling, recovery
sweeps and request-time deadline checks. Replace the rewards database heartbeat
only together with its current 90-second readiness gate, using responsive local
health checks that include required dependencies. Bound caches by age/count/bytes
and page heavy reads. For the single-host Linux deployment, evaluate an OS-held
scheduling lock with verified descriptor lifetime so process death releases it;
financial mutation/publication locks, signed records and input reservations keep
their separate recovery requirements. Independent review agrees with these
boundaries. Verify idle, active, pending-payment, deadline and interrupted-worker
scenarios with memory/query baselines. These remain proposed changes, not an
implementation or hosting change; existing tasks remain pending.

6 November owner supplies current-container cgroup measurements: 310091776 bytes
current (295.73 MiB), 369913856 bytes peak (352.78 MiB), and a 536870912-byte
limit (512 MiB), with all reported memory events zero. These supersede the
475.56 MiB summed-RSS estimate for container usage; shared pages inflated that
sum. Entrypoints confirm PID 52 is the supervisor, 59 the API, 96 the sponsor
and 105 Five rewards. No settlement process appears in this snapshot, which does
not establish whether prior passes ran. Current usage is about 58% and recorded
peak about 69% of the limit. There is no measured imminent exhaustion or proven
leak in this instance; the previous Render memory-limit incident remains valid.
Normal processes are running, but end-to-end hosted acceptance and long-running
settlement/live-match memory behavior remain unverified. Prioritize targeted
reads, unchanged-data suppression, bounded caches and less idle database work;
measure representative peaks before recommending a paid memory upgrade. No
runtime optimization or hosted mutation was made in this diagnostic turn.

6 November owner supplies a process snapshot from a new hosted instance after
recovery guidance. PID 52 has three Node children (59, 96, 105). Their RSS values
are 81128, 185840, 129968 and 90036 KiB respectively, totaling 475.56 MiB. This
supports concern about combined process overhead against the previously observed
512 MiB cap, but summed RSS can count shared pages multiple times and is not the
container's charged usage. Entrypoints, current cgroup usage/peak and worker-pass
memory remain unverified; the process tree alone is not full hosted acceptance.
Use lightweight shell reads for container memory and allowlisted process identity
instead of launching another Node diagnostic in the constrained service. No new
runtime optimization, deployment or financial action was performed in this turn.

6 November owner requests a simple explanation and efficiency recommendations
before further implementation. Independent source review recommends targeted SQL
instead of repeatedly materializing/copying the twelve-table store, bounded
provider/chain caches and measured combined process memory. Activity already has
event delivery; retain it and schedule durable work by the next due time, with
prompt checks for pending money/live matches and sparse recovery checks when idle.
All idle database wakeups must be addressed together, including rewards heartbeats,
Survivor, campaigns and fixture synchronization, for Neon to suspend. Separate
freshness metadata from semantic changes to avoid unchanged Activity rewrites
and campaign audit churn; preserve audit evidence and outstanding obligations for
finished/deleted competitions. Restart recovery must prove exclusive ownership
and reconcile retained financial journals. These changes can use existing services
without Redis or another worker. Begin with a small memory/query baseline, reduce
large reads and redundant writes, then idle scheduling and restart hardening.
No measured savings, proven leak or 512 MiB capacity guarantee is claimed; actual
Neon billing attribution and successful hosted recovery remain unverified. This
turn records advice only, not runtime implementation or a paid hosting change.

6 November hosted ownership check confirms PID 52 exactly matches the supplied
signer-free maintenance server. The retained worker lease names PID 33955 on the
previous Render instance, with modification time 4 November at 22:18:23 UTC. The
current maintenance instance differs; prior process and lock inventories showed
no other application worker or mutation lease. Together with Render's exclusive
disk attachment this supports archiving only that stale scheduling lease, then
restoring `node products/streak/scripts/direct-host.cjs` so preserved journals
reconcile normally. The cgroup memory limit is 536870912 bytes (512 MiB). Recovery
instructions are prepared; archive execution, normal startup and process memory
measurements remain owner-side and unverified. Do not present the lease recovery
as a memory fix. Memory reduction, Neon idle-work reduction, PostHog integration
and the hosted competition rehearsal remain outstanding.

6 November owner supplies Render's incident email: the service exceeded its
memory limit and Render restarted it. This corrects the earlier disk-exhaustion
description. The reported persistent mount is healthy; the email establishes
memory exhaustion, not a specific leak or traffic spike. An abrupt restart could
leave the worker scheduling lease behind. Source inspection confirms the hosted
launcher runs compiled JavaScript in separate API, sponsor, optional Five rewards
and serial settlement-worker processes, plus the supervisor. Their combined
memory and broad database working-set reads warrant measurement; no per-process
usage or historical peak has yet been obtained. Continue the bounded lock-owner
and maintenance-process check before retiring only the scheduling lease. Keep
memory remediation and Neon no-change-query/write reductions as separate pending
work. No runtime setting, lock, financial record or hosted process was changed.

6 November owner supplies hosted maintenance diagnostics: the durable mount uses
3.0 MB of 974 MB, with 955 MB available; inode usage is 1%. The only reported
lease is `operator-private/worker-lease/operator.lock` (114 bytes). Persistent
storage is not currently exhausted; the original resource-failure cause remains
unverified. PID 52 is labelled MainThread, requiring command-identity inspection
before treating it as maintenance-only. Next: read bounded lock owner metadata
and identify that process. Independent review confirms this is a scheduling
lease: once its prior owner is proven stopped, archive only that file and resume
normal preserved-journal reconciliation. A blanket manual audit of all transactions
is not necessary for this narrower scheduling recovery. Mutation locks, reserved
inputs and funding barriers remain intact. No lease has yet been retired.

6 November owner reports Render Shell is available again after the maintenance
startup guidance. Next hosted evidence: filesystem byte/inode usage, largest
durable-state directories, exact lease filenames/sizes and process IDs/names.
These are read-only checks; no private environment dump or signed bytes are needed.
Maintenance activation is owner-reported, not independently verified. No stale
lease retirement, disk cleanup or signer restart has been performed by this agent.

6 November owner adds that the original hosted failure followed disk exhaustion
and confirms the high database bill was Neon PostgreSQL, initially described as
Redis. Read-only source audit finds no Redis integration/dependency. Actual billed
usage remains unverified. Normal background cadences include Activity job checks
every five seconds, enabled Five rewards passes/heartbeat every ten seconds,
sponsor recovery every fifteen seconds, the API tick every twenty seconds, and
Five progression plus serialized direct-worker passes about every minute.
Provider caches and adaptive polling reduce some external calls; timers do not
imply constant CPU execution or a transaction on every tick. These settings can
keep a serverless database active even without visitors.

Independent source review identifies broad working-set PostgreSQL reads in the
API tick, repeated replacement of Activity owner projections during audits, and
the rewards heartbeat even without payouts. In the new competition implementation,
fresh verification timestamps also trigger campaign metadata/audit writes without
score changes, including finished/deleted competitions. That is a concrete new
growth issue to correct before rollout, not evidence of the earlier disk incident
or historical Neon charges. Preserve meaningful score, registration, award and
financial audit events when reducing no-change writes.

Disk-full failure is now an additional plausible source of the retained lease:
operator acquisition creates the file before writing its owner metadata, and a
failed write can leave it behind. Financial journals, football observations and
Activity acknowledgement files persist; some have count caps/deduplication but
there is no complete automatic safe archive/retention path. Actual disk consumers
are not yet measured. Continue maintenance recovery and inspect bytes/inodes and
directory sizes before any cleanup; preserve signed records and unresolved funds.
Then scope idle-work reduction and baseline disk/cost safeguards separately from
the larger deferred post-grant monitoring project. No runtime or hosted changes
were made by this audit; PostHog and campaign acceptance remain pending.

6 November hosted deployment investigation: owner reports build success followed
by `Operator or registry lease remains` from the launcher; Render Shell is
unavailable. Source review confirms startup blocks solely on existence of operator,
worker or canonical-selection lease files. It does not establish live ownership.
A plausible cause is the 25-second forced shutdown interrupting sequential RPCs
or the sponsor's active recovery pass before lease cleanup. Actual lock metadata
and preceding shutdown logs remain unavailable, so this is not a confirmed cause.
Independent read-only review concurs. No lock, journal, hosted setting or funds
were changed. Next: temporary signer-free maintenance startup to regain Shell,
inspect exact lease ownership, preserve state and reconcile before targeted recovery.
Do not automatically delete locks by age/PID. The old per-fixture reconcile command
does not cover every v4 batch record and is insufficient alone for this audit.
PostHog project setup and the GW10 hosted rehearsal remain outstanding.

5 November owner moves to PostHog setup. Repository inspection confirms analytics
remain documentation-only: no SDK, runtime initialization or deployed event capture.
Provide short new-project steps for Streak Production and request its write-only
project token and exact regional ingestion host before integration. Keep the
existing evidence exports authoritative and the planned explicit-event, privacy
and operator-rehearsal exclusions. No PostHog project, tracking or paid feature
has been created or enabled in this setup-guidance step. Preserve campaign
deployment and real-wallet acceptance as outstanding work.

5 November owner requested a simple, ordered post-deployment test guide. The
[GW10 checklist](delivery/hosted-acceptance-2026-11-06.md) reuses funded wallets A–F
and covers both competition types, original payment/squad flows, sponsorship,
deadlines, claims, ties, inactive entrants, evidence and deletion. Official public
FPL reads verified GW10 closes 6 November at 19:30 Lagos and GW11 closes 21 November
at noon. Hosted availability could not be verified; fixture selection must be
confirmed in the deployed app. No live transactions, campaign publication or
acceptance checks were performed. Rehearsals cannot exercise mainnet awards;
retain that as a separate real-payment acceptance item. Next: deploy the already
implemented runtime, confirm hosted settings, then follow the owner's checklist.

5 November implementation of the approved competitions design is complete locally:
persistent campaigns and registration, configurable
prizes/fixtures, real Five squad reuse, the existing prediction slip, canonical
scoring and ties, public standings, private evidence exports and two-step audited
deletion. Registration immediately ranks inactive entrants at the bottom. Published
terms are frozen; deleted listings retain participant access and prize obligations.
Rehearsals are explicitly labelled and excluded from community evidence. Mainnet
awards use an owner-controlled wallet with exact-output confirmation, never the
testnet rewards signer. Administrators can prepare a future official FPL gameweek
now, retaining ordinary Five saves and automatic scoring. Named competition lists
remain reachable on short desktop screens and mobile.

Independent review is complete. All 86 required stages passed across the major
run's 75 application/database/browser checks and a separate 11-stage CKB run with
WSL access and the disposable test DB. The major aggregate stopped at the WSL
permission boundary; it is not a single-run green release receipt. See the
[delivery record](delivery/competitions.md) for exact runs and limitations. No commit,
push, deployment, live competition publication or mainnet payment was made.
Next operational work is hosted configuration and the owner's real-wallet rehearsal,
then the separately configured public campaign. Preserve the deferred payment
concurrency and post-grant monitoring work. PostHog setup instructions are ready;
the project, SDK, consent configuration and tracking activation remain separate.

5 November deletion preview is implemented for both competition types: two steps,
exact-name guard, cancellation/back, persistent sample removal and a fresh-draft
action. Both desktop navigation and the mobile competition menu hide deleted
listings. Five setup offers sample GW10 for rehearsal. All 26 focused Chromium/
WebKit checks passed at 390px/1440px; destructive-button hover contrast was also
corrected and reviewed. Formatting, module syntax and static policies passed.
No live campaign backend, production deletion, database changes or publication
is included. The runtime requirements immediately below remain outstanding.

5 November owner requests admin competition deletion for a rehearsal with test
accounts this gameweek before the main campaign next week. Require two steps:
first review the competition and deletion consequences, then type its exact name
before enabling the final action. The current task adds this interaction to the
standalone synthetic preview only. No live deletion endpoint, database mutation,
competition cancellation or fund movement is implemented or authorized by a
preview confirmation.

Runtime deletion must target only the campaign wrapper. Preserve underlying market
predictions, Five squads, transaction journals, recovery and payout obligations.
Retain audit records and read-only access for existing entrants, including final
standings and award status, while removing the campaign from active discovery.
Recheck administrator identity, campaign ID/revision and current obligations at the
final server-side action; a rename or state change invalidates stale confirmation.
Treat repeated deletion safely. Pending payments and confirmed awards remain
recoverable; deletion must not silently cancel published prize promises. Exact
published-campaign cancellation rules and runtime enforcement remain implementation
work. Keep rehearsal/operator evidence separate from community campaign evidence.

5 November owner requires competition picks to exercise the existing prediction
slip, review, signer, transaction journal and recovery flow. Five must reuse its
existing editor, save and scoring flow. Campaign scoring consumes verified admitted
positions and accepted squad records, never preview clicks or payment reviews.
Registration still creates a ranked entry immediately. No second checkout or squad
store is part of the implementation plan.

The standalone [admin preview](../design/competition-review/README.md) now has
guided setup, editable winning places/prizes, searchable fixture selection and
live review. The approved $25/$15/$10 split is an editable preset, not a fixed
winner count; fixture selection has no fixed campaign count. Existing eight-pick
slips and 32-position markets retain their limits. Setup changes apply only to
synthetic preview views. Published rules and exact CKB amounts must be frozen in
the future runtime. The owner accepted organizer-controlled mainnet rewards with
prepared, wallet-approved payouts; receiving-address setup and implementation are
still outstanding.

The admin Evidence view demonstrates participation, verified-payment categories
and an explicitly synthetic export. The new
[campaign evidence plan](product/campaign-evidence.md) covers durable records,
optional PostHog funnels/retention, privacy boundaries and new-project setup.
No PostHog project, tracking or production evidence collection is enabled. Resume
with the refined preview review, then campaign runtime integration and separately
verified mainnet awards. Preserve pending payment concurrency and post-grant
monitoring commitments. No commit, push or fund movement in this design increment.

Local verification: 20 Chromium/WebKit captures at 390px/1440px passed, with bulk
fixture selection, configurable prizes, exact totals, player/admin propagation
and the synthetic evidence export. Formatting, module syntax and repository
static policies passed. This does not verify production campaign integration.

5 November owner approved the competition UI, including the revised podium awards.
Record that approval without requesting another design confirmation. Owner also
asked whether mainnet prizes are user-claimed or manually sent. Clarify that the
proposed owner-controlled wallet model requires owner-approved payouts; the admin
page can prepare recipients and amounts while winners confirm addresses and track
status. Automatic custodial claims require a separately secured signer; independent
on-chain claims require funded claim cells and rules. UI approval does not choose
either automatic-claim alternative, authorize mainnet fund movement or establish
an implemented payout service. The later owner acceptance selects wallet-approved
payouts for this first campaign. Production competition integration remains the
next development increment; wallet configuration and publication remain outstanding.

5 November owner approved a podium award structure: first $25, second $15, third
$10 equivalent in CKB in each competition, keeping $50 per competition and $100
overall before fees. This supersedes five $10 awards below. Update the standalone
preview's winner eligibility, tables, personal award and payout counts together.
Completed locally; all 28 desktop/mobile preview journeys passed after the change.
Owner asked where to fund mainnet rewards; recommend a dedicated owner-controlled
mainnet wallet with reviewed wallet-signed payouts and confirmed transaction
tracking. The owner subsequently accepted this model; address setup and runtime
implementation remain outstanding. Existing Five/Survivor rewards are explicitly testnet-only. No live
wallet was created, configured, accessed or funded; no mainnet private key or
transaction is part of the design preview.

5 November owner requested an interactive competition design preview before
implementation, with a state dropdown and special attention to finished results.
The correction is explicit: registration creates a ranked entry immediately;
non-participants remain at the bottom with zero points. The standalone
[preview](../design/competition-review/README.md) covers predictions and Five,
registration, live/full states, final verification, winners/non-winners/no entry,
prize-paid status and an admin view. It uses synthetic data and changes no runtime
routes, wallets, database or payment behavior. Local browser preview checks and
screenshots are recorded with the design. No commit or push requested here.

Campaign planning remains: two $50 pools, now $25/$15/$10-equivalent podium awards;
prediction points are 3 for a correct first qualifying paid call per fixture and
0 for wrong/missed calls, independent of stake. Ties use the earlier last qualifying
prediction or earlier meaningful final Five squad/captain save. Five uses the
following gameweek, GW11, with the official 21 November noon WAT deadline. Keep
four shards and 32 positions per market, including non-campaign entries, with
database-backed occupancy and final live validation at checkout. Registration does
not reserve capacity. Public standings and private admin oversight are planned.
Production campaign registration, scoring, occupancy, reward management and Survivor
discovery changes remain unimplemented. Preserve payment concurrency and deferred
post-grant monitoring commitments below.

3 November owner places funding/capacity monitoring in the post-grant monitoring
implementation. Record configurable alerts for usable versus total sponsor funds,
cell fragmentation, selection limits, reservations and market/shard/registry
headroom in the payment proposal's operational section. Include stale-data and
recovery context so a healthy HTTP endpoint cannot hide exhausted funding.
Monitoring is deferred; payment correctness and recovery guards remain required.
No monitoring implementation, service activation or publication in this increment.

3 November owner deferred funding-selection fixes: record multi-input sponsor
funding in the concurrent-payments proposal, alongside per-cell reservations,
exact contribution/change accounting and signed recovery. Also review the user
collector's 16-input/256-candidate fragmentation limits without removing bounds
blindly. Owner clarified the slip had three predictions; the number of new markets
is unconfirmed. A read-only public query at 08:56 UTC observed the owner's
100,000 tCKB transfer as one live sponsor cell. No agent fund movement, runtime
change or successful slip retry is claimed. This is backlog work, not immediate
implementation; resume with the planned payment concurrency increment.

3 November hosted sponsor-capacity investigation: owner reported the complete-slip
funding error on streakpitch.com. Read the public demand configuration and its
advertised sponsor's plain testnet cells, without keys or transactions. At
08:39:49 UTC, the bounded 64-cell page returned seven plain cells totaling
7,271.09803104 tCKB; the largest held 4,070.99873903 tCKB. Current atomic preparation
requires one funding cell covering 3,050 tCKB per new market plus 61 tCKB sponsor
change for this lock. Two creations need 6,161 tCKB in one cell, so that snapshot
cannot support them despite sufficient aggregate capacity. The owner's exact
slip and its incident-time funding state remain unknown. Pending canonical
recovery has a separate error. Do not claim a one-market failure is explained by
this later snapshot. No funding, consolidation, runtime edit or publication was
performed. Per-input allocation/concurrency work remains pending.

2 November README architecture correction: replace the outdated product overview
with the integrated Season direct-payment lifecycle, script-enforced claims and
event-driven Activity boundary. Distinguish custodial Five/Survivor rewards and
retained legacy ledger flows. Correct setup, architecture and security wording;
label historical receipt, API and economic sections rather than erasing them.
Preserve earlier local changes. This is documentation only, with no new runtime,
deployment or capacity claim. Also corrected the v4 script README's obsolete
deployment disclaimer using its existing delivery report and manifest. Changed-file
formatting and repository static policies passed. No runtime tests were needed.
Owner requested publication without tests. Publish only this README correction
and its documentation entries, preserving unrelated local work. Prediction-placement
concurrency remains next.

1 November wallet chooser correction: define the CCC host's missing theme tokens
so the wallet panel and secondary dialogs have an opaque dark surface, with
readable wallet buttons, icons and dividers. Owner explicitly requested a fix,
screenshots and push without checks or tests for this increment. Capture the real
chooser locally with synthetic background content and no wallet transactions.
Publish only this CSS correction and its delivery note; preserve unrelated local
payment copy, proposals and private documents. Prediction-placement concurrency
remains the next implementation priority. Completed local mobile WebKit and
desktop Chromium captures, then pushed CSS and the delivery note in `06100dd`.
No automated checks, tests or production deployment verification were run.

1 November owner deferred large-scale Activity/indexing upgrades for later
consideration, depending on actual demand and grant funding. Preserve incremental
chain replay/checkpoints, changed-record or bulk writes, parallel per-market jobs,
efficient paginated reads/totals and measured capacity testing as backlog. Current
limits include full market reconstruction, participant snapshot replacement,
sequential jobs, file relay delivery and bounded catalogue/history reads; no
million-user readiness is claimed. Revisit using queue age, verification latency,
RPC load, database cost and active usage, not registered accounts alone.
Prediction-placement concurrency remains the active priority: independent funding
inputs, exact cell reservations, fair shard allocation and safe signed recovery
for different/same-market and mixed slips. Activity infrastructure expansion is
not a prerequisite for that increment. Retain current admission checks in later
deposits/settlement. This turn records prioritization only, with no implementation,
deployment, commit or push. Resume from the payment proposal's v4 concurrency stages.

1 November owner keeps admission checks in later deposits and existing settlement;
a standalone admission/refund transition is only a possible future enhancement,
preferably integrated with existing lifecycle work rather than a new worker.
Record this boundary in the protocol candidate. Developer time/deadline tooling
is exploratory only: existing header and since primitives can support libraries
and tested patterns, but a package cannot expose the containing block timestamp
or turn a lower-bound since condition into an upper inclusion deadline. No package
implementation, extra service, runtime change or publication is authorized here.

1 November owner requested a concise private technical guide explaining current
on-chain flows, backend/database ownership, wallets and games for a Solidity/web
developer. Drafted in the existing Git-ignored private reports directory, without
adding it to public documentation links. Current v4 behavior and proposed scaling
remain distinct. The guide has 14 sections with terms explained in context;
formatting, all eight local source links and `git check-ignore` passed. The file
is untracked and excluded by the existing private-directory rule. No runtime
change, commit or publication is part of this task. Preserve earlier payment-copy
and architecture-proposal work; the next step remains owner design review.

1 November owner requested a complete proposal after the explanation of v4's
capacity ceiling and stale-signature cancellation. Revise the recommendation to
cover the entire payment lifecycle and provide a concrete larger-market settlement
candidate, including its funding, deadlines and failure boundaries. This is design
work, not authorization to deploy scripts or move funds. Preserve the earlier
local payment-copy change and unrelated owner edits. The revised
[payment proposal](architecture/concurrent-payments.md) now covers the operation
matrix, narrow auction admission ordering, rejected-but-funded bid refunds,
treasury liability categories, operational alerts and phased completion gates.
The [larger-market candidate](architecture/payment-protocol-vnext.md) specifies
pre-created lanes, sealing, complete tree reduction, cross-lane funding, bounded
distribution, exact rounding and independent claims. Candidate 16-by-32 capacity
is a prototype objective, not a verified limit. Permanent metadata capacity,
data availability, permissionless execution costs and independent protocol review
are explicit design boundaries. Formatting and static policies passed (69 docs,
96 browser files, 105 syntax checks, 705 text files); no runtime tests, independent
review, implementation, commit or push are claimed. Resume with owner design review
and a complete protocol specification before any new-script implementation.

1 November owner requested a meticulous concurrency architecture proposal before
implementation. Draft: [concurrent payments](architecture/concurrent-payments.md).
Source inspection confirmed that funded v4 entry permits owner-only authorization,
but the client currently requires a sponsor and safe lease release differs when
users can broadcast independently. Recommend per-cell co-signed coordination first,
with sponsor-free checkout behind its own safety gate. Document four lanes and
32 positions per v4 market; larger capacity needs a separately reviewed protocol
and complete bounded settlement design. Includes resource schema, atomic multi-pick
allocation, signer fencing, replenishment, deadlines, game sponsorship/payout
boundaries, abuse controls, migration and measurable multi-owner tests. No runtime
concurrency changes, deployment, fund movement or push in this proposal task.
Owner and independent technical review remain pending; preserve the local wording
edit and unrelated report/checklist changes. Documentation formatting and static
policies passed; no concurrency tests or independent review are claimed.

1 November concurrency investigation: the combined checkout calls the shared
operator funding barrier before every offer, including already-funded markets.
An active unsigned offer can block another owner until its 90-second lease ends;
signed operator transactions must reach four canonical confirmations before the
barrier clears. This can affect different fixtures sharing the operator journal.
The first eligible shard is selected without parallel allocation in this path.
The friendlier copy does not solve this throughput limit. A future concurrency
increment needs separate funding-cell reservations, collision-free shard selection
and preserved signed-byte/reorg recovery, with simultaneous-user regression tests.
This is a source finding; no production concurrency experiment or runtime change
was performed for this question.

1 November owner requested friendlier payment-availability copy. The slip now
explains a reserved payment review or first-payment confirmation separately, keeps
saved picks explicit and asks users to review again shortly. Unknown/unavailable
states do not promise reopening; they offer another review or another match.
The pre-payment heading is "Let's get your slip ready". Availability guards,
signing, retries and payment recovery are unchanged. Frontend strict TypeScript
and production build, targeted ESLint and formatting passed. This copy-only change
has not rerun the full runtime gate; no commit or push in this increment.

1 November intermittent payment-review investigation: the screenshot message is
thrown in `web/src/features/direct/batch-ui.tsx` before transaction preparation
when fresh batch demand is neither available nor funded. Reserved, confirming and
unavailable states share the same generic copy; the amount validation follows it.
A public read of the hosted batch-demand endpoint found Liverpool vs Arsenal
(`api-football-1557453`) funded with payments enabled. The historical state at the
time of the screenshot is unknown. Temporary market reservation/confirmation is
a plausible cause, not a confirmed incident diagnosis. Follow-up: distinguish
temporary preparation from closure, expose useful progress/retry, and preserve
server validation and signed-payment recovery. No runtime edits or payment actions
were made during this investigation.

1 November owner requested an immediate Week 23 terminology correction and push
without checks. The report now distinguishes contention on one shared mutable
tracking cell from reuse of shared script code. This is prose only; preserve
unrelated report edits. No verification is claimed for this correction.

1 November owner requested publication after local acceptance. Runtime `cf81620`
is pushed to GitHub main, including the approved mobile-only filters and button-free
intro. All 79 checks passed in one full run, 07:32:05 to 08:17:57 UTC, Node 24.14.0.
All 16 candidate files matched the recorded source hashes over unchanged base
`e578df8`; normal commit/push hooks reused the receipt for tree `7fc68e028350`.
The disposable PostgreSQL container was removed. Final release notes use scoped
formatting/static hooks. Preserve unrelated report/checklist edits and private-draft
exclusions. Hosted CI stays paused. Remaining: verify the deployed frontend and
physical Zerion interaction; fix inherited Git environment isolation before the
next full hook-driven run. Earlier local-only entries are historical.

1 November implementation verified: the final mobile-only controls passed all 26
Season Chromium/WebKit browser groups, including desktop preservation. All 64
startup groups pass, including late-controller recovery. The required
`npm run quality:major` passed all 79 checks in one run, 07:32:05 to 08:17:57 UTC,
Node 24.14.0, exit 0. It ran outside Git hooks in
`.quality-artifacts/release-nov1-dropdowns`, with copied source hashes recorded in
`.quality-artifacts/nov1-mobile-startup-source.json`. Its log/report names are
`nov1-mobile-startup-major.log` and `nov1-mobile-startup-major.json` within that
checkout's `.quality-artifacts`. A first root run stopped on the owner's unrelated
checklist formatting; that file was preserved and no check was waived. The final
major run used only disposable PostgreSQL `streak-nov1-ui-pg` on port 55436,
container ID `b1806b0cd564181959739f7097350a174e57116f3ff2173efff91da22e51b4a7`.
That owned container was removed after verification; other development databases
were left alone. No publication is requested in this increment; retain private-draft
exclusions and unrelated report changes. Final evidence-only docs use separate
formatting/static checks; runtime source remains identical to the successful gate.

1 November steering during integration: preserve the existing desktop market
filters. Apply the compact panel only at mobile widths (700px and below), with
the original desktop labels, pill styling and placement. Startup fixes remain
cross-device. Browser coverage now explicitly checks desktop preservation.

1 November owner approved the mobile markets and button-free intro preview.
Integration is complete locally: real status/search/league/sort controls share the compact
glass panel; first-paint recovery is hidden with an independent CSS timeout for
missing scripts. Genuine errors use a separate recovery screen. Preserve private
draft exclusions, report edits and the existing acceptance checklist. Focused
startup/market browsers and the full major gate passed. Publication is separate.

1 November mobile markets preview prepared at `http://127.0.0.1:4197/`:
compact glass status/search/league/sort panel and a button-free logo intro.
Eight Chromium/WebKit preview journeys passed at 320/390/430/1280px. The real
startup HTML reproduced visible recovery links before a delayed startup controller
in both engines. Production files are unchanged. Await owner design approval,
then integrate controls and fix first-paint recovery visibility; maintain separate
real-error/no-JavaScript recovery, reduced motion and landing behavior. See the
[preview and findings](../design/mobile-markets-review/README.md). No commit/push
or live wallet/API calls in this increment. Earlier release and tooling follow-ups
remain open.

1 November public report publication: `e578df8` publishes Week 23 with current
release evidence and existing public game screenshots, and removes the private
draft and its links from the current branch. Documentation formatting/static
checks passed. Private correspondence is excluded locally and prohibited by the
agent contract; old Git history was not rewritten. The larger community gallery
remains local. Follow-up tooling issue: running the full gate from a Git hook in
the isolated worktree exposed inherited Git environment variables in temporary
repository tests. They altered that detached worktree's HEAD/index and shared
Git configuration. These were restored before publication; original main and
owner files were preserved. Fix fixture Git environment isolation before the
next full hook-driven run. The failed configuration-inclusive candidate was not
published; the final candidate contains documentation only and passed its gate.

1 November owner publication correction: private correspondence drafts must remain
local and excluded from commits. Remove the previously tracked draft and its
documentation links from the current branch; preserve owner deletions. Public
weekly reports remain separate. Do not restore or publish private drafts.

1 November release and public frontend verification completed: runtime `30599d2`
and notes `dff2340` are pushed. All 79 required local checks passed in one run,
06:06:49.203 to 06:44:51.442 UTC, Node 24.14.0, exact tree `95be163ef780`.
The documentation follow-up passed its scoped formatting/static checks. Public
Season HTML matched the verified frontend assets at 06:52:27 UTC. Evidence is
retained in `.quality-artifacts/release-nov1-dropdowns/.quality-artifacts/`,
including `all.json`, `nov1-dropdown-gate.log`, the exact-tree receipt and the
earlier cache-link failure/repair logs. The original main checkout now points to
the published revision; report/gallery drafts, owner deletions and the acceptance
checklist were preserved. Only the disposable release PostgreSQL container was
removed. Physical Zerion and hosted money/settlement acceptance remain open;
hosted CI remains paused. Earlier pending-publication notes are historical.

1 November publication completed for the first runtime increment: `1dc53d8`
pushed to main after all 78 full-gate checks passed at 05:37:27 UTC. It publishes
Five live teams/points, Survivor remaining-season rounds and creator prizes,
versioned early winners/outcome handling and readable pending cell loaders.
Independent reviews and isolated chain/database/browser evidence passed; no
hosted deployment or physical wallet acceptance is inferred. The dropdown
follow-up remains active in a separate exact-tree gate. Preserve report drafts,
owner checklist edits and the outstanding production acceptance commitments.

1 November added steering: owner reports dropdowns fail inside Zerion and requests
compact, subtly glassy in-page menus with smaller interface text. Replace native
pickers across Season and retained pages, preserving labels, selected values,
keyboard navigation, touch targets and dialog focus. Test Chromium/WebKit with
synthetic data; physical Zerion acceptance remains separate. The isolated
Survivor/loading release gate continues unchanged while this increment is built
in the working checkout. Preserve its earlier unfinished publication commitments.

1 November added steering: pending/disabled button opacity makes the three-cell
loader hard to see. Fix shared React/legacy loader contrast without enabling
disabled actions; verify filled, secondary and danger buttons, both loader shapes,
reduced motion and mobile/desktop. The in-progress release gate was stopped before
contracts so the final candidate can include this fix. Preserve its partial log;
do not count that interrupted run as a full pass.

1 November active follow-up: owner asks to publish Five's locked-team/points view
and Survivor's remaining-gameweek round count, and make a sole remaining survivor
win before the full round ends. Inspect existing result finality, all-loss/void
rules and prize idempotency before implementing; cover missing picks, unsettled
matches and recovery. Run the required gate, independent review and publish the
intended runtime change with the already committed `948fb1c`/`cc994c6`. Preserve
the report/gallery drafts and owner acceptance checklist. Hosted CI stays paused.

1 November [Week 23 report](../../../reports/week-23.md) complete locally, covering
work since the 26 October report: Activity indexing, wallet/mobile recovery,
branding/loading, Five, Survivor and community publishing. Includes four paired
actual-app screenshots with synthetic-data captions, a sanitized
[77-check receipt summary](../../../reports/assets/week-23/validation.json).
Read-only runtime and evidence reviews found no remaining blocker. Scoped
formatting, static policies, 16 local report/evidence targets and diff whitespace
checks passed. No new runtime gate is claimed for this documentation-only task.
GitHub main was independently verified as `2839e9e`; local `948fb1c`/`cc994c6`
remain unpublished. Owner reports the issue update is posted, without an
independently verified public URL; Nervos Talk remains pending account permissions.
No commit, push, deployment or external message was performed. Next: owner reviews
the report; retain the outstanding hosted auction/refund/settlement, Survivor
funding/progression/payout and final Five reward acceptance commitments.

31 October forum permission follow-up complete locally: verified the media/link
rejection against official Discourse validation and permission sources. The
full introduction and gallery are preserved, with a separate
[text-only fallback](../../../reports/community/nervos-talk-text-only.md) and
formatted-copy tab. Source and copy payload checks confirm no URLs, hyperlinks,
images or image markers; mobile layout and page-error checks passed. README
recommends moderator review for the full showcase and avoids any promise of an
automatic trust-level unlock. Actual account settings and forum submission were
not tested; no external post or message was sent.

31 October gallery correction complete locally: added Streak Five and Survivor
desktop/mobile pairs using actual built components and isolated sample game data.
Five shows a complete saved squad, captain and budget; Survivor shows a saved
pick, used team and upcoming fixtures. All four new captures have no page errors
or external network requests. Both drafts, formatted-copy page, five-board gallery
and five-image upload folder/ZIP are updated. All exports are below 1.2 MB;
390/1440px gallery layout, image loading, upload hashes and ZIP entries passed.
The prediction journey remains first. No runtime change or external post was made.

31 October publishing usability correction complete locally: removed internal
notes from both drafts and documented the Markdown-mode repaste after the forum
displayed pasted Markdown literally. The [formatted-copy page](../../../reports/community/copy-ready.html)
separates title and body, with formatted/Markdown copy and manual-selection
controls. Copy payloads passed with an isolated clipboard adapter; 390/1100px
layouts and links passed with no page errors. The clean upload folder and ZIP
contain only the three paired PNGs; hashes match the gallery originals and ZIP
entries were verified. Content and synthetic captions are preserved. Live forum
paste and publication remain the owner's next step; no external post was made.

31 October publishing pack complete locally: separate GitHub issue and Nervos
Talk Markdown drafts, three paired desktop/mobile PNGs and an HTML gallery are in
the [community publishing pack](../../../reports/community/README.md). Actual
built components use isolated sample data, including the compact mobile payment
blob and collectible Activity return. Six source captures passed with no page
errors or external requests. The 1920px paired exports passed image-size and
390/1440px gallery-overflow checks. Capture provenance and composition evidence
are retained with the images; Week 22 assets are unchanged. Both platforms can
host editor-uploaded images, with instructions included. Nothing was posted,
committed or pushed for this pack; no live transaction was performed. Keep the
synthetic captions and undeployed-release wording when publishing. Next: owner
reviews the drafts, uploads the paired PNGs in each composer and publishes.

31 October positioning correction: the owner rejected a games-first forum story.
Lead with Streak's core prediction journey, independent positions in one payment,
stake/storage transparency, recoverable signatures and separate claims. Explain
on-demand market capacity and the event-driven index through the user problems
they solve. Five, Survivor and bounded sponsored rewards support onboarding and
return visits; these are intended product effects, not measured adoption. Editorial
review completed. Keep oracle/custody and undeployed-release boundaries accurate.
No external post made; draft remains in the conversation.

31 October Nervos Talk draft: researched CKBoost and Fiber Link proposals against
the forum's funded-proposal list. Both list USD 20,000 approved budgets, distinct
from fully disbursed funding. Their English proposal bodies are approximately
1,750 and 900 words respectively, excluding translations/replies. Adapt the clear
user journey, ecosystem purpose and linked evidence into a community introduction
with weekly rewards, short game rules and concise architecture. No fixed weekly
prize promise or mainnet availability claim; latest local changes remain undeployed.
Draft delivered in the conversation only. No forum post or funding request made.

31 October issue-draft refinement: explain the architectural journey, shared Rust
scripts with separate market cells, event-driven wallet indexing, on-demand reserve
funding, atomic slips, independent claims and recovery. Include the domain, short
Five/Survivor explanations and rules links. Distinguish contract-enforced predictions
from off-chain fantasy state and custodial rewards. Keep the draft concise and
evidence-led for acceptance-team review; no external posting authorized or performed.

31 October communication follow-up: Neon recommended an update on the existing
GitHub issue and Nervos Talk, with acceptance-team visibility. Prepared separate
technical and community drafts in the conversation from the Week 22 report and
current delivery evidence. Nothing posted externally. Keep the verified local
release distinct from hosted features; physical Survivor acceptance and publication
of `948fb1c`/`cc994c6` remain outstanding.

31 October post-deadline release completed: `948fb1c` commits the combined Survivor
and Five work. All 77 checks passed in one complete gate through the commit hook,
from 12:57:59 to 13:38:27 UTC; the commit reused its exact-tree receipt. Source tree:
`d0bf4b7149bf`. Evidence: `.quality-artifacts/oct31-release-gate.log`, `all.json`
and the exact-tree hook receipt. The owner's checklist and unrelated files remain
outside the release. Not pushed or deployed; hosted CI remains paused. Next:
physical Survivor creator funding, confirmation, refund and winner payout checks,
then provider-backed competition acceptance. Local dummy rounds can exercise
immediate deadlines without waiting for the next provider gameweek. Earlier
uncommitted/incomplete-gate entries below are historical.

31 October Five follow-up implemented locally: the default stays on the most recent
locked gameweek; its saved squad displays updating player points, captain scoring,
provisional/final labels and retained snapshots on refresh failure. Pick next team
opens an independent editor with its deadline, save/edit and Back to current team.
Historical selection and existing scoring/deadline rules remain intact. Focused
domain/feed tests, six workspace journeys, local game-mode checks and six expanded
Chromium/WebKit journeys pass, with build/lint/static verification. Next: owner
review, required full release gate and publication. Preserve the separate Survivor
physical-wallet acceptance below. [Details](delivery/five-live-team.md).

31 October Survivor increment implemented locally: official FPL deadlines on new
schedules, prominent close time, numeric remaining-season round selection and
creator-funded custodial testnet prizes. The owner explicitly selected the existing
rewards wallet. Signed payments freeze draft edits; confirmed backing gates publish;
terminal outcomes create conserved payouts or refunds. Reuse shared input reservations
and payout recovery; mismatched reward databases disable funding explicitly.
Domain, disposable PostgreSQL, complete browser and contract/chain checks pass across
the major run and documented reruns. Independent review accepted the corrected queue,
configuration and conflict recovery. The final mobile consent layout was inspected.
The original major run timed out in the loader suite; its complete rerun passed.
Five chain/rehearsal fixtures now exercise strict higher bids and exact refunds.
No single full-release receipt is claimed. Next: physical creator funding,
confirmation, cancellation refund and winner payout acceptance, then publication
through the required gate. Owner checklist edits are restored; this increment remains
uncommitted. [Implementation](delivery/survivor-creator-prizes.md).
Five's amount-edit and higher-bid correction was pushed as `2839e9e`.

31 October owner follow-up in progress: make unfinished Five sponsor amounts
editable and require new cumulative bids to exceed every admitted bid, including
payments confirming. Keep accepted payments immutable and exact retries recoverable.
Also show Survivor deadlines prominently, align new schedules with official FPL
deadlines, and accept numeric round counts through the remaining season. Creator
prize funding is requested; clarify contract escrow versus the existing custodial
testnet rewards wallet before choosing that financial boundary. Existing Survivor
prizes remain announcements until actual funding is implemented and verified.
Do not drop the sponsorship correction while extending Survivor.

31 October urgent sponsorship correction: owner reports Zerion succeeds but
MetaMask returns "Unexpected contribution transaction shape." Five incorrectly
required a witness per input, although CCC prepares one per shared owner lock.
Accept at least one witness while retaining all input/output/fee checks and the
mandatory chain dry-run. Do not pad or rewrite saved signatures. The focused
Five suite passes with two same-owner inputs, dry-run rejection before persistence,
exact-byte retries and invalid transaction rejection. Independent money/recovery
review found no blocker. Publish this narrow campaign fix with the full release
gate deferred under the owner's urgent direction; physical MetaMask acceptance
remains outstanding. Keep the failed panel open and retry its saved contribution
after deployment, before the noon deadline. Preserve the owner's edits to today's plan.

31 October published: GitHub `main` confirms `162dc061947e65a06f19579726e541a215b5fff5`.
The reviewed 39-file release includes wallet switching, mobile payment controls,
two-decimal balances, regression sources, gate scheduling and today's checklist.
Automatic approval initially rejected an unclear staged-file scope; an explicit
39-file manifest review resolved it before commit/push. No new tests were run,
per owner override. Original `.gitignore` and `todo` bytes have been restored.
Next: save all six Five squads and complete bids before noon, confirm Render's
deployed revision, then resume full automated verification after the deadline.

31 October owner override: publish all prepared product fixes immediately and
defer further automated tests because the Five deadline is approaching. The full
gate did not finish; its last log stopped during Five browser checks on 30 October.
Commit/push hooks are explicitly skipped for this release only, with hosted CI
also skipped. This is not a successful full-gate receipt. Resume full verification
after the urgent production campaign. All six wallets are funded, per owner.
At 10:44 Lagos, hosted Five and official FPL both confirmed GW9 closes at noon;
the round was open with funding available and zero sponsor bids. Use the
[31 October checklist](delivery/hosted-acceptance-2026-10-31.md), saving every team first.

30 October release-gate follow-up: balance labels required updating the sponsored
wallet browser expectation to two decimals. Two full reruns then reproduced the
existing healthy-child startup test failing under concurrent Node test load; its
isolated suite passed. Run that same process-lifecycle suite as a dedicated gate
step before concurrent client tests, preserving every assertion and deadline.
The exact-candidate gate must pass before commit or push. Unrelated `.gitignore`
and `todo` bytes are temporarily preserved under the ignored
`.quality-artifacts/oct30-mobile-release-preserved/` directory; restore them after
the release hooks finish. No production data or signing keys are used by the gate.

30 October publication authorized for the wallet-disconnect and mobile payment
controls. Include the owner's follow-up: wallet balances show exactly two decimal
places rounded down, using integer shannons for display while transaction values
retain full precision. Run the complete local release gate for this candidate,
commit the intended files and push with hosted CI skipped. Preserve unrelated
ignore-file changes and private local state. Physical-wallet acceptance remains due.

30 October local review opened on owner request: rebuilt frontend is served at
`http://127.0.0.1:4100/season/`, verified HTTP 200 and opened in the default
browser. The existing API was reused; no signing or settlement worker was started.
Mobile header and draggable pending-payment controls are implemented with
independent recovery review. Four wallet-header journeys, four wallet-overview
journeys, two placement tests, frontend build and lint pass. All six final checkout
journeys and the static lane pass, including WebKit phone drag and no-overflow
checks. Evidence: `.quality-artifacts/oct30-mobile-tracker-browser-final.log`
and `.quality-artifacts/oct30-mobile-controls-static.log`. WebKit exposed a decorative card
border escaping a static container; relative positioning now contains it without
clipping the page. Full release verification, publication and physical acceptance
remain separate. See [implementation](delivery/mobile-payment-controls.md).

30 October mobile header and payment notifications requested: use a deliberate
two-row mobile wallet layout, with a single-line sign-in/disconnect action.
Provide a real close action on collapsed and expanded failed/successful updates.
Owner refinement: pending payments cannot be dismissed. On mobile, minimize them
to a small animated three-cell button that expands when tapped. Further steering:
make the button draggable to each corner without covering other modal controls.
Snap inside safe screen bounds and avoid the header, slip dock and navigation;
temporarily yield to modal dialogs and restore when they close. Keep drafts,
signed recovery records and background monitoring intact. Make transient sign-in
errors dismissible too. Verify mobile
layout, dismissal, new payment/status updates and keyboard behavior before release.
The verified wallet-switching correction below remains local and uncommitted.

30 October wallet-switching correction completed locally: Season's header and
My Account share Disconnect, immediately clear identity/private caches and CCC's
remembered provider, request permission release and select an account on explicit
reconnect where supported. Failed logout remains suppressed across reloads;
cancelled account selection cannot reuse the old account. Signed-payment recovery
is preserved. Independent identity review accepted. All 76 major checks passed
at 13:59:26 UTC, including supported/unsupported permissions, rejection, stalled
revocation, server failures and two-account switching in Chromium/WebKit.
Evidence: `.quality-artifacts/oct30-disconnect-major-final.json` and its log.
Resume with publication, then physical MetaMask/Zerion/native-wallet switching,
reload and the existing hosted campaign. No physical switching or hosted fix is
claimed. Changes remain uncommitted; no new Render setting is needed.

Cleanup checkpoint: stopping the owned disposable `streak-quality-postgres`
container was approved on retry, but Docker has not returned. The stop command
remains pending; confirm that container is stopped when Docker responds. Do not
restart Docker or stop the separate developer database to force cleanup.

30 October physical Zerion retry: the owner reports sign-in now works after
updating the Zerion Android app. Record this as owner-reported physical success,
not synthetic evidence or proof of a particular provider bug. Old/new app
versions were not supplied. No further runtime fix is warranted by this report.
Next campaign checks are session persistence across navigation/reload, then F's
payment approval and resulting Activity status; these remain unverified.

30 October physical retry after `916e91e`: MetaMask connects, but Zerion Android's
in-app browser still reports no active connection. The owner confirmed this is
a created/imported wallet capable of sending, not a watch-only address. The
previous patch improved error visibility but did not resolve this physical
wallet failure. Investigate the specific provider/signing step before another
runtime change. Preserve working MetaMask behavior and the production campaign.

30 October publication authorized: commit and push the verified mobile sign-in
patch and campaign notes with hosted CI skipped. Runtime and regression sources
are unchanged since the 76-check pass; release-note formatting and static checks
are verified separately. Preserve the unrelated root ignore-file edit and local
notes. Next acceptance is Zerion in-app sign-in, navigation and reload after
Render deploys this candidate, followed by F's payment checks.

30 October mobile authentication blocker: the owner is using Zerion's in-app
browser. Address/balance appear, but sign-in returns to its button. The slip
shows no error; the header reports "No connected wallet". Local synthetic checks
also reproduced blank-error and missing-session silent failures. Candidate work
renews EVM permission on explicit sign-in, retains account-change guards, checks
the session after verification and displays nonempty failures inside checkout.
All four wallet and six checkout journeys pass. Independent identity review
accepted the final injected-EVM-only renewal guard and failure tests. The final
major gate passed all 76 checks at 11:01:09 UTC; evidence is retained in
`.quality-artifacts/oct30-mobile-auth-major-final.json` and its matching log.
Implementation is local, not committed or deployed. Next: publication and a
physical Zerion sign-in/reload retry before resuming F's payment tests. Do not
claim a physical Zerion fix or change Render configuration without evidence.
Preserve the production campaign and all earlier unfinished acceptance checks.

30 October campaign steering: only MetaMask and Zerion are available. E uses
another MetaMask address; F uses a distinct Zerion mobile address. Native CKB
wallet acceptance remains unexercised. First mobile issue: connection succeeds
but Sign in with wallet remains visible. Source distinguishes connection from
the signed server challenge/session; the owner confirmed the prompt does not
appear and supplied the error above. Do not
label mobile authentication passed or blame hosting without evidence. Preserve
the release freeze while establishing the failing step.

30 October production campaign begun at 09:51 Lagos. Published commit `b7511ec`
is verified on GitHub main; its entry asset filenames match the hosted page.
Read-only public checks confirm batch entry enabled, all three planned evening
fixtures available, and Five GW9 open with funding enabled and noon 31 October
lock. No payment, acceptance, settlement or payout is yet proven. Guide the
owner through Wallet A's three 100 tCKB Home picks first, then B/C opposing
outcomes and the remaining [production plan](delivery/hosted-acceptance-plan.md).
Keep feature work frozen unless a blocking defect requires a verified fix.

30 October publication authorized: commit and push the compact Five layout,
visible budget/save controls and dated production test plan. This release uses
the CSS/documentation gate; eight focused browser journeys already passed.
Keep GitHub CI skipped, preserve the unrelated root ignore-file edit, and leave
local launchers/private state outside Git. Confirm the remote commit after push;
Render deployment and production acceptance remain separate checks.

30 October local review is running at `http://127.0.0.1:4100/season/?view=five`
with the existing local database and regular game data. API/page reads return
200; the local review launcher leaves hosted Telegram registration unchanged.
This starts the API for layout review, not the separate signing/settlement or
rewards workers. No production state or wallet payment was changed.

The [production plan](delivery/hosted-acceptance-plan.md) now names tonight's
Elversberg/Mainz, Villarreal/Espanyol and Lille/Lens fixtures, verified against
the public hosted catalogue and independent schedules. Official FPL and the
hosted round confirm GW9 closes 31 October at noon Lagos time. Survivor's
provider-derived lock is separately 13:29. Six-wallet assignments and dated
settlement/finalization checks remain unperformed. Owner review precedes push.

30 October follow-up: the owner found the budget hidden below the pitch. The
budget/save panel now precedes the pitch, with a persistent Bank readout in the
mobile squad/player toolbar. Strict frontend build, formatting/static checks and
eight Chromium/WebKit gameplay journeys pass, including first-screen budget
visibility and pitch containment. Screenshots inspected. Preserve the compact
game-first layout and all prior commitments. Publication is now authorized above.

29 October Five layout correction implemented locally: the squad/player market
starts at 164px on a 1276 by 662 viewport, leaving 75.2% of the initial screen
for play. Compact shell/title/tabs/gameweek controls replace the stacked header;
sponsorship credit follows the builder, with bidding and details in Sponsors.
Mobile squad navigation remains intact. Strict frontend build, formatting/static
policies and eight Chromium/WebKit layout/gameplay journeys pass, including
selection, captain, save/reload and tab return. Screenshots inspected under
`.quality-artifacts/five-layout/`. This CSS-only change is not committed or
published. The published release and pending hosted acceptance below remain
separate. See [workspace evidence](delivery/five-workspace.md).

29 October release published: `51d0849` is verified on GitHub `main`, including
the newly approved loaders across the dapp and the earlier wallet, Activity and
branding/startup work. All 76 exact-tree local checks passed at 15:37:59 UTC;
commit/push reused that receipt. GitHub Actions skipped with `[skip actions]`;
zero workflow runs verified. Local logs preserve earlier failed/interrupted runs.
Implementation and publication are complete. Next: confirm the hosted release,
then perform the [production acceptance plan](delivery/hosted-acceptance-plan.md)
with fresh fixtures and physical wallets. No hosted or live-wallet success is
claimed by the synthetic browser and disposable-chain results.

29 October owner approved the refined loading preview while publication was
underway. Shared rotating/pulsating cells and connected-wave loaders are now
implemented across Season, games, payments, Activity, account, startup and
retained legacy pages. Six motion groups and eight built application loading
states pass in Chromium/WebKit; screenshots inspected, frontend build, scoped
lint and static checks passed. Independent review accepted after detached-node
cleanup was corrected and tested. See [delivery evidence](delivery/connected-loading.md).
Next: verify the final staged tree and push the combined candidate with GitHub
CI omitted. Preserve actual operation states, accessible labels, reduced motion,
hidden-tab suspension and error/retry controls. The previous publication gate
was interrupted before completing after this scope change.
The earlier timeout coincided with Windows battery-triggered hibernation;
it is not passing evidence. Keep prior publication logs and fresh exact-tree
verification. Hosted and physical-wallet acceptance remain separate.

29 October publication authorized: push the pending Streak release to GitHub
with hosted CI omitted. The candidate contains wallet compatibility, the approved
identity/splash assets, event-driven Activity and its local/UI corrections, and
the refined loading preview. Keep the loading animation as a preview until its
application integration is approved. Preserve unrelated local files and runtime
state outside the commit. The exact candidate must pass the existing local hook;
reuse that receipt for commit/push instead of repeating suites. Hosted acceptance
and physical-wallet evidence remain pending after publication. Resume with the
frozen-candidate production test plan. The later loader approval above supersedes
this earlier preview-only publication boundary.

The first publication gate passed 56 checks, then stopped at the shared-wallet
browser fixture's outdated Activity tab assumption. The wallet fixture now supplies
an authenticated synthetic empty index; historical sponsored recovery explicitly
opens Recovery options. Signature, claim and original-transaction assertions remain
required. Preserve `.quality-artifacts/oct29-publication-initial.json` and its log.
The final exact-candidate result is recorded in the publication commit's validation
notes; no failed gate is treated as a release pass.

29 October 07:46 UTC: [refined loading preview](../design/loading-signature-review/README.md)
is ready at `http://127.0.0.1:4199/`. Three square cells rotate and gently pulse
in circular controls; horizontal cells follow a sine wave while their links draw
between them. Both appear enlarged and at real UI sizes, with pause, reduced
motion and explicit state controls. All eight Chromium/WebKit groups at
320/390/1440px plus OS motion preferences passed; source checks and visual review
passed. A Chromium motion-preference transition issue was corrected and verified.
Preview only: application loaders await this revised design's approval. Preserve
local Activity/splash fixes, final-candidate publication and hosted acceptance.

29 October Activity and landing corrections completed locally at 06:03 UTC. The
older launcher blocked Activity routes and omitted index startup. Its corrected
allowlist and dedicated local PostgreSQL setting preserve file-backed accounts;
all 23 registered markets are now indexed, with 135 event receipts and no retrying
markets. Empty read failures use one stable retry card with secondary recovery;
cached records remain visible. Landing pages never show a splash, including
missing-controller/stylesheet cases. App startup retains its approved reveal.
Backend types, frontend build/lint, the dedicated PostgreSQL regression, all four
Activity browser journeys and all 58 startup browser groups passed. Independent
reviews accepted; mobile/desktop screenshots inspected. See [Activity evidence](delivery/event-driven-activity.md)
and [startup evidence](delivery/startup-identity.md). No fund movement, commit,
push or new full-gate receipt. Next: resolve the pending linked-cell loader preview
decision, then verify and publish the final candidate before hosted acceptance.
Preserve all earlier unfinished publication and physical-wallet commitments.

29 October splash correction completed locally at 05:40 UTC. The approved
animation now unfolds over a two-second presentation, with Open Streak/Escape
skip after shell readiness. Data loads underneath; covered controls stay inert.
Reduced motion, background tabs and React recovery bypass the presentation;
missing artwork has a one-second bound. All 38 isolated Chromium/WebKit groups,
frontend build, lint and syntax checks passed. Independent review accepted after
the missing-artwork timeout was made immediate; mobile rendering and local HTTP
asset delivery were verified. [Evidence](delivery/startup-identity.md). No full-gate
rerun, wallet signature, commit, push or deployment. The revised [production plan](delivery/hosted-acceptance-plan.md)
defers fixture selection until development, candidate verification and deployment
are complete. Next: finish the older local launcher's PostgreSQL Activity
startup/routes while preserving its records. Linked-cell loader preview approval,
publication and physical-wallet/hosted acceptance remain pending.

29 October owner correction: the startup splash disappears too quickly. Give the
approved drawing a readable two-second presentation with a ready-shell skip
control, while startup data continues underneath. Reduced motion and failure
recovery must stay immediate. This supersedes the earlier no-minimum-duration
rule. The owner missed the planned hosted bets and wants development finished
before acceptance: replace expired fixtures with a release-freeze checklist,
then select fresh matches and gameweeks after the candidate is deployed. Do not
claim any hosted tests were performed. Splash verification is recorded above;
preserve the local Activity launcher gap, publication commitments and pending
linked-cell loader preview decision.

28 October splash correction complete locally at 16:02 UTC: assets had been served correctly, but immediate layout-effect removal and an initially invisible SVG hid the splash on fast starts. The runtime artwork is visible immediately, with compressed motion, image preload and an inert 260ms exit over the usable shell. Reduced motion removes it immediately; input and data never wait. Frontend build, lint, formatting and all 20 isolated Chromium/WebKit startup groups passed, including fast first-frame pixels, input during exit, slow/recovery and missing-controller paths. Independent review accepted; current local HTTP assets are verified. Evidence: `.quality-artifacts/startup-fast-fix-browser.log`. No server/data migration, wallet signature, commit or push. The local Activity launcher integration and earlier publication commitments remain pending.

28 October local reopening: opened <http://127.0.0.1:4100/season/> in the owner's browser. Existing API launcher restarted as PID 6848 with local dummy-game mode, sponsor watchdog as PID 3412, and the persistent local database retained. App, Five and atomic demand returned HTTP 200; sponsorship is enabled. Local-launcher gap discovered: this older wrapper uses file-backed app/auth storage and bypasses normal server boot, so the new PostgreSQL Activity index is not active there. Next local integration must preserve existing records while configuring the index and its startup/routes. This does not change the completed isolated verification or establish hosted acceptance. No commit, push or wallet signature.

28 October verification closeout: final seven-check static/build gate passed at 14:28:19 UTC after the corrected runtime/browser follow-ups. Disposable Activity test database removed; app database and operational services untouched. Event-driven Activity implementation is complete locally, with all 75 required checks covered. Resume with existing publication/hosted acceptance commitments or the separately pending loading-signature preview decision.

28 October event-driven Activity completed locally. All 75 required checks have passing coverage across the major run and documented scoped follow-ups; initial failures are retained (historical sponsored recovery selector, then missing disposable-DB setting in the separate Five contract run). Final Activity browser coverage passed at 14:24:04 UTC, including signer-free reads, stale-record recovery, submitted summaries and live claim flows. Independent identity/recovery reviews accepted. [Delivery and evidence](delivery/event-driven-activity.md). No commit, push, live fund movement or hosted activation. Rebuild/restart API and sponsor together on publication; existing DB/IPC settings suffice. Preserve prior wallet/branding publication and hosted acceptance. Linked-block loader remains preview-only, awaiting approval.

28 October implementation progress: event-driven Activity now has public-only durable event delivery, transactional PostgreSQL receipts/jobs/wallet records, canonical all-owner reconstruction and authenticated recent-first reads. Frontend prefetches after sign-in without an active signer. Explicit chain recovery and live claim checks remain. Focused tests and independent identity/recovery reviews are complete; final major verification is in progress. [Delivery](delivery/event-driven-activity.md) records bounds/configuration. Resume with final gate results, corrections and evidence updates. No publication or live payments. Preserve prior wallet/branding publication and hosted acceptance; linked-block loader remains preview-only.

28 October owner approved implementation of the event-driven wallet Activity index. Implement durable event delivery, PostgreSQL owner records, canonical admission/settlement/claim verification, targeted catch-up/reorg handling, authenticated paginated reads and startup prefetch. Keep actual claim preparation live and preserve signed recovery. Frontend must use indexed records without requiring an active signer to read, with explicit legacy recovery if indexing is unavailable. Independent review and full major gate are required. This supersedes the index pause; the linked-block loader preview still awaits its own approval. No commit/push or production fund movement requested.

28 October architecture discussion: owner proposes event-driven Activity updates on market creation, bet completion and results. Source audit confirms useful durable sponsor/operator journal observations, while direct claims can bypass the API. The proposal now uses durable events as its primary update path, with deduplication and targeted recovery for missing events, pending admissions, external spends and reorgs. Reported results remain distinct from collectible settlement. No runtime/index implementation is approved or performed in this discussion. Preserve the pending linked-block loading-preview approval and earlier publication/acceptance work.

28 October loading-signature preview ready at <http://127.0.0.1:4199/>. Three linked cells from the approved logo supply one indeterminate motion across buttons, Activity refresh, game loading and expandable confirmation status; terminal states are static and manually selected in the preview. Chromium/WebKit checks passed at 320/390/1440px with retry, focus, all four states and reduced motion; independent review accepted. This is design only, awaiting approval before replacing actual loaders. The approved logo/splash is integrated locally with 18 startup browser groups passing; its major gate report records all 72 checks passed at 10:11:39 UTC. The PowerShell wrapper returned 1 from a Vite warning, retained separately in the delivery record. Final formatting/static checks cover the later preview/docs and updated recovery assertion. The temporary test database is removed after verification; no operational app restart or fund movement. Production test plan and architecture explanation are simplified. Resume with loading-signature feedback and existing publication/physical-wallet commitments. Architecture remains paused and no commit/push is requested.

28 October new steering during approved startup verification: derive a site-wide loading signature from the logo's three linked blocks. Prepare an interactive preview before replacing existing loaders. Cover buttons, Activity, wallet approval, games and minimized payment progress with one coherent motif, clear state labels and reduced motion. The approved logo/splash integration and simplified documents remain in progress toward verification; this request does not authorize a durable activity index or publication.

28 October owner approved the refined logo and splash for integration. Apply the permanent connected cells beneath the chart-r and initial-shell motion, preserving fast readiness and failure recovery. Owner also requested a short production test checklist and plain-language architecture explanation; those documents are simplified, with engineering detail retained separately. The durable index is still for review, not approved for implementation. Integration verification is underway; preserve earlier wallet/warmup changes and pending publication/physical-wallet acceptance.

28 October owner follow-up: connected cells must belong to the static logo, with the space beneath the chart-r used for balance. The isolated splash preview now retains three connected cells beneath the r across dark, light, single-colour and reduced-motion wordmarks. The animation assembles this permanent detail; the separate loader is a quiet line. Independent visual review accepted the spacing at primary and header sizes. Focused Chromium/WebKit checks passed at 320/390/1440px, including images, overflow, static variants, retry/completion and reduced motion. Architecture implementation is explicitly paused while the owner reads the proposal. Preserve the existing bounded warmup and unfinished publication/acceptance work; no application branding integration, commit or push in this refinement.

28 October refinement completed locally: second splash/identity proposal uses two cutting strokes, a price-chart r, connected outcome/CKB cells and a cell-shaped dot. Port 4198 preview passed responsive Chromium/WebKit/retry/reduced-motion checks; actual branding integration awaits review. The production-only test plan is saved as Markdown. [Activity startup warmup](delivery/activity-startup-warmup.md) now prefetches at most two recent saved markets after authenticated wallet restoration, sharing foreground query keys and fencing obsolete account results. Eight focused tests, final frontend build/lint and four direct plus four wallet browser journeys passed; independent review accepted. No full major/release/hosted speed claim. Durable owner indexing and broader expensive-operation improvements remain designed but unimplemented in [the architecture proposal](architecture/wallet-activity-index.md). No contract changes, payments, restart, commit or push in this increment. Preserve pending publication, physical-wallet acceptance and earlier commitments.

28 October owner steering: refine splash with two strikes cutting the s, a market-chart r and CKB/blockchain/prediction meaning; retain preview approval before application integration. Second proposal is live at port 4198 with generated static/animated SVGs and passing responsive Chromium/WebKit/retry/reduced-motion checks. The hosted acceptance Markdown now explicitly counts only streakpitch.com results. Owner also requests fast wallet-indexed activity and startup prefetch across expensive operations. Source audit confirms per-market chain fan-out; [durable wallet index proposal](architecture/wallet-activity-index.md) preserves CKB claim authority and avoids a global mutable contract bottleneck. A bounded read-only startup warmup increment is being implemented/reviewed separately; do not mark the durable index or whole-app speed targets complete. Preserve pending release and prior commitments.

28 October splash and hosted acceptance planning completed. Owner approved previewing an animated On form startup, not integration. Isolated port-4198 preview covers quick/slow/retry/reduced-motion states; Chromium/WebKit responsive checks passed. [Six-wallet hosted test plan](delivery/hosted-acceptance-plan.md) records verified GW9 noon-Saturday deadline, tonight's all-outcome prediction coverage, sponsor top-up/refund cases, Five entry/prize coverage, two Survivor competitions and explicit limits. Same-wallet history is not automatic environment sync: public catalogues have 23 local and 5 hosted descriptors with zero identical full market type scripts; Five/Survivor records are database scoped. No bets, game creation, signatures, production settings or publishing executed. Resume with splash design feedback, pending wallet/branding publication and planned manual hosted acceptance. Preserve earlier commitments.

28 October owner requested full local startup. Rebuilt the app, retained the running persistent Docker database and both rewards workers, restarted the API in test mode (PID 26856), and restored sponsor watchdog (32656, signer 36836) plus direct settlement loop (27264). Read-only checks at 07:43 UTC show dummy Five/Survivor HTTP 200, existing Test gameweek 2 open, Five funding available, atomic prediction demand enabled, and successful direct-worker passes. No game records, bids, deadlines or owner signatures were created. Telegram webhook configuration is unavailable; Telegram is not part of this local game acceptance. Evidence: .quality-artifacts/local-full-test-readiness.json and named local-full-test logs. Prior wallet/branding publication and physical-wallet acceptance remain pending. PIDs are dated observations, not durable identifiers.

28 October local startup guidance: verified the existing ignored launchers for the Season API, sponsor watchdog, direct settlement loop, ordinary Five rewards and separate dummy-game rewards. API launcher includes fixture refresh, Five progression and Survivor ticking. All named launcher/config files exist; Docker and process inspection were denied in this session, so running-service health is unverified. Owner receives separate-terminal commands using the persistent streak-survivor-dev database and explicit api/test mode. No services started, keys displayed, runtime changed or publication performed. Preserve pending wallet/branding publication and earlier commitments.

27 October approved On form integration completed locally. Shared React Brand and retained legacy surfaces now use the complete wordmark; browser/touch/compact icons use the same s. Build, lint, static policies, 26 Season Chromium/WebKit groups and legacy responsive checks passed; screenshots and local SVG/PNG/ICO delivery inspected. [Assets and evidence](../design/brand-review/README.md). Supersedes branding-pending entries below. Publication remains pending, alongside earlier wallet acceptance and unfinished product commitments; no commit, push or application worker restart in this increment. Owner's unrelated ignore entry and private/generated state remain untouched.

27 October owner approved On form application integration. Apply the complete wordmark, with its segmented s as the initial letter, to Season/landing and retained legacy branding; use the standalone s for favicon, touch icon and compact insignia. Keep wallet/session/money behavior unchanged. Verify asset delivery, responsive layouts and existing relevant browser journeys. Preserve prior wallet fixes, publication limits and unfinished commitments.

27 October owner selected **On form** as the Streak brand direction. Preserve the complete streak wordmark with the segmented s as its initial letter; use the same s alone for favicon/app insignia. The preview now opens On form and labels it Selected. Direction selection is complete; applying its exported assets to the application remains the next branding step. Preserve pending wallet publication, physical-wallet acceptance and all earlier commitments.

27 October owner branding refinement implemented in the preview: the word streak itself is the primary logo, with the custom insignia replacing its initial s, followed immediately by treak at a shared lowercase height and baseline. Standalone s remains the favicon/app insignia. All three wordmarks, previews and asset packs were regenerated; On form now uses a segmented s so the name stays readable. Chromium responsive and mobile WebKit checks passed. Final concept selection and production integration remain pending; preserve the uncommitted wallet compatibility work and all earlier commitments.

27 October branding preview ready at <http://127.0.0.1:4197/>: three original vector directions, Breakaway (recommended), Touchline and On form, with custom outlined lettering, dark/light/monochrome applications, actual-size favicon previews and downloadable SVG/PNG/ICO packs. Chromium checks passed at 320/390/768/1360 widths and mobile WebKit selection/theme checks passed. Desktop/mobile/contact-sheet visuals were inspected; the mark's counters and mobile header were refined. [Preview and regeneration](../design/brand-review/README.md). Await owner direction selection before applying branding to the actual app. No runtime branding, commit, push or hosted change. Wallet compatibility work remains local and uncommitted; publication and hosted/physical-wallet acceptance remain pending. Preserve all earlier commitments below.

27 October wallet compatibility implemented locally: owner requests MetaMask, Zerion and popular CKB wallet support without asking supervisor Neon to debug. Found JoyID exposed by the chooser but rejected by auth (matching the screenshot's address prefix and HTTP 400), and login errors hidden behind the slip. Implemented strict primary P-256 JoyID proof normalization/address binding, explicit login stages and visible slip errors, delayed EVM discovery, and read-only UTXO Global/JoyID restoration. REI remains explicit because its SDK reads request account access. Sponsored predictions still support native CKB and EVM locks only; the UI now explains unsupported formats before payment review. Independent identity/recovery review accepted. All 71 major checks passed at 11:47:28 UTC; four wallet and six full checkout journeys passed in Chromium/WebKit. A later presentation-only helper class change passed the full static/build lane after a formatting correction; the failed formatting receipt is retained. The disposable test database was removed; application state and workers were untouched. No new Render environment variable is required. Resume with publication when requested and physical-wallet/hosted acceptance; current changes are uncommitted and unpushed. Do not ask Neon for diagnostics. Preserve existing release, logo and all earlier commitments. [Delivery evidence](delivery/wallet-compatibility.md).

Week 22 rollout follow-up: anonymous HTTPS checks after publication found the matching `index-DWsM8nEv.js` frontend on streakpitch.com in API mode, and the served Survivor bundle includes the setup correction. Source and frontend rollout are verified; physical wallet and hosted payment/reward acceptance remain the next operational check.

26 October Week 22 release published as `cfd8dfec20fe186bad1822d58d3eb87a1158e6fe` on `origin/main`. The exact-candidate hook passed all 71 checks at 18:23:53 UTC and push reused its receipt. [Report](../../../reports/week-22.md) cover Five, sponsor auctions, Survivor, reliability, local full-flow testing and streakpitch.com. Fresh Five screenshots use API data and an unsigned, unsaved squad; auction and Survivor screenshots are explicitly synthetic. The domain returned HTTPS 200; hosted release acceptance and physical MetaMask refund/prize checks remain separate. Unrelated .gitignore and nested benchmark work are excluded from the release. Resume with hosted acceptance, owner feedback and original logo/favicon; paid Survivor admission, automatic Survivor payouts and other stated beta limits remain pending. Preserve earlier commitments.

26 October Survivor setup correction complete locally: Continue setup previously only reselected a draft while publication was buried in the game hero. Drafts now open a dedicated host review with entry terms, prize, deadline, expandable schedule and Publish free competition. Creation and Review setup focus this workspace; inactive team boards are hidden until publication. Paid-entry and expired-schedule restrictions explain how to proceed. Six responsive Chromium/WebKit journeys and all 71 required major checks passed at 12:08:36 UTC in one run. Local HTTP checks confirm the new frontend is served in regular-data mode; refresh the page, no API restart needed. [Implementation and evidence](delivery/survivor-implementation.md). Free entry works; paid admission and automatic Survivor prize payments remain unimplemented. No funds, owner records, commit, push or hosted deployment changed. Preserve earlier release, physical-wallet and logo commitments.

26 October latest corrections complete locally: consistent Five/Survivor Beta labels; no public mode controls; environment-only localhost dummy data with stale-scope rejection; Survivor creation/reload and delayed-response cache correction; visible competition cards and publish/join guidance; grey used teams; next-three fixture outlooks for Survivor and Five. Independent identity/recovery review accepted. All 71 required checks passed in one major run at 09:57:27 UTC, including new HTTP, delayed-create, fixture retry and responsive browser coverage. [Delivery and mode configuration](delivery/games-local-mode-and-outlook.md). API PID 4708 is active on regular data; live read-only FPL outlook returned 20 teams with three fixtures each. Existing stores/rewards workers retained; only the disposable quality database stopped. No wallet signature, commit, push or hosted deployment. Preserve pending physical MetaMask/hosted acceptance and earlier commitments. Next design task remains original logo/favicon.

26 October additional owner steering: newly created Survivor competitions must be easy to find and join; used teams need visibly grey unavailable cards; team boards and Five player lists need the next three fixtures. Preserve explicit draft publication, deadline rules and no-repeat enforcement. Add compact fixture outlooks using existing provider data, without one provider request per player or invented fixtures.

26 October owner correction in progress: remove public game-data switches and URL-selected test mode. Select dummy Five/Survivor data only through a local environment setting; retain isolated stores, real testnet wallet paths and admin deadline controls in that local mode. Make Five and Survivor Beta labels consistent. Verify stale-tab and hosted access denial without redirecting signed requests between stores. Logo/favicon remains next after this correction.

26 October Five workspace integration complete locally: squad-first tabs preserve drafts, formation separates positions, captain and save states explain the next action, and Back to squad works across panels and dialogs. Sponsors exposes open-round bidding plus moderated optional introductions/descriptions and branding. Independent money/identity/recovery review accepted. All 71 required checks have passing coverage at 08:37:18 UTC across the major run and documented follow-ups; original navigation-selector, missing test-DB setting and intermittent archived-preview failures are retained. [Implementation and evidence](delivery/five-workspace.md). Local API PID 17128 uses the original launcher and stores; regular and test routes return HTTP 200. Rewards workers were left running and only the disposable quality database was stopped. Next: design an original Streak logo and favicon. Physical MetaMask acceptance, publication and hosted rollout remain separate pending work. Preserve all earlier commitments below.

26 October owner approved the refined Five workspace and authorized integration. Implement the actual tabbed workspace, persistent drafts, correct formation, explicit captain/save states, mobile return navigation and prominent sponsor bidding. Persist optional sponsor introduction/description through existing validated, moderated sponsorship records and show confirmed eligible sponsor profiles. Preserve actual/test data separation and all financial rules. Run required runtime gates and independent review of sponsorship/recovery boundaries. After completion, the next design task is an original Streak logo and favicon. No new publication or funded action requested.

25 October preview refinement complete locally at `http://127.0.0.1:4196/`: Back to squad is explicit in panels and dialogs and stays reachable while scrolling the mobile player list. Formation has distinct forward, two-midfielder, defender and goalkeeper lines. Sponsors opens with a prominent open-gameweek bid card and isolated amount/review interaction. All six Chromium/WebKit preview journeys passed at 16:48 UTC, including formation geometry, sticky return navigation, draft preservation and visible bidding at 320px. App payment tracker and legacy Matchday details now use SVG disclosure icons; no text chevrons remain in the searched active web/public sources. Shared contributor/design guidance records that preference. Frontend build, lint, static policies, formatting and all six existing synthetic checkout journeys passed; no live wallet was used. [Preview evidence](../design/five-workspace-review/README.md). Five layout/bidding remains a preview awaiting approval; only icon presentation changed in the app. No commit, push, hosted update or money-rule change. Preserve all earlier unfinished testing and release commitments below.

25 October Five workspace preview completed: [review guide](../design/five-workspace-review/README.md), running at `http://127.0.0.1:4196/` (preview server PID 9520). My five opens first, secondary sections use tabs, mobile exposes a direct player-picker switch, saved entries distinguish Save changes, and explicit captain guidance explains incomplete teams. Sponsor credit opens an editable showcase with optional description, introduction, logo and website; anonymous, open-auction and unsponsored states are distinct. All six Chromium/WebKit journeys at 320/390/1440 passed at 16:28 UTC with no external requests, writes or page errors. Screenshots reviewed; scoped frontend build, static policies and diff checks passed. Existing build warnings remain. Resume with owner approval before live integration, including any sponsor metadata schema work. Preserve the in-app testing implementation and pending physical-wallet acceptance below. No production feature, schema, wallet, rewards, commit or deployment change was made for this preview.

25 October in-app testing implemented and active locally: the actual Five and Survivor pages now offer explicit dummy data, immediate admin deadline/results/next-round controls and a full reload back to API data. Ordinary FPL deadlines and gameweeks remain intact. Five uses the existing MetaMask path with a separate protected test rewards wallet, a separate persistent database and a reserved schema. Its faucet reserve is confirmed; its worker remains running independently when the view switches. All 71 required checks have successful coverage: 70 passed in the major run, then all 11 contract checks passed at 15:19:28 UTC after stopping the verified obsolete rehearsal on port 4190. The initial failed receipt remains preserved. A CSS contrast follow-up also passed the web build and all four new browser journeys. Independent money/identity/recovery review accepted. [Delivery and configuration](delivery/in-app-games-testing.md). API PID 29552 and dedicated test worker PID 27556 are active. Resume with the owner's physical MetaMask sponsorship, competing-bid refund and winner claim at `http://127.0.0.1:4100/season/?view=five&games=test`; an async request is pending. Survivor uses `?view=survivor&games=test` with two real signed-in entrants and its existing free-entry/announced-prize rules. No owner signature, commit, push or hosted activation was performed. Keep every earlier unfinished commitment below.

20 October quality pass and Survivor deletion verified locally: all **60 major checks passed at 07:42:14 UTC**, including the new silent-restoration, progressive Activity, delayed approval, cross-journal reservation and two-claim polling coverage. Empty Survivor games can be removed after confirmation; games with entrants retain their records. The server checks the signed-in wallet against `STREAK_SURVIVOR_ADMIN_WALLETS`; deletion and admission share a database row lock. [Delivery and evidence](delivery/wallet-activity-quality.md). Resume with owner review of the local build and a separately accessible physical MetaMask session; current browser automation cannot reach the owner's extension. No commit, push, local operator startup or hosted change was performed. Preserve all outstanding product work below.

Updated **20 October 2026**, Africa/Lagos. Current branch: `main`, after Activity release `df147f1`. This file tracks commitments and interruptions. [Status](../status.md) describes the implemented system; the [roadmap](product/scope-and-roadmap.md) describes the wider product direction.

## Current focus

25 October owner asks to test Five without waiting for the weekend. Verified the existing isolated rehearsal at `http://127.0.0.1:4190/state` is reachable at phase 0, not busy, with no error. Direct the owner to its six-step flow: competing bids, top-up, deadline/refund, synthetic scoring and collection. It uses preset demo squads and actual signed local-chain transactions; it does not verify the hosted MetaMask journey or live FPL finalization. No process restart, live payment, production deadline change or new runtime implementation was needed. Hosted launch readiness remains separate from this rehearsal.

24 October release published: runtime commit `74ee5e3` is on `origin/main`. The complete exact-candidate gate passed all 68 checks at 21:04:44 UTC (22:04:44 Africa/Lagos), including the new interactive signed-chain rehearsal. Push reused its successful exact-tree receipt; no suite was bypassed or repeated for transport. Owner chose to enter Render settings manually. A separate hosted rewards wallet was generated in protected ignored storage and funded with 10,000 tCKB, verified after 28 canonical confirmations. Settings and the matching key location are in `.quality-artifacts/five-render-settings.txt`; the key was never printed or committed. The fresh rehearsal is available on loopback port 4190 at its first step; the ordinary local API was reloaded after verifying process identity, retaining its original database and rewards worker. Resume with the owner's rehearsal and manual Render configuration, then hosted end-to-end verification. Render activation and physical MetaMask acceptance are not claimed. Independent deadline/rehearsal review accepted. [Verified release and setup](delivery/five-release-rehearsal.md).

24 October release candidate ready for the exact-tree gate: deadline regressions and the complete six-action Chromium/local-chain rehearsal passed, including stale worker heartbeat before prize collection. Independent review accepted the correction and rehearsal. The intermediate WSL forwarding readiness failure was fixed with a bounded read-only probe. Scope is the accumulated approved product changes and supporting quality tooling; unrelated `.gitignore` edit and generated nested benchmark data are preserved separately during the gate. Render integration is available but not connected. [Run and configuration instructions](delivery/five-release-rehearsal.md). Resume with exact-candidate release checks and publication, then leave the isolated rehearsal available for owner use. Real hosted/MetaMask acceptance remains separate.
24 October owner authorized all three release steps: official-deadline fail-closed correction, an isolated short rehearsal and commit/push followed by hosted rewards setup. Keep current polling intervals. Deadline regression passes; interactive loopback rehearsal uses disposable PostgreSQL, dummy wallets, a private CKB node and test-only clock advancement. Six browser-driven bid/top-up/refund/scoring/collection actions passed on the first run; independent review requested heartbeat refresh for slow manual use, now added with stale-heartbeat coverage. Render integration was discovered but is not connected; connection requested while local release work continues. Scope includes accumulated approved Five, Survivor, calendar and wallet quality work; preserve unrelated ignore-file edits and generated benchmark data. Required independent review and exact-candidate release checks are in progress. No hosted activation claimed.

24 October owner confirmed the official FPL deadline, normally 90 minutes before the first EPL match, for both squad/captain changes and sponsorship bids/top-ups. This resolves the earlier 60-versus-90-minute clarification; retain the provider's official deadline rather than introducing a custom one-hour rule. Existing server enforcement uses the same published `lockAt` for both actions. Confirmation grace does not admit new bids. Outstanding release correction: remove the catalogue's one-minute fallback when the official event deadline is missing, with regression coverage and the required review/checks. Accelerated isolated wallet rehearsal remains pending; no real gameweek timing or results changed.

24 October deadline/testing steering: owner wants picks and sponsorship bids to share the pre-match deadline and wants settlement verification without waiting a whole EPL week. Verified both entry saves and signed bid admission enforce the same published `lockAt` on the server; the 30-minute auction grace accepts confirmations only, not new bids. Current automatic rounds follow the official FPL deadline (90 minutes before the opening fixture), whereas the owner mentioned 60 minutes. Requested clarification before changing published timing rules. Inspection also found a catalogue fallback to one minute before kickoff when the event row is absent; this must fail closed on missing official data before release. Existing disposable-chain tests accelerate synthetic round boundaries; a short isolated wallet rehearsal remains a proposed additional acceptance route, not a completed hosted test. Do not alter real gameweek scores, deadlines or funded records to accelerate verification.

24 October Render configuration review: compared the owner's previously shared environment names with the current Five runtime and hosted launcher without reading secrets or changing Render. Automatic EPL progression needs `STREAK_FIVE_FPL_ENABLED=1`; sponsorship/refunds need the enabled dedicated testnet rewards child, matching address/key and funded reserve. Existing `DATABASE_URL` is the default for both API and rewards worker. Admin wallets must be explicitly configured. Auction rules add no separate environment flag. The new code remains local; deploy it before enabling the hosted worker. Use a separate hosted rewards wallet/database state from the active local test wallet unless performing an explicit state handover. No hosted activation or publication performed.

24 October sponsor auctions are implemented and active for newly created local rounds. Owner approved cumulative wallet top-ups. Highest funded total wins the sponsor spot; signed-admission order breaks ties, a 30-minute canonical confirmation window bounds eligibility, and losing/late bids refund automatically. Independent review accepted downtime, reorg, queue-race, audit and unpaid-status protections. All 67 required steps have passing coverage: 39 pre-browser checks, the full 18-check browser group and 10-check contract group. The full-run receipt retains a calendar-test failure because selecting today correctly omits the date URL parameter; the corrected assertion passed in the complete browser rerun at 20:03 UTC. Contract group passed at 19:53 UTC. No assertions or suites were skipped. Local API and worker reloaded; desktop/mobile checks passed and Gameweek 9 still has its original confirmed 100 tCKB pool with no auction mode. [Rules and evidence](delivery/five-sponsor-auction.md). Resume with owner review and a future real auction settlement; live auction refunds remain unverified. No commit, push or hosted change. Preserve prior unfinished commitments below.

24 October owner reports successful sponsorship and requests a sponsorship auction: highest funded sponsor before gameweek start wins, other bidders refunded. Implement for newly published/automatic rounds only; retain existing published community-gift terms and the current signed contribution. Proposed repeated payments are cumulative top-ups per wallet, deadline is the official squad lock, deterministic earliest accepted funded total breaks ties, and pending accepted signatures delay settlement. Winning funds alone become the prize pool; losers receive automatic refunds through the dedicated worker and durable payout journal. Optional branding remains moderated and anonymous bids remain possible. Money/recovery review and full major gate required. No hosted publication requested.

24 October live rewards acceptance resumed at owner request. Local API, rewards worker and Docker were stopped; restored the existing development database and processes without replacing keys or records. Read-only testnet verification found the same 10,000 tCKB reserve with 15,377 confirmations. There were no sponsorships, credits, payout records or claim requests to reconcile. Automatic progression opened Gameweek 9 with its official 31 October 11:00 UTC deadline; the API reports rewards available and a 100 tCKB minimum. Asked the owner to submit through their wallet, which this automation session cannot access. Resume with that signature, then verify canonical confirmation and pool attribution. Do not count restored services as completed live payment acceptance. No runtime changes, commit, push or hosted changes.

23 October rewards activation is complete locally: fresh native testnet rewards wallet, owner/SYSTEM-only private-key ACL, separate minimal-environment worker, public address on API and 10,000 tCKB faucet reserve confirmed after 26 blocks. No previous Five liabilities existed. Sponsorship is enabled on Gameweek 8; desktop/mobile checks passed. Existing domain, disposable PostgreSQL and signed local-chain recovery checks passed; independent activation review accepted. [Operational details and evidence](delivery/five-local-rewards-activation.md). Resume with the owner's minimum 100 tCKB sponsorship through the local UI, then verify its confirmed pool attribution. Physical-wallet contribution, eventual real winner collection and refunds remain unverified. No fake results, entries or sponsored pool; no product runtime, prediction funding, commit, push or hosted change. Earlier commitments remain below.

23 October rewards activation: owner approved proceeding with the dedicated Five testnet rewards wallet and local sponsorship/recovery verification. Restore the existing development database, create isolated rewards configuration, fund the separate fee reserve through the testnet faucet where available, and verify worker/API readiness. Preserve prediction signing state and all prior work. Do not invent entries, winners or gameweek results to demonstrate live rewards. Physical-wallet acceptance, funding confirmation and synthetic regression evidence must be reported separately. No commit, push or hosted configuration change requested.

23 October status review: owner reaffirmed approval of the Survivor preview and asked what remains. Survivor's free competition flow is implemented locally; approval is already recorded and is not a new design blocker. Remaining Survivor work is actual fee collection, funded prizes, refund/payout handling and hosted acceptance/publication. Across the product, Five rewards-wallet activation, automatic-round default settings and double-gameweek support remain open, alongside real-wallet/hosted recovery acceptance, the unresolved MetaMask warning, Community Markets, notifications and original branding. Latest local commit remains `df147f1`; extensive subsequent work is still uncommitted. This was a source/documentation status check, not a live-service verification or authorization to publish. Prior completed work and remaining commitments below are retained.

21 October automatic EPL progression and player scouting are complete locally. The API scheduler opens official rounds, observes provisional points and finalizes only complete checked results after both correction windows. Frozen terms, private entries and prize recovery are preserved. Dense pitch/player views, form/transfers sorting and clickable history/fixtures work on mobile/desktop. Public local activation opened Gameweek 8 with 562 eligible players; 668 scouting records and seven-match/eight-fixture profiles were verified read-only. Independent review accepted deduplication, fair catch-up, bench-card and funding guards. All 66 required checks have passing coverage across the major run's first 38 checks and successful complete browser (18) and contract (10) groups. Full-run receipt still records the subsequently fixed selector failure; no coverage was skipped or fabricated. Resume with owner review at `http://127.0.0.1:4100/season/?view=five`. Dedicated rewards wallet activation, future automatic-round default settings UI and double-gameweek support remain separate follow-ups. No commit, push, rewards funding or hosted change requested. [Delivery record](delivery/five-automatic-gameweeks.md). Earlier local work is preserved.

20 October local checkout availability: reproduced the owner's recurring disabled-payment notice. The API was alive but the sponsor listener on 4101 and its process were absent. Restarted only the existing sponsor launcher with its original journal; availability returned true for 182 fixtures in 617 ms. Added a local watchdog that leaves existing/uncertain services alone and restarts stopped service with backoff, plus five-second outage polling and animated Check again in the slip. Build, lint, formatting/static policies, two synthetic watchdog tests and six integrated checkout journeys passed across Chromium/WebKit at 390/900/1440 pixels, including outage, animated retry, automatic recovery and retained picks without a signature. Independent recovery review accepted. [Cause, operation and limits](delivery/local-sponsor-availability.md). No keys, journal records, prediction rules or hosted services changed. Preserve Five and earlier local work; full exact-candidate gate remains necessary before a future commit/push.

20 October Five development complete locally. The agreed incentive is optional gameweek sponsorship by admins or community members, configurable minimums, optional/anonymous branding, and score-weighted payout from a fixed pool to a published percentile including cutoff ties. Free unsponsored weeks remain available. Earlier fixed-dollar tiers and personal challenge reward proposals are superseded, not cumulative scope. Runtime free gameweeks, frozen catalogue, private entries, scores and exact allocation are implemented. [Implementation, configuration and evidence](delivery/five-implementation.md). The owner approved a dedicated custodial testnet rewards wallet. Optional sponsorship, moderation, exact signed delivery, canonical confirmation, fixed-pool credits, cancellation refunds and durable payout collection are implemented and opt-in. The major run passed 63 checks; its final Five chain check hit a Windows-to-WSL connection refusal and passed unchanged on isolated retry. All 64 required checks have passing coverage; retain the failed full-run receipt alongside the successful retry. Independent money, identity and recovery review accepted the final source. Local Five is available at `http://127.0.0.1:4100/season/?view=five`, with no gameweeks or funded wallet created. Resume with approved player-data reuse/coverage, dedicated wallet configuration, physical-wallet acceptance and publication. Preserve the earlier uncommitted quality, navigation and Survivor work. No commit, push or hosted change.

20 October owner asked to start Streak Five, superseding the earlier Community Markets-first sequence for the next increment. EPL-first private squad-builder preview is complete locally at `http://127.0.0.1:4195/` after investigating FPL prices/form and UEFA Fantasy. It includes search/positions, budget and club limits, captain, review/local save, lock/live/final/delayed simulations and scoring explanations. Four rules tests, six Chromium/WebKit viewport journeys, snapshot retry/storage failure checks, formatting and static policies passed. Screenshots reviewed; separate read-only inspection rendered 668 private-snapshot players. The owner initially requested all leagues, then offered EPL-only; UEFA covers UCL clubs and a separate pricing economy, not all non-EPL players. [Preview and source boundaries](../design/five-review/README.md). No live player-data redistribution or production entry/scoring is approved by a public feed response. Preserve Community Markets, original logo, physical-wallet verification, notifications and existing unpublished quality/Survivor work. Next: owner preview review, usable data rights and final scoring rules before integrating server-owned rounds and entries. No production changes, full production gate, commit, push or deployment.

20 October Survivor create-button styling: replaced the generic quiet link treatment and outbound arrow with a compact coral-tinted button, inset plus tile, stronger label and clear hover/focus states. Keeps its 44px touch target and existing admin/create behavior. Frontend build and the six existing Chromium/WebKit Survivor journeys passed. Evidence: `.quality-artifacts/survivor-create-style-{build,browser}.log`. Rebuilt locally; no commit or push.

20 October local Survivor activation complete: diagnosed the old launcher blocking the route and stripping database configuration. Added optional dedicated Survivor PostgreSQL pool, started a persistent loopback-only development database, enabled the exact route through existing auth/origin/admin checks and restarted only the local web API. The configured screenshot wallet has admin access; three complete upcoming rounds are present. Existing file accounts/auth and payment paths are retained. Independent review found no blockers; build and six Survivor browser journeys passed. [Configuration, evidence and recovery](delivery/survivor-implementation.md). Owner should refresh to see Create competition. No game/prize created, operator restart, commit, push or hosted change.

20 October dropdown spacing complete locally: browser-default arrows sat against the control edge. Added shared indicator styling for Season, Survivor and legacy pages, with a 12px inset, reserved label space and native forced-colors fallback. Strict frontend build passed. Focused Chromium/WebKit inspection passed for 390px/1280px Markets, Survivor and legacy select styles, option selection and forced-colors behavior. Screenshots: `.quality-artifacts/dropdown-{engine}-{width}.png`; build: `dropdown-inset-build.log`. No runtime logic, operator state, commit or hosted deployment changed.

20 October league-options correction complete locally: the running local server omits the new market-response competition metadata, which left only All leagues. Implemented an independent cached query to the existing provider-status endpoint, merged with catalogue options, plus loading/error/retry states. Read-only verification against the owner's local app found all six leagues and correctly filtered nine Champions League fixtures without restarting the API or operator. All 26 Chromium/WebKit groups passed, including older-server responses without league metadata; build, lint, formatting and static checks passed. Evidence: `.quality-artifacts/league-options-*.log`. Owner can refresh the local page. No commit or push; preserve earlier local changes.

20 October owner refinement complete locally: desktop has only a compact arrow/date bar; mobile has only centered scrolling dates with hidden scrollbars and progressively fading edges. Live and calendar remain accessible on both layouts; Weekend moved into the calendar. The league filter uses the full available catalogue before pagination and combines with dates, status and search. Build, lint, two calendar tests, formatting/static checks and all 26 Chromium/WebKit Season groups passed, including beyond-page-one league filtering and empty-state reset. Desktop and mobile screenshots were reviewed. [Evidence](delivery/fixture-date-navigation.md). Resume with owner review; no commit, push or hosted change. Earlier uncommitted quality and Survivor work is preserved.

20 October date-navigation complete locally: Today-first Markets, previous/next-day arrows, month calendar, horizontal mobile dates, Live and Weekend shortcuts. Local-day arithmetic handles DST; market recovery preserves the selected date; selected dates remain visible after resize. Build/lint, four date tests, catalogue-filter regression and all 26 integrated Season browser groups passed. [Delivery and evidence](delivery/fixture-date-navigation.md). Resume with owner review of the local build. Earlier wallet-quality and Survivor work remains local and intact; no commit or push requested or performed.

19 October quality priority: pause new features and preserve the uncommitted Survivor implementation. Owner reports nine issues: slow Activity discovery, refund review expiry, repeated wallet reconnects, slow preparation, slow approval, disappearing detail/loading state, stacked non-dismissible alerts, chain-refresh failure blocking unrelated claims, and missing teams/misaligned drawer close. Trace RPC and wallet work, publish independent results progressively, retain useful stale data without treating it as spend authority, restore already-authorized wallets without prompting, and improve animated accessible progress/alerts across core routes. Add regression coverage and contributor rules. Owner authorizes a physical MetaMask login review, but the current Chrome session exposes no automation connection; do not claim that check from synthetic evidence. No local signer/operator against the hosted operator wallet. No new feature publication or commit requested.

19 October Survivor implementation is complete locally: full-slate admin drafts, free publication/admission, saved private picks, no-repeat reserve, standings/history and deterministic PostgreSQL progression. Independent review corrections cover oracle withdrawal/history, changed fixtures, impossible future slates and stale mutation responses. All **60 local major checks passed at 13:17:00 UTC**, including real disposable PostgreSQL concurrency, six Chromium/WebKit Survivor journeys and the existing signed-chain regressions. Desktop and phone screenshots were inspected. Evidence: `.quality-artifacts/survivor-major.json` and `.quality-artifacts/survivor-implementation/`. See [delivery/configuration](delivery/survivor-implementation.md). Survivor remains uncommitted and unpublished. Next: owner review of the integrated free game, public-address admin configuration and a separately scoped payment/refund design before paid publication. Do not start a local signer against the hosted operator wallet.

19 October release complete: Activity and fixture-status fixes are published on main as `df147f17261dc8cf08d1131dc5f2d2bed1a0c6e9`. All 53 local major checks passed at 12:23:29 UTC; push reused the exact-tree receipt and remote main was verified. Render reported successful deployment at 12:25:25 UTC; the public entry bundle matched the tested release at 13:00:13 UTC. Survivor's approved implementation is completed locally above and is not included in the Activity release. Paid publication remains disabled pending the separate payment/refund design. Preserve all earlier commitments.

19 October Survivor preview completed locally: admin-only creation controls, free or fee-gated entry, independent prize and capacity configuration are ready at http://127.0.0.1:4192/. The [preview guide](../design/survivor-review/README.md) and [rules proposal](product/survivor-rules.md) cover entry review/retry, picks, used teams, standings, history, survival, elimination and winning states. This supersedes the free-only Survivor planning note below. Six focused Chromium/WebKit journeys passed at 320x568, 390x844 and 1440x900 with zero writes, external requests or page errors; a WebKit focus issue was corrected. Screenshots and results: `.quality-artifacts/survivor-review/`. Exact resume point: owner design/rules review, then production free-entry implementation and a separate fee/prize funding design. Preview server PID 42408, loopback only. No commits, pushes, live fee collection or funded prizes. Preserve Community Markets, Five, original logo, hosted operations, direct notifications and MetaMask work.

19 October product decisions saved: owner accepted the next-feature sequence **Streak Survivor → Community Markets → Streak Five** and asked that these ideas persist. See [current product decisions](product/scope-and-roadmap.md#current-product-decisions-19-october-2026) for scope, open rules and the grouped sidebar. Community Markets is retained under Predictions; Five and Survivor belong under Streak Games. Both games start with free entry. New prizes, fees, unrestricted markets and secondary trading remain unapproved. This supersedes older Five-first priority notes without marking Five complete or dropping it. No application implementation or publication is part of this memory update.

Earlier planning next step, now delivered as the preview above: write Survivor's short rules specification, resolving draws, missed picks, scheduling exceptions, simultaneous elimination and round/team eligibility. Then prepare the interactive competition flow and grouped navigation for review before implementation. Preserve the strategic no-team-reuse mechanic and use verified fixture/results data. Wallet-free entry requires an account-path decision; new result types and paid-game contracts need their own designs. Continue tracking the original logo, hosted operator durability, direct notifications, MetaMask classification and existing prediction/recovery reliability alongside this feature order. Do not resurrect the declined Founders Weekend campaign or promise a reward budget.

19 October Activity implementation: owner approved the preview and authorized commit/push alongside the finished-card fix. Production Open bets/History, search, filters, exact return/storage breakdowns, claim drawer and existing recovery integration are implemented. Fixture status and scores are separated from direct settlement; legacy ledger void no longer labels finished matches. Independent recovery review completed and concerns corrected. Four built-app Chromium/WebKit claim journeys and focused unit/build/lint checks passed. Current step: final release gate, commit and push. [Delivery details](delivery/activity-history.md). Do not start a local signer or include the unapproved Survivor implementation in this release.

19 October finished-card diagnosis: owner reports almost all completed fixtures show Voided. Read-only hosted inspection confirms all 44 final fixtures in the 48-fixture weekend page have legacy market status void and zero legacy bets. Provider final scores are present. `src/markets.ts:settleMarkets` voids an empty winning legacy pool, and `web/src/app/app.tsx:MarketCard` plus market detail render that legacy status as if it described the direct contract. Direct pool observations currently carry totals/read availability, not settlement phase. Six screenshot examples have no current hosted active pool mapping after the fresh start, which does not prove that historical chain contracts never existed. Evidence: `.quality-artifacts/void-card-diagnosis.json`. Correct fixture lifecycle and scores independently of contract settlement; derive Settled/Voided/refund labels only from verified direct state, preserve unknown/missing-registry states, update result filters and suppress Be the first to predict on closed fixtures. No settlement rules, balances or live state changed during diagnosis. The Activity preview was subsequently approved and its implementation is tracked above.

19 October My Activity preview ready for approval: [proposal and production-state mapping](../design/activity-review/README.md), running at http://127.0.0.1:4193/ (preview PID 10076). Open bets contains upcoming, live and settling matches. History contains settled results with separate collectible, transferring and collected states. Pending payments stay separate from accepted predictions; prediction returns stay separate from refundable storage. Includes search, filters, timelines, simulated background collection, interrupted recovery and empty/disconnected/stale scenarios. All six Chromium/WebKit journeys at 320/390/1440 passed at 10:00:29 UTC; screenshots visually reviewed, static policies passed, zero external requests or writes. Evidence: `.quality-artifacts/activity-review/`. No live app or payment logic changed, no commits or pushes. Resume with owner approval before implementing the activity/history read model. Hosted payment completion and the earlier Survivor/Community Markets/Five commitments remain open.

Local handover follow-up: the broad helper scan also briefly found local operator PID 32700, which had already exited on recheck. Sponsor PID 13648 was explicitly stopped; no matching local sponsor/worker/operator/host helpers remained at verification. Hosted atomic demand still returned enabled with 195 fixtures afterward. No archive migration, deletion or new signing was performed. Keep local operator helpers stopped while the hosted operator uses this wallet.

19 October owner simplification: historical test stakes need not migrate; prioritize working hosted predictions and defer convenient dev/production switching. No old records were deleted. Public read-only verification now returns HTTP 200 with atomic demand enabled and 195 fixtures; pinned batch configuration also returns HTTP 200. A broader port/process check identified the historical local sponsor helper, PID 13648, which was stopped to avoid competing with Render. The local Telegram gateway on port 4102 is unrelated and was left running. This clears the earlier hosted sponsor-unavailable observation, but does not prove a new hosted payment, settlement or restart persistence. Next acceptance is a small upcoming-fixture prediction through wallet approval and confirmation, followed by hosted recovery/settlement verification. Keep only one operator active for a shared wallet; separate dev and production wallet/state configuration remains later work.

19 October launcher publication completed as 322b711 on origin/main. Exact-candidate commit checks passed and push reused their receipt. Render deployment and operator activation remain unverified; configure the Start Command, complete signer handover and verify payment demand. Unrelated Survivor planning and preview files are restored locally.

19 October hosted launcher release: owner authorized commit and push. The API/sponsor/worker supervisor, graceful recovery draining and cooperative worker shutdown passed all 52 local major-gate checks at 08:54:42 UTC, ten Linux process tests and independent recovery review. Evidence: `.quality-artifacts/hosted-launcher-major.json`; [delivery record](delivery/hosted-launcher.md). Publication does not activate hosted payments. Next: Render Start Command `node products/streak/scripts/direct-host.cjs`, correct `APP_PUBLIC_URL`, reconcile pending signatures and stop local signers before hosted activation, then verify hosted demand and persistence. No live settings, funds or historical journals were changed. Survivor, Five, original logo, direct notifications and MetaMask follow-ups remain open.

17 October hook correction published as `37f5fd7`: following the hour-long hero release, the owner explicitly requested minimizing hooks/tests. Implemented a narrow path-based plan: docs get formatting/static checks; frontend CSS adds a strict web build; delivery tooling adds its regression tests; other paths retain the complete gate. Successful checks may be reused for the exact tree, Node version and sufficient coverage within 24 hours. Push planning covers all unpushed commits and treats renames as deletion plus addition. Dirty candidates and failed checks remain blocked. The exact commit passed formatting, static policy checks and all 13 tooling regressions in **8.85 seconds**. The push reused that receipt without repeating tests; the complete network push took 57.66 seconds. Evidence: `.quality-artifacts/hook-scope-commit.json`, `hook-scope-push.json` and their logs. Full runtime tests remain available and mandatory for major runtime changes; hosted Actions remain paused. The owned disposable PostgreSQL container is stopped. Preserve the owner ignore-file bytes and nested benchmark through the final documentation publication, then restore the ignore file from its verified backup. Resume product work with Five, original logo, hosted operator readiness and the unresolved MetaMask classification; no new grant or campaign commitment was added.

17 October hero release completed: commit `8e32db6b0a31e55c74f9887ec8d806e5bb2029c3` is on main. The old hooks passed all 51 checks before commit and on both push attempts; the first upload failed with curl 52 after validation, and the HTTP/1.1 retry succeeded. Render deployment `dep-db9sau942hec73d1jg00` succeeded at 19:00:07 UTC. Public root CSS was verified at 19:01 UTC and matches the local build exactly, including viewport centering. Evidence: `.quality-artifacts/hero-release-commit.json`, `hero-release-push-first.json`, `hero-release-push.json` and `hero-release-deployment.json`. The MetaMask classification remains unresolved.

17 October follow-up, complete locally: the landing hero copy now centers in the visible space below the header, independently of the tall fixture board. Mobile stacking and short-screen CTA visibility are preserved. Web TypeScript/build, all 26 existing Season browser groups and 22 additional Chromium/WebKit viewport measurements passed. Evidence: `.quality-artifacts/hero-centering-browser.log` and `.quality-artifacts/hero-centering-live/measurements.json`. No commit or deployment of this follow-up. The owner can review it at `http://127.0.0.1:4100/` after a hard refresh.

17 October security investigation, unresolved: MetaMask flags the public site during sign-in with both "Malicious site" and "High-risk request" alerts. Read-only source inspection found a nonce-bound `personal_sign` authentication message, five-minute expiry and no token allowance or payment request in the login path. At 16:25 UTC all nine published JavaScript chunks matched the expected build after normalizing generated import hashes where necessary; wallet chunks matched exact SHA-256 hashes. Evidence: `.quality-artifacts/metamask-published-js-audit.json`. This does not establish a false positive or clear the whole deployment. Keep the signature rejected while investigating. Follow [MetaMask's classification review procedure](https://support.metamask.io/configure/wallet/security-alerts) if the provider's reason cannot be established. No warning bypass, replacement signing scheme, wallet action or external support submission was performed. Resume with domain-check results and provider review, not an assumption that Render hosting or CKB caused the classification.

MetaMask domain check at 17:27 UTC: the public detector configuration at commit `1a87911568240a6333110ad03714a36607c0b03e` has no exact, parent-domain or fuzzy match for `streak-terminal.onrender.com`. Reviewed matching logic, source hashes and results are recorded in `.quality-artifacts/metamask-domain-list-audit.json` and `.quality-artifacts/metamask-domain-fuzzy-audit.json`. Cached lists and separate security-provider/request screening are outside this check. The actual warning remains unresolved; request manual classification review with the URL, both screenshots, `personal_sign` login description and public source links. Do not assert an identified cause or a clean verdict.

Follow-up validation: changed-file formatting, static source/document policies and diff checks passed. Repository-wide formatting reports 168 existing files; the sampled untouched agent file matches HEAD exactly after CRLF normalization, while HEAD passes Prettier and its Windows checkout does not (`core.autocrlf=true`). No unrelated files or repository Git settings were rewritten. Evidence: `.quality-artifacts/hero-format-audit.mjs`. This is not a fresh all-gates pass; exact-candidate release gates must be rerun before any future commit or push. A manual MetaMask review request is prepared in `.quality-artifacts/metamask-review-request.txt`, not submitted.

17 October Week 21 publication completed: [PR 4](https://github.com/HeySomtee/ckbuilder/pull/4) merged release `45297c1c` into main as `8621e4d`; the merged tree matches tested tree `984ffa2f`. All 51 checks passed at each exact-candidate pre-commit and pre-push gate. PR 1 is merged; PRs 2 and 3 were closed as consolidated; four verified merged remote feature branches were removed. The unrelated ignore-file bytes were restored and the nested benchmark retained. The [report](../../../reports/week-21.md) and six screenshots are published. Render's first deployment failed, then retry `dep-db9ptfrbc2fs73cqb0hg` succeeded at 16:14:46 UTC and the new public assets were verified. See the [release record](delivery/week-21-release.md). This confirms the hosted UI, not durable hosted payment operation. Five, the original logo, direct v4 notifications, storage-sponsorship decisions and durable operator work remain open. Hosted Actions remain paused; the declined Founders Weekend and new prize commitments remain excluded.

17 October Week 21 scope correction: the owner highlighted that Streak Five and a finished original logo are still missing. The completed prediction/payment work is substantial report material, but does not complete the planned community experience. Keep Week 21 planning open around these gaps. Next priorities are a playable free Five round using verified player data, published rules, persistent entries, enforced cutoff, deterministic scoring and standings; and original logo concepts for owner review, followed by an approved vector mark, wordmark and app/favicon variants. Five's preview format is a baseline, not a shipped competition. Confirm provider coverage and the account-entry path before opening entries. No reward budget, release, commit or push is implied. Preserve the completed checkout evidence and earlier outstanding work below.

17 October compact slip implementation complete locally: the approved Picks/Activity layout, on-demand cost explanation, compact full wallet total, single coral input focus and animated preparation/approval button stages are active. One stable tracker retains signed-payment recovery across closing and tab changes. Fresh per-operation fixture and creation-transaction reads are deduplicated with canonical checks retained. All **51 major-gate checks passed at 14:48:10 UTC**, with independent money/recovery review approved. Actual API read-only checks passed at 320x568, 390x844 and 1440x900 with zero writes or page errors. [Delivery record](delivery/compact-slip-implementation.md); `.quality-artifacts/slip-workspace-major.json`. Local API PID 8728 and sponsor PID 13648 were safely restarted; payment demand is enabled. Resume with owner review at `http://127.0.0.1:4100/season/` after Ctrl+Shift+R. Request counts improved, but public-testnet latency has not been benchmarked. The disposable database is stopped. No commits or pushes, and no new owner-wallet payment. Earlier Five, direct notifications, storage-sponsorship and durable-operation commitments remain open.

17 October compact slip preview is ready for owner approval at `http://127.0.0.1:4187/` (preview PID 23832). [Proposal and repeat-payment performance plan](../design/slip-workspace-review/README.md). Editable picks and Activity are separate tabs; the footer contains only stakes, full estimated/exact debit and the action; refundable storage details open on demand. Amount focus uses one coral border. Six Chromium/WebKit journeys passed at 320x568, 390x844 and 1440x900, with eight picks, delayed confirmation, receipt separation, no overflow/errors/external requests and zero writes. Evidence: `.quality-artifacts/slip-workspace-review/results.json` and screenshots. The performance plan is based on source inspection, not measured gains. Live app/payment code is unchanged by this task. Resume with owner review of this preview before implementation, then measure repeat-payment stages and retain all required financial checks. Earlier commitments remain open; no commits or pushes.

17 October sponsor correction complete locally: bounded journal-lock waiting replaces immediate contention failure in the sponsor; unsigned review and signed uncertainty have separate errors; background confirmation supersedes obsolete errors. All **50 major-gate checks passed at 11:30:23 UTC** and independent recovery review found no blockers. Evidence: `.quality-artifacts/sponsor-fix-major.json` and the [delivery record](delivery/sponsor-review-recovery.md). Public read-only inspection confirms the owner's Manchester City vs Ipswich transaction committed, despite the reported error. The exact earlier Chelsea error remains unproven; that fixture has now passed kickoff and is unavailable for new entries. API PID 13976 and sponsor PID 40492 are active; read-only demand is enabled. Resume with owner reload at `http://127.0.0.1:4100/season/`, recover the existing payment and use an upcoming fixture for any new prediction. No saved signatures were deleted or additional owner payments made. Test database stopped; commits/pushes remain paused. Earlier Five, direct notifications, storage-sponsorship decision and durable-operation commitments remain open.

17 October terminal/invoice/background-payment work is complete locally. All **50 major-gate checks passed at 10:51:39 UTC**, including signed local-chain settlement and independent claims. Recovery source review is approved. The final spacing follow-up adds a 900px profile and a non-overlap assertion to the phone/desktop checkout journey. Real-provider screenshots at 390/1279/1440 show genuine form and last-five meetings with zero page errors or writes. See `.quality-artifacts/terminal-major.json`, `.quality-artifacts/terminal-final-checkout.log` and the [delivery record](delivery/terminal-payment-upgrade.md). Resume with owner review at `http://127.0.0.1:4100/season/?market=m-api-football-1550147` after Ctrl+Shift+R. Storage subsidy options are documented, not implemented; existing contract economics remain intact. The owned test database is stopped; local app/operator services remain running. No commits or pushes. Earlier Five, direct Telegram notifications and durable-operation commitments remain open.

17 October invoice steering incorporated: stakes first, then a smaller storage/network section with a Refundable badge, short claim explanation and exact wallet total. Storage also appears before review. Public read-only audit confirms the owner's three-pick debit was 1,263.00006104 tCKB: 300 principal, 963 storage and 0.00006104 network fee. Streak separately supplied 9,150 tCKB. Terminal intelligence and background tracking are implemented; focused desktop/mobile checkout and reload-recovery suites pass. Independent recovery review is approved; the full major gate is next. Resume from `.quality-artifacts/terminal-major.log`; [delivery record](delivery/terminal-payment-upgrade.md). Keep all earlier unfinished commitments below. No commits or pushes.

17 October terminal and background-payment upgrade, in progress: owner confirms a three-prediction slip now works. Restore the legacy terminal typography and real football intelligence, including last five meetings, form, standings and model/bookmaker comparison. Audit the roughly 1,300 tCKB three-pick charge, surface the full upfront amount before review and prepare a concrete storage-sponsorship option without silently changing contract economics. Replace static payment waits with truthful animated stages and a persistent, expandable lower-left operation dock so signed payments continue while browsing. Notify confirmation, recoverable uncertainty and actual failures distinctly. Preserve saved signatures, account isolation, draft edits, first-bet sponsorship and all earlier work. Review relevant app surfaces, verify on desktop/mobile, run independent recovery review and the complete local gate. No commits or pushes.

17 October checkout/chart correction complete locally. All **50 major-gate checks passed at 09:54:32 UTC**, including the actual built-app EVM journey, new first-market creation, repeat combined payment without reconnecting, chart inspection, pool-share accounting, historical recovery and signed local-chain settlement. Independent review findings are closed. Read-only local checks at 390, 1279 and 1440px passed separately. Final evidence: `.quality-artifacts/checkout-chart-major.json`; [delivery record](delivery/checkout-route-correction.md). Resume with owner testing at `http://127.0.0.1:4100/season/?market=m-api-football-1570420`, using Ctrl+Shift+R once. Reconnect opens in place. The current atomic registry contains zero initialized markets; no owner-wallet payment has been made by the agent. Pool shares appear after confirmed eligible stakes; history is bounded and in memory. Local API, sponsor, worker and Telegram receiver remain active. **No commits or pushes.** Earlier Five, direct notifications and operational commitments remain open.

17 October chart steering, completed above: replace the first chart with a Polymarket-inspired interactive time-series plot. Show Home/Draw/Away pool-relative percentages on initialized market cards and details from actual direct contract principal, keeping storage and sponsor reserves out of the denominator. Preserve the current checkout fixes and complete their final gate together with this change. Do not invent historical observations or label pool shares as guaranteed payout odds. No commits or pushes.

17 October checkout correction, completed above: reproduce the owner's blocked payment from market details, eliminate the obsolete single-market offer path for new atomic entries, reconnect inside the current flow, and verify first-bet sponsorship from the real application journey. Add explicit market-card detail links, redesign details with a real-data chart and calm actionable alerts, and improve clear-slip confirmation. Preserve old signatures/claims and account-change guards. Independent payment/identity review and the full local gate are complete. No commits or pushes. Earlier completed visual work and unfinished Five/notification/operational commitments remain below.

17 October Overview/glass correction complete: compact horizontal match rows, clear blue side-panel reflections and small authentic CKB jersey crests are locally active. The final outcome palette is muted blue/Home, green/Draw and red/Away with soft reflected rims. All **48 major-gate checks passed at 07:58:50 UTC**, including the new Overview checks in Chromium/WebKit and signed local-chain regression journeys. Read-only real-provider screenshots at 390, 1279 and 1440px passed separately. An outdated database schema in the prediction test fixture was reproduced with uncached reads and corrected without changing production behavior. [Delivery record](delivery/overview-glass-correction.md). Resume with owner review at `/season/?view=overview`; hard refresh if old styles persist. **No commits or pushes.** Earlier Five, direct notifications, physical-wallet and durable-operation commitments remain open.

17 October final outcome palette steering: tone down the outcome contrast and switch Draw from white to green. Keep Home blue and Away red, with muted colours, clear centres and gentle reflected rims across all prediction screens. This supersedes the earlier white/Draw specification.

17 October CKB detail request: add a small authentic CKB/Nervos crest to all jerseys shared by Overview and Streak Five, plus restrained marks beside the existing testnet label and landing-page network attribution. Use a local copy from the official documentation assets, without adding a sponsorship or endorsement claim. Fold this into the current glass redesign and verification.

17 October material steering: the first coloured-glass pass looked too frosted. Make faces clear and concentrate outcome colour into reflected highlights and glistening rims. Reduce the blue side-panel fill as well. Preserve visible selection, focus, contrast and reduced-transparency alternatives. Complete this correction within the ongoing Overview redesign before the final gate.

17 October Overview glass redesign, in progress: follow the owner's supplied composition with compact team-led match rows, prediction controls aligned right on desktop, richer blue side panels and transparent blue/Home, white/Draw, red/Away outcome glass. Carry outcome styling consistently through prediction surfaces. Preserve the smaller typography, non-scrolling rail, real API fixtures, draft selection and accessible states. Do not invent leaderboard, rewards or account statistics from the reference. Capture desktop/mobile evidence and run the complete local gate. No commits or pushes; prior unfinished commitments remain below.

17 October density correction complete: the current Season pages and public landing have smaller type, shorter heroes and tighter rows at 100% zoom. The 180px sidebar fits all seven destinations with no internal scrollbar; "Your next chapter" is removed. Short windows use bottom navigation and More. Ten viewport profiles and six interaction journeys passed in Chromium/WebKit. All **48 major-gate checks passed at 07:08 UTC**, with final evidence in `.quality-artifacts/density-major.json`. Real-provider visual checks at 390, 1279 and 1440px passed separately with no page errors or writes. An independently reviewed test synchronization correction preserves account-switch assertions; payment production code is unchanged. The disposable database was stopped; local app, sponsor and worker remain running. [Delivery record](delivery/compact-layout-correction.md). Resume with owner review at `/season/?view=overview` using 100% zoom. **No commits or pushes.** Earlier Five, direct notifications, physical-wallet and durable-operation commitments remain open.

17 October completion: **all 48 major-gate checks passed** for the My Account/navigation/slip correction, including six new navigation journeys, existing account/checkout regression lanes, Rust VM checks and signed local-chain lifecycles. The final source includes both independent-review corrections. Local real-provider checks and the Telegram receiver check passed separately, with no user signatures, payments or bot messages generated. [Delivery record](delivery/account-navigation-correction.md). Local routes: `/season/?view=overview` and `/season/?view=account`. Code remains uncommitted on `07b427c`; **do not commit or push until the owner explicitly says so**. Resume with owner review of the running app, preserving the pending Five, direct notification, physical-wallet and durable-operation commitments below.

17 October, 06:13 Africa/Lagos: approved implementation is locally active at `/season/?view=overview` and `/season/?view=account`. All seven desktop destinations are restored; mobile uses More for Five, Matchday and Clubhouse. Old `view=wallet` links work. Independent review found and closed calendar rollover and unsaved-draft navigation issues. Six new isolated browser journeys, four account/Telegram journeys, four EVM connection journeys and the existing 26-group Season suite passed. Real-provider 390/1440 checks passed with two retained picks, no page errors and zero writes. The temporary Telegram tunnel had expired; its replacement and receiver were verified without messages. Complete major gate rerun is in progress after correcting an obsolete skip-link label in the test. See [delivery record](delivery/account-navigation-correction.md). **No commits or pushes.** Resume at `.quality-artifacts/account-navigation-major.log`, then record its result and stop only the owned disposable PostgreSQL test container. Keep the local app, sponsor, lifecycle worker and Telegram receiver running.

17 October owner approval: implement the reviewed account panel, fixed Add matches header and opaque slip dock. Rename the Wallet destination to **My Account**, retaining old wallet links. Restore Overview, Streak Five, Markets, Matchday, My activity and Clubhouse navigation from the approved original preview. Use real API fixtures on Overview; unfinished Five remains clearly identified as coming soon, and retained legacy community/matchday tools remain reachable. Fix the Telegram confirmation without relying on an optional handle. Preserve existing account, signing, payment and recovery behavior. Run isolated regressions and the complete local major gate, then activate locally. **The owner has not resumed commits or pushes.**

Preview ready, 16 October, 22:06 Africa/Lagos: [Wallet and slip proposal](../design/account-slip-review/README.md) is running at `http://127.0.0.1:4186/`. Wallet has one compact account panel; Add matches stays in the fixed slip header; the dock has explicit opaque normal/hover/focus backgrounds. Eight public API fixtures and their provider crests are captured locally. Balance and selections are labelled sample data. Six browser journeys passed in Chromium and WebKit at 320x568, 390x844 and 1440x900, covering scrolling, edited draft retention, eight-pick capacity, removal, Escape, review, clear and absence of external requests/page errors. Evidence: `.quality-artifacts/account-preview/results.json` and screenshots. Telegram diagnosis is documented, with username-independent wording proposed. Application code is unchanged. **Await owner UI approval before implementation; no commits or pushes.**

Owner review request, 16 October: **preview only, awaiting approval**. Create an interactive Wallet composition, keep Add matches visible outside the scrolling slip list, and make the collapsed slip opaque in its hover/focus states. Diagnose the Telegram `@undefined` confirmation. Do not apply these UI changes to the application before approval. **No commits or pushes until the owner explicitly resumes them.** Preserve all earlier unfinished work. The preceding atomic correction was published as `07b427c`, with all 47 pre-commit and pre-push checks passing; the sleep checkpoint below is historical. Current Telegram finding: the webhook interpolates optional `User.username` rather than checking for a display handle. Prepare safe confirmation wording and regression criteria for the implementation stage.

Release checkpoint, 16 October, 20:19 UTC: the first exact-candidate commit gate was blocked by a sponsored-devnet timeout. Windows System events confirm sleep at 19:47:45 UTC and resume at 20:14:26 UTC, spanning the test. No commit or push occurred, and the owner's unrelated ignore-file edit was restored byte-for-byte. The earlier 47-step major gate remains separate evidence. Resume with a fresh isolated sponsored test and complete commit/push gates; request temporary idle-sleep prevention only while those checks run. Do not bypass the failed gate.

Atomic correction completion, 16 October: All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. Telegram registration and the webhook-only receiver passed a no-message probe. Contract VM coverage is 149 checks; the signed local devnet passes 37 product plus three harness checks. Public evidence proves code deployment only. Resume after publication: physical-wallet validation, direct transaction notifications, durable operation, then Five and the approved community pilot. See [delivery evidence](delivery/atomic-slip-correction.md). Earlier progress notes below retain their original timestamps.

Telegram follow-up, 16 October, 19:23 UTC: the owner still saw unavailable after the receiver was restored. The API put availability at the response root while Wallet consumed `user.telegramAvailable`. Corrected both account-read and disconnect responses, added signed HTTP regressions for ready and disconnected accounts, rebuilt and restarted the local API. Receiver registration is successful. The focused identity suite passes. The ongoing broad gate began before this small response correction; final exact-candidate commit and push gates must cover it. No account or bot message was created by verification.

Atomic slip correction, 16 October, 18:55 UTC: implementation and focused checks are complete; full major and exact-candidate release gates are next. New v4 code is confirmed on public testnet at `0x930bba6cce8cd6b1dc254cc3469249d7ba32f09b44bc20ea784f45e172cd606f`, output 0. Signed eight-prediction payment and recovery evidence is local devnet, not a public user payment. Local API activation remains pending. Telegram credentials exist in `products/streak/.env`; the old quick tunnel was inactive. A new webhook-only gateway and tunnel are running, with registration pending API restart. No bot messages were sent. Operator has 76,971.43972621 testnet CKB after deployment. Next: full gate, restart API/sponsor/worker, verify live read paths and receiver, inspect phone/desktop screens, commit and push with required gates. Existing Five, operation and campaign commitments remain open.

Latest owner correction, 16 October: **active**. Separate Wallet from My activity (both previously linked to the same route), show live balance and a copyable address in navigation, restore Telegram settings, keep payment inside the slip, implement one atomic payment for all independent picks, remove the promotional Play on testnet block, replace Minimize with an X and remove Genie motion. Use smaller type and coherent account layouts. Wallet owns balance, address and settings; My activity owns transactions, predictions and claims. Historical Minimize/Genie acceptance below is superseded. Combined payment requires contract and transaction changes, not sequential payment buttons. Preserve historical claims and recovery. Resume: implement distinct routes and account screens, validate a new batch contract and operator flow, then integrated wallet, slip and recovery checks plus the full local gate. No completion or deployment claim yet.

Active owner direction, 16 October: create a market and its first prediction in one transaction, with Streak sponsoring the 3,050 CKB reserve. Implemented and locally active after the full **42-step gate passed at 14:59 UTC**. Real-API phone/desktop checks passed at 15:02 UTC with 180 unused eligible fixtures, 16 existing funded markets, no page errors and exact draft preservation. Bulk creation is paused; lifecycle reporting and settlement continue. V3 is deployed at transaction `243a71ce`. The VM suite passed 123 checks and the signed local-chain suite passed 38 integration checks plus four harness checks, including real conflict-proof reorganisations and canonical selection recovery. Independent review found no remaining blocker within the pilot bounds. The preceding wallet correction is commit `189c538`; both increments are delivered through [PR 4](https://github.com/HeySomtee/ckbuilder/pull/4), subject to exact-candidate commit/push gates. See the [design](architecture/sponsored-creation.md) and [delivery record](delivery/sponsored-creation.md). Approximately 17,800 testnet CKB remains, enough for roughly five new reserves before replenishment. The earlier bulk-funding requirement below is superseded. Next product acceptance: physical wallet-extension verification, monitored durable operation and restore rehearsal; combined payment and Five remain open.

Wallet and provisioning correction, 16 October: shared sign-in/checkout signer state, compatible Rust contract, generation-preserving recovery, per-pick setup status and automatic all-fixture provisioning are implemented. The compatible contract is deployed and the recurring local worker is active. All 38 gate steps passed at 13:54 UTC; mandatory commit/push gates verify the final candidate including the reviewed reconnect wording and public-verification resume selector. Independent money, identity and recovery reviews found no remaining blocker. Eleven markets were funded at 13:57 UTC, one was confirming and 184 were queued. Current funding covers about 31; roughly 501,000 additional testnet CKB plus fees is still needed for all 196. Physical MetaMask extension verification, durable hosted operation, combined payment and Five remain open. See the [correction evidence](delivery/wallet-provisioning-correction.md).

Checkout correction, 16 October: the owner reached a draft-review success message and could not pay. The slip now leads into wallet payment, funded matches are discoverable from ordinary browsing, and unfunded fixtures and legacy statistics are labelled. Explicit handoffs replace older unsent quotes on the same route. All saved picks survive individual checkout and rejection. The deployed single-market contract cannot execute a combined multi-market payment; keep that commitment open. No contract or financial-client rules changed. All 35 local gate steps passed at 12:48 UTC, alongside the running local API-backed UI check. This checkout increment is included in the wallet/provisioning correction above. See the checkout evidence below.

Owner correction after PR 4: a completed contract integration is not usable while the local launcher blocks account sign-in. The owner clarified that the current target is local testing; public hosting is not a blocker for this task. The accidental local authentication restriction is fixed, the running sign-in and direct-market paths pass manual checks, fixtures refresh every minute and a separate recurring local operator is running. Further local wallet compatibility checks, additional funded markets, combined payment and Five remain separate work. Do not describe local checks as a public launch. Earlier commitments below remain in scope.

CHAIN-01 implements all five authorized steps on the review branch: wallet connection and available testnet capacity, exact stake/capacity/fee review, wallet-to-market signing, confirmation with refresh recovery, and result/claim/refund recovery. The complete 35-step local gate passed at 11:48 UTC on 16 October. Seven synthetic public transactions are confirmed, and one separate real API fixture is funded locally. Commit and push hooks must pass before publication. Next, establish durable monitored operation and physical-wallet evidence before community onboarding. Preserve the Minimize-only slip, Genie and real fixture data.

| ID          | State                                | Commitment                                                                                | Completion evidence or remaining work                                                                                                                                                            |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-01       | Published                            | Keep both hero CTA buttons visible without scrolling on common laptop and phone viewports | Height-aware layout verified in Chromium and WebKit at seven short viewports; both actions remain visible and clickable                                                                          |
| DOC-01      | Published                            | Preserve active work and earlier commitments across steering and handoffs                 | Tracker linked from both agent instructions, status, documentation map and handoff; earlier commitments and resume point preserved                                                               |
| UI-02       | Superseded by owner correction       | Historical Genie and Minimize implementation                                              | Historical 31-step evidence remains; current slip uses X close, retained drafts and no Genie                                                                                                     |
| MARKET-01   | Complete on review branch            | Build the Season market-detail screen                                                     | Public API details, teams/logos, lifecycle, pool distribution, terms, navigation and recoverable errors; 31-step local gate passed                                                               |
| SLIP-01     | Complete on review branch            | Integrate the independent multi-prediction draft and server review                        | Eight picks, exact totals, retained drafts, explicit clear, whole-slip server validation and recovery; no payment; 31-step local gate passed                                                     |
| CHAIN-01    | Complete on review branch            | Connect one direct wallet-to-market stake, settlement and claim journey                   | All five steps implemented; 35-step local gate, 25 signed devnet checks and seven synthetic public transactions pass. One real API fixture is funded locally; hosted activation remains separate |
| SPONSOR-01  | Implemented, locally active          | Create market and first prediction atomically with Streak-funded reserve                  | Deployed v3; 42-step gate, 123 VM checks and 38 signed devnet checks pass; real-API mobile/desktop checks pass; commit/push gates required; physical wallet and hosted operation remain separate |
| WALLET-01   | Implemented, locally active          | Share the EVM signer and support compatible wallet locks                                  | Compatible deployment, 88 VM checks, 38 signed devnet checks and four shared-wallet browser journeys; physical extension session remains to verify                                               |
| MARKET-02   | Superseded by SPONSOR-01 and SLIP-02 | Automatically make eligible real fixtures playable                                        | Bulk provisioning is paused; eligible markets are created with the first prediction and Streak supplies the reserve                                                                              |
| SLIP-02     | Implemented, locally active          | One combined payment for up to eight independent predictions                              | V4 deployed; exact inline review, mixed new/funded markets, signed devnet recovery and four browser journeys pass; release gate required                                                         |
| UI-03       | Implemented, locally active          | Separate Wallet and Activity, compact fonts, balance/copy controls and X close            | Distinct routes, shared wallet cache, real-provider phone/desktop checks and retained drafts verified                                                                                            |
| TELEGRAM-01 | Linking active; alerts pending       | Restore Telegram connection and add direct transaction alerts                             | Existing bot configuration loaded; webhook-only local route verified without messages; direct v4 notification dispatch remains open                                                              |
| FIVE-01     | Planned                              | Integrate Streak Five                                                                     | Verify player-data coverage, finalize entry/scoring/exception rules, then implement entries and scoring                                                                                          |
| OPS-01      | Required before rollout              | Reliability and recovery foundations                                                      | Bounded SQL mutations, durable jobs, abuse controls, backup/restore evidence and supported-wallet checks; keep one API writer                                                                    |
| LAUNCH-01   | Planned                              | Community testnet campaign and grant evidence                                             | Usable end-to-end testnet flow, funded reward rules, onboarding, monitored user engagement and real transaction evidence                                                                         |
| MOTION-01   | Device profiling remains             | Verify production Genie motion                                                            | Integrated cold-start, paint and cleanup checks pass in Chromium/WebKit; historical preview observations remain recorded; physical-device profiling ahead                                        |
| CI-01       | Paused by owner                      | Hosted GitHub Actions and required checks                                                 | Owner stopped hosted CI after the billing lock. Do not resume it without a new instruction. Local gates remain required                                                                          |

## Completed increments

| ID            | Completed work                                                                                 | Evidence and release state                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| FOUNDATION-01 | Approved design, architecture, documentation, local quality gates and hook pipeline            | Foundation `5a90186`, [PR 1](https://github.com/HeySomtee/ckbuilder/pull/1); hosted CI paused                    |
| SEASON-01     | React market browser, API fixtures/logos, Friday-to-Monday filters and durable wallet identity | `800e774`; integrated local tests and independent identity/recovery review                                       |
| LANDING-01    | Season landing, legacy link recovery and conservative challenge expiry                         | `5244262`; full 29-step local gate and independent identity/recovery review                                      |
| FIXTURES-01   | Automatic landing refresh, matchweek rollover and weighted featured ranking                    | `70beb34`; full 30-step gate passed before commit and push, including 12 integrated browser groups; not deployed |

## Resume point and acceptance boundaries

**CHAIN-01** is implemented and verified across all five authorized steps. Publication uses the mandatory local commit/push gates. Next, establish durable operator storage, monitored execution, restore evidence and supported physical wallets before onboarding. The increment preserves the deployed Week 20 protocol for recovery and uses the compatible product deployment for new markets, without rewriting historical exercises. Its fixture labels remain an explicit trusted operator catalogue mapping, not an on-chain fixture/rules commitment. Provider identity, kickoff, rules, manifest and type script are pinned before wallet review. V4 now permits up to eight independent market entries per transaction; each claim remains a separate transaction. Signed transaction economics are checked and exact bytes/hash persist before broadcast. Unknown outcomes require reconciliation before retry. Missing or ambiguous football evidence remains unresolved. A timely eligible report resolves even when checked after the deadline; late pending deposits use direct refunds, while accepted void positions use funded claims.

Acceptance checklist for this increment:

- Wallet selection, network and supported-lock checks, available plain-cell testnet capacity.
- Exact principal, 321 CKB recoverable claim storage, network fee and immutable intent review.
- Real wallet signing and direct-market submission, preserving rejected or stale drafts.
- Durable transaction identity, confirmation and admission state, refresh/restart/reorg recovery without duplicate signing.
- Strict provider result submission, bounded settlement/timeout tooling, independent claim or refund discovery and transaction links.

Required evidence: domain and recovery tests, isolated browser journeys, local CKB devnet lifecycle checks, independent money/recovery review, full local quality gates, and separately labelled public testnet verification when run. No item is complete merely because its UI exists.

The multi-pick slip now reviews and pays all selected v4 predictions inline through SLIP-02. Historical single-market deep links remain for recovery. Legacy ledger markets and funded direct markets retain distinct limits, balances and settlement authority. Do not reuse preview fees or claim that legacy ledger bets are direct contract positions.

Public market data excludes account-specific positions. Server review validates the entire draft against one current snapshot, uses integer shannons, retains every invalid line, and invalidates stale responses after edits or account changes. Reviews also expire conservatively and cannot replace newer market terms. These rules are implemented and covered by regression tests.

## Working rules

1. Read this file at the start of every task and after a handoff or context reset.
2. Record new requests before implementation. A steering request adds or reprioritizes work unless the owner explicitly cancels an earlier commitment.
3. Before switching focus, record what is complete, the exact next action, dependencies and unfinished acceptance criteria. Keep earlier tasks in the table.
4. Update completion state only after implementation and relevant verification. Distinguish local completion, committed, pushed and deployed states.
5. End each increment with dated check results and a resume point. Keep canonical architecture/design decisions in their own documents and link them here.

## Current verification

The direct increment passed all **35 local gate steps** at **11:48 UTC on 16 October**, including eleven wallet/protocol unit groups, four standalone recovery tests, backend/HTTP checks and four integrated Chromium/WebKit direct journeys. The actual signed local devnet passes 25 checks, including six-hour cancellation, full claims, externally spent fee inputs, conflict-proof reorgs and original-byte recovery. Independent money/recovery review found no remaining blocker in the bounded prototype. Public synthetic verification passed at 11:13 UTC with creation, two deposits, report, settlement and both claims confirmed. The separate real Everton vs Chelsea market is funded and enabled in the local preview. Evidence: `.quality-artifacts/direct-full-gate.json`, `.quality-artifacts/direct-full-gate.log` and the [direct milestone](delivery/direct-testnet-milestone.md). Local commit/push gates remain mandatory; hosted deployment is separate.

The UI correction passed all **31 steps** of `npm.cmd run quality:major` on 16 October, completing at **09:00 UTC**. Evidence: `.quality-artifacts/ui-motion-full-gate.log`, `.quality-artifacts/all.json` and the [correction report](delivery/ui-motion-correction.md). Integrated coverage is now 22 groups, including real painted Genie frames in Chromium/WebKit at phone and desktop widths, two/eight picks, latest inputs, interruption, focus and reduced motion. Test sequencing now uses positive page/account readiness and tracked local reads before unrelated document changes; actual entry-link navigation, deliberate stale-response races and strict page-error/network assertions remain. Independent review found no remaining recovery blockers in this scope. Manual API captures confirmed logos and read-only review with no browser errors. Physical-device profiling and hosted rollout remain separate.

On 16 October, `npm.cmd run quality:major` passed all **31 steps**, with no skipped required suite. Evidence: `.quality-artifacts/market-full-gate.log` and `.quality-artifacts/all.json`, completed at 07:57 UTC. Coverage includes backend/HTTP review, six draft tests, eighteen integrated Chromium/WebKit groups, eighteen approved-preview groups, thirty-two combined-slip preview groups, disposable PostgreSQL and Rust VM/accounting checks. The earlier hero CTA checks remain in this suite, covering seven short viewports. Desktop and mobile synthetic market/slip screenshots were inspected under `.quality-artifacts/browser/`.

During the earlier read-only fixture check, the local preview at `http://127.0.0.1:4100/season/` disabled payments and account mutations, with only read-only slip review allowed as a POST. A separate manual provider refresh reported complete coverage for its loaded window, 262 scheduled fixtures and 196 market fixtures. A real fixture's public-detail and review requests succeeded with `paymentAvailable: false`. Routine tests remain isolated from provider credentials and production data. That historical read-only check is not on-chain settlement evidence; direct activation is recorded below.

Local testnet app: `http://127.0.0.1:4100/season/?direct=m-api-football-1557430`. Authentication, logout and profile updates now reach the existing backend. Signed direct transactions use the connected wallet and pinned public RPC. Custodial treasury operations remain unconfigured on this isolated local instance. The funded real fixture uses API names/logos. A recurring local operator is running; no hosted rollout or operating-system service is installed. Public synthetic evidence and actual fixture activation remain separate.

## Local usability correction after publication

### Slip-to-payment correction

On 16 October the owner reached a read-only draft success message instead of payment. The primary slip action is now **Continue to payment** for a single eligible pick. Multi-pick drafts expose **Pay this prediction** on eligible lines and explicitly state that payment is individual. The optional legacy-rule check is collapsed inside the scrollable body. Home browsing and unavailable slips link to funded matches. Legacy pool statistics and fees are labelled separately from contract terms.

Independent checkout/recovery review found a stale-intent bug when reopening the same market. An explicit handoff revision now replaces the older unsent checkout, including its quote. Review found no remaining blocker after correction. Lightweight discovery does not import the wallet SDK; full descriptor and live-cell validation remain in checkout. Funded listings apply the existing 30-second preparation margin, and the UI explains that review still checks space and time. Saved drafts may include already-paid picks, which is stated explicitly beside payment.

The final `npm.cmd run quality:major` report passed **35/35 checks**, completing at **2026-10-16T12:48:34.634Z**. Evidence: `.quality-artifacts/checkout-final-gate.json` and `.quality-artifacts/checkout-final-gate.log`. Coverage includes 22 Season browser groups, four expanded wallet journeys in Chromium/WebKit at 390/1440px, disposable PostgreSQL and 25 signed local-devnet checks. The expanded journey starts on the ordinary home page and verifies a nondefault Away pick and exact decimal amount, repeated same-market handoff, explicitly individual checkout from a two-pick draft, retained picks after rejection/reload and malformed-catalogue retry. Earlier draft expiry, stale responses and painted Genie checks remain intact.

The running real-API local app passed home-to-match-to-slip-to-wallet-prompt checks at 390/1440px with zero page errors and the selected Away/125 tCKB intent preserved. Evidence: `.quality-artifacts/checkout-local.json`, `.quality-artifacts/browser/checkout-slip-local-390.png` and the accompanying desktop/payment captures. Ordinary browsing did not request wallet SDK chunks. This check did not connect a wallet or move public-testnet funds. The synthetic browser and signed devnet evidence are separate from this manual local check.

Resume from `http://127.0.0.1:4100/season/`, hard refresh, then use **Play on testnet**. Everton vs Chelsea remains the sole funded real fixture. Other matches remain draft-only until funded; combined payment, wider wallet/device verification and Five remain open commitments. The local operator continues running. No additional contract deployment, GitHub publication or hosted release is claimed for this correction.

On 16 October, the owner encountered the local launcher's blanket write restriction while signing in. This was an operational configuration mistake in `.quality-artifacts/local-season.cjs`, not an undeployed contract or a missing backend authentication implementation. The launcher now permits the existing authentication and profile routes, initializes durable local identity storage, refreshes real fixtures without overlapping requests and warms provider status on startup. No production identity rules or contracts changed.

Manual checks against the running local app passed at **12:20 UTC**: challenge issuance, signed account creation, replay rejection, authenticated account read, profile update, cross-origin rejection, logout, session revocation and funded-market availability. Ephemeral unfunded verification identities exist only in the local data directory; they are not community users or engagement evidence. No chain transaction was submitted by these checks. Evidence: `.quality-artifacts/local-auth-check.json`. Fresh desktop/mobile captures had no page errors and required a wallet before review.

The separate `.quality-artifacts/local-direct-worker-loop.cjs` runs the existing operator serially, waiting one minute after each completed cycle. Its status is `.quality-artifacts/local-direct-worker-status.json`; private signing configuration remains outside the API process. Two completed cycles confirmed the real funded market and correctly waited for kickoff. It runs only while this computer and process remain available. This is not durable hosted activation.

Current local app PID: `24672`. Current local operator supervisor PID: `31184`. Verify process command lines before stopping either. The user-facing restriction has been corrected locally. The owner confirmed that local testing is the present target, so do not hold local usability work behind a public deployment request. The next interaction is the user's connected-wallet check against the funded real market. PR 4 and contract deployment remain unchanged by this runtime correction. These handoff updates are local and uncommitted.

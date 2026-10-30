# Streak documentation

29 October [Five game-first layout](delivery/five-workspace.md): compact controls
leave 75.2% of the initial desktop viewport below the game start. Local CSS-only
implementation and responsive gameplay checks are complete; publication remains
separate from the earlier release below.

29 October publication: `51d0849` is verified on GitHub `main`. Shared cell loaders,
wallet fixes, branding/startup and event-driven Activity passed all 76 local
gate checks. Hosted CI was intentionally skipped; hosted and physical-wallet
acceptance remain next. [Current status](../status.md).

29 October: [shared cell loaders](delivery/connected-loading.md) are implemented
across the dapp after owner approval. Six motion groups and eight real application
loading states pass in Chromium/WebKit. Final release verification/publication
remains pending. See the [work tracker](work-tracker.md) for current scope.

29 October [refined cell loading preview](../design/loading-signature-review/README.md):
rotating/pulsating squares and a horizontal connected sine wave, shown at actual
UI sizes. Eight Chromium/WebKit verification groups pass. Await design approval
before application integration.

29 October [local Activity wiring and calmer retry UI](delivery/event-driven-activity.md)
are verified with persistent records, four browser journeys and disposable
PostgreSQL checks. [Landing pages skip the splash](delivery/startup-identity.md);
all 58 startup browser groups pass. Publication and hosted acceptance remain
pending, with the earlier local launcher gap resolved.

29 October [longer, skippable startup reveal](delivery/startup-identity.md) is
verified locally with 38 Chromium/WebKit groups. The [production test plan](delivery/hosted-acceptance-plan.md)
now waits for development completion and a frozen deployed candidate before
selecting fresh fixtures. No hosted test or publication is claimed.

28 October [event-driven Activity delivered locally](delivery/event-driven-activity.md), with all 75 required checks covered by passing results across the full run and documented follow-ups. Final indexed/recovery browser verification passed at 14:24:04 UTC; independent reviews accepted. Publication and physical-wallet acceptance remain separate. This supersedes the implementation-in-progress entries below.

28 October approved implementation: [event-driven wallet Activity](delivery/event-driven-activity.md) adds durable public event delivery, owner-indexed PostgreSQL reads, canonical recovery and signer-independent startup prefetch. Focused tests and independent review are complete; final major verification is in progress. Earlier proposal-only entries below are historical. The linked-block loading preview still awaits separate approval.

28 October Activity proposal refinement: [event-driven wallet records](architecture/wallet-activity-index.md), backed by durable delivery and targeted reconciliation. [Engineering notes](architecture/wallet-activity-index-technical.md) identify existing journal hooks and the distinction between submitted, admitted, reported and collectible states. Proposal only; no index runtime is implemented.

28 October [linked-block loading signature](../design/loading-signature-review/README.md): interactive preview for payment buttons, Activity, games and minimized confirmation status. Responsive Chromium/WebKit and reduced-motion checks passed. Await approval before replacing site-wide loaders.

28 October owner-approved [logo and startup integration](delivery/startup-identity.md). The [production test plan](delivery/hosted-acceptance-plan.md) is now a short checklist. Read the [plain-language activity proposal](architecture/wallet-activity-index.md) first; its [engineering notes](architecture/wallet-activity-index-technical.md) retain implementation details. The durable index remains for review.

28 October implemented: [bounded Activity startup warmup](delivery/activity-startup-warmup.md) shares cached reads after sign-in without delaying the shell. Focused unit/build/lint/browser checks passed and independent review accepted. The durable index remains a separate architecture proposal.

28 October refinement: [two-strike / chart-r splash](../design/splash-review/README.md) adds CKB cell and prediction motifs in an isolated preview. [Wallet activity index design](architecture/wallet-activity-index.md) documents current scan costs, durable owner-index architecture, bounded prefetch and app-wide performance targets. [Hosted acceptance](delivery/hosted-acceptance-plan.md) explicitly runs on streakpitch.com; local results do not count as hosted acceptance.

28 October: [hosted acceptance plan](delivery/hosted-acceptance-plan.md) for six QA wallets, tonight's prediction coverage and GW9 Five/Survivor deadlines. Public hosted and official FPL snapshots verified; no test bets executed. [Animated startup preview](../design/splash-review/README.md) is isolated at port 4198 awaiting design approval.

27 October branding integration: [approved On form wordmark and favicon](../design/brand-review/README.md) now appear across local Season, landing and retained legacy surfaces. Build, lint, static policies and both responsive browser suites passed. Includes application asset mapping and downloadable vector/icon packs. Commit, push and hosted rollout remain pending.

27 October local implementation: [wallet compatibility, visible login recovery and restoration](delivery/wallet-compatibility.md). Independent identity review accepted; all 71 major checks and the subsequent scoped static/build check passed. Physical wallet and hosted acceptance remain separate.

26 October release report: [Week 22: a reason to come back next weekend](../../../reports/week-22.md), with screenshots, the new streakpitch.com domain and explicit testnet limits. [DM draft for Neon](../../../reports/week-22-dm.md).

26 October owner correction implemented locally: [environment-only game data, consistent Beta labels, Survivor competition discovery and next-three fixture outlooks](delivery/games-local-mode-and-outlook.md). All 71 major checks passed in one run; local API is back on regular football data.

26 October implemented locally: [Five tabs, captain/save states, mobile return navigation and sponsor showcase](delivery/five-workspace.md). All required checks have passing coverage across the major run and documented follow-ups. Independent review accepted; original failed receipts remain. Logo/favicon design is next.

25 October design review: [Five workspace tabs, captain guidance, editing states and sponsor showcase](../design/five-workspace-review/README.md). Archived synthetic preview, approved and integrated on 26 October.

25 October in-app testing: [actual Five/Survivor pages, dummy data, real testnet payment paths and immediate admin deadlines](delivery/in-app-games-testing.md). Active locally with passing required check coverage; physical-wallet and hosted acceptance remain separate.

24 October release: [official deadline enforcement, short local-chain rehearsal and Render configuration](delivery/five-release-rehearsal.md).

24 October Five: [sponsor auctions, cumulative bids and automatic losing-bid refunds](delivery/five-sponsor-auction.md). Applies to newly created rounds; existing community-funded gameweeks keep their terms.

23 October Five: [local dedicated rewards wallet activation and remaining live acceptance](delivery/five-local-rewards-activation.md). Faucet reserve confirmed, isolated worker running and sponsorship enabled locally. No live sponsor contribution or prize paid yet.

21 October Five: [automatic EPL gameweeks, interactive player profiles and game workspace](delivery/five-automatic-gameweeks.md). Local Gameweek 8 opens without manual imports. Official deadlines, provisional/final scoring and live scouting are integrated; all 66 required checks have passing coverage across completed runs. Local only.

20 October Five runtime: [gameweeks, private squads, scoring, optional sponsorship design and funding boundary](delivery/five-implementation.md). Development and dedicated testnet rewards custody are approved. Funding and claims have isolated signed-chain coverage; hosted activation and physical-wallet checks remain separate.

20 October Streak Five: [private EPL squad builder, proposed scoring and FPL/UEFA source investigation](../design/five-review/README.md). Owner's latest start-Five direction supersedes the earlier feature sequence for this increment; Community Markets remains planned. Public player-data reuse and production entries are separate acceptance steps.

20 October navigation refinement: [compact desktop controls, centered fading mobile dates and full-catalogue league filtering](delivery/fixture-date-navigation.md). All 26 integrated browser groups passed with the local API; screenshots reviewed. Local only.

20 October daily navigation: [Today-first fixtures, day arrows, month calendar, mobile scrolling and Live filtering](delivery/fixture-date-navigation.md). Build/lint, calendar/filter tests and all 26 integrated Season browser groups passed locally.

20 October quality pass: [wallet restoration, progressive Activity, refund recovery, animated states and Survivor deletion](delivery/wallet-activity-quality.md). All 60 local major checks passed; physical MetaMask verification and hosted rollout remain separate.

19 October Survivor: approved design is now integrated locally with admin drafts, free admission, private picks, persistent rounds and standings. Read the [implementation, configuration and verification record](delivery/survivor-implementation.md). Paid publication and funded prizes remain separate work.

19 October Survivor preview: [admin creation, free or fee-gated entry, prize controls and the player journey](../design/survivor-review/README.md). The [proposed rules and implementation boundary](product/survivor-rules.md) distinguish this local design simulation from live game state and prize funding.

19 October durable product decisions: [Survivor → Community Markets → Five, grouped navigation and the next planning step](product/scope-and-roadmap.md#current-product-decisions-19-october-2026). This is the current feature sequence and supersedes older Five-first priority notes. These features remain planned; begin with Survivor rules and an interactive preview.

19 October My Activity: [interactive open-bets/history proposal](../design/activity-review/README.md) with return breakdowns, payment tracking and production state mapping. Approved and implemented: [Activity delivery and source boundaries](delivery/activity-history.md).

19 October hosted payments: [supervised API, sponsor and settlement worker](delivery/hosted-launcher.md) implements the missing Render startup process. [Configuration and handover steps](operations/direct-testnet.md#hosted-render-configuration-checklist-19-october-2026) distinguish local implementation, publication and live activation.

17 October Week 21 release: the owner authorized the report, screenshots, commit, push and PR integration into main. The [report](../../../reports/week-21.md) distinguishes confirmed public payments, local regression evidence and the hosted sponsor/worker configuration still required. This supersedes earlier publication pauses below. Five and an original logo remain upcoming; no new campaign or prize commitment is included.

17 October approved implementation: [compact Picks/Activity slip, animated payment button and repeat-payment reads](delivery/compact-slip-implementation.md). All 51 local major-gate checks passed; the implementation is active locally.

Approved reference: [compact slip workspace and repeat-payment performance plan](../design/slip-workspace-review/README.md), with the isolated simulation retained on port 4187.

17 October sponsor correction: [review contention and signed-payment recovery](delivery/sponsor-review-recovery.md) distinguishes the confirmed owner payment from unsigned review failure and records the queue/status changes.

17 October terminal and payment upgrade: [match intelligence, background tracking and refundable storage](delivery/terminal-payment-upgrade.md) records the new experience, actual three-pick cost and the storage-sponsorship decision still needed.

17 October payment correction: [market checkout and wallet continuity](delivery/checkout-route-correction.md) records the obsolete-entry fix, inline EVM reconnect, redesigned match details and full-application payment regression.

17 October Overview update: [clear glass and CKB details](delivery/overview-glass-correction.md) records the reference-led match rows, blue side-panel reflections, shared Home/Draw/Away colours and jersey crests.

17 October compact layout: [density correction](delivery/compact-layout-correction.md) records the owner's normal-zoom layout change, viewport-fitting navigation and verification.

17 October local work: [My Account and restored navigation](delivery/account-navigation-correction.md) implements the approved account/slip proposal, restores all original destinations and fixes Telegram's optional-username confirmation. Follow the work tracker for verification and release evidence.

Canonical foundation approved **15 October 2026**. Start with [status](../status.md), then the document governing the task. [AGENTS.md](../AGENTS.md) is the single contributor contract; tool-specific guidance should link to it instead of maintaining competing rules.

Current implementation: the [atomic slip correction](delivery/atomic-slip-correction.md) adds one reviewed payment for up to eight independent predictions, same-transaction sponsored market creation, separate Wallet and Activity routes, and compact balance/address controls. The v4 contract is deployed on public testnet. All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. Public deployment is not evidence of a public eight-prediction payment. Five, durable operation, physical-wallet checks, direct v4 Telegram notifications and community onboarding remain open.

Current commitments and resume point: [work tracker](work-tracker.md). Update it whenever work is steered, interrupted or completed.

Latest owner direction: payment stays inside the slip, with one X close button and no Genie animation. Close and Escape retain the draft. The [atomic delivery record](delivery/atomic-slip-correction.md) supersedes the earlier individual-payment and minimize-only behavior while preserving its historical evidence. [Sponsored first-prediction creation](architecture/sponsored-creation.md) continues to replace bulk funding of unused markets.

The [wallet and automatic provisioning correction](delivery/wallet-provisioning-correction.md) supersedes the native-wallet-only and single-funded-fixture limitations above. It records the separate compatible contract deployment, shared signer state, all-fixture queue and remaining rollout evidence.

| Document                                                           | Purpose                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [Product scope and roadmap](product/scope-and-roadmap.md)          | Pilot boundaries, Five, acceptance criteria and delivery order                    |
| [Featured fixture ranking](product/fixture-ranking.md)             | League preferences, match appeal, rivalries and discovery order                   |
| [Architecture](architecture/overview.md)                           | Current system, approved target, state ownership and migration                    |
| [Chain and oracle](architecture/chain.md)                          | Rust lab limits, direct stake/claim integration and pinned trust                  |
| [Design system](design/system.md)                                  | Approved visual tokens, interaction, motion and accessibility                     |
| [Engineering conventions](engineering/conventions.md)              | Code boundaries, exact money, security and resource use                           |
| [Quality and release](delivery/quality.md)                         | Mandatory checks, test isolation, CI and commit procedure                         |
| [Operations runbook](operations/runbook.md)                        | Recovery, rollout, observability and launch readiness                             |
| [Direct operator and owner recovery](operations/direct-testnet.md) | Real fixture publication, bounded worker, durable journals and independent claims |
| [Approval decision](decisions/0001-approved-foundation.md)         | What the owner approved and what remains unproven                                 |
| [Handoff](handoff/README.md)                                       | Reading order and next implementation task                                        |

The [interactive preview](../design/season-preview/README.md), [design proposal](../design/season-preview/DESIGN-PROPOSAL.md) and [architecture proposal](../design/season-preview/ARCHITECTURE-PROPOSAL.md) retain the detailed review evidence. Their original review-state language is historical; ADR 0001 records the later approval. Their simulated behavior is still not production implementation.

Existing implementation references remain useful: [application README](../README.md), [performance notes](../PERFORMANCE.md), [contract scope](../CONTRACT_SCOPE.md), [contract design notes](../CONTRACT_DESIGN_NOTES.md) and [Week 20 lab](../../../src/week20/contract-lab/README.md). When older marketing wording conflicts with the documented custody boundary, use the source-backed distinction here and correct the wording in the integration change.

The [market/slip milestone](delivery/market-slip-milestone.md) documents the integrated read-only detail, persistent draft and whole-slip review increment, including its recovery rules and payment boundary.

The [visual and Genie correction](delivery/ui-motion-correction.md) is historical evidence for the earlier Minimize design. The owner subsequently removed that animation and selected the close-only interaction described in the atomic correction.

The [direct testnet milestone](delivery/direct-testnet-milestone.md) records the new single-market payment, settlement and recovery integration. It keeps legacy custody liabilities separate. The immutable football catalogue is a trusted mapping because the unchanged script arguments do not include a fixture digest. Combined entry is now implemented in the separate v4 protocol; Five remains a later increment.

Update the governing document when a decision changes. Add an ADR for a material architecture or trust decision, with the superseded decision and consequences. Update status with dated evidence, not a duplicate specification. This directory defines the approved direction; the implementation source and exact test results establish what exists today.

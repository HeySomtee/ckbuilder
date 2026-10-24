# Streak documentation

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

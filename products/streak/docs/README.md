# Streak documentation

Canonical foundation approved **15 October 2026**. Start with [status](../status.md), then the document governing the task. [AGENTS.md](../AGENTS.md) is the single contributor contract; tool-specific guidance should link to it instead of maintaining competing rules.

Current implementation: the [direct wallet-to-market journey](delivery/direct-testnet-milestone.md) includes shared EVM wallet state and [sponsored creation with the first prediction](delivery/sponsored-creation.md). The v3 contract is deployed on testnet and the separate sponsor is active locally. All 42 local gate steps passed at 14:59 UTC on 16 October. Real-API phone and desktop checks passed with 180 unused fixtures eligible for sponsorship and 16 existing funded markets. Bulk creation is paused. Operator capacity currently covers roughly five new reserves before replenishment. Physical wallet checks and durable operation remain before community onboarding; combined payment and Five remain open.

Current commitments and resume point: [work tracker](work-tracker.md). Update it whenever work is steered, interrupted or completed.

Latest owner direction: [sponsored first-prediction creation](architecture/sponsored-creation.md) replaces bulk funding of unused markets. The [delivery record](delivery/sponsored-creation.md) tracks its separate contract deployment, local activation, verification and remaining limits.

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

The [visual and Genie correction](delivery/ui-motion-correction.md) documents the follow-up to the approved preview, the single Minimize control and motion resource ownership.

The [direct testnet milestone](delivery/direct-testnet-milestone.md) records the new single-market payment, settlement and recovery integration. It keeps legacy custody liabilities separate. The immutable football catalogue is a trusted mapping because the unchanged script arguments do not include a fixture digest. Combined payments and Five remain later increments.

Update the governing document when a decision changes. Add an ADR for a material architecture or trust decision, with the superseded decision and consequences. Update status with dated evidence, not a duplicate specification. This directory defines the approved direction; the implementation source and exact test results establish what exists today.

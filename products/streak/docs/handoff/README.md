# Contributor handoff

Snapshot: **16 October 2026**, Africa/Lagos. Verify [status](../../status.md) and source before relying on this handoff. The market/slip increment is based on published Season revision `eb8d151`.

Read the [work tracker](../work-tracker.md) first for current progress and the exact resume point. Market detail and persistent draft/slip review are implemented. Payment remains unavailable in this flow. See the [market/slip milestone](../delivery/market-slip-milestone.md).

The owner's UI correction is also implemented: preview composition, one Minimize control and actual Genie minimize/restore. The [correction report](../delivery/ui-motion-correction.md) records 22 integrated browser groups, visual evidence and the 31-step local gate completed at 09:00 UTC on 16 October. The next implementation task remains the direct stake-to-claim journey.

## Read first

1. [AGENTS.md](../../AGENTS.md) and the [documentation map](../README.md).
2. [ADR 0001](../decisions/0001-approved-foundation.md) for the owner's approval and scope.
3. [Architecture](../architecture/overview.md), [chain boundary](../architecture/chain.md) and [roadmap](../product/scope-and-roadmap.md).
4. [Design system](../design/system.md) and the approved [interactive preview](../../design/season-preview/README.md).
5. [Quality gates](../delivery/quality.md), [engineering conventions](../engineering/conventions.md) and [operations](../operations/runbook.md).

## What exists

Streak has a React landing at `/` and market browser at `/season/`, with the existing custodial application retained at `/index.html`. The TypeScript Node API supplies fixtures and logos across Friday through Monday, with weighted featured ranking. Relational PostgreSQL, changed-row writes and existing performance work already exist. Sessions/challenges are durable; ledger writes still depend on a whole-working-set snapshot and single-process queue. Read the [Season milestone](../delivery/season-milestone.md) for identity, testing and rollout limits.

The Week 20 Rust lab is a separate bounded market/claim implementation with its own browser and recovery tools. The Season preview is an isolated synthetic design study. Durable workers, direct-market app integration, integrated combined payments and official Five entry/scoring remain ahead; the React/Vite landing and market browser are implemented.

The owner approved the UI and architecture, then requested this documentation/testing/CI foundation before the rebuild. Do not ask for the same approval again. Do not deploy, spend funds, announce prizes or change contract economics because the visual direction was accepted.

## Next implementation increment

The foundation is published as PR 1; Season landing, ranked fixtures and identity are in PR 2. The Season base passed 30 local gate steps. The market/slip increment passed 31, including eighteen integrated browser groups and an independent recovery review. Hosted CI remains paused by the owner after the billing lock; local verification remains required.

The next increment is one direct wallet-to-market stake through settlement and claim. Map app market and fixture IDs to protocol commitments and establish durable pending transaction recovery before adding combined payment. The integrated draft and server review do not reserve stakes or authorize spending. Bounded SQL mutations, durable jobs and restore evidence remain required for rollout. Read the tracker before switching focus so these commitments survive later UI requests.

Use the accepted preview for visual detail and the architecture for authority. A generated sample receipt, local saved team or simulated combined payment must never be presented as real integration. Batch payment support, fixture/rules commitment, account linking and player-scoring coverage each need implementation evidence.

## Known evidence gaps

- Historical full preview motion run: 56/58; earlier snapshot run: 9/9 before final slip-opacity change. The integrated controller separately passes cold-start, paint and cleanup checks in both engines. Physical-device performance is not verified.
- Current DB health, hosting budget and load capacity were not re-established by design work.
- The 32-bet contract bound and supported lock-argument limit remain real constraints.
- No verified GitHub Actions run or active branch protection is established by local workflow files. Read status for the latest publication/authentication state.
- Five player coverage, final scoring/exception rules and monetary campaign budget remain to be established before public entries or promises.

## Leave the next handoff better

Record the exact changed behavior, source revision, commands and results, artifacts/run links, independent review, rollout state and remaining blocker. Update the canonical document rather than appending conflicting rules to a new agent file. Preserve unrelated local work and never include secrets or real user data in evidence.

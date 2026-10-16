# Contributor handoff

Snapshot: **16 October 2026**, Africa/Lagos. Verify [status](../../status.md) and source before relying on this handoff. The active direct testnet increment is on `feat/streak-direct-testnet`, following published UI correction `ef2d4db`.

Read the [work tracker](../work-tracker.md) first. All five parts of the one-market direct journey are implemented and verified: wallet capacity, exact review, signing, confirmation with refresh recovery, and result/claim/refund recovery. The complete local candidate gate passed all **35 checks** at **2026-10-16T11:48:11.275Z**. The increment is complete on the `feat/streak-direct-testnet` review branch; publication uses mandatory local commit and push gates. See the [direct milestone](../delivery/direct-testnet-milestone.md). The retained multi-pick draft still has no combined payment.

Preserve the owner's implemented UI correction: preview composition, one Minimize control and actual Genie minimize/restore. The [correction report](../delivery/ui-motion-correction.md) retains its earlier 22 browser groups and 31-step gate evidence. Do not replace that history with the new direct verification results.

## Read first

1. [AGENTS.md](../../AGENTS.md) and the [documentation map](../README.md).
2. [ADR 0001](../decisions/0001-approved-foundation.md) for the owner's approval and scope.
3. [Architecture](../architecture/overview.md), [chain boundary](../architecture/chain.md) and [roadmap](../product/scope-and-roadmap.md).
4. [Design system](../design/system.md) and the approved [interactive preview](../../design/season-preview/README.md).
5. [Quality gates](../delivery/quality.md), [engineering conventions](../engineering/conventions.md) and [operations](../operations/runbook.md).
6. [Direct operator and owner recovery](../operations/direct-testnet.md) for exact CLI commands, trusted source rules, persistent storage and exit recovery.

## What exists

Streak has a React landing at `/` and market browser at `/season/`, with the existing custodial application retained at `/index.html`. The TypeScript Node API supplies fixtures and logos across Friday through Monday, with weighted featured ranking. Relational PostgreSQL, changed-row writes and existing performance work already exist. Sessions/challenges are durable; ledger writes still depend on a whole-working-set snapshot and single-process queue. Read the [Season milestone](../delivery/season-milestone.md) for identity, testing and rollout limits.

The direct integration uses the unchanged deployed Week 20 protocol through product transaction builders and the shared browser/standalone client. The historical lab remains a separate regression reference. A public immutable registry maps real API fixtures to market instances. A separate bounded worker handles trusted regulation-time evidence, reporting, settlement and timeout, backed by durable single-operator journals. It is not a replicated PostgreSQL job service or a hosted deployment.

The wallet signs direct transactions, and exact signed bytes are persisted before broadcast. Canonical reconciliation keeps unknown results distinct from confirmation, admission and settlement. Browser exports support independent owner claims and exact-byte resubmission. A canonical conflicting-input proof can release an impossible original transaction only while that proof remains valid. Legacy ledger balances and exits remain separate.

The catalogue's fixture digest is not encoded in the deployed script arguments. Admin authority is pinned per market, without a global creator factory allowlist. The trusted curated registry identifies supported operator instances. Combined payments, integrated Five scoring, broader storage/job coordination and public rollout remain ahead. The Season preview continues to be an isolated synthetic design study.

The owner approved the UI and architecture, then requested this documentation/testing/CI foundation before the rebuild. Do not ask for the same approval again. Do not deploy, spend funds, announce prizes or change contract economics because the visual direction was accepted.

## Resume point

The foundation is published as PR 1; Season landing, ranked fixtures and identity are in PR 2. The Season base passed 30 local gate steps. The market/slip increment passed 31, including eighteen integrated browser groups and an independent recovery review. Hosted CI remains paused by the owner after the billing lock; local verification remains required.

Establish operational readiness and supported-wallet compatibility before onboarding. The complete local gate passed all 35 checks; evidence is in `.quality-artifacts/direct-full-gate.json` and `.quality-artifacts/direct-full-gate.log`. Targeted backend checks pass in five groups, HTTP boundary checks pass, and four standalone recovery tests pass. Native devnet passed 25 actual signed checks. The separately authorized public synthetic run passed at 11:13 UTC with all seven transactions confirmed. One separate real API fixture, Everton vs Chelsea, is funded and enabled locally. Combined payment and Five follow as separate implementation increments.

Keep the direct milestone, status and tracker aligned with the exact revision and publication state. Synthetic public-chain outcomes stay labelled synthetic and out of the real football catalogue. The local real-fixture mapping was published after six confirmations, and the worker was exercised once. No hosted deployment or worker activation has occurred. Monitored worker execution, durable-volume verification and backup restore are distinct operational steps. Bounded SQL mutations and production job coordination remain required for rollout.

Use the accepted preview for visual detail and the architecture for authority. A sample receipt, saved fantasy team or simulated combined payment must never be presented as chain evidence. Batch payment support, a future on-chain fixture commitment, account linking and player-scoring coverage each need separate implementation evidence.

## Known evidence gaps

- Historical full preview motion run: 56/58; earlier snapshot run: 9/9 before final slip-opacity change. The integrated controller separately passes cold-start, paint and cleanup checks in both engines. Physical-device performance is not verified.
- Current DB health, hosting budget and load capacity were not re-established by design work.
- The 32-bet contract bound and supported lock-argument limit remain real constraints.
- The file-backed worker requires one writer and durable storage. Unknown/conflicting operator jobs fail closed for review. They are not silently rebuilt after a timeout.
- The new integration has a completed 35-check local candidate gate, but no hosted activation or completed real-football settlement. The public settlement exercise used synthetic results; the real local fixture has only been created and funded.
- No verified GitHub Actions run or active branch protection is established by local workflow files. Read status for the latest publication/authentication state.
- Five player coverage, final scoring/exception rules and monetary campaign budget remain to be established before public entries or promises.

## Leave the next handoff better

Record the exact changed behavior, source revision, commands and results, artifacts/run links, independent review, rollout state and remaining blocker. Update the canonical document rather than appending conflicting rules to a new agent file. Preserve unrelated local work and never include secrets or real user data in evidence.

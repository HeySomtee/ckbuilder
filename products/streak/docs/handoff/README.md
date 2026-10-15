# Contributor handoff

Snapshot: **15 October 2026**, Africa/Lagos. Verify [status](../../status.md) and source before relying on this handoff. Application baseline inspected: `2d5879a`.

## Read first

1. [AGENTS.md](../../AGENTS.md) and the [documentation map](../README.md).
2. [ADR 0001](../decisions/0001-approved-foundation.md) for the owner's approval and scope.
3. [Architecture](../architecture/overview.md), [chain boundary](../architecture/chain.md) and [roadmap](../product/scope-and-roadmap.md).
4. [Design system](../design/system.md) and the approved [interactive preview](../../design/season-preview/README.md).
5. [Quality gates](../delivery/quality.md), [engineering conventions](../engineering/conventions.md) and [operations](../operations/runbook.md).

## What exists

The current Streak application is a vanilla frontend with a TypeScript Node API and custodial treasury-backed ledger. Relational PostgreSQL, changed-row writes and existing performance work already exist. Sessions/challenges are process-local, and writes still depend on a whole-working-set snapshot and single-process queue.

The Week 20 Rust lab is a separate bounded market/claim implementation with its own browser and recovery tools. The Season preview is an isolated synthetic design study. React/Vite, durable workers, direct-market app integration and official Five entry/scoring are the approved target, not delivered production features.

The owner approved the UI and architecture, then requested this documentation/testing/CI foundation before the rebuild. Do not ask for the same approval again. Do not deploy, spend funds, announce prizes or change contract economics because the visual direction was accepted.

## Next implementation increment

The full local foundation gate passed; see status for the 20 completed steps and regression evidence. Publish only within authorized Git scope and verify hosted checks/protection separately. Then take stage 1 from the roadmap: establish bounded persistence and durable identity/job correctness, repair TLS/cookie policy and define the legacy liability recovery boundary. Build one complete new frontend journey after its dependencies are ready, rather than moving every mock page into production at once.

Use the accepted preview for visual detail and the architecture for authority. A generated sample receipt, local saved team or simulated combined payment must never be presented as real integration. Batch payment support, fixture/rules commitment, account linking and player-scoring coverage each need implementation evidence.

## Known evidence gaps

- Full preview motion run: 56/58, with two headless mobile WebKit timing failures. Earlier snapshot run: 9/9 before final slip-opacity change. Real-device performance is not verified.
- Current DB health, hosting budget and load capacity were not re-established by design work.
- The 32-bet contract bound and supported lock-argument limit remain real constraints.
- No verified GitHub Actions run or active branch protection is established by local workflow files. Read status for the latest publication/authentication state.
- Five player coverage, final scoring/exception rules and monetary campaign budget remain to be established before public entries or promises.

## Leave the next handoff better

Record the exact changed behavior, source revision, commands and results, artifacts/run links, independent review, rollout state and remaining blocker. Update the canonical document rather than appending conflicting rules to a new agent file. Preserve unrelated local work and never include secrets or real user data in evidence.

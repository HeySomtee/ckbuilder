# Streak status

Updated **15 October 2026**, Africa/Lagos. Application source baseline inspected: `2d5879a`. This is a dated handoff, not a production readiness claim. See [the docs index](docs/README.md) and [quality procedure](docs/delivery/quality.md).

## Owner decisions

- UI and architecture approved, including clear glass, directional rims, native scrollbar, visible Minimize/Close labels and the denser 95% prediction slip.
- Independent predictions in one combined payment remain the accepted slip behavior.
- React/TypeScript/Vite with retained Node API, modular backend/durable worker and a bounded direct-market pilot are the accepted target.
- Establish canonical docs, agent instructions, recurring tests and mandatory CI before the production rebuild. [ADR 0001](docs/decisions/0001-approved-foundation.md) records scope and limits.

## Implementation state

| Area                  | State                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing app          | Vanilla frontend, TypeScript API and treasury-backed custodial ledger; production redesign not started                                                                   |
| Week 20 Rust work     | Separate bounded lab and browser/CLI, not integrated with the Streak backend                                                                                             |
| Season preview        | Approved local simulation; combined slip and Five drafts use sample data                                                                                                 |
| Canonical docs        | Added contributor contract, architecture, product/design rules, conventions, quality, operations and handoff                                                             |
| Quality/CI foundation | Canonical docs, isolated tests, full verification runner and GitHub workflow added; local hooks installed                                                                |
| Hosted enforcement    | Authenticated read-only GitHub inspection confirmed the public repository and an unprotected main branch. The workflow is not yet published and no hosted run is claimed |

## Preview evidence carried forward

Recorded on 15 October: 18 general browser groups and the expanded 32 basket groups passed. The foundation run found and fixed shared mutable defaults that could retain activity after resetting the preview. Reset now has pending and completed-submission regression coverage in both browsers. Latest full motion run passed **56/58** with two Windows headless mobile WebKit timing observations unresolved. Earlier dedicated snapshot run passed **9/9 before the final 95% slip tint**. See [preview results and captures](design/season-preview/README.md#verification). These are preview results, not wallet, production, capacity or physical-device evidence.

## Foundation verification

`npm.cmd run quality:major` passed on 15 October 2026 against the current foundation working tree based on `2d5879a`: all **20 runner steps passed**. The result is saved locally at `.quality-artifacts/all.json`; it is not a hosted CI result or a new commit SHA.

- Scoped formatting, 18 documentation files, source/sensitive-path policies, 50 JavaScript syntax checks and both TypeScript builds passed.
- Nine quality-tooling tests, six application TypeScript suites and seven client-runtime cases passed. These include deposit replay, concurrent spending, cutoff, rollback, failed writes and recovery.
- Real PostgreSQL 16 integration passed using a disposable loopback database and randomly isolated schema. Missing `PG_TEST_URL` was separately confirmed to fail the gate instead of skipping.
- Current-app desktop/mobile browser journeys passed, including rejected submissions and explicit retry. The approved preview passed 18 general groups and 32 combined-slip groups in Chromium/WebKit.
- Week 20 passed eight Rust VM groups, four accounting tests including 1,000 deterministic portfolios, and four transaction-builder tests. No live settlement was performed.

Independent review found test-transport escape paths and a child process missing the isolation preload. The final runner validates HTTP option overrides, prevents redirect following, blocks browser external traffic/service workers and invokes accounting tests with the preload directly. Tooling regressions cover these boundaries. A stricter network check initially rejected Playwright's custom fixture transport; the fixture now uses guarded native loopback fetch. The final complete gate passed after these fixes.

`npm.cmd run hooks:install` completed and `core.hooksPath` reads `.githooks`. Both shell hooks are staged with executable Git mode for Linux compatibility; the broader change is not committed or pushed. The hooks reject mismatched staged/working contents and repeat the complete gate before commit and push. They require the documented local test prerequisites. The GitHub workflow is prepared with a stable `Quality gate`, but hosted execution and required branch protection are not yet active.

## Next and unresolved

1. Publish this verified foundation within authorized Git scope, verify hosted CI for its exact SHA, and activate required branch checks before merging/releasing.
2. Begin stage 1 reliability work: bounded SQL mutations, durable sessions/challenges/jobs, hosted TLS verification, secure cookie policy and restore evidence.
3. Implement the approved shell and one real stake-to-claim journey with legacy custody exits kept separate.
4. Verify player-stat coverage and final rules before implementing official Five entries/scoring.
5. Resolve or safely fall back from expensive mobile motion before the public cohort. Verify real devices, deployment capacity and support ownership.

Still unproven: current Neon/storage health, always-on hosting budget, broad wallet support, production batch transactions, fixture/rules commitment, player-stat entitlement, final scoring exceptions and funded campaign budget. The October 31 pilot target does not override these gates.

# Streak work tracker

Updated **16 October 2026**, Africa/Lagos. Delivery branch: `feat/streak-market-slip`, based on published Season revision `eb8d151` and [PR 2](https://github.com/HeySomtee/ckbuilder/pull/2). This file tracks commitments and interruptions. [Status](../status.md) describes the implemented system; the [roadmap](product/scope-and-roadmap.md) describes the wider product direction.

## Current focus

MARKET-01 and SLIP-01 are complete locally on the review branch. All 31 full local gate steps passed on 16 October, including eighteen integrated browser groups. Independent recovery review has no remaining blockers in this read-only scope. Commit and push hooks require the complete gate again for the unchanged candidate. No deployment or payment integration is claimed. See the [milestone report](delivery/market-slip-milestone.md).

| ID        | State                        | Commitment                                                                                | Completion evidence or remaining work                                                                                                                                  |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01     | Published                    | Keep both hero CTA buttons visible without scrolling on common laptop and phone viewports | Height-aware layout verified in Chromium and WebKit at seven short viewports; both actions remain visible and clickable                                                |
| DOC-01    | Published                    | Preserve active work and earlier commitments across steering and handoffs                 | Tracker linked from both agent instructions, status, documentation map and handoff; earlier commitments and resume point preserved                                     |
| MARKET-01 | Complete on review branch    | Build the Season market-detail screen                                                     | Public API details, teams/logos, lifecycle, pool distribution, terms, navigation and recoverable errors; 31-step local gate passed                                     |
| SLIP-01   | Complete on review branch    | Integrate the independent multi-prediction draft and server review                        | Eight picks, exact totals, retained drafts, explicit clear, whole-slip server validation and recovery; no payment; 31-step local gate passed                           |
| CHAIN-01  | Planned dependency           | Connect one direct wallet-to-market stake, settlement and claim journey                   | Map app fixture/market IDs to protocol commitments, prepare and verify transactions, persist pending intent and reconcile chain outcomes; Week 20 lab remains separate |
| SLIP-02   | Planned, depends on CHAIN-01 | Pay for independent predictions in one combined transaction                               | Preserve per-market settlement and complete-basket validation; sequential legacy bets are not a combined payment                                                       |
| FIVE-01   | Planned                      | Integrate Streak Five                                                                     | Verify player-data coverage, finalize entry/scoring/exception rules, then implement entries and scoring                                                                |
| OPS-01    | Required before rollout      | Reliability and recovery foundations                                                      | Bounded SQL mutations, durable jobs, abuse controls, backup/restore evidence and supported-wallet checks; keep one API writer                                          |
| LAUNCH-01 | Planned                      | Community testnet campaign and grant evidence                                             | Usable end-to-end testnet flow, funded reward rules, onboarding, monitored user engagement and real transaction evidence                                               |
| MOTION-01 | Open evidence gap            | Verify production Genie motion                                                            | Two historical mobile WebKit timing observations and real-device profiling remain; immediate transitions are the safe fallback                                         |
| CI-01     | Paused by owner              | Hosted GitHub Actions and required checks                                                 | Owner stopped hosted CI after the billing lock. Do not resume it without a new instruction. Local gates remain required                                                |

## Completed increments

| ID            | Completed work                                                                                 | Evidence and release state                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| FOUNDATION-01 | Approved design, architecture, documentation, local quality gates and hook pipeline            | Foundation `5a90186`, [PR 1](https://github.com/HeySomtee/ckbuilder/pull/1); hosted CI paused                    |
| SEASON-01     | React market browser, API fixtures/logos, Friday-to-Monday filters and durable wallet identity | `800e774`; integrated local tests and independent identity/recovery review                                       |
| LANDING-01    | Season landing, legacy link recovery and conservative challenge expiry                         | `5244262`; full 29-step local gate and independent identity/recovery review                                      |
| FIXTURES-01   | Automatic landing refresh, matchweek rollover and weighted featured ranking                    | `70beb34`; full 30-step gate passed before commit and push, including 12 integrated browser groups; not deployed |

## Resume point and acceptance boundaries

Resume **CHAIN-01** after this review increment: one real direct wallet-to-market stake, settlement and claim journey with durable pending transaction recovery. Keep the separate contract lab and the application's current custodial markets distinct. Combined payment follows that complete journey.

The first integrated slip increment is a draft and read-only server review. Keep it explicitly unpaid until CHAIN-01 and SLIP-02 are implemented. Current markets use the custodial ledger; the direct-contract lab has different limits and capacity requirements. Do not reuse preview fees or claim that legacy ledger bets are direct contract positions.

Public market data excludes account-specific positions. Server review validates the entire draft against one current snapshot, uses integer shannons, retains every invalid line, and invalidates stale responses after edits or account changes. Reviews also expire conservatively and cannot replace newer market terms. These rules are implemented and covered by regression tests.

## Working rules

1. Read this file at the start of every task and after a handoff or context reset.
2. Record new requests before implementation. A steering request adds or reprioritizes work unless the owner explicitly cancels an earlier commitment.
3. Before switching focus, record what is complete, the exact next action, dependencies and unfinished acceptance criteria. Keep earlier tasks in the table.
4. Update completion state only after implementation and relevant verification. Distinguish local completion, committed, pushed and deployed states.
5. End each increment with dated check results and a resume point. Keep canonical architecture/design decisions in their own documents and link them here.

## Current verification

On 16 October, `npm.cmd run quality:major` passed all **31 steps**, with no skipped required suite. Evidence: `.quality-artifacts/market-full-gate.log` and `.quality-artifacts/all.json`, completed at 07:57 UTC. Coverage includes backend/HTTP review, six draft tests, eighteen integrated Chromium/WebKit groups, eighteen approved-preview groups, thirty-two combined-slip preview groups, disposable PostgreSQL and Rust VM/accounting checks. The earlier hero CTA checks remain in this suite, covering seven short viewports. Desktop and mobile synthetic market/slip screenshots were inspected under `.quality-artifacts/browser/`.

The local preview is `http://127.0.0.1:4100/season/`; payments and account mutations are disabled, with only read-only slip review allowed as a POST. A separate manual provider refresh reported complete coverage for its loaded window, 262 scheduled fixtures and 196 market fixtures. A real fixture's public-detail and review requests succeeded with `paymentAvailable: false`. Routine tests remain isolated from provider credentials and production data. This manual read-only check is not on-chain settlement evidence.

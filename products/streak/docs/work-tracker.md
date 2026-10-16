# Streak work tracker

Updated **15 October 2026**, Africa/Lagos. Last published implementation: `70beb34` on `feat/streak-season-foundation`, [PR 2](https://github.com/HeySomtee/ckbuilder/pull/2). This file tracks commitments and interruptions. [Status](../status.md) describes the implemented system; the [roadmap](product/scope-and-roadmap.md) describes the wider product direction.

## Current focus

Hero CTA visibility and the persistent tracker are complete locally, with browser and static checks passed. They have not been committed or pushed. These are additions to the approved work, not cancellation of the market-detail and combined-slip increment. The next implementation remains MARKET-01 and SLIP-01.

| ID        | State                        | Commitment                                                                                | Completion evidence or remaining work                                                                                                                                                              |
| --------- | ---------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI-01     | Completed locally            | Keep both hero CTA buttons visible without scrolling on common laptop and phone viewports | Height-aware layout verified in Chromium and WebKit at seven short viewports; both actions remain visible and clickable                                                                            |
| DOC-01    | Completed locally            | Preserve active work and earlier commitments across steering and handoffs                 | Tracker linked from both agent instructions, status, documentation map and handoff; earlier commitments and resume point preserved                                                                 |
| MARKET-01 | Next, previously approved    | Build the Season market-detail screen                                                     | API teams/logos, kickoff, lifecycle, pool breakdown, terms, navigation and failure states; currently links to the legacy detail page                                                               |
| SLIP-01   | Next, previously approved    | Integrate the independent multi-prediction draft and server review                        | Exact totals, one selection per fixture, persistent drafts, labelled minimize/close, explicit clear, whole-slip validation, stale-response and recovery handling; no integrated implementation yet |
| CHAIN-01  | Planned dependency           | Connect one direct wallet-to-market stake, settlement and claim journey                   | Map app fixture/market IDs to protocol commitments, prepare and verify transactions, persist pending intent and reconcile chain outcomes; Week 20 lab remains separate                             |
| SLIP-02   | Planned, depends on CHAIN-01 | Pay for independent predictions in one combined transaction                               | Preserve per-market settlement and complete-basket validation; sequential legacy bets are not a combined payment                                                                                   |
| FIVE-01   | Planned                      | Integrate Streak Five                                                                     | Verify player-data coverage, finalize entry/scoring/exception rules, then implement entries and scoring                                                                                            |
| OPS-01    | Required before rollout      | Reliability and recovery foundations                                                      | Bounded SQL mutations, durable jobs, abuse controls, backup/restore evidence and supported-wallet checks; keep one API writer                                                                      |
| LAUNCH-01 | Planned                      | Community testnet campaign and grant evidence                                             | Usable end-to-end testnet flow, funded reward rules, onboarding, monitored user engagement and real transaction evidence                                                                           |
| MOTION-01 | Open evidence gap            | Verify production Genie motion                                                            | Two historical mobile WebKit timing observations and real-device profiling remain; immediate transitions are the safe fallback                                                                     |
| CI-01     | Paused by owner              | Hosted GitHub Actions and required checks                                                 | Owner stopped hosted CI after the billing lock. Do not resume it without a new instruction. Local gates remain required                                                                            |

## Completed increments

| ID            | Completed work                                                                                 | Evidence and release state                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| FOUNDATION-01 | Approved design, architecture, documentation, local quality gates and hook pipeline            | Foundation `5a90186`, [PR 1](https://github.com/HeySomtee/ckbuilder/pull/1); hosted CI paused                    |
| SEASON-01     | React market browser, API fixtures/logos, Friday-to-Monday filters and durable wallet identity | `800e774`; integrated local tests and independent identity/recovery review                                       |
| LANDING-01    | Season landing, legacy link recovery and conservative challenge expiry                         | `5244262`; full 29-step local gate and independent identity/recovery review                                      |
| FIXTURES-01   | Automatic landing refresh, matchweek rollover and weighted featured ranking                    | `70beb34`; full 30-step gate passed before commit and push, including 12 integrated browser groups; not deployed |

## Resume point and acceptance boundaries

After UI-01 and DOC-01 are verified, resume **MARKET-01 and SLIP-01** together as the next coherent increment. They were accepted before the landing follow-ups and have not been implemented. Do not confuse their approved interactive simulation with production integration.

The first integrated slip increment is a draft and read-only server review. Keep it explicitly unpaid until CHAIN-01 and SLIP-02 are implemented. Current markets use the custodial ledger; the direct-contract lab has different limits and capacity requirements. Do not reuse preview fees or claim that legacy ledger bets are direct contract positions.

Public market data must not cache account-specific positions. Server review must validate the entire draft against one current snapshot, use integer shannons, retain every invalid line, and invalidate stale responses after edits or account changes. These are implementation requirements, not claims of completed code.

## Working rules

1. Read this file at the start of every task and after a handoff or context reset.
2. Record new requests before implementation. A steering request adds or reprioritizes work unless the owner explicitly cancels an earlier commitment.
3. Before switching focus, record what is complete, the exact next action, dependencies and unfinished acceptance criteria. Keep earlier tasks in the table.
4. Update completion state only after implementation and relevant verification. Distinguish local completion, committed, pushed and deployed states.
5. End each increment with dated check results and a resume point. Keep canonical architecture/design decisions in their own documents and link them here.

## Current verification

On 15 October 2026, `npm.cmd --prefix products/streak run test:season` passed all 12 integrated Chromium/WebKit groups. New assertions verify both hero actions are fully within the initial viewport, clickable and at least 44px tall at 1213x629, 1366x650, 1440x700, 1024x600, 768x600, 390x667 and 320x568. The build passed. Synthetic screenshots were inspected at 1213x629 and 320x568; captures are in `.quality-artifacts/browser/landing-hero-*.png`. `npm.cmd run quality:static` passed, covering repository policy, documentation links, formatting, types, frontend lint and builds. These local changes are not yet committed or pushed. Run the full gate before publication; the earlier revision's 30-step result is not a full-gate result for this local change.

The previous published revision passed 30 local gate steps. The local browsing preview is `http://127.0.0.1:4100/`; payments and account mutations are disabled. The latest manual provider refresh reported partial coverage, which the UI displays. Routine tests remain isolated from provider credentials and production data.

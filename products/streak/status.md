# Streak status

Updated **15 October 2026**, Africa/Lagos. Published Season baseline: `800e774`. The landing-page extension is included on the Season review branch and has not been deployed. See the [milestone report](docs/delivery/season-milestone.md) for implementation and rollout limits.

## Owner decisions

- The Season UI and architecture are approved: React/TypeScript/Vite, the retained Node API, clear glass, labelled controls and a denser prediction slip.
- Independent predictions in one combined payment remain the accepted future slip behavior.
- Fixtures and logos must use API data. A matchweek covers Friday through Monday, including Monday EPL fixtures.
- Hosted CI work is paused at the owner's request after GitHub's account billing lock prevented jobs from starting. Local commit and push gates remain mandatory.

## Implementation state

| Area                   | State                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Season app             | Integrated shell at `/season/`, real API fixture catalogue, Friday-to-Monday filters, search, pagination and error recovery                              |
| Identity               | Durable single-use challenges and hashed sessions, full lock binding, exact origin policy, secure hosted cookies and verified database TLS configuration |
| Public landing         | New Season design at `/` and `/welcome/`, API fixture preview, browsing before login and clearly labelled Five introduction                              |
| Existing app           | Retained at `/index.html`, including custodial market details, activity, wallet and withdrawals; existing root hash links preserved                      |
| Week 20 Rust work      | Separate lab and browser/CLI; direct stake-to-claim integration remains ahead                                                                            |
| Combined slip and Five | Approved simulation only; not integrated production features                                                                                             |
| Quality foundation     | Published in [PR 1](https://github.com/HeySomtee/ckbuilder/pull/1); local hooks and workflow configuration retained                                      |
| Hosted checks          | No successful run claimed; temporary required branch protection removed following the owner's override                                                   |

## Verification

The full local gate passed all **29 steps** for the landing-page extension on 15 October 2026. No required suite was skipped. The local preview at `http://127.0.0.1:4100/` uses real API fixtures in separate local storage with account mutations and payments disabled. Manual inspection confirmed team-logo loading; automated tests used synthetic fixtures and no live provider requests.

The recurring command is `npm.cmd run quality:major`, using a disposable local PostgreSQL database. Exact results are written to `.quality-artifacts/all.json` and repeated against the unchanged staged candidate by the commit and push hooks. The foundation passed all 20 steps before publication. This increment extends the gate with frontend lint/build, identity and provider regressions, and eight integrated browser groups across Chromium/WebKit at 320, 390 and 1440px.

Targeted checks cover Monday fixtures, catalogue-only postponed matches, API logos, paging/search, failed reads, stale responses, real disposable wallet signatures, CCC connector event ordering, cancelled connection, logout failure and delayed account responses. Database tests cover challenge races, audience/expiry enforcement, session persistence across pool recreation, revocation and storage failure. Tests use synthetic data and loopback services; no production data or live settlement was used.

Independent identity/recovery review found audience/expiry, wallet binding, hosted fallback, test isolation, connector lifecycle, logout race and schedule coverage issues. These were corrected and reviewed again with no remaining blockers for this review milestone. This is not a security audit or deployment approval.

The approved preview retains 18 general and 32 combined-slip regression groups. Earlier motion research passed 56/58 with two mobile WebKit timing observations unresolved. Those remain release prerequisites, not reasons to weaken tests.

## Next and unresolved

1. Review this branch, verify real-device wallet compatibility and establish an account recovery path before hosted rollout. JoyID binding is currently unsupported.
2. Complete bounded SQL mutations, durable jobs, coordinated public-endpoint abuse controls and backup/restore evidence. Keep a single API writer until then.
3. Integrate one direct stake-to-claim journey, then the independent combined slip, keeping legacy custody exits separate.
4. Verify player-stat coverage and final rules before integrating Five entries and scoring.
5. Validate deployment capacity, real provider coverage, support ownership and funded campaign rules before community onboarding.

Current Neon/storage health, broad wallet compatibility, live provider access and production capacity have not been established by these local checks. No deployment or live-chain settlement is claimed by this increment.

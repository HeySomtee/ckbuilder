# Streak status

Active work, earlier commitments and the next resume point are tracked in the [work tracker](docs/work-tracker.md). Read it before starting or switching tasks.

Updated **16 October 2026**, Africa/Lagos. Published market/slip base: `13d2571` in [PR 3](https://github.com/HeySomtee/ckbuilder/pull/3), following Season base `eb8d151`. The visual and Genie correction is implemented and locally verified on `feat/streak-market-slip`. See the [correction report](docs/delivery/ui-motion-correction.md), [market/slip report](docs/delivery/market-slip-milestone.md) and earlier [Season report](docs/delivery/season-milestone.md). No deployment is claimed.

## Owner decisions

- The Season UI and architecture are approved: React/TypeScript/Vite, the retained Node API, clear glass, labelled controls and a denser prediction slip.
- On 16 October the owner removed the duplicate Close control. The prediction slip uses Minimize, with Escape retaining the draft and Clear remaining a separate confirmed action.
- Independent predictions in one combined payment remain the accepted future slip behavior.
- Fixtures and logos must use API data. A matchweek covers Friday through Monday, including Monday EPL fixtures.
- Featured matches use weighted league and club preferences. EPL leads otherwise comparable fixtures, followed by La Liga and Italian Serie A, but marquee matches such as El Clásico can outrank EPL games.
- Hosted CI work is paused at the owner's request after GitHub's account billing lock prevented jobs from starting. Local commit and push gates remain mandatory.

## Implementation state

| Area                      | State                                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Season app                | Integrated shell at `/season/`, real API fixture catalogue, Friday-to-Monday filters, search, pagination and error recovery                                                                |
| Identity                  | Durable single-use challenges and hashed sessions, full lock binding, exact origin policy, secure hosted cookies and verified database TLS configuration                                   |
| Public landing            | New Season design at `/` and `/welcome/`, live API fixture preview with visible-tab refresh and automatic matchweek rollover, browsing before login and clearly labelled Five introduction |
| Existing app              | Retained at `/index.html`, including custodial market details, activity, wallet and withdrawals; existing root hash links preserved                                                        |
| Week 20 Rust work         | Separate lab and browser/CLI; direct stake-to-claim integration remains ahead                                                                                                              |
| Market detail and draft   | Integrated API market detail, persistent independent picks, exact subtotal, explicit recovery and read-only whole-slip server review; payment unavailable                                  |
| Visuals and Genie         | Compact preview composition, mobile bottom sheet and actual narrow-neck minimize/restore; full 31-step local gate passed                                                                   |
| Combined payment and Five | Approved future work; no contract payment or Five scoring integration in the Season app                                                                                                    |
| Quality foundation        | Published in [PR 1](https://github.com/HeySomtee/ckbuilder/pull/1); local hooks and workflow configuration retained                                                                        |
| Hosted checks             | No successful run claimed; temporary required branch protection removed following the owner's override                                                                                     |

## Verification

The UI correction passed the full **31-step gate**, finishing at **09:00 UTC on 16 October**, including **22 integrated browser groups** across Chromium and WebKit. Tests inspect actual painted snapshots at 390 and 1440px, two and eight picks, current amounts, interrupted transitions, focus, reduced motion and renderer failure. Source and unwarped capture comparisons were inspected separately from the narrowed frame. Independent recovery review resolved a delayed focus callback and a queued preference-event race. Browser tests now await positive page/account readiness and finish tracked local reads before unrelated document changes. Redundant navigation was removed while deliberate stale-response races and all browser-error assertions remain. Evidence is in `.quality-artifacts/ui-motion-full-gate.log` and the correction report.

The 16 October market/slip increment passed all **31 steps** of `npm.cmd run quality:major`. It adds server/domain tests, six draft recovery tests and six browser journeys, bringing integrated coverage to eighteen groups across Chromium/WebKit at 320, 390 and 1440px. The new checks include newer terms arriving before an older review, slow device clocks, retained invalid lines, cross-tab recovery and keyboard focus. Independent review found and resolved review freshness, account-return revival, device-clock expiry, storage denial and missing provider ownership checks. See the tracker for evidence and the next resume point.

The full local gate passed all **30 steps** for published revision `70beb34` on 15 October 2026, including the live fixture ranking follow-up. No required suite was skipped. The local preview at `http://127.0.0.1:4100/` uses real API fixtures in separate local storage with account mutations and payments disabled. Manual inspection confirmed team-logo loading; automated tests used synthetic fixtures and no live provider requests. The tracker records verification for subsequent local changes separately.

The recurring command is `npm.cmd run quality:major`, using a disposable local PostgreSQL database. Exact results are written to `.quality-artifacts/all.json` and repeated against the unchanged staged candidate by the commit and push hooks. The foundation passed all 20 steps before publication. Earlier Season work added frontend lint/build, identity and provider regressions, automatic API refresh, Monday-to-Tuesday rollover, ranking before pagination and chronological sorting. These checks remain in the current gate. See the [ranking policy](docs/product/fixture-ranking.md) for scoring and remaining data limits.

Targeted checks cover Monday fixtures, catalogue-only postponed matches, API logos, paging/search, failed reads, stale responses, real disposable wallet signatures, CCC connector event ordering, cancelled connection, logout failure and delayed account responses. Database tests cover challenge races, audience/expiry enforcement, session persistence across pool recreation, revocation and storage failure. Tests use synthetic data and loopback services; no production data or live settlement was used.

Independent identity/recovery review found audience/expiry, wallet binding, hosted fallback, test isolation, connector lifecycle, logout race and schedule coverage issues. These were corrected and reviewed again with no remaining blockers for this review milestone. This is not a security audit or deployment approval.

The approved preview retains 18 general and 32 combined-slip regression groups. Earlier motion research passed 56/58 with two mobile WebKit timing observations. That historical result remains recorded. The integrated controller has separate cold-start and cleanup checks in both engines; physical-device frame-rate profiling remains required before a public pilot.

## Next and unresolved

1. Review this branch, verify real-device wallet compatibility and establish an account recovery path before hosted rollout. JoyID binding is currently unsupported.
2. Complete bounded SQL mutations, durable jobs, coordinated public-endpoint abuse controls and backup/restore evidence. Keep a single API writer until then.
3. Integrate one direct stake-to-claim journey, then the independent combined slip, keeping legacy custody exits separate.
4. Verify player-stat coverage and final rules before integrating Five entries and scoring.
5. Validate deployment capacity, real provider coverage, support ownership and funded campaign rules before community onboarding.

Current Neon/storage health, broad wallet compatibility, live provider access and production capacity have not been established by these local checks. No deployment or live-chain settlement is claimed by this increment.

# Streak status

Active work, earlier commitments and the next resume point are tracked in the [work tracker](docs/work-tracker.md). Read it before starting or switching tasks.

Updated **16 October 2026**, Africa/Lagos. The current candidate adds one payment for up to eight independent predictions inside the slip, separate Wallet and Activity pages, compact balance/address controls and Telegram settings. The separate v4 contract is deployed on public testnet with 13 canonical confirmations observed. All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. See the [atomic slip delivery record](docs/delivery/atomic-slip-correction.md) for pins, evidence and limits. No public eight-line user payment, public v4 settlement or hosted operation is claimed.

## Owner decisions

Latest correction, 16 October: review and payment stay inside the slip. One X close button and Escape retain the draft; Clear slip remains explicit. Genie motion is removed. A combined payment includes every reviewed line, with independent settlement and one claim per position. Streak covers reserves for new markets, while the bettor pays principal, 321 CKB recoverable storage per line and the exact network fee. Wallet shows balance, address, connection and Telegram; Activity owns history, recovery and claims.

The earlier sponsored-creation increment established owner-first signing, sponsor-last co-signing and durable partial recovery. V4 extends that model to several distinct market groups, preserving the original-generation terms, descriptors and exits. The previous v3 release passed 42 local gate steps at 14:59 UTC; those results are historical evidence for that revision, not a completed gate for this candidate.

Historical checkout correction, 16 October: the prior individual-payment handoff passed a 35-step gate at 12:48 UTC, as recorded in the [tracker](docs/work-tracker.md#slip-to-payment-correction). The atomic slip replaces that handoff for v4 entry. Existing generations remain independently recoverable.

Runtime correction after PR 4, 16 October: the owner confirmed that local testing is the present target. Local sign-in is enabled after removing an accidental launcher restriction. Signed authentication, profile updates and logout passed against the running app. Fixtures refresh continuously and a separate local operator now runs recurring cycles for the funded fixture. This depends on the computer remaining available; public hosting is not required for the current local task. See the [tracker](docs/work-tracker.md#local-usability-correction-after-publication) for evidence. Historical milestone results below retain their original release state.

- The Season UI and architecture are approved: React/TypeScript/Vite, the retained Node API, clear glass, labelled controls and a denser prediction slip.
- The latest owner correction uses one X close control, retained drafts and immediate opening/closing. Earlier Minimize and Genie evidence is historical.
- Independent predictions in one combined payment are implemented for up to eight eligible v4 fixtures, with final release verification pending.
- The five direct-journey steps remain: wallet capacity, exact review, signing, canonical confirmation/recovery, and independent result/claim/refund recovery. Combined entry preserves each position's independent exit.
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
| Week 20 Rust work         | Historical protocol and v2/v3 positions retained; separate v4 supports atomic entry with unchanged payout/storage economics and guard                                                      |
| Market detail and draft   | API fixture detail and persistent independent picks; exact combined review and one payment inside the slip for up to eight eligible v4 fixtures                                            |
| Direct single-market flow | All five parts implemented and verified: wallet capacity, exact principal/storage/fee review, wallet signing, persisted signed bytes, canonical confirmation and position/claim recovery   |
| Oracle and operator       | Immutable real-fixture catalogue, strict regulation-time observations, durable signed jobs and a bounded separate worker; no hosted worker activation claimed                              |
| Independent owner exits   | Browser recovery export and standalone claim, exact-byte resubmission and canonical conflict-proof recovery implemented without API or admin permission                                    |
| Slip interaction          | Compact native dialog, one X close control, retained draft and focus restoration; Genie removed by owner                                                                                   |
| Atomic payment and Five   | Atomic entry implemented and focused checks pass; final gate/release pending. Five remains planned                                                                                         |
| Quality foundation        | Published in [PR 1](https://github.com/HeySomtee/ckbuilder/pull/1); local hooks and workflow configuration retained                                                                        |
| Hosted checks             | No successful run claimed; temporary required branch protection removed following the owner's override                                                                                     |

## Current verification

V4 passed **149 labelled VM checks** and **37 signed local-devnet product checks plus three harness checks**. The actual node exercises native and genuine OmniLock wallets, eight-new, mixed and eight-funded payments, independent claims, refunds, lost responses and reorganisation recovery. Frontend checks passed 29 unit groups, four combined-slip browser journeys and eight Wallet/shared-connection journeys, plus TypeScript and lint. Public testnet evidence is the [v4 code deployment](https://pudge.explorer.nervos.org/transaction/0x930bba6cce8cd6b1dc254cc3469249d7ba32f09b44bc20ea784f45e172cd606f) only. These results do not substitute for the pending complete major and exact-candidate commit/push gates.

The [atomic delivery record](docs/delivery/atomic-slip-correction.md) identifies commands, generated artifacts, protocol pins and remaining activation work. Browser checks use synthetic transports and send no public transactions or Telegram messages. Hosted Actions remain paused.

## Historical direct verification

The earlier direct integration gate passed all **35 checks** at **2026-10-16T11:48:11.275Z**. The wallet/provisioning correction subsequently passed 38 steps, as recorded above. Evidence is in `.quality-artifacts/direct-full-gate.json` and `.quality-artifacts/direct-full-gate.log`. The direct adapter passed **25 actual signed local-devnet checks**, including the full six-hour refund and real reorganisation recovery. Public synthetic testnet verification completed at 11:13 UTC on 16 October with creation, two deposits, report, settlement, winning claim and losing-storage claim confirmed. The [milestone](docs/delivery/direct-testnet-milestone.md) links every transaction and the separate funded Everton vs Chelsea fixture. Hosted Actions remain paused.

The direct increment also has passing targeted backend checks in five groups, HTTP integration checks and four standalone recovery tests. They cover immutable fixture mappings, explicit fulltime scores, two-observation reporting, durable signed bytes, unknown broadcasts, canonical reorg checks, bounded worker scheduling and owner conflict-proof recovery. Backend TypeScript passes. These targeted checks use isolated synthetic data and stubbed chain reads; the native devnet and public-chain exercises provide separate evidence.

The synthetic public exercise passed with seven confirmed transactions; its run log is `.quality-artifacts/direct-public-run.log`. Synthetic oracle inputs were kept out of the real-football catalogue. The separate Everton vs Chelsea market is funded and enabled locally, and the worker was exercised once. This is fixture creation evidence, not completed real-football settlement or an unattended hosted service. Commands, counts, hashes and release state are recorded in the [direct milestone](docs/delivery/direct-testnet-milestone.md).

## Earlier verified increments

The UI correction passed the full **31-step gate**, finishing at **09:00 UTC on 16 October**, including **22 integrated browser groups** across Chromium and WebKit. Tests inspect actual painted snapshots at 390 and 1440px, two and eight picks, current amounts, interrupted transitions, focus, reduced motion and renderer failure. Source and unwarped capture comparisons were inspected separately from the narrowed frame. Independent recovery review resolved a delayed focus callback and a queued preference-event race. Browser tests now await positive page/account readiness and finish tracked local reads before unrelated document changes. Redundant navigation was removed while deliberate stale-response races and all browser-error assertions remain. Evidence is in `.quality-artifacts/ui-motion-full-gate.log` and the correction report.

The 16 October market/slip increment passed all **31 steps** of `npm.cmd run quality:major`. It adds server/domain tests, six draft recovery tests and six browser journeys, bringing integrated coverage to eighteen groups across Chromium/WebKit at 320, 390 and 1440px. The new checks include newer terms arriving before an older review, slow device clocks, retained invalid lines, cross-tab recovery and keyboard focus. Independent review found and resolved review freshness, account-return revival, device-clock expiry, storage denial and missing provider ownership checks. See the tracker for evidence and the next resume point.

The full local gate passed all **30 steps** for published revision `70beb34` on 15 October 2026, including the live fixture ranking follow-up. No required suite was skipped. That check used the local preview at `http://127.0.0.1:4100/` with real API fixtures in separate local storage, account mutations and payments disabled. Manual inspection confirmed team-logo loading; automated tests used synthetic fixtures and no live provider requests. The tracker records subsequent verification separately.

The recurring command is `npm.cmd run quality:major`, using a disposable local PostgreSQL database. Exact results are written to `.quality-artifacts/all.json` and repeated against the unchanged staged candidate by the commit and push hooks. The foundation passed all 20 steps before publication. Earlier Season work added frontend lint/build, identity and provider regressions, automatic API refresh, Monday-to-Tuesday rollover, ranking before pagination and chronological sorting. These checks remain in the current gate. See the [ranking policy](docs/product/fixture-ranking.md) for scoring and remaining data limits.

Targeted checks cover Monday fixtures, catalogue-only postponed matches, API logos, paging/search, failed reads, stale responses, real disposable wallet signatures, CCC connector event ordering, cancelled connection, logout failure and delayed account responses. Database tests cover challenge races, audience/expiry enforcement, session persistence across pool recreation, revocation and storage failure. Tests use synthetic data and loopback services; no production data or live settlement was used.

Independent identity/recovery review found audience/expiry, wallet binding, hosted fallback, test isolation, connector lifecycle, logout race and schedule coverage issues. These were corrected and reviewed again with no remaining blockers for this review milestone. This is not a security audit or deployment approval.

The approved preview retains 18 general and 32 combined-slip regression groups. Earlier motion research passed 56/58 with two mobile WebKit timing observations. That historical result remains recorded. The former controller had separate cold-start and cleanup checks in both engines. Genie was subsequently removed; this research does not describe current slip behavior. Physical-device wallet, focus and interaction checks still remain before a public pilot.

## Next and unresolved

1. Complete the current major and exact-candidate release gates, then verify local v4 API, sponsor and worker activation. Public contract deployment alone does not establish this application rollout.
2. Verify supported wallets and the current slip/chooser interactions on physical devices. JoyID identity binding remains unsupported. Establish durable operator storage, monitored execution, restore evidence and sufficient reserve/fee capacity before onboarding.
3. Complete bounded SQL mutations, coordinated abuse controls, backup/restore evidence and production job coordination. The new file-backed operator is explicitly one writer; API replication remains unsupported.
4. Verify Five player coverage, publish its rules and implement immutable entries and replayable scoring. Verify restored Telegram linking and implement direct v4 notification dispatch before offering settlement alerts. Keep legacy custody exits separate from direct claims.
5. Establish deployment capacity, support ownership and a funded campaign budget before public onboarding.

The fixture digest is an off-chain catalogue check, not an on-chain fixture commitment. Admin authority is pinned per market; this deployment does not have a global market-creator factory allowlist. The curated registry identifies the supported operator's instances. Current Neon health, broad wallet compatibility, hosted operator durability and production capacity remain unproven. Earlier local evidence and the completed synthetic public exercise do not establish live football settlement or deployment readiness.

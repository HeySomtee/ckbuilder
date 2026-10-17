# Product scope and delivery roadmap

Owner-approved direction: 15 October 2026, [ADR 0001](../decisions/0001-approved-foundation.md). The aim is a usable, enjoyable testnet pilot with evidence of repeat participation. A grant is a potential outcome, not an approved budget or a reason to overstate readiness.

Current increment, 16 October 2026: [atomic combined entry](../delivery/atomic-slip-correction.md) is implemented for up to eight independent predictions, with exact review and payment inside the slip. V4 code is deployed on public testnet. Its eight-line signing, claims and recovery evidence comes from an isolated devnet; the 47-step major gate passed, with exact-candidate commit and push gates enforced separately. Wallet and Activity are distinct, and the slip uses one X close button with retained drafts and no Genie animation.

## Pilot scope

The minimum useful experience combines the new responsive shell, a complete prediction lifecycle, existing Matchday context, a small free Streak Five competition and basic community progress. Keep legacy balances and exits understandable during migration. A functioning narrow cohort is more useful than disconnected screens labelled complete.

| Journey         | Acceptance before public use                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding      | Clear testnet/custody explanation, account recovery and honest wallet support; browse/draft without a wallet                                           |
| Predictions     | Published fixture terms, exact review, wallet rejection/retry, committed admission state, settlement, owner claim/refund and recovery evidence         |
| Combined slip   | Independent positions, one reviewed payment, per-pick status, no silent omissions or partial submission                                                |
| Matchday        | Source/freshness visible, no synthetic results for real markets, unavailable coverage handled                                                          |
| Five            | Published rules, verified player data, atomic entry cutoff, replayable scores and correction policy                                                    |
| Activity/wallet | Separate Wallet balance/address/connection controls from Activity history/recovery/claims; preserve legacy liabilities and authoritative direct states |
| Community       | Basic standings/badges, opt-in sharing and a measured onboarding/support loop                                                                          |

Rich private leagues, paid fantasy, chips/transfers, share trading, broader social features and unbounded markets are deferred. A feature illustrated in the preview is not automatically part of the first pilot.

The combined slip supports one through eight distinct fixtures, all in one transaction. Streak supplies market reserves only for newly created markets. Every line retains an independent outcome, payout and claim. Existing generations remain recoverable through their original terms. Completion of this feature does not imply that a community campaign or Five is already available.

Telegram connection controls are implemented against the existing integration endpoints, with explicit configuration and expiry states. Local linking uses a verified webhook-only tunnel. Registration and receiver routing were checked without sending messages or linking a test account. Direct v4 settlement notification dispatch is not implemented; verify that separate path before promising alerts to participants.

## Streak Five

The approved first format is free to enter: five players, one captain, a fixed budget, a weekly round and separate season score. The preview uses one goalkeeper, one defender, two midfielders, one forward, forty credits and a 2x captain. Treat those as the design baseline. Before entries open, publish the final ruleset, scoring, eligibility, prices and deadlines after confirming provider coverage.

Browsing and drafting need no wallet. Local saves explicitly say they are local. An official entry needs a verified account independent of wallet ownership. Email sign-in plus optional wallet sign-in requires a delivery/provider decision and safe identity linking; the current wallet-only model does not already provide this.

Store immutable round rulesets and player catalogues, provider-scoped player IDs and versioned entries. Enforce five unique eligible players, budget, position/team constraints and captain membership in one transaction. The entry command and lock worker share the same concurrency rule. A server-authoritative cutoff prevents delayed requests from accepting late changes. Local time never grants eligibility.

Score with a pure deterministic function of frozen entry, ruleset version and stat revision. Store per-player explanations and captain multiplication. Keep raw source snapshots with provenance and bounded retention. Corrections produce a visible new scoring revision; replay must reproduce standings. Scores remain provisional until the published correction window closes.

Before launch, decide and publish missing-data handling, non-playing captains, postponed/abandoned games, double fixtures, ties and prize finality. Recommended launch bounds are one eligible fixture per player per round, no transfers after cutoff, no silent substitutions and no chips. Missing data stays pending or uses a published void rule, never an invented zero.

## Incentives and measurement

Use a short season with weekly return reasons: Five standings, prediction progress, founding badges, helpful onboarding and opt-in team cards. Reward meaningful participation or helpful feedback under clear eligibility rules, not wallet count or transaction spam. A unique wallet/email does not establish a unique human.

Campaign points, badges and monetary awards are different records. Any funded rewards need the owner's fixed budget, eligibility policy, duplicate-account review, tie policy and audit trail. Pool principal and reserves cannot fund campaign promises. Do not announce prizes or future tokens that have not been approved.

Measure account activation, successful first entry/stake, completed claims/refunds, returning participants, drop-off/error rates and support burden. Define denominators and bot exclusions. Do not represent sample profiles or test fixtures as active users. Record performance and successful recovery alongside engagement.

## Delivery sequence

| Stage            | Work                                                                              | Exit evidence                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0. Foundation    | Canonical docs, agent contract, safe recurring tests and CI                       | Exact local command results; hosted checks and protection state reported separately                                           |
| 1. Reliability   | Bounded DB work, storage recovery, durable identity/jobs, TLS/cookie hardening    | Disposable DB concurrency tests, restart/replay checks and restore rehearsal                                                  |
| 2. Core journey  | Shared shell, atomic slip, direct stake-to-claim flow and separate legacy exits   | Supported-wallet matrix, authoritative statuses, rejection/retry/reorg behavior, real testnet flow when separately authorized |
| 3. Five          | Verified player feed, frozen rounds, submission and scoring                       | Deterministic replay, cutoff races, corrections and clear public rules                                                        |
| 4. Limited pilot | Published markets, cohort onboarding, monitoring, support and approved incentives | Real-device checks, observed workload, complete exits and genuine participant metrics                                         |
| 5. Expansion     | Larger contract design or richer community features when justified                | Separate design and benchmarks before raising limits                                                                          |

October 31, 2026 is the requested pilot target. It is not a commitment to finish every migration or feature by that date. If readiness gates are unmet, reduce the cohort or feature scope openly rather than weaken fund safety or label unfinished integrations complete.

## Feature delivery record

For each increment, record the user journey and acceptance criteria, approved design reference, owning modules, data/contract changes, normal and failure/recovery states, resource budget, tests actually run, rollout/rollback and unresolved dependencies. Routine work inside the approved direction proceeds. Seek review only for a material departure or a newly proposed product/economic decision.

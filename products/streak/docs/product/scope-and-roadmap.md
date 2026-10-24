# Product scope and delivery roadmap

Owner-approved direction: 15 October 2026, [ADR 0001](../decisions/0001-approved-foundation.md). The aim is a usable, enjoyable testnet pilot with evidence of repeat participation. A grant is a potential outcome, not an approved budget or a reason to overstate readiness.

20 October approved Five sponsorship direction: free gameweeks can be unsponsored, admin-sponsored or community-funded. Contributions have a configurable minimum; logos, names and links are optional, with anonymous recognition supported. A fixed funded pool is shared in proportion to points among a published qualifying percentile, including ties. This replaces fixed per-person dollar rewards and the earlier personal-challenge allocation proposal. Testnet only for now; no campaign budget, financial return to sponsors or mainnet launch is approved. Runtime development is authorized; [funding custody and implementation acceptance](../delivery/five-implementation.md) remain separate.

20 October steering supersedes the next-feature order below: the owner asked to **start Streak Five**. Initially all supported leagues were requested; after asking about FPL and UEFA Fantasy, the owner offered EPL-only as a fallback. The current increment uses an EPL-first [private squad-builder preview](../../design/five-review/README.md). FPL prices/form are research references, not a licensed production integration. A later UCL edition needs separate calendar, pricing and coverage decisions. Community Markets remains committed backlog rather than being dropped.

## Current product decisions, 19 October 2026

The owner asked to preserve the community/game direction discussed on 18 and 19 October. The agreed next-feature order is **Streak Survivor, Community Markets, then Streak Five**. Community Markets remains part of the plan; it is a prediction feature, not one of the two games. This order supersedes earlier Five-first sequencing below and in historical reports. These are planned features, not shipped functionality or a new deadline commitment.

| Feature           | Agreed direction                                                                                                                             | First delivery boundary                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Streak Survivor   | Choose a team to win each round; a losing pick eliminates the entrant; a previously chosen team cannot be used again within that competition | Admin-created EPL competitions; configurable free or fee-gated entry and separate prize; persistent picks, deadlines and standings         |
| Community Markets | Users create supported football questions, add their reasoning, share and discuss them                                                       | Guided templates and verified resolution sources; equivalent questions share one pool; bounded operator sponsorship on first participation |
| Streak Five       | Select five players within a budget, choose a captain and score from actual performances                                                     | Free entry, verified player data, frozen entries, deterministic scoring, weekly and season standings                                       |

19 October owner clarification: Survivor competitions are created by the configured admin, who chooses free or fee-gated entry and sets a separate prize. This supersedes the earlier free-only Survivor planning boundary. The [Survivor rules proposal](survivor-rules.md) and [interactive preview](../../design/survivor-review/README.md) demonstrate those controls. Streak Five retains its free-entry baseline.

Regular prediction markets remain available alongside these additions. Survivor's paid-entry controls are authorized design scope, while actual collection, prize prefunding, custody, refunds and payout still require implementation and review. No reward amount, creator-fee promise, new contract deployment or campaign has been approved. Unrestricted market questions and secondary position trading remain deferred.

### Start with Survivor

First deliver a short rules specification, then an interactive preview for review before implementation. Define admin competition creation with free or fee-gated entry and a separate prize, joining, choosing a team, confirming a pick, locking the round, viewing results, elimination, survival and the winning state. The first live milestone remains a complete free competition flow. Paid publication must wait for a reviewed funding, refund and payout implementation; the preview may demonstrate both entry modes without moving funds.

Core strategy: using a strong team now removes it from later rounds. Preserve that planning element with a remaining-team grid, used-team markers and upcoming fixtures. Other proposed experience details are picks hidden until the round deadline, a survivor board, a pick-history view, shareable community competitions and opt-in Telegram reminders/results. These still need detailed UX and implementation design; do not describe them as implemented.

Resolve before coding the game rules:

- Whether a draw eliminates the entrant. Elimination is the proposed default, not yet a confirmed rule.
- Missed-pick treatment and the exact server-enforced round deadline.
- Postponed, cancelled, abandoned and rescheduled fixtures, including whether a team is consumed.
- What happens when every remaining entrant is eliminated in the same round.
- Round eligibility, multiple fixtures for one club, result corrections and the maximum competition length when teams run out.
- One-entry policy, public/private competition scope and the account-entry path. Free participation does not mean wallet-free authentication is already implemented.

Use the existing fixture/results integration where verified coverage supports it. Free competition entries and progression belong in the application/database initially. Current single-fixture pool contracts do not already implement a multiweek Survivor prize escrow. Paid competitions need a separate review.

### Community Markets remains second

The initial direction is a guided creator flow: select an eligible fixture and a supported template, add reasoning, preview fixed rules and publish. Candidate templates include match winner, both teams to score and a supported goals threshold. New outcome types require provider validation and contract/oracle design before accepting funds; they are not already supported by the current match-winner implementation.

Creators choose questions and provide commentary; they do not decide their own outcomes or receive oracle/admin signing authority. Equivalent fixture/question/rule combinations should share canonical liquidity while retaining creator attribution and discussions. A published question should not itself tie up operator funds. For an eligible funded market, first participation triggers market-state creation using deployed contract code, with the operator supplying the setup reserve. User principal, recoverable position storage and network fees stay separately disclosed. Sponsorship must remain within operator funding and eligibility limits.

### Navigation direction

Keep Overview as the top-level destination. Group the desktop sidebar as follows:

- **Predictions:** Markets, Matchday. Community Markets belongs within this area.
- **Streak Games:** Streak Five, Streak Survivor. Display order does not change the Survivor-first build sequence.
- **Community:** Clubhouse.
- **Bottom destinations:** My Activity, My Account.

Use small muted group labels, compact spacing and consistent icons. Keep the desktop sidebar within the viewport without independent scrolling. Keep game destinations visibly coming soon until their actual journeys are playable. Proposed mobile navigation is Overview, Markets, Games, Activity and More; More holds Matchday, Clubhouse and My Account, while Games opens a selection page for Five and Survivor. My Activity can later include both games with filters, without conflating game points with betting balances or claimable funds.

The earlier alternatives, such as standalone call-out challenges and creator weekend prediction leagues, remain idea backlog. They are not additional committed games. The two selected games are Survivor and Five.

Current increment, 16 October 2026: [atomic combined entry](../delivery/atomic-slip-correction.md) is implemented for up to eight independent predictions, with exact review and payment inside the slip. V4 code is deployed on public testnet. Its eight-line signing, claims and recovery evidence comes from an isolated devnet; the 47-step major gate passed, with exact-candidate commit and push gates enforced separately. Wallet and Activity are distinct, and the slip uses one X close button with retained drafts and no Genie animation.

## Pilot scope

The minimum useful experience combines the new responsive shell, a complete prediction lifecycle, existing Matchday context, a small free Survivor competition and basic community progress. Community Markets and Five follow in the newly agreed order. Keep legacy balances and exits understandable during migration. A functioning narrow cohort is more useful than disconnected screens labelled complete.

| Journey           | Acceptance before public use                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding        | Clear testnet/custody explanation, account recovery and honest wallet support; browse/draft without a wallet                                           |
| Predictions       | Published fixture terms, exact review, wallet rejection/retry, committed admission state, settlement, owner claim/refund and recovery evidence         |
| Combined slip     | Independent positions, one reviewed payment, per-pick status, no silent omissions or partial submission                                                |
| Matchday          | Source/freshness visible, no synthetic results for real markets, unavailable coverage handled                                                          |
| Survivor          | Published elimination/exception rules, persistent unique picks, team-reuse prevention, authoritative cutoff, result corrections and survivor standings |
| Community Markets | Guided eligible questions, unambiguous resolution, canonical duplicate handling and funded entry only for supported contract terms                     |
| Five              | Published rules, verified player data, atomic entry cutoff, replayable scores and correction policy                                                    |
| Activity/wallet   | Separate Wallet balance/address/connection controls from Activity history/recovery/claims; preserve legacy liabilities and authoritative direct states |
| Community         | Basic standings/badges, opt-in sharing and a measured onboarding/support loop                                                                          |

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

| Stage                | Work                                                                                          | Exit evidence                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 0. Foundation        | Canonical docs, agent contract, safe recurring tests and CI                                   | Exact local command results; hosted checks and protection state reported separately                                           |
| 1. Reliability       | Bounded DB work, storage recovery, durable identity/jobs, TLS/cookie hardening                | Disposable DB concurrency tests, restart/replay checks and restore rehearsal                                                  |
| 2. Core journey      | Shared shell, atomic slip, direct stake-to-claim flow and separate legacy exits               | Supported-wallet matrix, authoritative statuses, rejection/retry/reorg behavior, real testnet flow when separately authorized |
| 3. Survivor          | Rules and UX preview, then free competition entries, round locking, elimination and standings | Team-reuse protection, cutoff races, exception/correction tests and one complete competition journey                          |
| 4. Community Markets | Guided questions, creator context, shared pools and supported first-participation sponsorship | Verified resolution, duplicate handling, creation permissions and exact funding checks                                        |
| 5. Five              | Verified player feed, frozen rounds, submission and scoring                                   | Deterministic replay, cutoff races, corrections and clear public rules                                                        |
| Limited pilot        | Onboard a bounded cohort as each complete feature becomes ready; monitor and support it       | Real-device checks, observed workload, complete exits and genuine participant metrics; do not wait for every planned feature  |
| Later expansion      | Larger contract design or richer community features when justified                            | Separate design and benchmarks before raising limits                                                                          |

October 31, 2026 is the requested pilot target. It is not a commitment to finish every migration or feature by that date. If readiness gates are unmet, reduce the cohort or feature scope openly rather than weaken fund safety or label unfinished integrations complete.

## Feature delivery record

For each increment, record the user journey and acceptance criteria, approved design reference, owning modules, data/contract changes, normal and failure/recovery states, resource budget, tests actually run, rollout/rollback and unresolved dependencies. Routine work inside the approved direction proceeds. Seek review only for a material departure or a newly proposed product/economic decision.

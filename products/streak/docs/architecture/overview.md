# Architecture and migration

26 October game-data correction: a local environment setting owns dummy data selection. The uncached application shell pins the mode per document; game APIs reject stale scopes after restart. Hosted and proxied test-mode requests are denied. Public switches and URL-based selection are removed. Survivor creation uses explicit competition cache keys, and Five fixture outlooks load independently through one shared provider query. [Boundaries and evidence](../delivery/games-local-mode-and-outlook.md).

26 October Five workspace retains mounted, account/round-scoped drafts across presentation tabs. Optional sponsor introduction and description use the existing JSON aggregate, bounded validation, immutable intent retries and moderated public projections. Sponsor review retains its original round across refreshes. [Integration and evidence](../delivery/five-workspace.md).

25 October in-app testing selects synthetic Five/Survivor adapters explicitly through a server-enabled data scope. The actual feature components, domain rules, wallet transport and reward journal are reused. A reserved database namespace and bound dedicated rewards address separate dummy rounds from API rounds. Audited admin timestamps can close marked synthetic rounds immediately without changing blockchain time or ordinary published deadlines. [Boundaries and acceptance](../delivery/in-app-games-testing.md).

24 October Five sponsorship auctions add optional frozen round mode, durable signed-admission ordering, canonical confirmation cutoff evidence and an audited winner snapshot. Only the winning amount funds player awards. The existing rewards worker processes losing-bid refunds with refund-only queue scope, queue/credit transaction locking and the retained signed-payout journal. Existing community-funded rounds retain their terms. [Rules and recovery](../delivery/five-sponsor-auction.md).

21 October Five automation adds an API-owned minute scheduler, official FPL deadline/event adapter and public scouting/profile reads. Stable round IDs, database-time cutoffs, immutable terms, semantic score deduplication and fair catch-up preserve restart/concurrency behavior. The scheduler cannot sign rewards. [Lifecycle and verification boundaries](../delivery/five-automatic-gameweeks.md).

20 October Five adds a separate PostgreSQL application feature for frozen gameweeks, private entries and versioned score observations. The fixed-pool allocation engine has no spending authority. The owner approved separate custodial testnet rewards. A read-only API accepts validated owner signatures; a dedicated worker broadcasts contributions and journals prize payouts before sending. Neither legacy treasury nor direct-market contracts are reused. Configuration and real-wallet activation remain separate. [Implementation and remaining boundaries](../delivery/five-implementation.md).

19 October Survivor implementation: the isolated `modules/survivor` feature owns PostgreSQL competition aggregates, locked mutations, private projections and deterministic free-game progression. The existing provider adds stable observation history for corrections; existing prediction settlement remains unchanged. The React feature uses account-scoped queries and the shared authentication flow. [Rules, bounds and configuration](../delivery/survivor-implementation.md).

19 October proposed Survivor addition: [competition rules and system boundary](../product/survivor-rules.md). Admin-only creation, round progression and private picks belong in an isolated application feature backed by PostgreSQL. Fee collection and prize escrow require a separate reviewed financial boundary; current match-pool contracts do not implement them. The [interactive preview](../../design/survivor-review/README.md) is standalone and changes no runtime service or contract.

19 October Activity read model: [verified history and source precedence](../delivery/activity-history.md) joins bounded direct-chain discovery with fixture metadata. Wallet-scoped queries keep saved payments separate from accepted positions, historical claims and automatic refunds. Football completion and direct settlement are separate card fields. Existing signing, journal and conflict recovery controllers retain financial authority.

19 October hosted process implementation: [launcher and recovery lifecycle](../delivery/hosted-launcher.md) supervises the API, sponsor and serialized settlement worker inside one disk-backed service. Child environments are allowlisted; the API receives no direct signing key. Mounted-state and lease checks precede startup. Operator handover and hosted payment activation remain separate from publishing this implementation.

17 October sponsor contention correction: sponsor journal acquisition waits for up to ten seconds behind another owner, while lifecycle commands retain fail-fast locking. A queue timeout is an explicit retryable 429, without stealing stale or foreign ownership. Unsigned reviews and signed-delivery uncertainty have separate public errors; diagnostics contain only fixed operation/category values. The browser continues checking a shared signature when its submission response is unavailable, and verified chain acknowledgement supersedes obsolete submission errors. See the [recovery delivery record](../delivery/sponsor-review-recovery.md).

17 October background payment update: the app-level slip owns one lazy BatchCheckout instance across route changes. It also mounts after an explicit wallet connection to discover an unresolved journal record without opening the slip. A body portal displays progress outside the closed native dialog. Queries are identity-scoped; a displayed recovery must match the current transaction hash. Prior transient success is cleared before another review. Background recovery, submit, conflict resolution and discard serialize through the same wallet Web Lock, with private unlocked recovery only inside an existing lock. This adds no second signer or transaction journal. Closed-slip monitoring remains an in-app feature, not a push-notification service.

Approved direction: [ADR 0001](../decisions/0001-approved-foundation.md). Detailed source inspection: [architecture proposal](../../design/season-preview/ARCHITECTURE-PROPOSAL.md). This document separates implementation from planned work.

The current [atomic slip correction](../delivery/atomic-slip-correction.md) supports one reviewed transaction for one to eight independent predictions. It can create new v4 markets and deposit into existing v4 markets together. The user supplies exact principal, 321 CKB position storage per line and the network fee; Streak supplies 3,050 CKB reserves per new market. The owner signs first and a separate operator verifies and co-signs last. V4 is deployed on testnet and activated locally. All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. Bulk provisioning stays paused. The API never loads the sponsor signing key.

The 16 October wallet correction introduces a separately deployed product contract in `contracts/direct-v2`. It accepts authorized lock arguments up to 59 bytes, including the 22-byte OmniLock format used by EVM wallets. Historical contracts, terms, positions and exact signed recovery records retain their original code hashes. The wire and journal schema remains `testnet-v1`; the pinned code hash identifies the contract generation. Fee, storage, payout and timing rules are unchanged.

Sign-in, Wallet and checkout share one explicitly selected in-memory signer. Provider replacement, account changes and successful logout invalidate it and account-bound reviews. On reload, a seven-day public EVM provider/address hint can silently restore the exact still-authorized account through EIP-6963 discovery and `eth_accounts`. Restoration never requests permission or signs; locked, changed or revoked accounts require an explicit connection. Disconnect and logout remove the hint. Server sessions and saved transaction recovery remain separate. Browsing without a remembered wallet does not import the wallet SDK.

New entries use the shared atomic slip. Compatibility `?direct=` entry URLs consult the public deployment mode before selecting a checkout; a lookup failure cannot enable historical sponsorship. Historical activity and signed recovery retain their original protocol. Reconnect opens the chooser in place. Unchanged EVM account notifications revalidate the existing signer with a continuously armed replacement listener; actual account/network changes still invalidate it.

Market cards and detail charts use a separate optional public pool read model. Active contract generation selection prevents historical pools from pricing a fresh entry. Canonical live-cell observations sum eligible principal, excluding storage and reserves. Four bounded readers and a 512-market cache keep statistics independent of fixture rendering and payment authority. Current shares expire after 60 seconds; failures retain labelled historical observations without inventing zero values. The 180-point in-memory history resets on API restart and is not a durable indexer. Closed totals require the settlement reserve to remain live. Full transaction verification still belongs to checkout and the contracts.

The earlier bulk operator can consume a bounded real-provider schedule and fund markets serially. That mode is now paused in favor of first-bet sponsorship. The lifecycle worker and sponsor share durable funding coordination. They own private signed jobs; the API exposes validated public descriptors and bounded status. Current and legacy descriptors remain discoverable together, with legacy entry disabled. Per-pick preparation status cannot authorize funds; checkout rechecks actual live cells. The [wallet and provisioning correction](../delivery/wallet-provisioning-correction.md) records the preceding migration.

## Four distinct systems

17 October navigation correction: `?view=account` is the canonical My Account route; `?view=wallet` remains a compatibility alias. Overview has a public API fixture query with its own cache key. Streak Five is an honest coming-soon destination, while Matchday and Clubhouse link to retained existing tools. Section navigation does not own wallet state or drafts. The app-level draft store survives route transitions, and Add matches returns to the market browser without touching payments or submitted recovery records.

| System              | Current evidence                                                                               | Authority                                                                                                                                                                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing Streak app | `public/` vanilla modules and `src/` Node/TypeScript API; PostgreSQL or local file persistence | Treasury-backed betting ledger, accounts, football views and application features                                                                                                                                                                                       |
| Week 20 Rust lab    | `../../../../src/week20/contract-lab`, its own browser/CLI, manifest and tests                 | Bounded CKB market/admission/settlement/claim rules; independent from Streak's DB                                                                                                                                                                                       |
| Season preview      | `design/season-preview`, sample data and localStorage                                          | Design and interaction evidence only; no wallet, API or database integration                                                                                                                                                                                            |
| Approved target     | This foundation and the accepted proposal                                                      | React/Vite frontend, retained API, durable worker, direct-market integration and Five; the Season shell, durable identity and bounded direct testnet journey are implemented; atomic combined entry is implemented; Five and broader operational readiness remain ahead |

The legacy app's wallet signatures authenticate users and authorize treasury transfers. They do not remove custody from ledger betting funds. Keep legacy liabilities discoverable and withdrawable throughout migration. Season's direct testnet route uses the deployed Rust market and claim scripts for new funds, with a separate immutable football catalogue, user transaction journal and explicit operator worker. The [chain document](chain.md) describes its trust assumptions and bounds.

Season browsing and the independent draft now lead to review and payment inside the slip. Legacy public pool statistics remain labelled separately from contract funds. The lightweight availability projection cannot authorize funds; the lazy checkout independently verifies full descriptors, all live inputs, each market output group, exact contributor changes, witness groups and pinned dependencies. One payment is atomic across all reviewed lines. A stale or unavailable line blocks the entire payment. Existing v1/v2/v3 markets retain their original single-market flows and exits and cannot be mixed into a v4 entry.

V4 identifies each new market with the hash of the first input outpoint and its genesis output index. Several markets can share one creation transaction hash while retaining distinct type scripts. The 172-byte arguments still pin the admin, cutoff, guard and fee recipients. The football digest remains off-chain and trusted. Reporting, closure and each independent claim stay isolated to one market.

The ordinary, sponsored and atomic browser journals share IndexedDB version 3, a 128-record aggregate bound, a wallet submission lock and atomic input reservations. Owner partial bytes persist before submission; final bytes persist before rebroadcast. Timeouts and offer expiry cannot retire submitted signatures. Recovery uses uncached canonical observations and revalidated conflicting-spend proofs. Each atomic record can retain its exact source draft lines, so a confirmed payment retires only unchanged picks. It cannot erase edits made while a request was pending.

Wallet owns balance, copyable address, connection and Telegram controls. Activity owns history, transaction recovery and independent claims. Both use the same explicit in-memory signer and account-scoped caches. The owner removed Genie motion: the slip opens and closes immediately through a native dialog, retaining the draft and focus. The wallet chooser receives a separate top-layer host inside this flow.

## Ownership

| Owner              | Responsibilities                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Browser            | Presentation, local drafts, reviewed intent, wallet interaction and explicit pending/recovery states  |
| Identity module    | Accounts, verified identities, linked wallets, sessions and preferences                               |
| Fixtures module    | Provider IDs, schedules, data coverage, cache freshness and provenance                                |
| Markets module     | Approved catalogue, terms, preparation, discovery and lifecycle projections                           |
| Chain index        | Confirmed outpoints, block checkpoints, transaction evidence and deterministic replay                 |
| Oracle worker      | Pinned football evidence, authorized reporting and reconciliation                                     |
| Five module        | Immutable round rules, entries, player stats, deterministic scoring and revisions                     |
| Community/campaign | Crews, achievements, opt-in notifications and separately funded award records                         |
| Legacy ledger      | Existing custody liabilities, deposits and withdrawal reconciliation                                  |
| CKB scripts        | Valid fund movements, admission, settlement and independently owned claims for new protocol positions |

The server can prepare transactions and help users find claims. It cannot authorize an entitlement that the script rejects. The chain does not authenticate a football result by itself; the configured reporter remains trusted. Fantasy points cannot alter betting principal or payouts.

## Frontend boundaries

Use React, strict TypeScript and Vite, serving built assets from the existing same-origin Node service. Next.js is a possible later decision, not the approved initial stack. Retain public landing metadata; evaluate prerendering only when a discovery need exists.

The new landing page owns `/` and `/welcome/`; market browsing owns `/season/`. The original account application is served at `/index.html`. Independent `public/entry.js` preserves existing root hash links without depending on React. New account recovery links target the original entry directly. The new shell's static HTML and missing-build response must always retain a usable recovery link; never serve application HTML in place of a missing JavaScript asset.

Featured fixture ranking is a read-only catalogue projection shared by the landing page and market browser. The API filters, scores and sorts the full catalogue before applying pagination. Its versioned editorial preferences are documented in [fixture ranking](../product/fixture-ranking.md); they have no authority over betting funds, probabilities or settlement. Ranking uses cached fixture metadata without remote requests. The browser also offers chronological order.

Create these boundaries as implementation arrives:

```text
web/src/app/             routes, shell, loading/error boundaries
web/src/features/        owned journeys and named operations
web/src/components/      accessible primitives and shared compositions
web/src/design-system/   semantic visual tokens and motion geometry
web/src/lib/             HTTP, wallet and telemetry adapters
src/modules/            server commands and bounded query handlers
src/infrastructure/     PostgreSQL, provider, chain and signing adapters
src/workers/            durable jobs, oracle submission and indexing
shared/                 validated public contracts and exact units
```

Routes compose features. Features expose public entry points rather than importing each other's private modules. Shared components never depend on features. Raw HTTP belongs in one transport adapter; UI calls operations such as `five.submitTeam` or `markets.getPosition`. Privileged imports must not transitively reach the browser bundle.

Use TanStack Query for server-owned data with account-scoped keys and explicit freshness, cancellation and retry policies. Do not duplicate that cache in a global store. Draft team/slip controllers own unsent input. Submitted intent becomes immutable, so a new draft cannot be overwritten when an older request completes.

## Persistence and jobs

PostgreSQL relational tables, changed-row writes, explicit deletion helpers and uniqueness constraints already exist. The remaining concern is whole-working-set reads plus read/clone/mutate writes serialized only inside one Node process. A second process has a different queue. Replace hot mutations with focused SQL transactions before enabling API replicas.

Bound and paginate reads. Add indexes from actual query plans. Use row locks or compare-and-swap versions for invariants, document lock ordering, and retry safe whole transactions rather than arbitrary partial operations. Keep exact integer money through load, mutation and serialization. Unique business keys are the final duplicate guard.

Challenges and sessions now use dedicated PostgreSQL tables, hash-only session storage and atomic audience-bound single-use challenges. Local development has a single-process atomic file adapter. Hosted origin policy, secure cookies and verified database TLS are implemented. Coordinated source/global rate limits and bounded ledger writes are still required before replicas. See the [Season milestone](../delivery/season-milestone.md) for rollout and wallet-access limits. Separate accounts, verified identities and linked wallets. Linking needs an authenticated session and fresh proof; a supplied email/address alone never merges accounts.

The existing web process coalesces a 20-second fixture/settlement loop. Replace authoritative work with leased durable jobs carrying business key, attempt count, next-run time, owner/expiry and last error. Write required jobs/outbox records in the domain transaction. Handlers are idempotent under at-least-once execution. Fence stale workers before completion after lease expiry.

Persist signed transaction bytes and the hash before broadcast. Reconcile that hash and its inputs after timeout or restart before rebuilding. Unknown broadcast outcome is not permission for another spend. PostgreSQL is sufficient for initial jobs, sessions and coordination; add Redis only for a measured need.

## Performance and reliability

Preserve current compression, ETags, shared requests, cached balances, hidden-tab polling suppression and navigation-race protection. Measure the new bundle and actual API/database workloads. Every new journey records its normal request count, refresh cadence, pagination, timeout/retry bounds and render cost. These are budgets to verify, not demonstrated user capacity. Atomic offer and recovery API operations allow a bounded 60 seconds for multi-fixture verification; normal reads retain 15 seconds. Wallet capacity is shared between navigation and overview with a 15-second freshness window and 30-second foreground refresh.

Start with one API service and one worker deployment from the same codebase. Do not enable additional API replicas before shared-state correctness. The free-service declaration in `render.yaml` and earlier Neon quota incident require current operational verification; neither is evidence of the presently deployed configuration.

Failure must remain visible: stale data carries freshness, errors keep recoverable drafts, unconfirmed transactions stay pending, and an unavailable football feed never becomes synthetic settlement. Validate configuration once, redact secrets centrally and emit correlation IDs for support without storing sensitive payloads.

## Migration order

1. Land this foundation and required checks.
2. Repair storage/session correctness and establish restore evidence, TLS/cookie policy and durable jobs.
3. Complete release verification of the implemented shell, direct stake-to-claim flow and atomic slip, retaining separate legacy recovery.
4. Verify player-data coverage, then implement Five entry and deterministic scoring.
5. Complete a bounded, observed testnet pilot before broad community onboarding.

Each step has an independently testable exit and a rollback path. Read [the roadmap](../product/scope-and-roadmap.md) for product acceptance and [the chain contract](chain.md) for protocol constraints.

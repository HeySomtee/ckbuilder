# Architecture and migration

Approved direction: [ADR 0001](../decisions/0001-approved-foundation.md). Detailed source inspection: [architecture proposal](../../design/season-preview/ARCHITECTURE-PROPOSAL.md). This document separates implementation from planned work.

The current [atomic slip correction](../delivery/atomic-slip-correction.md) supports one reviewed transaction for one to eight independent predictions. It can create new v4 markets and deposit into existing v4 markets together. The user supplies exact principal, 321 CKB position storage per line and the network fee; Streak supplies 3,050 CKB reserves per new market. The owner signs first and a separate operator verifies and co-signs last. V4 is deployed on testnet and activated locally. All 47 local major-gate steps passed at 19:33 UTC on 16 October. The API, separate sponsor and lifecycle worker are active locally. Phone and desktop live-provider checks passed with no page errors, distinct Wallet/Activity routes and preserved drafts. Exact-candidate commit and push gates remain mandatory. Bulk provisioning stays paused. The API never loads the sponsor signing key.

The 16 October wallet correction introduces a separately deployed product contract in `contracts/direct-v2`. It accepts authorized lock arguments up to 59 bytes, including the 22-byte OmniLock format used by EVM wallets. Historical contracts, terms, positions and exact signed recovery records retain their original code hashes. The wire and journal schema remains `testnet-v1`; the pinned code hash identifies the contract generation. Fee, storage, payout and timing rules are unchanged.

Sign-in, Wallet and checkout share one explicitly selected in-memory signer. Provider replacement, account changes and successful logout invalidate it and account-bound reviews. A page reload requires reconnection, while server sessions and saved transaction recovery remain separate. Ordinary fixture browsing does not import the wallet SDK.

The earlier bulk operator can consume a bounded real-provider schedule and fund markets serially. That mode is now paused in favor of first-bet sponsorship. The lifecycle worker and sponsor share durable funding coordination. They own private signed jobs; the API exposes validated public descriptors and bounded status. Current and legacy descriptors remain discoverable together, with legacy entry disabled. Per-pick preparation status cannot authorize funds; checkout rechecks actual live cells. The [wallet and provisioning correction](../delivery/wallet-provisioning-correction.md) records the preceding migration.

## Four distinct systems

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

# Streak platform and agent workflow proposal

Revision 01, 15 October 2026. **Approved by the owner on 15 October 2026.** This document preserves the reviewed proposal. The [active documentation](../../docs/README.md) and [agent contract](../../AGENTS.md) track implementation; the approval does not mean the proposed migration is already built.

This accompanies the interactive Season preview. Its screens use sample data and simulated operations. Approval should cover the experience and these implementation boundaries together. Preview behavior is not evidence of wallet, football API, database or contract integration.

## Recommendation

Keep Streak's TypeScript backend and Rust contract work. Introduce a feature-based React and TypeScript frontend, then replace whole-ledger operations with focused database commands in stages. Run a modular application with a separate durable worker, rather than introduce microservices for every feature. Ship the new shell, a complete prediction journey and a small Streak Five competition before expanding the social surface.

The important change is ownership: CKB owns prediction funds, the football oracle supplies trusted results, PostgreSQL owns accounts and fantasy competition state, and the browser presents those authorities without inventing success. Fantasy points and campaign rewards cannot change betting entitlements.

## What the source actually shows

Inspection baseline: Streak `2d5879a`; Chessdict Web `3a2a9a4`. Sources were read locally. Hosted configuration, current database health and production capacity were not verified during this proposal.

| Area | Existing implementation | Required change |
| --- | --- | --- |
| Frontend | Vanilla modules; `public/app.js` is about 148 KB of source and `styles.css` about 86 KB. Separate Matchday module and shared runtime already exist. | Extract feature ownership, typed operations, semantic design tokens and reusable interactions. These source sizes are not compressed transfer measurements. |
| Persistence | Relational PostgreSQL tables, changed-row writes, SQL constraints, archived receipt access and explicit deletion helpers already exist. | Replace the remaining whole-ledger read/clone/mutate model with bounded queries and transaction-scoped commands. Do not describe relational migration as new work. |
| Concurrency | `store.ts` serializes writes inside one Node process; Postgres loads all users, markets, bets and several histories into a snapshot. | Use database concurrency control before multiple API instances. A second process has a different queue and can overwrite stale values. |
| Sessions | Wallet signature verification exists; challenges and sessions live in process-local Maps. | Durable, expiring sessions and atomic single-use challenges; account linking and explicit session security. |
| Background operations | A coalesced 20-second loop refreshes fixtures and settles legacy ledger markets in the web process. | Durable jobs, restart recovery, retries, ownership leases, alerts and chain reconciliation. |
| Performance | Snapshot reads, request sharing, cached balances, compression, ETags, hidden-tab polling suppression and navigation race protection already exist. | Preserve these benefits while measuring the new bundle, real deployment and matchday bursts. |
| Funds | The application uses treasury deposits and a custodial ledger; Week 20 independently funded claims are a separate Rust/browser lab. | Integrate direct stakes and claims explicitly, retain and reconcile legacy liabilities, and never label old balances as contract collateral. |
| Football data | Fixtures, events, lineups, team statistics, predictions and odds have provider seams and caching. | Add verified per-player statistics, eligible-player catalogue and versioned fantasy scoring. Team stats and lineup data do not supply the full fantasy scoring feed. |
| Operations | `render.yaml` declares one free web service; Neon previously reached its quota. | Confirm deployed reality, recover DB access, establish retention and purchase an always-on execution budget before public matchday commitments. |

Two source-level hardening items belong in the first integration stage: hosted PostgreSQL currently sets `rejectUnauthorized: false`, and the session cookie lacks `Secure`. Establish trusted TLS verification and HTTPS cookie policy without weakening local development. This is a source finding, not a claim of an observed exploit.

The current README calls login and on-chain actions non-custodial. Wallet signing alone does not make treasury-held betting funds non-custodial. Update that explanation as part of the migration, with a visible distinction between legacy treasury balances and new contract positions.

## What to learn from Chessdict

Adopt its explicit feature ownership, typed named operations, shared transport, semantic visual and motion tokens, browser/server separation, ADRs, evidence-aware status log and reviewable feature briefs. Its docs deliberately distinguish design intent, local integration, live verification and deployed behavior. That distinction should become normal practice in Streak.

Do not copy its backend trust boundary blindly. Chessdict's backend owns its game and money operations; Streak's new scripts must own the movement of prediction funds. Also do not inherit its branch destinations, custodial account model, private backend report rules or sibling-repository publishing instructions.

Chessdict's concurrency figures are planning targets, not demonstrated capacity. Its Genie study is explicitly deferred by ADR 0004. We can take the geometry and accessibility lessons while making a separate, measured Streak motion decision.

## Proposed frontend foundation

Use **React + strict TypeScript + Vite**, with explicit route modules and one server-data cache. The reason is the new interaction/state surface: persistent slips, fantasy selection, mobile sheets, activity recovery and live score updates need reusable behavior rather than more string-rendered page code.

Keep the existing Node API and serve the built frontend under the same origin. Vite produces static application assets, so this does not require a new request-time rendering service. Retain public landing metadata and later add prerendering only where discovery needs it. [Vite production build documentation](https://vite.dev/guide/build)

Next.js is a reasonable future choice for substantial server-rendered public content, but copying Chessdict's stack now would also introduce a second server/session boundary. Vanilla modules remain a fallback if the framework migration threatens the launch; the module boundaries and state contracts below still apply. This is a proposal, not a dependency installation.

Use TanStack Query for server-owned data, with explicit freshness, account-scoped keys, cancellation and retry settings. Its default stale/refetch behavior must be overridden for expensive chain/provider reads. Never put the same server data in another global store. Keep draft team selection and slip state local or in a narrow draft controller. [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)

```text
products/streak/
  web/src/app/                 route composition, shell, boundaries
  web/src/features/           home, markets, five, matchday, portfolio,
                              crews, leaderboard, account, receipts
  web/src/components/         accessible primitives and shared compositions
  web/src/design-system/      semantic tokens, motion constants, geometry
  web/src/lib/                HTTP, wallet adapter, telemetry adapters
  src/modules/                server domain commands and query handlers
  src/infrastructure/         PostgreSQL, provider, chain and signing adapters
  src/workers/                leased jobs, result submission, indexing
  shared/                     validated public contracts and exact units
```

Create directories when useful code arrives. Routes compose features; components call operations such as `five.submitTeam` or `markets.getPosition`. Shared UI must not import feature internals. Server keys, provider credentials and privileged configuration must never enter the browser bundle. Pin versions and enforce the boundaries in CI after approval.

## Server modules and state ownership

| Module | Owns | Must not own |
| --- | --- | --- |
| Identity | Accounts, verified identities, linked wallets, sessions and preferences | Private wallet keys or pool spending |
| Fixtures | Provider identifiers, schedules, coverage and data freshness | Rewriting a funded market's pinned cutoff |
| Prediction markets | Approved catalogue, transaction preparation, discovery and lifecycle projections | A database balance that substitutes for on-chain ownership |
| Chain index | Confirmed cells/events, outpoints, block checkpoints and replay | Invented confirmation from a submitted hash |
| Oracle operations | Evidence snapshots, configured reporter signing and reconciliation | Undisclosed result corrections after an irreversible result |
| Five | Competition rules, squads, deadlines, player statistics and scoring versions | Betting principal or contract payout amounts |
| Community | Crews, achievements, invitations and opt-in notifications | Rewarding wallet count as verified unique people |
| Campaign | Budget approvals, eligibility, reward decisions and payment records | Automatic use of user deposits or pool reserves for prizes |
| Legacy ledger | Existing treasury liability and withdrawal reconciliation | New direct-market positions |

Use a small public contract for each module and ordinary function calls inside the backend. Start with one API service and one worker deployment from the same repository. Split a service only when operational ownership or measured demand warrants it.

### Database and job correctness

1. Replace hot mutations with focused SQL transactions, locking the rows whose invariants they change or using compare-and-swap versions. Unique constraints remain the final duplicate guard. Document lock ordering and retry only whole transactions when safe. PostgreSQL row locks coordinate concurrent transactions; an in-memory queue does not coordinate replicas. [PostgreSQL locking documentation](https://www.postgresql.org/docs/current/explicit-locking.html)
2. Keep public read models bounded and indexed. Paginate portfolio, receipt and activity history. Load large analytics only on demand. Measure query plans and connection use before adding caching infrastructure.
3. Store durable jobs with unique business keys, attempt count, next-run time, lease owner/expiry and last error. Workers claim work transactionally; expired leases can be recovered. Use fencing/version checks when completing work after a lease expires.
4. Write domain changes and required job/outbox records in the same transaction. Treat execution as at least once. Make handlers idempotent and record external-operation identity. Do not claim exactly-once network execution.
5. Persist signed transaction bytes and hash before broadcast. On timeout/restart, reconcile that hash and inputs before rebuilding; retrying a request is not permission to create a second spend. Preserve the current withdrawal recovery principles.
6. Put sessions, challenge consumption, rate-limit coordination and job ownership in shared durable storage before enabling replicas. PostgreSQL is sufficient initially; Redis is optional when measured load or connection fan-out justifies it.

Add account-scoped authorization, request schemas, stable error codes, origin/CSRF checks, body limits and operation-specific rate limits. Keep money as integer base-unit strings/BigInt, not floating-point numbers. Validate config once and redact secrets, tokens and private inputs centrally.

## Direct on-chain prediction flow

The browser reviews the selected outcome, principal, recoverable storage and estimated network fee separately. A wallet signature submits the transaction; it does not mean acceptance. Show `awaiting signature`, `submitted`, `committed/pending validation`, `accepted` or `refund required` according to chain evidence. Existing Week 20 admission records require a later transition to verify the deposit's actual creation header.

### Multiple predictions, one payment

The approved interaction is a basket of independently settled predictions. A user selects at most one outcome per fixture in the slip, adjusts each stake, and reviews one combined payment. Changing an outcome preserves that fixture's stake. Each pick retains its own receipt, admission status and eventual claim or refund. The preview models this with a shared sample payment ID and one activity position per pick.

Production support requires a batch transaction builder and verification of the deployed scripts across multiple market/type groups. This preview does not establish that the current builder supports such transactions. Sum principal and receipt capacity across every pick; estimate the fee from the complete transaction rather than multiplying a single-pick estimate. The displayed 0.005 tCKB fee and 321 tCKB storage per receipt remain illustrative for this proposal.

Before signing, revalidate every fixture's cutoff, terms, available shard and total capacity against one immutable reviewed intent. Bind the returned transaction to that intent and check per-market conservation, receipt ownership and duplicate inputs. A changed or full market sends the whole slip back for review; never silently omit a pick or split one approved payment into several transactions. Broadcast/retry reconciliation uses the single signed hash. After commitment, track each market's admission and refund eligibility independently, including reorg handling. Test multi-group isolation and transaction size/cycle bounds before enabling this flow on the live testnet app.

The indexer stores block number/hash checkpoints, transaction hashes and outpoints. Confirmation policy is explicit. It detects reorgs, rolls back affected projections and replays deterministically. Both the website and operator tools use the same versioned encoders/builders. Raw protocol code remains independently testable without the app.

The oracle worker fetches football evidence and records its provenance before signing. It checks the pinned fixture rules and result window, submits once and reconciles. Real markets never fall back to synthetic outcomes. The six-hour deadline concerns actual commitment eligibility, not the browser clock or a claimed `since` upper bound. Timely reports can be verified later; ineligible late reports cannot win a race against cancellation.

Settlement consumes the complete bounded shard set. Claims are independently funded and recoverable through direct RPC tooling even when Streak is unavailable. The backend may help discover or construct a claim; it does not authorize the owner's entitlement. A keeper can trigger timeout cancellation when eligible, with clear treatment of an eligible report already committed.

### Limits to resolve before inviting users

- Week 20 supports four shards and eight records per shard, at most 32 bets per market. It removes shared claim contention, not all deposit contention. Sequential routing is advisory, with bounded conflict retry; no shared routing counter should become a new hot cell.
- A stake needs at least 100 CKB principal plus 321 CKB recoverable claim storage and separate fees. The app must not advertise a 100 CKB all-in cost.
- The current shared builder restricts wallet lock arguments to at most 20 bytes. Publish a tested supported-wallet matrix or extend the protocol/builder with new evidence before promising every CCC wallet.
- Fixture identity and settlement-rule commitment need a reviewed catalogue contract. Week 20's arguments do not pin a fixture/rules hash. Prefer a reviewed version that commits these terms before real football markets; an off-chain label alone is an extra trust assumption.
- Funded kickoff terms are immutable. Do not copy the legacy behavior that updates an open market's close time when the provider reschedules a fixture. Publish postponement, abandonment and regulation-time rules before creating it.
- Script changes require new deployments and versioned manifests. Keep old versions available for exits. A pause stops new entries, not valid claims. Confirm reserve funding, fee recipients and keeper budgets per market.

For a limited pilot, keep the proven bounds and show a full-market state. Larger pools need a separate contract design and benchmark; adding API servers does not increase cell capacity.

## Streak Five: data and scoring contract

Preview proposal: five players, one captain, fixed budget, weekly reset and a separate season score. The exact positions, prices, scoring and deadlines must be approved and published before entries open. Keep fantasy free to enter and distinct from staking.

Browsing and drafting require no wallet. The initial draft can live locally with an explicit unsaved state. For an official entry, support a verified account independent of wallet ownership, proposed email sign-in plus optional wallet sign-in. This needs an email-delivery decision, durable sessions and a safe identity-linking flow; the current wallet-only account model does not already provide it.

Separate `accounts` from `account_identities` and `linked_wallets`, with unique verified identifiers and signed proof to attach a wallet. Link only from an authenticated account with fresh proof. Never merge accounts merely because a user supplies an address or email. A unique wallet/email is not proof of a unique human.

Suggested tables: `five_rounds`, `five_rulesets`, `five_player_catalogues`, `five_entries`, `five_entry_players`, `player_stat_snapshots`, `five_scoring_runs`, `five_score_lines`, `campaign_awards`. Use provider-scoped player IDs, immutable round catalogue/prices and a unique account/round entry constraint.

Submission checks all five unique eligible players, budget, position/team constraints and captain membership in one transaction. Lock the round row, enforce its server-side cutoff and update the entry version atomically. Lock workers and submission commands use the same concurrency rule. A locally saved draft is not a submitted team, and a slow request after the deadline must not silently succeed.

Capture raw provider snapshots with provenance/hash and bounded retention, then normalize the statistics used by the approved scoring rules. The current Matchday endpoint supplies team statistics; verify per-player endpoint coverage, plan quota, attribution and permitted image use before enabling scoring. [API-Football documentation](https://www.api-football.com/documentation-v3)

Scoring is a deterministic pure function of frozen entry, ruleset version and stat revision. Store each player's point breakdown and captain multiplier, not just a total. A correction creates a new scoring revision with a visible reason; replay must reproduce the same standings. Distinguish provisional and final scores, define a correction window, and settle prizes only after it closes.

Publish rules for postponed/cancelled games, non-playing captains, missing statistics, double fixtures and ties. Recommendation for launch: one clearly defined eligible fixture per player per round, no transfers after cutoff, no complex chips and no silent substitute. Missing data remains pending or follows a published void rule, never invented zeroes.

Campaign points, badges and monetary awards are separate ledgers. Keep a fixed approved budget, eligibility policy, tie handling, duplicate-account review and an auditable award decision. Do not issue prizes per transaction count or promise future tokens. Any cash-prize announcement waits for the owner's budget and campaign terms.

## Motion, interaction and accessibility

Use a lightweight connected-surface transition for the prediction slip or Five draft retracting into its dock item. This communicates where the draft went. Avoid turning every navigation into a whole-page deformation.

The local Genie study uses one WebGL mesh with curved, tapered geometry, a shared browser animation clock and a Canvas2D fallback. It prepares an inert image of the synthetic prediction slip before the transition, with a bounded cache, shared on-demand preparation and version guards on pending transitions. Missing cache entries must not silently bypass ordinary user-triggered motion. Failed rendering still falls back to a usable interface. CSS projective bands were rejected after WebKit painted beyond their intended bounds. The decorative layer is hidden from assistive technology and discarded on completion or cancellation. A production implementation should render a dedicated, nonsensitive receipt surface rather than generalizing DOM capture to arbitrary dialogs. Never capture live wallet prompts, credentials or signing material.

The real interface owns focus and state throughout. Rapid toggles, navigation, resize, scrolling, unmount and tab hiding must cancel safely. Reduced motion uses an immediate or short fade transition. No animation delays signing, locks input, erases drafts or announces confirmation before evidence. Use CSS transforms/opacity for common feedback and measure the rare deformation on a modest phone before product rollout.

Every component specifies press, hover, focus-visible, pending, disabled, success and error behavior. Use native semantics, 44px primary touch targets, readable contrast, keyboard alternatives, persistent financial statuses and safe-area spacing. Keep sound/haptics optional. Test zoom and short screens rather than forcing everything into one viewport.

The revised material shares translucent face, directional rim, financial backing and scrollbar tokens. Ordinary page cards do not each require a backdrop filter; reserve that cost for elevated surfaces. Keep pick details and payment totals readable even when backdrop filtering is unavailable or rendered differently. Window actions retain visible Minimize/Close labels at all widths. Scrollbars remain native, with standard thin/colour fallbacks and system colours in high-contrast mode. Decorative edges must not intercept input or replace focus indicators.

## Performance and operational budgets

These are proposed acceptance targets, not measured results or guarantees:

| Area | Initial budget / gate |
| --- | --- |
| First useful screen | Mobile LCP at or below 2.5 seconds on an agreed device/network profile; initial compressed route JavaScript target under 180 KB, excluding deferred wallet tools. |
| Interaction | INP target at or below 200 ms; no animation or score update should replace a focused form or lose input. |
| API | Public cached query p95 under 300 ms and normal mutation acknowledgement p95 under 700 ms in the same-region test environment; chain confirmation measured separately. |
| Live reads | One composed page read, explicit optional hydration; shared polling at 20-30 seconds where justified, paused when hidden, jittered recovery. No request per countdown tick. |
| Capacity | Characterize 25-user pilot, then 100 and 500 active sessions with declared route mix, deadline bursts and retries. Do not advertise thousands from a folder structure. |
| Reliability | No known critical fund/account defects; alert on worker heartbeat, queue age, failed settlement, oracle deadline risk, RPC divergence and DB storage. |
| Data growth | Table/index/bloat inventory first. Alert at agreed usage thresholds; prune transient caches under a documented policy and preserve funded-market evidence and liabilities. |

Operate always-on API/worker execution, pooled Postgres in the same region, bounded provider calls and static asset caching. Confirm recurring hosting, database, football API and testnet reserve budgets separately from community prizes. Start with structured logs and a small operational dashboard; no vendor purchase or analytics transmission is authorized by this proposal.

## Migration and recovery

1. Back up and rehearse restore. Inventory users, legacy balances, pending withdrawals, receipts and funded contract positions without logging private data. Resolve the Neon quota cause before adding another write-heavy feature.
2. Add schemas and feature flags without deleting old fields. Introduce typed reads and durable sessions, then focused commands. Keep one writer until concurrency tests pass.
3. Release the new shell to a preview cohort. Adapt existing read endpoints first; migrate one complete flow at a time, with typed errors, recovery states and behavior tests.
4. Freeze new legacy deposits/bets only when exits remain available. Preserve settlement and withdrawal recovery for existing liabilities. Offer an explicit user-signed migration path if needed; do not move treasury balances into a contract automatically.
5. Enable a small curated contract market pilot, then Five. Reconcile database projections against CKB before wider rollout. Track version per market and retain old claim tools.
6. Roll back new entry surfaces through flags while keeping status, claims, refunds and legacy withdrawals reachable. A frontend rollback cannot undo committed chain transactions or safely discard new database records.

## Agent pipeline in the approved proposal

Use canonical `AGENTS.md` rather than competing `AGENT.md` copies. Tool-specific files may point to it. The owner has now approved this pipeline. The implementation is tracked in the [active quality policy](../../docs/delivery/quality.md); the table below preserves the original proposed responsibilities, consolidated into the active documentation where appropriate.

| Proposed document | Purpose |
| --- | --- |
| `AGENTS.md` | Start/finish routine, ownership, trust boundaries, secret handling, evidence and review rules. |
| `status.md` and `docs/README.md` | Dated current facts, next work, blockers and canonical reading map. |
| `docs/product/roadmap.md` and `decisions.md` | Cohorts, launch priorities, approved/deferred scope and unresolved choices. |
| `docs/design/foundations.md`, `motion.md`, `copy.md` | Streak tokens, glass/elevation recipes, interaction states, accessibility and voice. |
| `docs/design/flows/` | Approved previews, state diagrams, screenshots, review scope/revision and sign-off. |
| `docs/architecture/overview.md`, `data.md`, `identity.md` | Ownership, shared contracts, SQL/concurrency and session design. |
| `docs/architecture/chain.md`, `oracle.md`, `five.md` | Versioned transaction schemas, pinned trust assumptions, index recovery and scoring rules. |
| `docs/operations/` | Deploy/rollback, DB restore, keeper recovery, signing key controls, budgets and incidents. |
| `docs/delivery/quality.md` and `capacity.md` | Required checks, browser matrix, test evidence and workload budgets. |
| `docs/decisions/NNNN-topic.md` | One decision, alternatives, consequences, status and supersession. |
| `.agents/skills/streak-design/SKILL.md` | Optional local design workflow derived from approved Streak conventions, not a copied Chessdict theme. |

The workflow is: inspect current status and sources; define one complete journey; present UI plus integration design; record the owner's concrete approval; implement UI and behavior together; test relevant normal/failure/recovery cases; review the diff; update evidence and docs; deliver according to the authorized release scope. Avoid repeated approval for already accepted details, but return material scope changes for review.

Agents can divide design, domain integration and independent verification with explicit file ownership. Financial/contract changes receive a second review of invariants and recovery. A passing mock test never becomes a live-chain claim. A screenshot is visual evidence, not proof of wallet approval or scoring accuracy.

After approval, a single `verify` entry point should run proportional formatting, strict type checks, ownership checks, meaningful tests, documentation links and secret scanning. CI configuration and actual branch protections must be reported separately. No automatic publishing or external messaging authority is inherited from Chessdict.

## Review decisions and delivery order

Approve or revise these concrete choices: React/Vite with retained Node backend; free five-player fantasy with account/wallet separation; modular backend plus durable worker; limited 32-bet contract pilot before a larger contract redesign; Genie confined to a recoverable dock interaction; and the proposed canonical agent/doc workflow.

After approval: (1) establish docs and foundations, (2) recover storage and session/job correctness, (3) deliver shell and one real stake-to-claim flow, (4) verify player data and implement Five submission/scoring, (5) run a supported pilot, then expand. October 31 remains a pilot target, not a promise to finish the entire architecture migration or every proposed social feature.

## Source map

Streak sources: `products/streak/PERFORMANCE.md`; `src/auth.ts`; `src/server.ts`; `src/store.ts`; `src/store_pg.ts`; `scripts/sql/001_schema.sql`; `src/game.ts`; `src/matchday.ts`; `public/app.js`; `public/runtime.js`; `products/streak/CONTRACT_SCOPE.md`; root `render.yaml`; `src/week20/contract-lab/README.md` and `web/client.mjs`. Paths under `src`, `public` and `scripts/sql` in this sentence are relative to `products/streak` unless explicitly rooted.

Chessdict reference root: `C:/Users/HP/Desktop/CHESSDICT/chessdict_web`. Read `AGENTS.md`, `docs/architecture/overview.md`, `docs/architecture/performance-and-realtime.md`, `docs/security/browser-security.md`, `docs/design/component-system.md`, `docs/design/motion-and-microinteractions.md`, `docs/product/scope-and-decisions.md`, `docs/delivery/quality-and-conventions.md`, ADRs 0001/0003/0004 and `package.json`. They are reference evidence; their project-specific permissions do not govern Streak.

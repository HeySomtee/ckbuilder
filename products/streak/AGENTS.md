# Streak agent and contributor contract

This is the canonical instruction file for work inside `products/streak`. Read the [documentation map](docs/README.md), [status](status.md) and [architecture](docs/architecture/overview.md) before changing code. The repository contains other CKB learning projects; their state and authority are separate.

Read and maintain the [work tracker](docs/work-tracker.md) on every task and handoff. Record new steering requests without dropping earlier commitments. Before changing focus, update progress, unfinished acceptance criteria and the exact resume point. Mark work complete only with implementation and verification evidence, distinguishing local work from publication and deployment.

## Approved scope and working method

The owner approved the Streak UI and architecture on **15 October 2026**, including the latest dense prediction slip, clear glass elsewhere, labelled controls and shared scrollbar. The owner then requested documentation, recurring tests and CI before production implementation. [ADR 0001](docs/decisions/0001-approved-foundation.md) records that approval. Proceed within it without asking for the same permission again. Present material departures from the approved experience, trust boundaries, contract economics or launch scope for review before implementing those departures.

1. Read the relevant product, design, architecture, delivery and operations documents. Verify dated findings against source. Inspect existing helpers and tests before introducing another abstraction or dependency.
2. Choose a complete, reviewable increment with explicit acceptance criteria, state ownership and failure/recovery behavior. Work on one coherent journey at a time. Do not count mock buttons as integrated features.
3. Preserve unrelated changes. Assign explicit file ownership when using parallel agents. Independent review is required for changes to money, contract rules, identity or recovery. Record what was reviewed, including concerns that remain.
4. Implement UI and behavior together within the approved architecture. Carry forward accessibility, measured performance and the approved small interaction details. A materially different design needs review; a routine implementation choice does not.
5. Run the [quality gates](docs/delivery/quality.md). Owner direction on 17 October replaces blanket commit/push reruns with scoped checks: documentation uses formatting/static policies; CSS adds the frontend build; delivery tooling adds its regression tests; other code changes retain the full gate. Major runtime changes still require `npm run quality:major`. A push can reuse a successful receipt for identical contents, runtime and sufficient coverage for up to 24 hours. Never bypass a failed check or lower an assertion to hide a failure. Hosted CI is confirmed separately for the resulting commit SHA.
6. Review the final diff, update governing docs and `status.md`, and report actual checks, limitations and release state. Documentation is part of the same change. Do not claim deployment, capacity or live-chain verification from a local test.

## Product and trust boundaries

- Legacy balances use a custodial treasury-backed ledger. The Season app integrates direct testnet market positions with separate claims. Keep legacy liabilities and withdrawals separate from those positions; wallet login alone does not change custody.
- The Week 20 Rust lab at `../../src/week20/contract-lab` retains its independent historical demo. The app's later versioned contracts and direct modules integrate bounded market and claim rules. Local integration and public payments do not establish hosted operator readiness.
- The approved target gives CKB authority over new prediction funds and claims. The configured football oracle remains trusted for results. PostgreSQL owns identity, fantasy competition state and read models. A read model is never an entitlement to spend a cell.
- Five, daily streaks, revivals, crews, badges and campaign awards remain application features initially. They cannot change contract principal, payouts or refunds. Campaign awards need a separately approved budget and published rules.
- The preview is synthetic. Never reuse sample balances, fees, player scores, transaction success or fixture results as a production fallback.
- Owner correction, 26 October: Five/Survivor dummy data is a local environment setting, not a public UI or URL switch. Preserve separate test stores and rewards recovery, deny hosted test-mode requests, and reject stale document scopes after mode changes. Admin deadline controls are local-test tools. Both games use consistent Beta labels until release status is deliberately changed.

## Code and state ownership

- Retain the Node/TypeScript API and Rust contracts. The approved new frontend is React, strict TypeScript and Vite, built as same-origin static assets. Next.js is not the approved foundation.
- Follow the [module boundaries](docs/architecture/overview.md). Routes compose features. Features expose named operations. Shared UI does not import feature internals. Transport, wallet, provider and database details stay in adapters.
- Create directories when real code needs them. Do not add empty scaffolds, speculative services or a second framework simply to resemble the reference repository.
- Use one server-data cache with account-scoped keys, cancellation and explicit retry/freshness rules. Keep drafts distinct from submitted data. Clear private caches on account changes.
- Use integer shannons and exact decimal strings at boundaries. Never calculate money with floating-point numbers. Keep units explicit in names. Authoritative fees and limits come from the relevant protocol version or backend rules, not UI constants.
- Keep TypeScript strict. Validate untrusted data and narrow `unknown`; avoid unchecked casts, catch-and-ignore errors and unexplained suppressions. Pin reviewed dependencies and update the lockfile together.

## Design and motion

Owner priority, 19 October 2026: reliability, measured speed and polished core journeys come before additional features. For chain/wallet changes, measure request counts and latency under delayed and failed reads, not just instant fixtures. Independent data must appear progressively; one unavailable market must not erase or block unrelated verified rows. Keep previous data visibly labelled during refresh, and revalidate actual spend authority before signatures. Wallet restoration may silently reuse an explicitly selected, still-authorized provider/account, but must never prompt, sign, change accounts or bypass revoked access on page load. Disconnect and sign-out must stop restoration.

Pending work needs truthful animated progress, an accessible status, reduced-motion support and a recovery path; do not leave users staring at static Checking text or hide the whole page behind chain reads. Distinguish checking, wallet approval and broadcast/confirmation. Keep selected details and drafts stable across background refresh. Informational notices are compact and dismissible; necessary restrictions remain visible at the affected action. Test real team names/logo fallbacks, centered close controls, keyboard focus, small screens, slow requests and recovery. Document measured improvements and any physical-wallet checks that could not be performed. Passing synthetic tests alone is not evidence of a polished hosted journey.

Use the [design system](docs/design/system.md) and approved [preview](design/season-preview/README.md) as the reference. Preserve the coral/graphite football identity, clear glass, directional rims, dense payment surfaces and native scrolling. Use semantic tokens rather than copying values into every feature.

Owner correction, 25 October 2026: use stroked SVG icons for dropdown and disclosure chevrons, not text glyph substitutes. Reuse the shared Icon component in React and the same geometry in legacy surfaces. Keep expanded state, accessible labels and keyboard behavior intact.

Every interaction has appropriate press, focus, pending, success, failure and disabled behavior. Keep 44px primary touch targets, visible focus, semantic labels and keyboard/touch alternatives. Amounts and consequences must remain legible without blur or colour. Latest owner correction, 16 October: the prediction slip has one X close button with an accessible label. Close and Escape retain the draft. Clear slip is a separate explicit action. Payment stays inside the slip; Wallet and My activity have distinct routes and purposes.

The owner removed the Genie effect on 16 October. Use immediate slip opening and closing, with reliable focus restoration. Retain reduced motion and reduced transparency support elsewhere. Historical preview motion evidence is archived and does not govern the current application.

## Security and testing

- Browser code never receives private keys, seed phrases, provider credentials, database URLs or oracle signing material. Session tokens and sensitive inputs do not belong in URLs, localStorage, telemetry or screenshots.
- Tests use disposable local data, dummy identities and local chain nodes. Never point routine checks at Neon, a deployed service, real wallets, public RPC or production secrets. Live testnet verification is a separate, explicitly scoped operation.
- PostgreSQL tests use a disposable database and must fail if a required database check cannot run. A skipped test is not a pass. Do not use an existing developer or production database for destructive fixtures.
- Retain authorization, request validation, origin/CSRF handling, redaction and resource limits at server boundaries. UI route guards do not authorize an operation.
- Follow [engineering conventions](docs/engineering/conventions.md) and the [operations runbook](docs/operations/runbook.md). Test failure and recovery paths, including interrupted submissions and restarts, rather than only successful screenshots.

## Delivery and evidence

Owner correction, 17 October 2026: the hour-long hero release showed that running the full suite before both commit and push is disproportionate for small changes. Use the scoped hook policy above. Preserve all full-suite tests and the explicit major/release commands; do not interpret reduced hook scope as proof that unrun browser or contract lanes passed.

Owner direction, 17 October 2026: the Week 21 release is explicitly authorized, including the report, screenshots, commit, push, review of outstanding PRs and integration into main for Render deployment. This supersedes the earlier commit/push pause for this release. Exact-candidate local gates still apply; hosted CI remains paused. Keep the account destination My Account and historical wallet deep links. Keep Streak Five clearly marked coming soon until its actual entry and scoring workflow exists. Additional campaign proposals need owner review; the proposed Founders Weekend was declined for this report.

Owner override, 15 October 2026: hosted CI work is paused because GitHub jobs
cannot start under the account billing lock. Local gates remain mandatory.
Do not resume hosted checks or branch protection without a new instruction.

Use focused Conventional Commits, stage explicit files, and preserve unrelated work. Do not rewrite shared history. Local checks, GitHub Actions configuration, successful hosted runs, required branch checks and deployment are separate facts. Report each accurately. No authority to purchase hosting, set a prize budget, deploy, send messages or publish to sibling repositories is inherited from Chessdict.

Write clear, direct prose without em dashes. Reports and handoffs identify the date, source revision, commands, outcomes and unresolved limits. Never promise that software cannot crash; demonstrate how failures are prevented, surfaced, recovered and monitored.

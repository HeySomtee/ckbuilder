# Engineering conventions and security

Apply these conventions to new and changed code. Do not rewrite unrelated legacy modules just to match naming. The [architecture](../architecture/overview.md) defines target ownership; [quality](../delivery/quality.md) defines the executable gates.

## Code contracts

- Use strict TypeScript, explicit inputs and focused functions. Narrow `unknown` at request, provider, chain, storage and browser-persistence boundaries. Prefer discriminated unions for states carrying different data.
- Use kebab-case new files, PascalCase components/types, camelCase values/functions and UPPER_SNAKE_CASE exported constants. Unit suffixes such as `_MS`, `_BYTES` and `Shannons` prevent ambiguous values.
- Keep fixed application defaults separate from validated environment configuration. Feature-only constants stay local. Visual values belong in semantic design tokens. Contract fees/limits come from the pinned version.
- Use named feature/domain operations, not arbitrary URLs or SQL inside components. Map wire DTOs to application models only where responsibilities differ. Avoid broad barrels and dependency cycles.
- Pin reviewed dependency/tool versions and commit lockfile changes together. Install with `npm ci`. Do not use force flags to hide peer conflicts. Prefer one library per responsibility.
- Model cancellation, timeout, retry and unknown outcome explicitly. A client abort does not prove a server mutation or broadcast was cancelled. Cleanup must be idempotent.

## Exact money and transaction intent

Use integer shannons internally and exact decimal strings over JSON. Parse decimal inputs without floating-point multiplication. Reject negative, nonfinite, over-precision and out-of-range values. Keep principal, recoverable capacity, network fees, protocol fees and campaign awards separate.

Bind signing to immutable reviewed intent and check the returned transaction against it. Never trust a prepared transaction only because the backend returned it. Do not silently change outcomes, recipients, capacity or payment count. On timeout, reconcile the original identity/hash before retrying. Use uniqueness and idempotency keys at the authority owning the mutation.

## Identity and browser security

The browser is untrusted. Check identity, ownership and authorization on every protected command. Route guards and hidden buttons are not permission checks. Link identities only from an authenticated session with fresh proof; do not merge on unverified identifiers.

Use secure, HTTP-only cookies over HTTPS with appropriate SameSite behavior, origin/CSRF protection and explicit expiry/revocation. Make challenges atomically single-use in durable storage. Coordinate rate limits before replicas. Protect mutations with request schemas, body limits and operation-specific controls.

Private keys, seed phrases, provider/API credentials, database URLs and oracle signing material stay server-side or in the user's wallet. Never embed them in browser imports, props, source maps, localStorage, URLs, analytics, screenshots or error reports. Public environment projections are allowlisted. Do not read or print local `.env` or key files to document configuration.

Treat fixture names, provider content and user text as untrusted display data. Escape/render them safely, validate URLs and maintain a restrictive CSP compatible with the implemented app. Avoid direct HTML insertion for untrusted values. Never weaken security policy to accommodate a screenshot helper.

Use verified TLS for hosted PostgreSQL and outbound services. The Season identity increment enables certificate verification and HTTPS session cookies. Verify hosted certificate compatibility and exact origin configuration before deployment; configuration tests alone do not establish a live TLS handshake.

## Data, workers and external services

Use transaction-scoped SQL for invariants, bounded reads, explicit deletions and unique constraints. Document lock ordering and retry whole safe transactions. Do not use a process-local queue as multi-instance coordination. Database errors must not silently switch to another balance ledger.

Jobs run at least once. Store durable intent/outbox entries with domain changes, claim work with leases, fence stale completions and make external effects idempotent. Preserve provider provenance and transaction identity. Reconcile after restart. Report stale/failed data instead of synthesizing a result.

Centralize timeouts, cancellation, retry caps and provider caching. Do not retry authentication failures, invalid requests or irreversible operations blindly. Avoid retry storms by coalescing shared reads and adding bounded jitter where appropriate. Do not poll hidden tabs unnecessarily.

## Resource and observability budgets

Every new data-bearing journey states its query/request count, payload bounds, pagination, refresh cadence, concurrency and retry budget. Inspect actual query plans and browser traces for hot paths. Define service latency/error targets against a measured deployment before claiming capacity. No fixed concurrency number is proven by this folder structure.

Use allowlisted structured logs, correlation IDs and sanitized error codes. Monitor latency, failures, DB connections/storage, job lag, chain-index lag, pending transactions and unresolved claims. Keep secrets, tokens and raw sensitive payloads out of logs. Define retention and deletion rules before collecting analytics or replay data.

## Test and review principles

Test invariants and observable behavior rather than implementation details. Cover errors, duplicate requests, races, retries, interruption and recovery in proportion to the risk. Financial and identity changes need an independent invariant/recovery review. Small reversible copy/style changes do not need artificial tests that merely restate the edit, but existing relevant gates still run.

All routine tests use disposable local fixtures and fail closed on attempted external access. Do not point tests at production databases, real secrets or deployed wallets. A mock can establish client behavior; it cannot establish a live integration. Preserve that distinction in documentation and grant reports.

# Season shell and identity milestone

Implemented 15 October 2026 on top of foundation commit `5a90186`. This is a review branch, not a deployed release.

## What works

The new React, TypeScript and Vite application is served by the existing Node API at `/season/`. It uses the approved graphite, coral and mint design, clear glass borders, native scrollbar, desktop rail and labelled mobile navigation. The landing-page extension below now serves `/` and `/welcome/`; the existing application remains at `/index.html`, including activity, wallet and legacy withdrawals. Existing shared hash links retain their destinations.

Markets default to the current or upcoming **Friday through Monday** in the viewer's local timezone. Monday belongs to the preceding Friday's matchweek. Day filters, search, market-state filters, previous/next windows and 24-item pagination use the real API. Team names, competition names and logos come from provider records. Missing/broken logos show API team codes. Browser tests use synthetic records and logo images, not live provider calls.

The read-only fixture catalogue includes finished and postponed API fixtures even when no pool was created. Those cards say that a prediction market is unavailable and have no betting action. They never create pools or enter settlement. The API-Football cache now keeps ten past days by default, with a four-day minimum to cover Friday on Monday with a UTC margin. Coverage dates and partial competition failures are exposed to the UI. A missing schedule is not presented as a confirmed empty weekend. Navigation is bounded to one previous and two upcoming matchweeks.

Existing markets open their current detail screen. This increment does not implement direct-contract payments, the combined slip or Five. All money in the existing markets remains the custodial ledger described in the architecture.

Review captures: [mobile](../evidence/season-mobile.png) and [desktop](../evidence/season-desktop.png). Both show the integrated app with synthetic test fixtures and a local placeholder logo. They demonstrate layout and fallback behavior, not live provider coverage.

## Landing-page extension

Requested and implemented on 15 October 2026 after commit `800e774`. The homepage now uses Season's design tokens, clear glass rims, native scrollbar and coral calls to action. Its fixture board reads the same validated API, including team logos and Friday-to-Monday filters. It shows loading, unavailable, empty and partial-coverage states without invented fixtures or odds. Browsing does not require login. Five is explicitly in development; no entry or reward is advertised as available.

The homepage has keyboard-operable native FAQ disclosures, visible testnet/custody explanations, reduced-motion behavior and usable high-contrast/no-blur fallbacks. Primary links enter `/season/`. A small independent `/entry.js` redirects existing account, market and receipt hashes to `/index.html`, preserving the query and hash even if the new application bundle is unavailable. Owned legacy links go directly to that entry. Static HTML and a missing-build 503 response both retain direct account recovery links. Missing assets remain 404, not fallback HTML.

Integrated Chromium/WebKit checks cover 320, 390, 768 and 1440px layouts, API logos, Monday/empty/failed/partial schedule states, CTA navigation, keyboard disclosures, reduced motion, forced colours, blocked-bundle recovery and missing-build handling. The existing browser suite retains the legacy login-page checks at `/index.html` and exercises shared receipt and account links through the root entry. An independent routing/recovery review identified the bundle and missing-build recovery cases; both were corrected and reviewed again with no remaining blockers.

The combined landing/market bundle measures approximately 88 KB gzip, with 7.2 KB CSS and the unchanged deferred 242 KB wallet chunk. The landing makes one bounded fixture request per selected day, caches for one minute, retries a failed read once and uses the existing 15-second request timeout. It does not poll, request account data or load the wallet connector. Vite reports the deliberately independent classic `/entry.js` as unbundled; it must be served from the existing public directory.

The complete local gate passed all 29 steps for this extension on 15 October 2026. Review captures: [mobile landing](../evidence/landing-mobile.png) and [desktop landing](../evidence/landing-desktop.png), both with synthetic test records. A separate manual inspection of the local browsing preview confirmed real provider fixtures and team logos. The extension is included on the Season review branch; no deployment was performed.

## Authentication and storage

Publication verification exposed clock skew between the application and PostgreSQL during challenge expiry. Consumption now requires the stored expiry to be later than both the application timestamp and the database clock. Controlled ahead/behind-clock regressions cover this conservative expiry policy; clock skew cannot extend a signed challenge's lifetime.

Wallet challenges now have independent random IDs, a pinned origin, testnet network, address, version and absolute expiry. PostgreSQL consumes each challenge atomically and enforces its stored audience and expiry. Five challenges per address per five minutes are allowed, including consumed attempts. Sessions store SHA-256 hashes of random 256-bit tokens. Logout removes the durable record before claiming success.

The server validates the CKB address checksum and verifies that the signed identity controls the complete testnet lock. Supported proof families are CKB secp256k1, EVM personal signatures, Bitcoin ECDSA, Nostr and Dogecoin. This is proof-family coverage, not a claim that every wallet extension/device works. JoyID binding is explicitly unsupported pending a separate implementation and review. Existing bindings are checked inside the serialized account mutation, compared by canonical full address, and retained. Login cannot silently relink a wallet.

PostgreSQL authentication uses additive `auth_challenges` and `auth_sessions` tables, separate from whole-ledger snapshots. Startup requires permission to create these tables and indexes on first use. No production migration was run. Local development without PostgreSQL uses an atomic file in the ledger's directory. That adapter is single-process, has bounded rows and fails on corruption. A PostgreSQL outage never activates it. Production mode or a configured hosted origin requires PostgreSQL.

Hosted requests require `STREAK_PUBLIC_ORIGIN`, an exact HTTPS origin without a path. Session cookies are Secure, HttpOnly and SameSite=Lax. Unsafe hosted requests require the matching Origin and JSON content type; the authenticated Telegram webhook has a narrow exception. Forwarded headers cannot choose the trusted origin. Remote PostgreSQL connections verify certificates. URL SSL flags cannot weaken this policy. See the [node-postgres TLS guidance](https://node-postgres.com/features/ssl) for why connection-string SSL options must not override the explicit configuration.

## Verification and budgets

`npm.cmd run quality:major` passed all **29 runner steps** on 15 October 2026 using disposable PostgreSQL and isolated local services. This includes eight integrated Season browser groups, 18 general preview groups, 32 combined-slip preview groups, eight Rust VM groups and the accounting/client regressions. No required suite was skipped. Commit and push hooks repeat the full gate against the publication candidate.

The recurring runner now builds and checks the frontend, runs TypeScript/React-hook linting, and exercises the integrated app in Chromium and WebKit at 320, 390 and 1440px. Browser cases cover API pagination/search, Monday inclusion, unavailable fixtures, bad/missing data, explicit retry, logo loading/fallback, account errors, failed logout, late navigation responses, keyboard skip navigation and overflow.

The actual CCC connector is exercised with a synthetic signer that produces a real disposable CKB login signature. Its close-before-connected event ordering is covered, as is cancellation. This does not replace testing installed wallets on real devices. PostgreSQL tests cover concurrent challenge consumption, audience isolation, absolute expiry, per-address issuance races, session persistence across pool recreation, revocation and storage failure. Local identity tests cover file-adapter recreation, corruption, conflicting first-login bindings, signed HTTP login and failed logout. TLS tests verify configuration, not a hosted TLS handshake.

The browser makes no wallet/RPC request during market browsing. Wallet code loads only on sign-in. The verified production build was approximately 85 KB gzip for the application JavaScript, 4.3 KB for CSS and 242 KB for the deferred wallet chunk. Queries use one TanStack cache, cancellation, a 15-second request timeout, one automatic retry for market reads and a 30-second visible-tab refresh. Authentication mutations are not retried automatically. The API caps page size at 50; SQL work still reads the existing whole ledger and is not yet a bounded-query migration.

The dependency audit reported 20 low-severity findings in the CCC/JoyID/elliptic dependency tree and no moderate, high or critical findings at inspection. The suggested automatic fix includes an incompatible CCC downgrade, so it was not applied. Dependency review and real-device wallet testing remain rollout requirements.

## Independent review

The independent identity/recovery review identified audience/expiry enforcement, a binding race, hosted fallback, test-isolation ordering, connector close ordering, an account-cache/logout race and incomplete Monday schedule coverage. These were corrected and received targeted regressions. Preserve the remaining limits below rather than interpreting this review as a security audit.

## Rollout and recovery

Build with `npm --prefix products/streak run build`, then run the compiled API with `npm --prefix products/streak run serve`. The generated `/public/season` assets are ignored and must be built for every release. Vite development is available through `npm --prefix products/streak run dev:web`, proxying the local API on port 4100. The deployment declaration is updated for review; no deployment is authorized by this change.

Before a hosted rollout, set the exact HTTPS origin, confirm verified PostgreSQL connectivity and table privileges, and inspect supported wallet bindings without exporting user data. Old in-memory sessions require fresh login. Do not deploy this change over existing JoyID or unsupported/mismatched bindings without an owner-approved recovery path that preserves account IDs and liabilities. Keep the currently deployed version available until access compatibility is verified. Never repair access by assigning an arbitrary wallet address or moving balances.

Keep one API writer. Durable authentication does not make the current ledger, withdrawals or settlement loop safe for multiple replicas. Coordinated source/global abuse controls, bounded SQL mutations, durable jobs, backup/restore rehearsal, real provider coverage, real-device wallet checks and the direct stake-to-claim integration remain ahead. The current per-address challenge limit is not a complete public-endpoint abuse limit.

GitHub Actions could not start because the account is billing-locked. The owner then instructed us to abort hosted CI work. The newly created branch protection was removed. The workflow and local gates remain available; no hosted success, required branch enforcement or deployment is claimed.

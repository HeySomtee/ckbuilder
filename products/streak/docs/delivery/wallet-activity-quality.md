# Wallet and Activity quality pass

20 October 2026. Local changes on top of the Activity release and unpublished Survivor implementation. No public payment, operator startup, commit or push was performed for this pass.

## What changed

- An explicitly selected EVM wallet can restore its exact authorized account after reload. The seven-day hint contains only public provider/address metadata. Restoration uses account discovery, never a permission request or signature. Disconnect, sign-out, changed accounts and revoked authorization remain respected.
- Activity presents verified live positions before historical discovery finishes. Market queries are independent, three discoveries run at once, individual live-cell/history reads are bounded, and repeated canonical reads are deduplicated only within the current observation. An unavailable market cannot prevent collection from another freshly verified market.
- Wallet readiness no longer waits for balance and three separate histories. Funding reconciliation checks reservations only when relevant to selected inputs; every overlapping reservation is freshly checked before broadcast, including other payment stores.
- Claims allow five minutes to begin approval. Approval started within that period can finish later, while identity, exact transaction contents, fees, live inputs and canonical state remain checked. Exact signed bytes are saved before post-sign reads, so an RPC outage does not lose a signed transfer.
- Background claim tracking advances from the newest confirmed claim to older unresolved claims while the recovery section stays closed. Already-confirmed payments stop repeated polling. The wallet balance refreshes after submission and confirmation.
- Animated skeletons and progress stages replace static checking blocks. Informational notices can be dismissed. Selected prediction details stay visible through refresh; both team names and badge fallbacks render, and the close button is centered in a 44px target.
- Survivor admins can delete empty competitions after confirmation. The API checks the verified session wallet against the admin allowlist. PostgreSQL row locks prevent a deletion/admission race from erasing an entry; deletion markers prevent delayed requests recreating a removed game. Competitions with entrants retain their records.

## Verification and limits

Focused checks passed: nine chain-quality tests; four wallet browser journeys; four Activity/refund browser journeys; six Survivor browser journeys; Survivor domain, authorization and disposable PostgreSQL concurrency tests; frontend build and lint. The Activity browser regression includes a newer confirmed claim and an older pending claim, with recovery collapsed, and checks that the older claim continues polling.

With a synthetic 40ms delay per selected RPC, one focused run delivered live positions in 137ms and full history in 254ms, with four transaction reads, one canonical header read and two live-cell reads. These are adapter timings, not a measurement of public CKB confirmation speed.

An anonymous read-only audit of the local patched UI against public API data covered landing, overview, markets, My Account, Activity, Matchday and Clubhouse at 390px and 1440px. All fourteen page checks passed without page exceptions, horizontal overflow or mutations. Screenshots: `.quality-artifacts/quality-public/`.

Independent identity/recovery review found two issues during implementation: shared funding conflict proofs needed a fresh cross-journal check before broadcast, and a confirmed claim could starve older unresolved claims. Both were corrected and reviewed. Survivor deletion authorization and concurrency were also independently reviewed.

All **60 major-gate checks passed at 07:42:14 UTC on 20 October 2026**, using `npm run quality:major` and a disposable loopback PostgreSQL database. Evidence: `.quality-artifacts/quality-pass-major.json` and `.quality-artifacts/quality-pass-major.log`. This includes authorization, database concurrency, browser flows, Rust VM checks and signed local-chain lifecycle/reorganization tests. The working tree remains based on `df147f1`; these changes are uncommitted and unpublished.

Physical MetaMask was authorized by the owner but the existing browser exposes no automation interface; isolated CCC/EVM browser tests are not a physical-wallet test. The hosted deployment remains unchanged. Public-network confirmation latency and the owner's physical-wallet experience still need separate verification.

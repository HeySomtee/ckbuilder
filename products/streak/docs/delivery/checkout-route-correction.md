# Market checkout and wallet continuity

17 October 2026, Africa/Lagos. Uncommitted work based on `07b427c`. Commits and pushes remain paused.

## Failure and correction

The market-detail payment link opened the historical single-market route. An undeployed fixture then used the v3 sponsor offer endpoint, while the running operator only accepts v4 batch offers for new predictions. Its rejection exactly matched the owner's screenshot. The combined slip already supported first-bet creation, but this link bypassed it. Previous component-level tests did not exercise this complete route.

Current market details select into the shared slip. Existing `?direct=` entry links consult the explicit public entry-mode endpoint: an activated atomic deployment uses current market details even when sponsorship is temporarily unavailable. A failed mode lookup has a retry state and cannot fall back to old sponsorship. Explicit legacy deployments retain their older entry path. Activity and saved historical transaction recovery remain intact.

The navigation reconnect control opens the chooser in place and validates the selected wallet against the signed-in account. Slip reconnect does the same. Repeated unchanged EVM account notifications revalidate the existing signer instead of discarding it. Replacement listeners rearm synchronously; real account/network changes still invalidate the connection. Reload requires explicit reconnection, but it no longer requires visiting My Account. Reconnect never signs a payment.

## UI

Cards have a visible View market link. Details use a compact match header, prediction panel and exact published minimum/storage amounts. The owner's subsequent chart correction replaces the first slider design with a Polymarket-inspired line chart: coloured outcome values, a right-side percentage axis, time labels, a hover/touch crosshair, keyboard inspection, outcome emphasis and 1H/6H/ALL windows.

Initialized markets show current Home/Draw/Away pool shares on market cards, Overview rows and the match page. These come from the active contract generation, not the old application ledger. Principal for a side divided by all eligible principal determines its percentage. Sponsor reserves and position storage are excluded. Accepted entries count; pending entries count only when their canonical creation-block timestamp precedes kickoff. Closed totals come from the live settlement reserve. Values use integer shannons and basis-point division before display rounding. They are pool shares, not fixed payout odds.

The API's optional read model coalesces work, limits concurrent readers to four, bounds the cache to 512 markets and keeps at most 180 observed points per market. Fixture cards render independently of statistics. A failure never becomes a fabricated zero; current percentages disappear when observations are stale. The graph identifies delayed historical observations. History begins when observed and is held in memory, so API restart resets it. Settlement reserve recovery can remove the closed-total source. A durable historical indexer remains future work.

Blue informational cards and amber attention cards replace red alert styling. Payment preparation explains what is being checked; failures preserve the slip and offer the relevant retry. Clear-slip confirmation distinguishes saved picks from submitted payments and makes Keep predictions the prominent action.

## Verification

The new mandatory `scripts/checkout-browser.cjs` lane uses the built application, its real routes, CCC EIP-1193 personal signing and a synthetic isolated chain. It starts from a visible market-card link, reconnects inside the slip, creates a market with the first payment, then pays for an existing and a new market together without reconnecting. It covers old entry links, unavailable routing, chart keyboard inspection and absence of obsolete offer requests. Chromium and WebKit run at 390 and 1440px. The separate wallet lane covers unchanged account events, rapid replacement, replacement during signing and prevention of obsolete authentication proofs.

Independent source review by `checkout_review` identified a stale-mode blank screen and a replacement-listener timing gap. Both were corrected and re-reviewed with no remaining payment/identity/recovery blockers. This review is separate from test execution evidence.

The pool-data follow-up received independent review. Corrections prevent older contract pools from pricing a fresh atomic entry, make statistics independent of fixture rendering, and enforce observation-age limits. Only the active registry branch is read. Focused tests cover principal and cutoff math, live closed reserves, missing reserves, shared requests, failure retention, recovery and fair four-reader scheduling. Browser checks delay statistics while requiring fixture cards to appear, compare card/detail percentages, inspect chart history and suppress stale current values.

The integrated tests initially exposed two outdated screen assumptions: an ambiguous generic market-link name, corrected in the UI with a specific accessible team-link name, and historical sponsorship copy removed by the new detail page. The historical fixture now explicitly declares legacy mode and waits for the new prediction heading. Its exact accounting, signature, persistence, unchanged-byte recovery and claim assertions remain intact. This fixture correction also passed independent review and all four focused browser journeys.

All **50 checks passed at 09:54:32 UTC on 17 October 2026** in the final combined checkout/chart gate, using `node scripts/quality/verify.mjs all` with an isolated loopback PostgreSQL database. Evidence: `.quality-artifacts/checkout-chart-major.json` and its log. This includes the full-app EVM payment/chart journey, historical recovery, Rust VM checks and signed local-chain lifecycles. Final static checks also passed. These tests use synthetic identities and do not spend from the owner's wallet or establish a public testnet payment.

Separate read-only checks used the running local API and actual provider logos. The selected Real Madrid versus Sevilla fixture was available for sponsored first entry. Desktop and phone captures at 390, 1279 and 1440px passed with zero page errors, horizontal overflow or writes, including old entry URLs and clear-slip retention. Evidence is in `.quality-artifacts/checkout-live/results.json` and its adjacent screenshots. Public testnet cell inspection found six plain operator cells totalling 7,697,143,964,641 shannons, or 76,971.43964641 tCKB, at the time of the check. Capacity can change as other operations proceed; this observation is not a reservation or a payment proof.

Earlier Five, direct notification, physical-wallet and durable-operation commitments remain open.

After local API activation, its current atomic registry contained zero initialized markets. The selected Real Madrid fixture correctly returned `uninitialized`, with first-bet sponsorship available. Actual pool percentages will appear after an initialized market has confirmed eligible principal. No user payment was created just to populate this chart.

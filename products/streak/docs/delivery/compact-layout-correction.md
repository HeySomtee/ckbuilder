# Compact layout correction

17 October 2026. Local, uncommitted work on `feat/streak-direct-testnet`, based on `07b427c`. The owner has paused commits and pushes.

## Requested behavior

Make the application at 100% browser zoom closer to the owner's preferred 80% view. Keep the desktop navigation within the viewport and remove the "Your next chapter" promotion.

## Implementation

- A 180px desktop rail holds all seven destinations with 44px targets and no internal scrollbar. Short windows at 460px height or below use the bottom navigation and More dialog. The dialog can scroll when needed; no navigation item is clipped.
- Shared body type is 12px and page titles range from 24 to 28px. Smaller horizontal gutters, card padding, radii and headers leave more room for content. Browser zoom remains native.
- The shorter Five hero and compact overview fixtures let a complete first match fit at 1279 by 663px. Desktop outcome controls and the details link share a row; phones stack them for legibility.
- Markets, match details, My Account, activity, the slip and public landing share the tighter spacing. Primary controls retain their touch targets. Payment values, account state, fixed Add matches and the opaque slip dock retain their existing behavior.

## Verification

The maintained account/navigation browser suite now checks sidebar overflow, every destination's viewport bounds, navigation after page scrolling, short-window fallback and page reflow in Chromium and WebKit. Profiles include 1279 by 663, 1024 by 600, 1024 by 461, 900 by 460 and 640 by 450, alongside the existing 320, 390 and 1440px interaction journeys. The 640 by 450 profile checks reduced layout space comparable to zooming a 1280 by 900 desktop to 200%; it is not a claim of an automated native browser zoom check.

Read-only local checks capture Overview, Markets, My Account and the landing page at 390, 1279 and 1440px. This uses actual provider data separately from isolated tests and blocks write requests. Evidence is under `.quality-artifacts/density-live/`. No user signatures, payments or Telegram messages are generated.

All **48 major-gate checks passed**, finishing at **2026-10-17T07:08:19.971Z**. Evidence is in `.quality-artifacts/density-major.json` and `.quality-artifacts/density-major.log`. The account/navigation lane passed ten viewport profiles plus six existing interaction journeys across Chromium and WebKit. The complete gate also passed database, account, Telegram, wallet, combined-payment, Rust VM and signed local-chain regressions. The owned disposable PostgreSQL container was stopped and removed after completion; the local app remains running. The broader Five implementation, direct settlement notifications, physical-wallet checks and durable hosting remain open.

The first complete attempt exposed a timing race in the combined-payment browser test's held-request/account-switch sequence. A negative pending-text check could restore the original account before validation resumed. The corrected test observes pending first, then waits for the enabled review button before restoring identity. Existing assertions still require zero new offers and no extra signing. Independent review confirmed the test-only change; no production payment code changed. All four focused combined-payment journeys then passed. The earlier failure is retained in `.quality-artifacts/density-major-test-race.log`.

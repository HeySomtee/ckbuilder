# Compact market filters and quiet startup

1 November 2026. The owner approved the
[interactive preview](../../design/mobile-markets-review/README.md) before integration.

The mobile market page now groups its status tabs, search, league and sort controls
inside one restrained glass panel. At 700px and below, league and sort share a row and the
four status tabs remain together. Repeated visible labels are removed while
accessible names remain. Search has a clear action that retains input focus.
Result count and refresh information sit outside the control panel. At the owner's
explicit request, desktop retains its original layout, labels and pill buttons.
Existing API queries, pagination, selection and empty-state recovery remain authoritative.

The splash contains only the approved animated wordmark. There is no Open Streak
button, progress copy or recovery action inside it. Escape remains available once
the app mounts. The two-second presentation, background shell/data startup,
reduced-motion bypass, hidden-tab behavior and missing-artwork bounds remain.

## Why the recovery controls flashed

The initial HTML rendered retry and Wallet links visibly before the startup
controller downloaded and hid them. A delayed-controller reproduction showed
this in Chromium and WebKit without a real load failure. Initial inline CSS now
hides the separate recovery surface before any external scripts execute.

Confirmed application bundle failures show a separate recovery screen. A ten-second
timeout offers the same recovery if startup stalls. An independent CSS watchdog
preserves ordinary retry/Wallet links even when the controller and entry scripts
fail. A late controller retains already visible recovery; eventual shell readiness
removes it and restores input/focus. Landing routes never show the brand reveal.
No-JavaScript guidance remains available. Unrelated injected-script errors no
longer trigger the application startup error screen.

This reproduces and fixes a concrete first-paint flash path; the exact fleeting
message seen on the owner's device was not captured.

## Verification and boundaries

The complete `npm run quality:major` passed all 79 required checks on Node 24.14.0,
1 November 2026, 07:32:05 to 08:17:57 UTC, exit 0. This includes 64 startup and
26 integrated Season browser groups. Source hashes matched both the original
workspace and isolated gate candidate. Final evidence-only documentation updates
are checked separately; runtime files are unchanged after the gate.

The receipt and log are under
`.quality-artifacts/release-nov1-dropdowns/.quality-artifacts/nov1-mobile-startup-major.{json,log}`.
The source manifest is `.quality-artifacts/nov1-mobile-startup-source.json`.
An initial root run stopped on formatting in the owner's unrelated acceptance
checklist. The clean candidate preserved that file instead of changing it or
waiving the check. Runtime `cf81620` was subsequently pushed to GitHub main at the
owner's request. Normal hooks reused the exact-tree receipt. Hosted deployment
has not been verified; hosted CI remains paused.

The Season browser checks cover the real controls at 320/390/768/1440px in
Chromium and WebKit, including side-by-side selectors, touch sizes, search clearing,
filter recovery and navigation. Startup coverage retains its existing failure,
timing, input, no-JavaScript and landing checks, replaces the retired visible-skip
assertions, and adds delayed-controller first frames, unrelated errors, all-script
failure and late-controller recovery. Browser fixtures use local synthetic data
and blocked external services. Physical wallet-browser acceptance is separate.

Final gate and release status are recorded in [status](../../status.md) and the
[work tracker](../work-tracker.md). Physical wallet-browser acceptance remains separate.

# Approved logo and startup integration

29 October 2026. The owner approved the revised On form identity on 28 October,
then requested a longer splash after the fast-start correction was too brief.

The live application assets now use the chart-shaped r and permanent connected
cells beneath it. Existing brand URLs remain stable; the standalone s and
favicons are unchanged. Regenerate the approved assets with
`node products/streak/design/brand-review/publish-approved.cjs`.

Season now gives the two strikes, chart-r and connected cells a
two-second presentation from the loaded logo's first paint, then fade for 260ms.
The shell mounts and starts data reads underneath. Covered controls are inert;
once ready, Open Streak or Escape skips the presentation and restores access.
Slow bundle loading counts toward the reveal instead of adding another delay.
It never waits for a wallet, session, API or chain read. In-app navigation never
replays it. The account-scoped Activity warmup still runs independently.

29 October landing correction: `/`, `/welcome` and `/welcome/` never show the
splash or block input. Critical inline CSS excludes these routes before paint,
even with a missing stylesheet or controller. Landing failures retain plain
retry/Wallet links, with focus returned to the mounted page after recovery.
Only `/season` and its app paths use the animated startup.

The final combined frontend build, lint and all 58 isolated Chromium/WebKit
startup groups passed at 06:03 UTC. Landing aliases, held bundles, missing
controller/style combinations, no JavaScript, focus and all existing app timing
checks passed. Evidence: `.quality-artifacts/startup-landing-browser.log`.
Independent review accepted. This supersedes landing splash behavior below.

Reduced motion, background tabs and React error recovery bypass the presentation.
An absent or stalled logo cannot hold a ready shell for more than one second.
Missing or failed startup-controller downloads retain the shell's independent
removal and input-unlock fallback. Exit cleanup stays bounded at 500ms even when
animation events do not fire. A focused skip/recovery control returns focus to
the app root. Slow-bundle retry and ordinary Wallet links remain available.

29 October verification completed at 05:40 UTC: all 38 isolated Chromium/WebKit
groups, frontend build, lint and syntax checks passed. The browser lane checks
actual first-frame pixels, two-second timing, background mounting/data reads,
skip/Escape focus, blocked click-through, slow and missing artwork, failed and
missing controllers, reduced motion, hidden tabs and React error recovery.
Evidence: `.quality-artifacts/startup-duration-browser.log`. Independent review
caught an extra fade after the missing-artwork timeout; it now removes immediately
at the one-second bound. The mobile render was visually inspected. Local port
4100 serves the rebuilt shell and updated controller with HTTP 200.

This timing correction supersedes the earlier immediate-release policy below.
It has scoped verification, not a new full-gate receipt. No commit, push or hosted
release is included. Production tests remain unperformed and are deferred until
the candidate is frozen, as recorded in the [test plan](hosted-acceptance-plan.md).

Earlier 28 October correction: the owner reported an invisible splash on fast
local startup. Previously React
could remove it before the first paint, while the SVG began transparent and
delayed its main lettering for a second. The exported startup variant now has
visible artwork immediately, compressed drawing motion and an early image
preload. The design review keeps its slower demonstration. Reduced motion and
background tabs remove the splash immediately on shell readiness.

Fast-start correction verified at 16:02 UTC on 28 October: frontend build, lint,
formatting and all 20 focused Chromium/WebKit groups passed. The added checks
observe actual first-frame logo pixels and pointer/keyboard access while the
decorative exit remains. API responses stay blocked throughout these checks.
Evidence: `.quality-artifacts/startup-fast-fix-browser.log`. The local service
serves the updated assets with revalidation; no service restart is required.
This cosmetic correction has scoped verification, not a new full-gate receipt.

Reduced motion selects the final static wordmark. Slow startup offers recovery
after ten seconds; a failed application bundle offers it immediately. Ordinary
reload and Wallet links remain available if the startup controller itself fails.
JavaScript-disabled browsers retain an explanation and legacy recovery links.
That earlier correction introduced no data read, transaction, wallet permission
or minimum delay. The later two-second presentation changes only the last point.

The mobile topbar now uses the same real wordmark, replacing its text-only pseudo
element. Both desktop and mobile links return to Overview.

Focused verification passed 18 Chromium/WebKit groups at 320/390/1440px, including
an interactive shell while every API response remains blocked, failed-module
retry, missing-controller recovery, reduced motion, no JavaScript, legacy hash
redirects and focus restoration. Static assets also passed independent visual
review. Two harness sequencing issues, screenshot font readiness while the entry
was deliberately held and a request-count assertion before React's passive
effects, were corrected; failure logs remain. The original missing-bundle Season
test now expects the approved recovery status and retains its working Wallet
navigation assertion.

The required major gate report records all 72 checks passed at 10:11:39 UTC,
including the final Five signed-chain and interactive rehearsal checks. Evidence:
`.quality-artifacts/startup-integration-major.json` and its `.log`; browser
captures are under `.quality-artifacts/browser/startup-integration-*`.
PowerShell returned wrapper status 1 because it converted Vite's external-script
warning to `NativeCommandError`; the gate's per-check statuses and final report
are passed with no failed check. Preserve both observations rather than calling
the wrapper exit successful. The actual startup assets are served separately by
the API, as intended. Final formatting/static checks also passed.

Local port 4100 refused the
separate static delivery check; no operational app service was restarted.
This is local implementation, not publication or hosted/physical-wallet acceptance.

The owner separately requested a [linked-cell loading signature preview](../../design/loading-signature-review/README.md)
for the rest of the app. That remains preview-only. The event-driven Activity
index was subsequently approved and completed locally; see its separate
[delivery record](event-driven-activity.md).

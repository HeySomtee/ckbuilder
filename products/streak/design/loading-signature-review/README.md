# Connected loading signature preview

29 October 2026 refinement. The owner requested two loading motions drawn from
the three connected cells inside the approved wordmark.

Run `node products/streak/design/loading-signature-review/serve.cjs` and open
<http://127.0.0.1:4199/>. This is an isolated design preview, not the application.

The enlarged studies show both motions, followed by examples at actual UI sizes:

- Circular: three connected square cells rotate as a cluster over 4.8 seconds,
  with a gentle 2.4-second scale and opacity pulse. Used in prepare/refresh controls.
- Horizontal: three cells follow a 2.4-second sine wave while their links draw
  between them. The link endpoints follow the cells throughout the wave. Used
  in page loading, wallet approval and minimized background status.

Home/Draw/Away reflections stay subtle. This is indeterminate motion, not a
confirmation count or progress meter. Native SVG animation and CSS handle the
movement without a JavaScript frame loop. Pause freezes both kinds; hidden tabs
pause them too. Reduced motion shows aligned, static cells with complete links.

The preview shows a compact payment button, wallet-approval button, Activity
refresh with retained rows, first-load game panel and expandable minimized
payment status. The dock illustrates a signed payment awaiting network
confirmation, distinct from the preparing and wallet-action button examples.
State controls explicitly select loading, taking longer, attention and completion.
Success is never triggered by a timer. Retry restarts the illustration. Terminal
states stop the motion, keep the studies static and show contextual status icons.

The wordmark is copied from the approved application SVG. All visible matches,
balances, payments and statuses are illustrative. No API, wallet, provider,
database, chain request or persistent state is accessed. The loopback server
serves only the preview HTML and SVG and blocks network connections through CSP.

Earlier 28 October verification: Chromium and WebKit checks passed at 320, 390 and 1440px: local asset loading,
all four preview states, overflow, retry, expanded status, focus restoration,
checkbox and operating-system reduced motion. Desktop and 320px renders were
visually inspected. Evidence: `.quality-artifacts/loading-signature-browser.log`
and `loading-signature-{engine}-{width}.png`. The later Active-tab label counts
the two open predictions and the one ready refund together.
Independent visual/source review accepted the consistent geometry and terminal
states; its suggested distinction for the signed-payment dock is included.

No runtime integration, commit, push or hosted deployment is included.

29 October verification completed at 07:46 UTC: all eight groups in
`node products/streak/design/loading-signature-review/browser.cjs` passed across
Chromium/WebKit at 320, 390 and 1440px, plus operating-system reduced motion.
Checks measure actual rotation, gentle scaling, staggered wave motion, attached
link endpoints, link drawing, pause/resume, hidden tabs and preference changes.
They also cover terminal states, preserved rows, focus, overflow and zero API or
external requests. Mobile and desktop screenshots were visually inspected.

Evidence: `.quality-artifacts/loading-signature-refinement-browser-final.log`
and `loading-signature-refinement-{engine}-{width}.png`. Earlier failed logs
remain: pause assertions now wait for the CSS pause frame to commit; a Chromium
SVG timing issue after changing the OS motion setting was fixed with one
initialization frame. The animation itself has no JavaScript frame loop.
Script syntax, formatting and scoped documentation/security policies passed.
Approved by the owner on 29 October for integration across the application.
The shared runtime uses `public/cell-loader.js`, `public/cell-loader.css` and the
React `CellLoader` component. This isolated preview remains the motion reference.

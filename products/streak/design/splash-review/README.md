# On form. On chain: startup and identity preview

Approved by the owner on 28 October 2026 and now integrated locally. See
[application behavior and verification](../../docs/delivery/startup-identity.md).
The preview remains available for replaying the full motion and simulated states.
The actual app opens as soon as its shell is ready and may finish sooner.

28 October 2026. Owner requested an animated splash-screen preview before
implementation. Open <http://127.0.0.1:4198/> after running
`node products/streak/design/splash-review/serve.cjs` from repository root.

The second proposal follows the owner's specific direction: two opposing strokes
cut the s, a rising/falling price line draws the r, and a square cell settles as
the final dot. Following the owner's next refinement, three connected cells now
occupy the space beneath the chart-r and remain part of the static wordmark.
Their subtle Home/Draw/Away colours reference predictions and CKB's cell model.
The footer names Nervos CKB. Motion suggests the
product's chain and prediction context without pretending to confirm a payment.

The r is a proposed custom letter rather than a copied Polymarket mark. The word
still reads as streak, including in the static header-size samples below the
preview. Download the proposed SVG there; light and single-colour examples are
also visible. `build.cjs` generates final dark/light/monochrome wordmarks, the
standalone s and animated SVG. Approved assets are published into `public/brand/`
by `../brand-review/publish-approved.cjs`; archived concept exports remain separate.

Quick start, slow connection, interrupted connection/retry and reduced motion
can be reviewed. Animation draws once; the three cells assemble beneath the r
and stay fixed afterward. A quiet moving line indicates loading separately,
replacing the duplicate row of cells below the logo.
Reduced motion uses the completed static SVG. The completed app shell is an
illustrative design, not the real application.

Production proposal: show this only during initial shell startup, never on
every route change. Do not introduce a minimum artificial delay, wait on wallet
connection or block the shell on chain/provider reads. Those should retain their
own inline progress and recovery. The preview's timers only demonstrate states.
The approved integration follows this behavior and includes bundle-failure recovery.

This isolated preview calls no API, wallet or external asset. It makes no game,
payment or persistent-state changes. Source geometry builds on the original
On form assets. The loopback server serves only HTML and SVG within this folder.

Chromium and WebKit checks passed at 320, 390 and 1440 pixels: loaded wordmark,
no horizontal overflow, interrupted-state retry, completion and reduced motion.
Second-proposal screenshots at `.quality-artifacts/splash-v2-{engine}-{width}.png`
were inspected. The localhost preview runs in a separate background process;
an initial check encountered its stopped first-preview server, then passed after
starting the dedicated preview server. No app/API service restart was needed.
An initial ad hoc check incorrectly waited for an already-hidden finished splash
to become visible; correcting the check to wait for its finished class passed
in both engines without changing the transition behavior.

The third refinement retains the cells in every full wordmark export, including
the reduced-motion final frame. Independent visual review accepted their spacing
and legibility in the 210px and 115px samples. Chromium and WebKit checks passed
again at 320, 390 and 1440px, including all full-wordmark variants, loaded images,
overflow, retry/completion, checkbox and operating-system reduced motion.
Updated screenshots are `.quality-artifacts/splash-v3-{engine}-{width}.png`;
mobile and light/monochrome renders were visually inspected. Architecture implementation is
paused while the owner reviews the separate proposal.

The earlier preview-only evidence above predates integration. No commit, push or
hosted deployment is included in this approval follow-up.

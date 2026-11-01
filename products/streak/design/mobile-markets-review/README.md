# Mobile markets and quiet startup preview

1 November 2026. Approved by the owner. Application integration is documented in
[the delivery record](../../docs/delivery/mobile-markets-startup.md).

Run `node products/streak/design/mobile-markets-review/serve.cjs`, then open
[the local preview](http://127.0.0.1:4197/). On desktop, the design notes sit beside
a phone-sized view. On mobile, the proposal fills the viewport. Replay intro is
a preview control outside the splash; the splash itself contains no buttons.

The proposal groups status tabs, search and two equally sized league/sort controls
inside a subtle glass panel. Repeated field labels disappear visually while
accessible names remain. Fixture count and illustrative freshness sit below the
panel. Search, statuses, reset, league filtering and sorting work on synthetic
fixtures. The preview reuses the production in-page select adapter and approved
wordmark animation. It makes no API, wallet or payment calls.

The intro reveals the logo without progress text or actions and automatically
exits. Reduced motion uses the static logo; Escape and hidden-tab transitions
release the sample screen. Artwork failure has a bounded exit.

## Startup flash investigation

The existing `web/index.html` initially renders `streak-startup-actions` without
`hidden`. The bottom-of-document `public/startup.js` hides it only after that script
downloads and executes. Holding that script for 1.2 seconds while serving the real
HTML/CSS reproduces visible Try again and Open current Wallet links before the
controller starts, in both Chromium and WebKit, without a runtime failure.
This establishes a real flash path, but cannot identify an unseen user message
with certainty. The landing fallback is also initially visible and needs first-paint
coverage when this is implemented.

Integration should hide recovery controls before the first paint, remove the
visible Open Streak skip button, and move actual startup failure/timeout recovery
to a separate screen after the intro. Preserve no-JavaScript and missing-controller
recovery, reduced motion and ordinary landing rendering. Do not merely suppress
real errors or leave the app covered forever. Production startup files are unchanged
in this preview increment.

## Verification

Eight preview journeys passed: Chromium and WebKit at 320, 390, 430 and 1280px.
Checked search/clear, league/sort changes, status/reset, empty states, no horizontal
overflow, intro replay/automatic exit, disabled background interaction and no
actions inside the splash. No page errors. Captures were visually reviewed.
The two production-HTML flash reproductions both showed recovery controls before
the delayed controller and hid them afterward. Evidence is local under
`.quality-artifacts/mobile-markets-*` and `startup-flash-before-controller-*`.
This is synthetic preview evidence, not physical Zerion or deployed acceptance.

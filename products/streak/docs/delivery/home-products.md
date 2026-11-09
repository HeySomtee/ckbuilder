# Home feature and competition carousels

7 November 2026. Replaces the Five-only Home promotion after the owner's request
to make active competitions and Survivor equally discoverable.

## Behavior

- Visible Overview navigation and breadcrumbs now say Home. Existing
  `?view=overview` links continue working.
- Explore Streak contains Predictions, Five and Survivor. A separate Competitions
  carousel contains open, live and finalizing events. Each row scrolls independently.
  Draft, deleted and finished events stay outside that row; View all opens the
  existing directory. With no active events, it shows "Watch out for competitions
  coming soon." Loading and failed reads never show that empty-state promise.
- Cards show short descriptions, state and a direct route into the existing
  product. Competition prize amounts use exact integer formatting. Rehearsal
  awards remain labelled as tests. Custom banners are dimmed behind the text;
  missing or failed artwork uses the Streak logo.
- Native horizontal scrolling supports touch and trackpads. Labelled arrow
  buttons and keyboard arrows/Home/End provide alternatives. There is no
  automatic rotation. Reduced motion removes animated scrolling.
- All three feature cards fit together on desktop, with controls hidden when
  scrolling is unnecessary. Short desktop screens use tighter spacing; a complete
  match row remains visible below the two sections when competitions are empty.
- Core products remain usable while competitions load or fail. A compact retry
  appears in the competition panel. New competition membership resets its row to
  the start without moving the feature row.

## Data and scope

Home reuses the app's existing account-scoped competition list. It introduces no
endpoint, interval, database write or worker. Existing viewer checks reject stale
account responses. Payment, squad selection, registration and settlement use the
existing routes and operations. No deployment configuration is required.

## Verification

The existing campaign browser suite now covers Home in Chromium and WebKit at
320, 390 and 1440px: delayed/failed/empty lists, stale viewer rejection, active
states, exact route destinations, native scrolling, keyboard controls, no added
polling or automatic rotation, long titles and broken/custom artwork. Existing
account-navigation and startup expectations use the Home label.

Initial checks caught native scroll anchoring after the delayed list arrived;
the implementation now resets when membership changes. A browser assertion also
needed to wait for the scroll event's animation-frame update before checking the
arrow's disabled state. The delayed-response harness now waits for its held
request before releasing it; WebKit could render the loading label before that
request arrived. These failed attempts are not treated as passing evidence.
Full-document fixture navigation also waits for the existing Activity prefetch
before tearing down its intercepted WebKit network context. The first full gate
found that the carousel displaced the first match row at 1279 by 663px. The
layout was tightened; the original density assertion remains unchanged.
The owner then requested separate carousels. The superseded full-gate rerun was
stopped, and final verification uses the split layout, independent controls and
confirmed-empty message. No interrupted run counts as a successful gate.

Final verification passed all 96 stages of `npm run quality:major` on 7 November.
The final runtime and test files match the recorded hashes in
`.quality-artifacts/home-runtime-manifest.json`; the complete run is archived as
`home-final-major.json` and `home-final-major.log`. Local screenshots and synthetic
test data are under `.quality-artifacts/campaigns-runtime/`. These are not hosted
or physical-wallet acceptance. This increment has not been pushed.

The final-layout gate first stopped on an immediate WebKit focus/visibility
assertion. Waiting for the focused link's scroll position, while keeping the same
touch-target bounds, passed all six focused navigation journeys. The next full run
stopped on intercepted campaign reads during a test-only document reload. The
fixture now waits for those in-flight reads before navigation; errors are not
suppressed. Both failed full runs remain recorded as failures. The owner checklist
was restored byte-for-byte after each run.

A subsequent full attempt reproduced the refresh failure in the nested artwork
continuation, whose direct reloads had not used the synchronization helper. That
continuation now receives the same navigation helpers. This third failed attempt
also remains recorded; it is not counted as successful verification.

The following full run passed with both navigation fixes. No browser exceptions
were suppressed and no visibility or density assertion was weakened. The owner
checklist's original SHA-256 was preserved:
`3aef043493c49fe66903d9240a2a0eadec0fd6c7bd52bff1d9021137cef3fb6d`.

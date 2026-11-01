# Connected loading signature

1 November visibility correction: disabled button opacity was multiplying the
cells' own fade, making pending work difficult to see. The shared stylesheet now
keeps disabled buttons containing a loader at full compositing opacity. Cells and
links inherit the control's contrasting foreground, with thicker outlines and a
higher pulse floor. Standalone panel loaders keep their three-color signature.
Native disabled behavior is unchanged; unavailable controls without a loader stay
dimmed. Both the React wrapper and bare legacy SVG use the same rules.

The existing browser matrix now checks nine real-theme button variants, including
coral/lime fills, dark secondary actions and destructive controls, at 390/1440px
in Chromium/WebKit. It measures cell-stroke contrast at the lowest pulse level,
accounts for gradient stops, verifies reduced motion and rejects duplicate clicks.
The actual payment approval journey also checks its held pending button and captures
it for visual inspection. Evidence is generated as `cell-loader-button-contrast.json`
with the browser screenshots; release verification is recorded in [status](../../status.md).

Owner approved the refined preview on 29 October 2026 for application use.

The same three cells now identify pending work in Season and the retained legacy
pages. Buttons and compact controls rotate and gently pulse; wider loading
panels use a sine wave with links attached to the moving cells. Shared geometry,
colors and lifecycle live in `public/cell-loader.js` and `public/cell-loader.css`;
React uses the `CellLoader` wrapper.

Coverage includes market and league refresh, wallet connection and balance,
prediction review/approval/recovery, the minimized payment tracker, Activity,
Five/player profiles/sponsorship, Survivor/admin actions, local test controls,
legacy Matchday and initial application startup. Landing pages still bypass
the splash. Status wording and operation outcomes remain controlled by their
existing requests. Skeletons preserve layout while records arrive.

Reduced motion displays three still, linked cells. Hidden tabs pause both CSS
and SVG animation. Completion, failure and unmount release animation listeners.
The wave uses native SVG timelines with one startup frame, not a JavaScript
animation loop. Error and ready states do not pretend to be pending.

Focused verification passed on 29 October: six Chromium/WebKit motion groups
and eight real application loading states at 390/1440px. Checks cover exact
three-cell geometry, attached wave links, rotation/pulse, reduced-motion changes,
hidden tabs, cleanup/remount and held API reads in the built Season and legacy
pages. Screenshots were inspected. Frontend TypeScript/build, scoped lint and
static source policies passed. Independent lifecycle review found and corrected
detached legacy registrations; the regression is included in the browser suite.

The complete local release gate remains required for the final staged tree.
Its actual outcome is recorded in the publication commit's validation notes.
Synthetic browser checks do not establish hosted or physical-wallet performance.
Publication is authorized with GitHub CI omitted. Earlier publication
interruptions are retained in local evidence.

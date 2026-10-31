# Mobile wallet and payment controls

30 October 2026. Local UI correction; not published or physically tested on a phone.

The mobile header uses two rows: brand and a single-line account action, then
balance and copyable address. Sign in stays short visually while retaining its
full accessible label. Transient authentication errors have a close control.
Wallet balances in the header and My Account show two decimals rounded down;
integer shannon values remain unchanged for payments and recovery.

Pending payment updates cannot be dismissed. On mobile they minimize to a 56px
button using the shared three-cell loader. Tap to expand, use the minimize
control or Escape to collapse. Unresolved recovery remains available; confirmed,
unsent, resolved and discarded updates can close. Closing changes presentation
only, preserving picks, signed records and background monitoring.

Drag the minimized button to snap to a corner, or use arrow keys while focused.
Placement respects the visible viewport and safe areas, leaving space around the
header, saved-slip dock, mobile navigation and dialog panels. Native modal dialogs
temporarily hide the button; closing them restores it. Resize, scroll and layout
events update placement without an interval. The chosen corner lasts while the
component remains mounted. Expanded details retain their regular panel layout.

Independent recovery review accepted the implementation, including the explicit
terminal flag that prevents finished recovery records from becoming permanent
pending buttons. Test coverage includes geometry with blocked corners, phone
header widths, failed/successful dismissal, pending expansion/minimization,
Chromium touch dragging, WebKit pointer dragging, keyboard corners, resize,
dialog restoration and continued payment confirmation. All wallets, fixtures and
transactions in these checks are synthetic.

The final review also corrected a mobile match-card rim: nonsticky cards now
retain relative positioning so their decorative border stays inside the card's
containing block. The no-horizontal-overflow browser assertion is unchanged.
A checkout rerun timed out because its synthetic response remained deliberately
held during drag gestures. Its response deadline now starts immediately before
releasing that response, without extending the timeout or changing app behavior.

Evidence is under `.quality-artifacts/oct30-mobile-*` and
`.quality-artifacts/checkout-browser/`. Final verification results are recorded
in the work tracker. The prior 76-check disconnect receipt predates this UI
change and is not a release receipt for it. The complete required release gate
remains due before commit/push; physical wallet acceptance remains separate.

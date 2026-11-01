# In-page dropdowns

Owner request, 1 November 2026: dropdown fields do not open reliably inside the
Zerion mobile browser. Replace the platform popup with a compact menu rendered
inside Streak. Use smaller interface text and restrained glass while keeping
large touch targets.

## Behavior

- League, sorting, gameweek, Survivor entry mode and local scenario choices share
  the same visual treatment. Retained pages use the same control styles.
- Opening a menu shows the current selection with a check. Choosing a row updates
  the existing filter or form; it does not submit a form by itself.
- Arrow keys and typeahead move through available choices. Enter selects;
  Escape closes without changing the value. Disabled choices cannot be selected.
- Menus fit the visible viewport and scroll internally. Controls inside a dialog
  keep its focus boundary, so closing a dropdown does not dismiss the form.
- The 13px system text is compact; primary touch targets remain at least 44px.
  Glass has an opaque fallback, visible focus and forced-colours support.

This changes presentation and input handling. It does not change wallet identity,
market eligibility, game deadlines, prices, payment reviews or server validation.

## Verification

The shared browser regression exercises the actual control in Chromium and
WebKit with desktop and touch viewports. Existing market, Five, Survivor and local
game-mode journeys verify the values still reach their original feature handlers.
Results and publication status are recorded in the work tracker and release
commit. These synthetic browser checks are separate from acceptance inside a
physical Android Zerion app; that device-specific result must not be inferred.

Keyboard semantics follow the
[W3C select-only combobox guidance](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/).

# Streak identity review

28 October 2026. **On form is the owner-selected Streak identity.** The owner
approved the newer chart-r refinement with three permanent connected cells
beneath the r and the two-strike splash animation. Current artwork is in the
[splash review](../splash-review/README.md). The original three-direction studio
below is retained as design history; its exports are not the current wordmark.
The approved identity is integrated locally into the application. The
standalone review uses no wallet, database, API, external font, tracking or
provider connection.

Owner refinement: the full word **streak** is the primary logo. The custom
mark replaces the initial s and sits on the same baseline and lowercase height
as **treak**. Do not prepend a separate symbol to an already complete wordmark.
Use that same s alone for favicons, avatars and other insignia placements.

Run `node products/streak/design/brand-review/serve.cjs` and open
<http://127.0.0.1:4197/>. `index.html` also works as a local file. Select a
direction, switch the logo between light and dark, inspect actual favicon
sizes and download the matching pack. [Contact sheet](comparison.png).

## Directions

1. **Breakaway, alternative:** a bold split S with rounded turns and a diagonal break.
2. **Touchline:** a continuous curved S inspired by pitch-line geometry.
3. **On form, selected:** a segmented s carrying the original three-part winning-run idea.

All three use bespoke outlined lowercase lettering and the existing coral,
graphite and off-white palette. Wordmarks do not require installed fonts.
The geometry is authored in `build.cjs`; no stock logo or image tracing is used.

## Assets and regeneration

Each `assets/<direction>/` folder contains:

- Dark, light and monochrome SVG wordmark lockups.
- Standalone coral and monochrome SVG marks.
- SVG and two-size PNG-backed ICO favicons.
- 16/32 px PNG favicons, 180 px touch icon and 512 px app icon.
- A ZIP package of those assets.

Run `node products/streak/design/brand-review/build.cjs` to regenerate SVGs
and the review page. With the local server running, run
`node products/streak/design/brand-review/export.cjs` to render icons,
screenshots and check preview behavior using the repository's Playwright.
Rebuild the ZIP files after changing assets.

Chromium checks cover all directions at 320, 390, 768 and 1360 pixels, no
horizontal overflow and favicon updates. Mobile WebKit covers selection and
the light background. Desktop and mobile renders were visually inspected;
the original mark's counters were opened up after the first review.

## Application integration, 27 October 2026

Season's sidebar and landing header/footer share `web/src/components/brand.tsx`.
Retained legacy headers, landing pages, loading mark and footer use the same
identity. `public/brand.css` controls responsive sizing. Full wordmarks contain
the initial s; never add a second insignia beside them.

Published assets live in `public/brand/` with the `on-form-` prefix. Dark,
light and monochrome wordmarks are available. Both application entry documents
declare SVG, PNG and ICO favicons plus the 180px Apple touch icon. `public/mark.svg`
retains a compatibility copy of the standalone s. The 512px icon is available
for future app placements; this does not add PWA installation behavior.

To refresh the current application artwork, run
`node products/streak/design/brand-review/publish-approved.cjs`. It rebuilds the
approved splash-review geometry and exports dark, light and single-colour
wordmarks, `on-form-splash.svg` and `on-form-splash-final.svg` to `public/brand/`.
The three-cell chain is part of every full wordmark, including the reduced-motion
final frame. The wordmark's intrinsic size is now 342 by 86.

The standalone s geometry has not changed. Existing SVG/PNG/ICO favicons, the
touch icon, app icon and `public/mark.svg` remain in place. Do not copy archived
concept-studio wordmarks over the approved chart-r assets.

The 28 October static export passed syntax/formatting checks and isolated
Chromium/WebKit renders of all three full-wordmark variants at 210px and 115px.
The connected cells remain present in every export. The small-size and
single-colour renders were visually inspected; screenshots are
`.quality-artifacts/approved-brand-{chromium,webkit}.png`. Application splash
startup verification is recorded separately from these asset checks.

Verification passed: application build, frontend lint, static policies, all 26
Season Chromium/WebKit browser groups and the legacy responsive browser suite.
Desktop and mobile screenshots were visually inspected. Read-only local asset
requests returned HTTP 200 with correct SVG, PNG and ICO content types. Browser
journeys used isolated synthetic data and blocked external services.

Logs: `.quality-artifacts/on-form-build.log`, `on-form-lint.log`,
`on-form-static.log`, `on-form-season.log` and `on-form-legacy.log` at repository
root. No money/identity behavior changed in this branding increment. The full
major suite was not rerun for this presentational change. No commit, push or
hosted rollout is claimed; previous wallet work remains uncommitted separately.

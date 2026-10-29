# Streak design and interaction system

29 October approved loading signature: use three linked square cells throughout
the app. Compact controls rotate the cells with a gentle pulse; wider loading
states use the connected sine wave. Consume `CellLoader` in React and the shared
`public/cell-loader.js` module in legacy pages. Keep status text, failure/retry
controls and static reduced motion. Stop motion when work ends and pause hidden
tabs. Skeletons can preserve layout while data arrives. Do not add ring spinners,
animated ellipsis dots or artificial completion delays. See the
[implementation record](../delivery/connected-loading.md).

28 October refinement approved: the On form wordmark now has a chart-shaped r with three connected cells permanently beneath it. The segmented s remains the standalone insignia. The approved splash cuts the s with two strokes and assembles the wordmark once during initial document startup. It ends when the application shell mounts, without waiting for the animation, wallet, API or chain. Fast loads may only show part of the motion. Navigation does not replay it. Keep static reduced motion and usable retry/Wallet recovery when bundles fail.

27 October brand selection: the owner chose **On form**, the segmented-s
wordmark in the [brand review](../../design/brand-review/README.md).
Use its complete streak wordmark as the primary logo and the same segmented s
alone for favicon/app insignia. Approved application integration is complete
locally in `public/brand/`, shared React Brand and retained legacy surfaces.

27 October owner branding direction: the complete word **streak** is the logo.
Its custom initial **s** is the insignia, integrated into the remaining **treak**
lettering with matched lowercase height and baseline. Do not put a separate
insignia beside a wordmark that already contains the s. Use the same s alone
for favicons, app icons and compact insignia placements. The updated
[branding preview](../../design/brand-review/README.md) records the selected
direction, application asset mapping and verification evidence.

25 October dropdown correction: use proper SVG chevrons for disclosure controls. React uses the shared Icon component; retained vanilla screens use the same 24px viewBox path and currentColor stroke. Do not substitute angle characters or triangle glyphs. Existing native select SVG indicators remain appropriate. Keep icons decorative and expose expanded state on the controlling element.

20 October Survivor admin action: Create competition uses a compact coral-tinted clear-glass button with a plus tile, 12px semibold label, 44px minimum height and visible hover/focus. Creation actions should not use the external-link arrow. Preserve native button semantics and forced-colors contrast.

20 October select indicators: Season and retained legacy pages share `public/select-controls.css`. Single-choice selects use a 14px chevron positioned 12px from the inline end, with 38px end padding so labels cannot overlap it. Keep native select behavior, exclude multiple/list selects, mirror the indicator in RTL and restore the platform indicator in forced-colors mode. Feature background/padding rules must not override this shared spacing.

20 October responsive correction: desktop shows only the compact date/arrow bar, capped at 460px; phones show only the scrollable date strip between Live and the calendar. Hide its scrollbar, center Today initially and the selected date afterward, and fade progressively toward the edges. Disable the fade in forced-colors mode. Put Weekend in the calendar footer. League filtering uses provider competitions across the full catalogue before paging, alongside status, dates, search and sort.

20 October fixture navigation: use Today-first daily browsing, one-day arrows, a Monday-first month calendar and a horizontally scrollable mobile day strip. Keep Live and the calendar outside the strip; center the selected date after selection and viewport changes. Retain a Weekend shortcut for Friday–Monday browsing. Use the existing compact clear-glass palette, 44px primary controls, keyboard calendar movement, Escape and focus restoration. [Implementation and verification](../delivery/fixture-date-navigation.md).

## Compact slip, 17 October 2026

Use separate Picks and Activity tabs with one persistent payment controller. Keep receipts out of the Picks footer. The footer shows stakes and full wallet debit; detailed storage and network charges open in a dismissible cost dialog. Preparation and approval stages animate inside the primary button. Use a single coral amount-field focus ring. Respect reduced motion and forced colours. See [implementation](../delivery/compact-slip-implementation.md).

17 October terminal and invoice direction: use the legacy system sans stack for interface text and a system monospace stack for numeric match data, form, timestamps and payment amounts. Match intelligence includes real model/bookmaker comparison, standings and recent meetings with explicit unavailable states. Show estimated storage before review. The invoice places stakes first, storage/network in a quieter inset section, then the full wallet debit. Label storage Refundable and explain claim timing without treating it as a fee. Signed payments close the slip and continue in an expandable lower-left tracker. Use indeterminate moving dots, reduced-motion support and truthful confirmation/recovery states. The X still closes immediately and retains drafts.

17 October payment correction: market cards expose a visible View market link. Match details use a compact scoreboard, chart and prediction panel, with choices first on narrow screens. New entries open the shared slip. Wallet reconnect happens in place. Informational alerts use blue and attention states use amber, with a short title and a relevant retry or recovery action. Clear-slip confirmation distinguishes saved picks from submitted payments. Charts use recorded data, identify its source and show an honest empty state.

The subsequent chart direction follows [Polymarket's market presentation](https://polymarket.com/sports): prominent outcome percentages, clean time-series lines, a right-side percentage axis and direct crosshair inspection. Retain Streak's dark glass and blue/Home, green/Draw, muted red/Away palette. Pointer, touch and arrow keys inspect observations; outcome labels emphasize a line, and time-range buttons filter recorded points. Current card and selection values remain current while the chart inspects an older point. Show pool-relative principal as Pool share, with changing returns explained. Never substitute older-generation pools, old application-ledger values or fabricated historical points for direct-contract data.

Approved on 15 October 2026. The source of visual evidence is the [Season preview](../../design/season-preview/README.md) and its [design proposal](../../design/season-preview/DESIGN-PROPOSAL.md). The preview is a reference, not a production controller to copy wholesale.

## Identity and tokens

17 October density correction: the current Season app and public landing use compact proportions at normal browser zoom. The desktop rail is 180px with seven 44px navigation targets, no promotional footer and no independent scrolling. Below 461px viewport height or at phone widths, the bottom navigation and More menu keep every destination reachable. Shared body type is 12px, page titles are 24 to 28px, and card radii are 18px. Heroes, fixture rows, account panels and activity cards use tighter spacing. Preserve browser zoom, 44px primary controls and readable transaction amounts; do not simulate density with CSS zoom or page scaling.

Keep vivid football character on a dark graphite foundation. Coral marks prediction actions; mint/green marks positive state and the pitch; lilac supports community and fantasy results. Colour supplements text, icons and structure. Do not reintroduce the beige editorial theme.

| Semantic role                         | Approved preview value or behavior                   |
| ------------------------------------- | ---------------------------------------------------- |
| Canvas / surface / raised             | `#111413` / `#1a1e1c` / `#222724`                    |
| Main / muted text                     | `#f1f3ed` / `#a4aea7`                                |
| Brand/action coral                    | `#ff986f`                                            |
| Mint / pitch green                    | `#b9ed8a` / `#71e0b5`                                |
| Community lilac / error               | `#c8b7f6` / `#ff95a4`                                |
| Ordinary glass tint                   | `#17221d66`, with restrained directional reflections |
| Prediction slip face                  | `#14211bf2`, approximately 95% opaque                |
| Inset financial face / payment footer | `#14211be6` / `#14211bf5`                            |
| Elevated glass blur                   | 8px, with 2px dialog backdrop blur                   |
| Type                                  | System sans-serif; tabular digits for amounts        |
| Default radius                        | 18px, with smaller control radii                     |
| Press / surface timing                | 120ms / 220ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`      |

Move these roles into shared semantic tokens when the production frontend is created. Define spacing, typography, focus, elevation and responsive scales there too. Feature components consume roles, not arbitrary repeated hex values. The preview values are an approved baseline; verify contrast in actual compositions, including disabled and focus states.

## Glass and scrolling

17 October Overview correction: Home uses muted blue, Draw green and Away red. Keep the rims and reflections soft enough to sit comfortably beside the surrounding UI. Keep outcome faces almost clear; tint belongs in reflected edges and small highlights rather than an evenly coloured or frosted fill. The same `outcome-glass` treatment spans Overview, market cards, details, direct entry and the landing illustration. Selected state has a check mark or existing selection indicator as well as a brighter rim. Overview side panels use restrained blue edge reflections over transparent faces. The pitch-grid banner includes a small authentic CKB chest mark, with the same local asset in existing chain attribution. See the [delivery record](../delivery/overview-glass-correction.md) for source and verification.

Ordinary page cards use tint and a directional one-pixel rim without individual backdrop filters. Elevated surfaces can use local blur. The rim highlights opposing edges and fades around rounded ends; it is inert and never intercepts input. No looping glisten or shimmer. Dense financial content has a readable backing without relying on blur support.

The prediction slip stays more opaque than its surroundings. Its picks, storage, total and primary action must remain legible over any page. Use a solid fallback when backdrop filtering is unavailable, reduced transparency is requested or higher contrast requires it. Forced-colours mode uses system colours and visible outlines.

Use native scrolling throughout. Fine-pointer browsers with custom scrollbar support use a 12px rail, 6px sage thumb, 8px hover thumb and coral pressed state. Other browsers use standard thin scrollbars; touch devices keep native overlay scrolling. Preserve wheel, keyboard, touch and thumb dragging. Stable gutters prevent avoidable desktop layout movement. Do not install a JavaScript scroll replacement or hide the only scroll affordance.

## Composition and controls

17 October approved correction: use the compact integrated account panel in `design/account-slip-review`. The destination is **My Account**, covering wallet and Telegram settings. Restore Overview, Streak Five, Markets, Matchday, My activity and Clubhouse in desktop navigation; mobile retains Overview, Markets, Activity and My Account with the remaining destinations under More. Add matches belongs to the non-scrolling slip header, with an eight-pick capacity state. The collapsed slip uses an opaque background in normal, hover and focus states. Focus starts on the X close control rather than outlining the title. Keep the original preview's general identity while retaining live financial and identity adapters.

The public landing page carries the same graphite, coral, mint and glass tokens into a simpler reading flow: football-first hero, API-backed matchweek board, three onboarding steps, a clearly labelled Five introduction, native FAQ disclosures and market entry links. Visitors can browse before signing in. Use provider names/logos and explicit schedule states instead of fabricated odds, activity counters or winnings. Five stays marked as in development until its entry and scoring journey exists.

Keep both hero actions visible without scrolling on common laptop and phone viewports. Short screens use height-aware spacing and type, with the copy aligned to the top instead of centred against the taller fixture panel. Preserve readable text, 44px targets and natural scrolling at high zoom; do not hide content or fix the CTA over other controls. Browser regressions check full bounds and hit targets from 320x568 through 1440x700, including 1213x629.

Desktop uses a stable navigation rail and a wide work area. Mobile uses natural vertical reading order and a thumb-accessible dock. My activity, Wallet and Account remain reachable without hover. Matchday keeps a user's predictions beside the match context.

Latest owner correction, 16 October: the prediction slip has one X close button with an accessible name and a 44px target. Close and Escape immediately dismiss the slip while retaining every pick. Clear slip remains a separate explicit action. Remove Genie animation. Payment review and signing stay in the slip. Wallet shows funds and account settings; My activity shows transactions, predictions and claims on its own route.

The integrated slip is 480px wide on desktop and a full-width bottom sheet on phones, with safe-area spacing. Inset cards group each fixture, chosen outcome, amount and stake shortcuts. The first pick opens the slip; later new picks update the dock so browsing can continue. Choosing an already selected outcome reopens its existing pick. Match details put the fixture and pool distribution beside the prediction panel at desktop widths.

Amounts and consequences stay in the reading flow. Show principal, recoverable storage and estimated network fees separately. Keep the main action available at typical heights, but allow natural scrolling on short screens, with zoom and with the software keyboard. A pinned header/footer must not cover fields or focus. Do not shrink financial text to force a screenshot fit.

Use clear loading, empty, stale, error, rejected, full-market and locked-round states. A draft is not a submitted entry. A transaction awaiting validation is not an accepted bet. Explain what remains safe and what the user can do next without exposing implementation details unnecessarily.

## Motion contract

Every interaction gets immediate press/focus feedback and understandable pending/success/failure states. Use motion to connect surfaces, preserve orientation and acknowledge an action. Avoid full-page movement, looping celebration, auto-playing audio and loss-pressure copy.

The active application uses immediate slip opening and closing. The owner removed Genie motion after using the integrated app. Keep focus restoration and draft persistence independent of rendering, with no screenshots or raster copies of payment surfaces. Earlier preview motion measurements below are historical evidence.

## Accessibility acceptance

- Navigate all primary journeys with Tab, Shift+Tab, Enter, Space and Escape where appropriate. Restore focus after a dialog closes or minimizes.
- Give controls meaningful accessible names, persistent visible labels and visible focus. Use semantic buttons and form errors associated with their inputs.
- Meet readable contrast in ordinary, selected, disabled and error states. Do not rely on colour, animation, hover, gesture or sound alone.
- Preserve layout and reachable actions at 320px, representative phone/desktop sizes, zoom and short viewport heights.
- Announce asynchronous feedback once with appropriate live regions. Keep financial terms and important error details persistent rather than toast-only.
- Check reduced motion, reduced transparency, high contrast and native scrolling with representative browser support.

## Evidence and remaining limits

The recorded preview run passed 18 general scenario groups and 32 basket groups, including reset during and after a completed submission. The latest full motion run passed **56 of 58 checks**. Two Windows headless WebKit mobile timing observations failed: cleanup was not confirmed within the observation window and cold animation observation timed out. The dedicated snapshot run passed **9 of 9 checks before the final 95% slip tint**. See the [preview evidence](../../design/season-preview/README.md#verification).

These results do not prove smooth motion on a physical iPhone, modest Android hardware or the integrated app. Keep the two failures visible. Profile real devices before enabling expensive motion for a public pilot; the immediate transition is a valid reliability fallback. Production functional tests must cover the same state/focus invariants without depending on frame timing.

The [16 October correction](../delivery/ui-motion-correction.md) implements a separate typed controller in the React app. Integrated tests inspect real painted pixels at phone and desktop widths, including cold preparation and an eight-pick slip. They preserve the draft and focus through cancellation and renderer failure. These checks are separate from the historical preview run and from physical-device profiling.

## Copy and assets

Use short, direct, warm language with precise actions and consequences. No em dashes. Never manufacture confirmation, imply guaranteed winnings, promise future tokens or turn a badge into a financial entitlement. Fantasy credits and testnet CKB must stay visibly distinct. Publish only licensed or original assets and permitted player imagery. The preview's player names, associations, dates and points are illustrative.

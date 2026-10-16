# Streak design and interaction system

Approved on 15 October 2026. The source of visual evidence is the [Season preview](../../design/season-preview/README.md) and its [design proposal](../../design/season-preview/DESIGN-PROPOSAL.md). The preview is a reference, not a production controller to copy wholesale.

## Identity and tokens

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
| Default radius                        | 22px, with smaller control radii                     |
| Press / surface timing                | 120ms / 220ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`      |

Move these roles into shared semantic tokens when the production frontend is created. Define spacing, typography, focus, elevation and responsive scales there too. Feature components consume roles, not arbitrary repeated hex values. The preview values are an approved baseline; verify contrast in actual compositions, including disabled and focus states.

## Glass and scrolling

Ordinary page cards use tint and a directional one-pixel rim without individual backdrop filters. Elevated surfaces can use local blur. The rim highlights opposing edges and fades around rounded ends; it is inert and never intercepts input. No looping glisten or shimmer. Dense financial content has a readable backing without relying on blur support.

The prediction slip stays more opaque than its surroundings. Its picks, storage, total and primary action must remain legible over any page. Use a solid fallback when backdrop filtering is unavailable, reduced transparency is requested or higher contrast requires it. Forced-colours mode uses system colours and visible outlines.

Use native scrolling throughout. Fine-pointer browsers with custom scrollbar support use a 12px rail, 6px sage thumb, 8px hover thumb and coral pressed state. Other browsers use standard thin scrollbars; touch devices keep native overlay scrolling. Preserve wheel, keyboard, touch and thumb dragging. Stable gutters prevent avoidable desktop layout movement. Do not install a JavaScript scroll replacement or hide the only scroll affordance.

## Composition and controls

The public landing page carries the same graphite, coral, mint and glass tokens into a simpler reading flow: football-first hero, API-backed matchweek board, three onboarding steps, a clearly labelled Five introduction, native FAQ disclosures and market entry links. Visitors can browse before signing in. Use provider names/logos and explicit schedule states instead of fabricated odds, activity counters or winnings. Five stays marked as in development until its entry and scoring journey exists.

Keep both hero actions visible without scrolling on common laptop and phone viewports. Short screens use height-aware spacing and type, with the copy aligned to the top instead of centred against the taller fixture panel. Preserve readable text, 44px targets and natural scrolling at high zoom; do not hide content or fix the CTA over other controls. Browser regressions check full bounds and hit targets from 320x568 through 1440x700, including 1213x629.

Desktop uses a stable navigation rail and a wide work area. Mobile uses natural vertical reading order and a thumb-accessible dock. My activity, Wallet and Account remain reachable without hover. Matchday keeps a user's predictions beside the match context.

Owner correction, 16 October: the prediction slip displays one labelled Minimize control beside its minus icon, with a 44px target at every width. Remove the duplicate Close control. Minimize and Escape retain the draft in the dock, with the connected Genie when motion is enabled. Clear slip remains a separate explicit action. Other dialogs can retain Close when dismissal is their distinct action.

The integrated slip is 480px wide on desktop and a full-width bottom sheet on phones, with safe-area spacing. Inset cards group each fixture, chosen outcome, amount and stake shortcuts. The first pick opens the slip; later new picks update the dock so browsing can continue. Choosing an already selected outcome reopens its existing pick. Match details put the fixture and pool distribution beside the prediction panel at desktop widths.

Amounts and consequences stay in the reading flow. Show principal, recoverable storage and estimated network fees separately. Keep the main action available at typical heights, but allow natural scrolling on short screens, with zoom and with the software keyboard. A pinned header/footer must not cover fields or focus. Do not shrink financial text to force a screenshot fit.

Use clear loading, empty, stale, error, rejected, full-market and locked-round states. A draft is not a submitted entry. A transaction awaiting validation is not an accepted bet. Explain what remains safe and what the user can do next without exposing implementation details unnecessarily.

## Motion contract

Every interaction gets immediate press/focus feedback and understandable pending/success/failure states. Use motion to connect surfaces, preserve orientation and acknowledge an action. Avoid full-page movement, looping celebration, auto-playing audio and loss-pressure copy.

The approved Genie retracts the lower sheet into a narrow dock mouth before the top follows; restore reverses that connection. Preview timing is 720ms to minimize and 620ms to restore. Production must profile preparation and animation cost, not assume those durations guarantee smoothness.

The decorative renderer is inert and hidden from assistive technology. The real dialog owns focus and semantics. State transitions are independent of animation completion. Reduced motion skips the warp, with immediate focus and state restoration. Unsupported or failed rendering uses the same immediate transition after a bounded preparation wait.

Cancel rendering and clean up resources on navigation, repeated actions, pointer/keyboard interruption, resize, scrolling, tab hiding, unmount and preference changes. Late preparation must never hide a newer draft. Do not capture a live wallet prompt, sensitive signing data or user secrets into a raster. Shared geometry and tokens belong outside feature components.

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

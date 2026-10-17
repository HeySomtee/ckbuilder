# Streak: the next matchday

Design proposal 01. Prepared 15 October 2026. Awaiting owner review.

This is a connected, local interaction study for the whole Streak experience and the new Streak Five journey. It does not change the running application, sign transactions, fetch football data, send messages or install an agent policy.

## The direction

Keep the coral Streak mark, dark graphite foundations and vivid football character. Give the interface more breathing room, clearer type, tactile controls and a stronger relationship between a user's action and the next surface. Use a green pitch for Five, coral for prediction actions, mint for positive states and lilac for community and fantasy results.

Chessdict supplied a standard of thought, not a skin. Its reviewed sources include `AGENTS.md`, the design library's foundations, voice and component recipes, motion guidance, tournament studies, and the actual shared component/motion implementations. Its warm sand palette, chess imagery, custodial account rules and project-specific authorizations are not carried over. Its Genie implementation is a deferred study, not evidence that the effect is production-ready.

The preview has original SVG kits, pitch markings and club monograms, rather than unlicensed player portraits or official club assets. Player names, associations, dates, statistics, fixtures and credits are illustrative, not a current football feed.

## Information architecture

| Destination | Primary job | Existing capabilities carried forward |
| --- | --- | --- |
| Welcome | Understand Five, predictions and the community before joining | Public landing and onboarding |
| Overview | Choose the next useful action | Dashboard, featured markets, streak summary, claims |
| Streak Five | Build, captain and submit a small squad; follow points | New free fantasy competition |
| Markets / market detail | Understand a fixture and review an informed prediction | Markets, fixtures, schedule, Market vs Machine |
| Matchday | Follow the game without losing personal context | Timeline, stats, player context, feed freshness |
| My activity | Find entries, claims, refunds and evidence | Portfolio, receipt history, claim recovery |
| Clubhouse | See familiar names and progress | Leaderboard, crews, daily prediction streak, badges |
| Wallet | Understand available CKB, storage and claims | Wallet connection, funding, separate legacy recovery |
| Account | Manage identity, motion and reminder choices | Profile, settings, notification preferences |

Desktop uses a stable navigation rail and a wide working area. Mobile uses a thumb-accessible glass dock, natural vertical order and bottom-sheet dialogs. Financial details stay in the reading flow; they are not hidden behind hover or tiny tooltips. My activity is reachable from the claim summary and wallet on mobile. Account remains a visible header action.

The preview includes a signed-in sample profile, Somtee. A disconnected wallet is a separate state from account identity. Official Five entry will require an authenticated account, even though a visitor can draft without a wallet. Actual identity and account-linking work is specified in the architecture proposal; the local Save button is explicitly not a server submission.

## Streak Five journey

1. Arrive from the welcome page or Overview. Learn that entry is free and fantasy credits are not CKB.
2. Open the pitch. Start with five empty positions and forty credits.
3. Tap a position. A searchable player surface shows role, club, sample points and price. Ineligible duplicate and unaffordable players explain why they cannot be selected.
4. Build one goalkeeper, one defender, two midfielders and one forward. The budget changes immediately. A suggested five is a shortcut, not an automatic submission.
5. Tap C beside any selected player. The pitch and roster agree on who is captain. Replacing the captain clears that choice rather than silently assigning a new one.
6. Review all five, the captain and total credits. In the prototype, confirmation saves on this device. A production save must wait for an authoritative server response.
7. Return to edit while the round is open. The locked-round preview disables edits and preserves the team. Refresh restores the draft and saved state.
8. Follow provisional points in Matchday, then review a separate sample final result and player contributions. Those 61 sample points are illustrative and do not recalculate from the user's edited draft.
9. Preview a team card. Actual public team sharing should use an opt-in locked entry, not leak a private draft before the deadline.

Proposed game rules: one entry per account and round; fixed catalogue and prices; all five positions lock before the earliest included fixture; captain multiplier is 2x; no substitutions, chips or paid transfers at launch. Scoring in the preview is a proposal and requires player-stat coverage and rule review. The handling of missing data, postponements, ties and corrections must be published before opening a competition.

## Prediction journey

1. Open a market, inspect the pool distribution and context, and choose Home, Draw or Away.
2. Set a stake and choose Add more matches. Additional selections stay on the markets page so users can keep picking. Selected outcomes are marked, and a persistent dock displays the pick count and combined total.
3. Open the slip to edit each stake or remove a pick. Choosing a different outcome for the same fixture replaces that prediction while preserving its stake. One outcome per fixture keeps the basket easy to review. The minimum is 100 tCKB per pick in this proposal.
4. Review total stakes, recoverable receipt storage for every pick and one illustrative network fee. At taller viewport sizes the total and payment action stay visible while the picks scroll. Short viewports use normal scrolling so the footer cannot cover the inputs.
5. Minimize the complete slip into its dock. Navigate and restore all the same amounts and outcomes. Refresh also retains the basket. The animation preserves the visible header, total and payment controls when the sheet has been scrolled.
6. Connect the demo wallet and review all picks before one combined payment. Every prediction settles independently, with its own claim or refund. These are independent pool positions, not an accumulator. Rejected-signature and stale-shard scenarios retain the entire basket for review, with no silent partial payment.
7. A successful simulation records one submitted position per pick, linked by a shared sample payment identifier. It is not called an accepted bet: actual inclusion and cutoff checks remain distinct protocol states. A new draft created during submission remains separate from the submitted basket.
8. Review a winning claim, including returned storage, or a void refund with no market fees. Simulate the signature and see the action become unavailable for repeated claiming.
9. Open the sample receipt. No fake transaction hash or misleading explorer link is generated. Production receipts must identify actual outpoints and transactions.

The prototype uses a fixed 5,000 tCKB sample wallet balance and standalone sample payouts. Storage of 321 tCKB per receipt and the 0.005 tCKB combined network fee are illustrative. Production must calculate capacity and fees from the actual complete transaction. The prototype does not debit the sample balance when a prediction is submitted. The combined payment is a UX proposal; implementing and validating a multi-market transaction builder remains production work, described in the architecture proposal.

## Glass, borders and scrolling

The revised material uses translucent green-black faces over restrained coral and stadium-green light. Cards, navigation, the prediction dock and dialogs share the same tokens. Ordinary page cards use tint and rims without their own blur layer. Elevated surfaces use 8px local blur, with a lighter 2px dialog backdrop blur. Pick cards, financial inputs and pinned totals have darker local backing so their readability does not depend on a browser rendering the blur correctly.

The prediction slip uses a denser 95% dark-green face, following the owner's refinement. The surrounding app retains clearer glass. Directional borders and subtle surface reflections connect the slip to that material system without letting background fixtures compete with the picks or payment details.

Directional one-pixel rims borrow the construction of Chessdict's specular edges, with Streak's own colours. Opposing highlights fade at the rounded ends rather than drawing a uniform bright outline. The rim is masked to the boundary and cannot intercept input. There are no looping shimmer effects. The Genie snapshot includes the decorative rim while keeping the real controls responsible for interaction.

Use the same native scrollbar vocabulary for the page, sheets, lists and horizontal overflow. Fine-pointer browsers that support custom scrollbar parts get a 12px rail with a rounded 6px sage thumb, a brighter 8px hover thumb and a coral pressed thumb. Other browsers use the standard thin scrollbar and colour properties. Touch platforms retain their native overlay and gesture behavior. Wheel, keyboard and native thumb dragging stay intact; no JavaScript scrolling layer or hidden scrollbar is added. Stable gutters keep desktop text from shifting when overflow appears.

Window actions use familiar minus and X icons with persistent **Minimize** and **Close** text. Both have 44px targets on desktop and mobile. Minimize preserves the slip in its dock; Close dismisses the surface and retains the draft. Clear slip remains a separate explicit action. Colour is supporting feedback, not the only way to identify a control.

Reduced-transparency and higher-contrast preferences use solid surfaces where supported. Forced-colours mode restores system scrollbar colours and visible control outlines. Browsers without backdrop filtering also receive solid readable surfaces.

## Interaction and motion system

| Moment | Treatment | Purpose and guardrail |
| --- | --- | --- |
| Press | 120 ms, small transform and surface response | Immediate acknowledgement, never a delayed action |
| Page / sheet entry | 220-240 ms opacity and small translation | Establish location without moving the whole workspace |
| Player hover / selection | Small kit lift, clear roster update | Connect the person picked to the pitch; tap and keyboard alternatives remain primary |
| Captain | A visible C badge on pitch and roster | The multiplier is explicit, not just a different colour |
| Slip minimize | 720 ms curved funnel, bottom narrows to a 20 px dock mouth before the top follows | Preserve the complete slip and explain where the draft went |
| Restore | 620 ms reversal of the same funnel, above the native dialog | Return to the saved draft with the same spatial connection |
| Reduced motion | Skip the warp and entrances | Preserve state, focus and the dock, without merely accelerating the same animation |
| Feedback | Dismissible live-region notification | Pause dismissal on hover/focus; financial terms remain in persistent surfaces |
| Delayed feed | Last-known state plus explicit delay | Do not disguise stale data or celebrate a provisional result |

The Genie renderer prepares one raster image of the synthetic slip while it is idle, then deforms it in one WebGL mesh draw per frame. Canvas2D with device-pixel-aligned rows provides a fallback when WebGL is unavailable. Both paths avoid the WebKit clipping defects seen with transformed DOM bands. The bottom narrows first, then the broad top accelerates into the dock icon. Restore reverses that geometry. A manual popover places the decorative image above the native dialog while the real dialog retains keyboard focus. The layer is inert and hidden from assistive technology.

One animation clock drives the image. Navigation, pointer or keyboard interruption, resize, page or visual-viewport scrolling, tab hiding and motion preference changes cancel it immediately. A cold image cache is prepared on demand, with duplicate preparation requests shared. Minimize leaves the real sheet available until its image is ready. Cold restore avoids a full-panel flash before expansion. Closing, editing or navigating cancels pending preparation intent, so late work cannot hide a newer draft. Unsupported rendering or failed preparation uses the immediate state change after a bounded wait. Cached images are limited to three entries and raster density to 2x. Preparation refreshes after stake changes and sheet scrolling. No live wallet prompt or real signing material is captured. This remains a local motion study. Profile it on a modest real phone before approving production use.

The real interface changes state independently of animation completion. Closing a simulated submission surface does not cancel the operation. The result is still recorded in My activity, avoiding a common false-cancellation pattern.

## Small details with a reason

- System typography avoids a font request before the first screen. Tabular numbers keep amounts steady.
- Shared clear-glass faces and directional rims connect the cards, navigation and elevated surfaces. Dense financial details retain darker local backing.
- The Streak mark remains coral. Colour denotes a role rather than decorating every container.
- Fantasy uses the pitch on desktop and mobile, with a roster as the precise keyboard-readable counterpart.
- Window controls show Minimize and Close beside their icons at every viewport size, with 44px targets and a separate visible keyboard focus ring.
- The prediction dock says what it contains and preserves context across navigation.
- “Now for the football” follows a clearly labelled local save. It does not imply a real entry was accepted.
- Loading, empty, stale, rejected and locked states are reviewable through real controls.
- No auto-playing audio, forced haptics, looping celebration or loss-pressure language.
- The founding badge is recognition, not a promised token or cash entitlement.
- Crew competition is marked as a proposed follow-up. The preview illustrates the wider direction without claiming it fits in the October launch scope.

## What this review should settle

1. The visual direction and navigation hierarchy, on a phone and desktop.
2. Whether the five-player pitch, budget and captain flow are the right first fantasy format.
3. Whether the prediction slip's dock interaction is useful enough to justify measuring and refining the effect for production.
4. The minimum launch scope: shell, Five, complete prediction lifecycle, existing Matchday and basic leaderboard/badges. Rich private leagues and broader social features follow later.
5. The architecture and documentation foundation in [ARCHITECTURE-PROPOSAL.md](ARCHITECTURE-PROPOSAL.md).

The owner approved this revision and architecture on 15 October 2026, including the denser slip face and revised glass, scrollbar and controls. The [active documentation](../../docs/README.md) now records the implementation rules. Approval does not silently approve a hosting purchase, prize budget, new contract economic rules, live data permissions or deployment.

## Evidence and limits

See [README.md](README.md) for running, repeatable browser verification and captures. The browser checks cover the simulation only. They cannot establish production capacity, wallet compatibility, mainnet readiness, API accuracy, human uniqueness or real-device motion quality.

The original design study did not mutate the existing Streak application, production database or Week 20 contracts. The sibling Chessdict repository was read only. Subsequent documentation and quality foundation work is recorded separately in [status.md](../../status.md).

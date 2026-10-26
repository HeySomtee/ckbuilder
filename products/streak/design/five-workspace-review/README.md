# Five workspace preview

25 October 2026. Owner-requested design review. Approved on 26 October;
the [actual implementation](../../docs/delivery/five-workspace.md) now owns
the delivery status. This archived preview remains synthetic.

Run `node products/streak/design/five-workspace-review/serve.cjs`, then open
<http://127.0.0.1:4196/>. It serves only local static assets. No credentials,
wallet, database, API or provider is used. All players, branding, scores and
contributions are illustrative. Drafts last only until this page is refreshed.

## Review the changes

- My five opens first. Standings, Sponsors and More remove secondary content
  from the route to picking. On phones, Your squad and Pick players switch the
  workspace without scrolling past the pitch. Back to squad is explicit in
  the player panel, secondary tabs and dialogs, preserving unsaved edits.
- The pitch has separate forward, midfield, defender and goalkeeper lines.
  Both midfielders share the midfield line, including after player swaps.
- Captain controls retain the shirt's C badge. An explicit guide and named
  player chooser explain double points. The footer states the missing action;
  disabled review never silently submits an incomplete squad.
- First entry uses Review your five. Editing a saved team uses Save changes.
  An unchanged saved team says Changes saved. Drafts survive tab changes.
- A compact sponsor credit remains on the squad tab. The Sponsors tab gives
  the confirmed winner room for a logo, introduction, product description and
  website. Edit the sample profile and preview anonymous or unbranded support.
- The default open gameweek places a prominent Place a sponsor bid card first
  in Sponsors. Try amount validation and the bid-review dialog. These are
  illustrative controls: no wallet is opened and no bid is submitted.
- More holds rules, activity, proposed admin-tool placement and preview state
  controls. Try a saved squad, confirmed winner, anonymous winner or unsponsored week.

The sponsor form demonstrates proposed product-description and introduction
fields. These are not persisted or validated by the production backend yet.
The sample logo toggle illustrates optional branding; actual upload handling
is not included. Website navigation is simulated in a dialog, not opened.
An open auction never labels its leading bidder as the winning sponsor.
No auction economics, deadline, contribution, refund or prize rules change.

## Verification

`node products/streak/design/five-workspace-review/verify.cjs` checks Chromium
and WebKit at 320, 390 and 1440 pixels. It covers initial visibility, first save,
editing, captain replacement, draft retention, sponsorship copy, anonymous and
unfunded states, position-correct formation, back navigation, visible bidding,
amount review, tab keyboard navigation, dialog focus and horizontal overflow.
Requests are restricted to this local static preview. Screenshots and the
dated result are written to `.quality-artifacts/five-workspace-review/`.

All six refined journeys passed on 25 October at 16:48 UTC with no page errors,
external requests or writes. Final phone and desktop screenshots were reviewed.
The scoped frontend build, frontend lint and repository static policies passed; existing Vite
entry-script and dependency directive warnings remain. This does not establish
live wallet, reward or hosted acceptance.

The same refinement replaced text disclosure arrows in the actual payment
tracker and retained Matchday details with SVG chevrons. This presentation-only
app change does not integrate the Five workspace proposal. The contributor
contract and design guide now require SVG disclosure icons.
All six existing built-app synthetic checkout journeys passed after the icon
change in Chromium/WebKit at 390, 900 and 1440 pixels. Those checks use an
isolated synthetic chain, not the owner's wallet or the running test database.

The owner approved integration on 26 October. Preserve the running in-app
dummy-data test and pending physical MetaMask sponsorship/refund/prize checks.

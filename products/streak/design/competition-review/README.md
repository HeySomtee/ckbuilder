# Competition design preview

5 November 2026. Base UI approved by the owner. Configurable admin setup and
Evidence refinements are available for review. The preview remains local; campaign
runtime implementation and publication are still outstanding.

Run from the repository root:

```sh
node products/streak/design/competition-review/serve.cjs
```

Open [the interactive preview](http://127.0.0.1:4198/). It starts with the finished
prediction competition. The three dropdowns choose the competition, scenario and
player/admin view. Controls are outside the proposed app and would not ship to users.

Direct review links:

- [Choose campaign fixtures](http://127.0.0.1:4198/?view=admin&admin=setup&step=fixtures&state=open).
- [Campaign evidence](http://127.0.0.1:4198/?view=admin&admin=evidence&state=finished).
- [Delete a sample competition](http://127.0.0.1:4198/?view=admin&admin=monitor&state=open).

## What to review

- **Open:** prize, deadline, free registration and direct campaign fixture cards.
- **Registered:** immediate leaderboard place with zero points; joining alone does
  not reserve a market slot. Sample entry and squad actions show the next step.
- **Live:** provisional scores and each market's filled slots out of 32.
- **Full/closed:** disabled entry actions with standings still accessible.
- **Finalizing:** results stay provisional while verification completes.
- **Finished:** winning podium, personal rank, points breakdown and separate payout
  status. Includes winning, non-winning and non-participating player scenarios.
- **Paid:** a sample confirmed-prize state, without a fabricated transaction hash.
- **Admin setup:** guided competition details, editable prize places and amounts,
  fixture search/filter/selection, and a live review. Add or remove prize places
  and fixtures; no fixed campaign counts. Five selects a gameweek instead.
- **Admin monitor:** entrant search, participation, score monitoring, final
  standings, sample CSV export and award review.
- **Admin evidence:** illustrative participation, transaction/position counts,
  acquisition funnel and a clearly labelled synthetic export. These are design
  examples, not campaign results or grant evidence.
- **Admin deletion:** review the selected competition and effects, then type its
  exact, case-sensitive name. Partial names or extra spaces cannot confirm. Back,
  Cancel, Close and Escape preserve it. Deletion removes this sample listing,
  persists in browser storage when available and offers a fresh competition draft.

Setup drafts can be retained in this browser. Applying a draft changes the sample
competition views only; it never publishes a competition. The sample catalogue is
finite, not a proposed fixture limit. Prize places beyond the available sample
participants remain unawarded in the preview; non-participants cannot win by filling
an empty prize place. Existing eight-pick slips and 32-position markets stay bounded.

Both competitions have public leaderboards. Registration creates a ranked entry;
non-participants remain at the bottom with zero points. Active entries rank first,
even if a Five score is negative. Prediction ties use the earlier last qualifying
prediction; Five ties use the earlier meaningful save of the final squad and captain.

The approved first-campaign preset is $25, $15 and $10 equivalent in CKB for first,
second and third per competition. Each preset pool totals $50; both total $100 before
fees. Admins can configure different winning places and prizes for future campaigns.
Campaign mainnet rewards are separate from testnet play and existing custodial game
rewards. Exact CKB amounts, payout timing, eligibility and exceptional fixture rules
still need publishing before a live campaign opens. The preview does not set them.

The selected first-campaign funding design is a dedicated organizer-controlled
mainnet wallet. It would hold the two prize pools, with wallet-approved payouts
after final standings and recipient-address verification. Its standard lock script
would authorize spending; no custom campaign escrow is implemented. The admin
would prepare/review awards and track confirmed transactions without requiring a
mainnet private key in the web server. Wallet selection, funding and payment
implementation remain outstanding. Existing Five/Survivor reward code explicitly
supports testnet only and must not be repointed to mainnet for this campaign.

Under this proposed wallet payout model, winners confirm their receiving address
and follow their award status; they cannot spend directly from the organizer wallet.
The admin workflow can prepare the recipients and amounts for owner review and
wallet signing. A user-initiated automatic custodial payout would need a separately
secured signing service. Independent on-chain claims would require explicitly
funded claim cells and appropriate authorization rules. Neither is implied by the
UI approval or currently implemented for campaign mainnet prizes.

Five is pinned to Gameweek 11, with the official deadline of 21 November 2026 at
11:00 UTC / 12:00 WAT in the initial preset. The setup preview can select other
sample gameweeks, including Gameweek 10 for the requested earlier rehearsal.
Production setup must use the provider's current selectable events and official
deadlines, not these sample options. Prediction fixture names, dates, results, people, awards and
capacity are illustrative, not a final whitelist or live availability.

## Runtime handoff

Campaign fixture cards must call the existing selection operation and shared
prediction slip. Review, wallet signing, transaction persistence, submission and
recovery stay in the established payment flow. Five must reuse the existing squad
editor, save endpoint and live points. Campaign qualification is a separate view of
registered users' verified eligible records, including ordinary Markets entries;
clicking a campaign card or reviewing a payment does not award points.

Freeze the whitelist, scoring rules, deadlines and exact CKB prizes at publication.
Derive standings from canonical admitted predictions or accepted Five entries and
scores. Retain original chain evidence and meaningful squad-change timestamps for
tie-breaks. These runtime extensions are planned, not exercised by this preview.

Deletion must be an authenticated admin operation bound to the competition ID,
revision and exact current name. A stale review must be repeated. Soft deletion
closes registration and removes active listings while retaining an audit record,
archived entrant results and existing award obligations. Registration and deletion
must serialize on the same competition; retries must be idempotent. It must never
cascade into ordinary predictions, Five squads, settlement, payment journals or
fund recovery. Keep processing existing financial obligations. Rehearsal entries
must stay distinguishable in evidence exports even after their listing is deleted.
Creating another competition uses a fresh ID; it must not revive old registrations.

The [campaign evidence plan](../../docs/product/campaign-evidence.md) explains the
database/CKB evidence boundary, export contents and optional PostHog setup. It
includes instructions for a new PostHog project. No analytics SDK, account access
or production collection is installed here; analytics cannot determine awards.

## Boundaries and verification

The preview reuses Streak's approved SVG identity and in-page dropdown adapter.
Its loopback server serves only an explicit file allowlist. It makes no API, wallet,
database or payment calls. No keys, production records or real receiving addresses
are used. Edits here do not change the Season application.

The initial design rendered 28 Chromium/WebKit desktop/mobile combinations at 1440px and
390px. Join, state switching, award dialogs, non-participant ranking and admin search
were exercised with no page errors or document overflow. Captures were visually
reviewed. Another 36 renders covered all nine scenarios for both competitions in
both engines at 320px, including points totals, saving a sample squad and keyboard
tabs. The state dropdown was also captured at 390px. Local evidence lives under
`.quality-artifacts/competition-review/`.
The approved podium revision reran all 28 desktop/mobile journeys, including the
updated three-award payment count. Formatting and JavaScript syntax checks passed.
These are synthetic preview checks, not deployed or physical-wallet acceptance.

The configurable setup/Evidence revision passed 20 Chromium/WebKit captures at
390px and 1440px, with no page errors or document overflow. Interaction checks
covered bulk selection of 12 fixtures, search, six prize places, exact custom
totals, applying settings to the player/monitor views and a labelled sample export.
Screenshots are in `.quality-artifacts/competition-studio/`. Formatting, module
syntax and repository static policies also passed. This is preview verification,
not a full application release receipt.

Another 20 focused checks passed in Chromium/WebKit at 320px/390px: Five gameweek
selection, the separate official pick deadline, invalid prize/empty-fixture errors,
saved draft restoration and custom-fixture finished totals matching their breakdowns.
Evidence: `.quality-artifacts/campaign-setup-focused-results.json`.

The deletion increment passed 26 Chromium/WebKit checks at 390px/1440px:
cancel/Escape, exact-name matching, Back, reload persistence, both navigation
menus, fresh draft creation, escaped names, player-view restrictions and GW10
selection. Captures are in `.quality-artifacts/competition-delete/`. The final
destructive-button hover/focus colors were visually reviewed separately.

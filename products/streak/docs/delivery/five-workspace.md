# Five workspace integration

30 October budget correction: the budget and save panel now precedes the pitch
in a compact two-column card, with missing-player/captain guidance retained.
Mobile squad/player navigation shows Bank even while browsing players. The
local API serves the rebuilt assets on port 4100 with regular data; reload an
already-open page to load the updated CSS. No push has been performed.
Eight Chromium/WebKit journeys pass at 320, 390, 1276 and 1440px, checking
first-screen budget visibility, pitch containment, squad saving and tab return.
Strict frontend build and formatting/static policies also pass.

## 29 October: game-first screen

The compact Five header shares a row with the tabs on desktop. Gameweek and
deadline use one toolbar; the sponsorship credit follows the builder, with
bidding and full sponsor details still in Sponsors. Desktop player browsing no
longer repeats Back to squad. Mobile retains that control and the squad/player
switch. The mobile wallet address copy remains available in My Account rather
than taking another header row. The network label stays visible.

At 1276 by 662, the game starts at 164px instead of about 388px in the owner's
screenshot, leaving 75.2% of the initial viewport below its top edge. At 390 by
844 it starts at 164px; at 320 by 844, 178px. These measure space for gameplay,
not a claim that every control fits without scrolling. The pitch scales on
desktop while preserving four formation rows and 44px controls.

Validation uses the built application and the existing automatic-gameweek
browser fixture, extended locally to four viewport sizes in Chromium/WebKit.
The fixture checks geometry, overflow, pitch containment, scouting recovery,
profiles, captain selection, saving, reload and returning from Sponsors.
No wallet, provider, production database or funds are used. Evidence is under
`.quality-artifacts/five-layout/`; publication and hosted acceptance are separate.

26 October 2026. The owner approved the refined interactive workspace and asked
to implement it before moving on to an original logo and favicon.

## Implemented scope

My five opens first. Standings, Sponsors, Activity and More hold secondary
content. The builder stays mounted across tab changes so unsaved picks,
captain, search and filters survive. Back to squad resets the mobile builder
to its pitch without remounting it. Four pitch lines keep the forward,
midfield pair, defender and goalkeeper in their correct positions.

First submission uses Review your five. Existing entries distinguish Save
changes from Changes saved. Incomplete teams explain missing players or
captain; the captain chooser supplements the shirt controls. Failed saves keep
the review and draft. Success appears inline instead of adding another banner
above the pitch.

Sponsors contains the existing real auction/contribution flow. Confirmed,
eligible sponsors receive a compact squad credit and a larger showcase.
Optional introduction (80 characters) and description (240 characters) are
stored in the existing JSON sponsorship record. Old records default to empty
copy. Both fields follow name/logo moderation and anonymous privacy rules;
open and losing auction bids do not receive public branding. Reusing an intent
ID with changed copy is rejected. Admins can inspect copy before approving it.

The sponsorship dialog pins its reviewed round across background selection
changes. Returned data for another round does not replace the current cache.
Payment signing, custody, fee accounting, cutoff, winner selection, refunds and
reward allocation retain their existing rules and adapters. Test controls live
in More; the test playground indicator remains visible on the page heading.

## Verification and rollout

Independent review accepted the sponsorship metadata, moderation/privacy,
pinned-round submission, account cache and draft-recovery boundaries. The
focused build, lint, domain tests and all six Five workspace, six scouting and
four actual game-testing browser journeys passed. Desktop and phone
screenshots were inspected.

The 26 October major run passed 54 checks before the old navigation test
looked for How it works in the main view. Its assertion now navigates through
the approved More tab; all six navigation cases passed. All remaining
production browser checks passed. Nine contract checks passed before the
separate invocation reached Five without its disposable PostgreSQL URL; both
remaining Five signed-chain checks passed with that setting restored at
08:31:33 UTC. The archived multi-pick preview then timed out once on WebKit
390; its unchanged full-suite rerun passed all 32 cases at 08:37:18 UTC. The
timeout did not recur; its cause is not established. All 71 required check
executions now have passing coverage across these runs, not a clean single
major-run receipt. No assertion was weakened, and original failures remain.

Evidence lives in ignored `.quality-artifacts/`:
`five-workspace-major-initial.json`, `five-workspace-browser-initial.json`,
`five-workspace-contracts-initial.json` and
`five-workspace-contracts-remaining.json`, `five-workspace-preview-rerun.json`
and the summary `five-workspace-coverage.json`, with corresponding logs. These are
isolated synthetic-browser and disposable local-chain checks, not proof of
physical MetaMask or hosted acceptance. The disposable quality database was
stopped after database and chain verification; application databases remain.

This is local work. No commit, push, hosted change or owner wallet transaction
is part of this increment. The logo/favicon is the next design task, not an
asset replacement included in this implementation.

The existing local API was reloaded with its same launcher and persistent
stores (PID 17128). The real Five route and both ordinary/test public API
reads return HTTP 200. Existing sponsorship and rewards workers were not
restarted. Open `http://127.0.0.1:4100/season/?view=five`. The later 26 October
[local environment correction](games-local-mode-and-outlook.md) replaces URL
mode selection with `STREAK_GAMES_DATA_MODE`. Physical MetaMask
sponsorship, refund and prize acceptance remains a separate pending check.

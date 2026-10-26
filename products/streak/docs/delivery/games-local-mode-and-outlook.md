# Local game data and fixture outlooks

26 October 2026. Owner correction replaces public data-source switches with
local environment configuration. Both Five and Survivor now carry the same
Beta navigation label. This does not represent hosted acceptance.

## Data mode

Set `STREAK_GAMES_DATA_MODE=api` for normal football data, or `test` for dummy
Five/Survivor rounds. Restart the local API and reload the page. The normal
URLs remain `/season/?view=five` and `/season/?view=survivor`. The default is
`api`; old `games=test` URL parameters do not select a data source.

Dummy mode additionally needs the existing `STREAK_GAMES_TEST_ENABLED=1`,
testnet, isolated PostgreSQL and dedicated rewards-wallet configuration in
[in-app testing](in-app-games-testing.md). It rejects production/Render,
configured public origins, remote peers and forwarded requests. Do not enable
dummy mode on Render. Existing test rewards workers may continue recovering
previously signed transfers independently of the selected UI mode.

The server injects a non-secret mode into uncached application HTML. The
browser captures it once and sends the expected scope on game requests.
Switching server modes rejects stale tabs rather than rerouting prepared
signatures to another database. Local admin controls can close deadlines and
apply dummy results; normal users never receive a mode-switch button. Test
data remains visibly labelled when explicitly enabled locally.

## Competition discovery

Creating a Survivor draft selects its new ID, writes the corresponding cache
entry and updates the URL. Refreshing keeps that selection. A delayed create
response cannot replace the previously viewed competition. Drafts remain
private to admins and require explicit publication before anyone can join.
Competition cards distinguish draft, open, running and finished states. Open
competitions appear first when no explicit competition is selected.

Used teams are disabled, grey and marked Already used. Current editable picks
retain their selection state. No-repeat rules and eligibility remain server
enforced. Cards show up to three fixtures from the published competition
schedule, including the current round; missing future slots are marked TBC.

## Five fixture outlook

Players show three compact opponent/home-away chips beside their name; player
profiles show the same compact outlook above history. One shared schedule
query serves all players, independently of scouting statistics. The adapter
coalesces and caches the existing FPL bootstrap and whole-season fixture
requests. A schedule failure offers Retry fixtures without blocking picks.

Five uses the provider's difficulty ratings, with text alternatives and
home/away labels, following the [official FPL fixture outlook](https://fantasy.premierleague.com/fixtures/fdr).
Survivor does not invent equivalent difficulty ratings. Unknown fixture dates
and incomplete published schedules remain explicit.

## Verification and release

Focused environment/HTTP and FPL unit checks, all four local-game browser
journeys, six scouting journeys and six Survivor journeys passed during
implementation. The final six Survivor journeys include the delayed-create,
competition switch and failed-read cache regression. Independent review
accepted the corrected identity/recovery boundaries. `npm run quality:major`
passed all 71 checks in one complete run at 09:57:27 UTC on 26 October, using
Node 24.14.0, disposable PostgreSQL, synthetic browser identities and isolated
CKB nodes. No suite was skipped. Evidence is retained in ignored
`.quality-artifacts/games-local-outlook-major.json` and the matching `.log`.
The disposable quality database was stopped after verification. Mobile
fixture chips, profile layouts and used-team cards were visually inspected.

The existing local API was reloaded as PID 4708 in regular-data mode, retaining
its launcher, persistent stores and independent workers. Ordinary Five and
Survivor API reads returned HTTP 200. The old test URL still received an API-mode
shell. A separate read-only operational check fetched real FPL outlooks for
20 teams with three upcoming fixtures each. This is provider-read evidence,
not a synthetic fixture or payment verification.

No owner wallet signatures, live sponsorships, commit, push or hosted changes
are included. Original logo and favicon design remains the next design task.

# Five current team and next-week picks

31 October 2026. Implemented locally; uncommitted and not deployed.

The default gameweek is the most recently locked published round, including its
final results until another round locks. The scheduler still opens upcoming
gameweeks automatically. An explicit Pick next team button opens that week's
independent squad editor, with its deadline and existing review/save/edit controls.
Back to current team returns to the scoring pitch. The gameweek selector retains
older squads and results. A new week never copies a previous squad.

The locked view reads only the saved entry. Each shirt shows that gameweek's Streak
Five points; the captain contribution is already doubled. Clicking a player opens
the scoring breakdown and existing history/profile, with no squad-edit action.
Missing observations say Awaiting points. The total sums available observations and
shows how many players have updates; finalization remains owned by the existing
server scoring rules. Signed-out users and accounts without an entry get a clear
empty state rather than a fabricated squad.

This reuses the existing server score scheduler and visible-page 30-second query
refresh, with a manual Refresh points action. There is no new scoring algorithm,
reward allocation, deadline or background worker. Failed refreshes retain the last
saved team and points with a retry notice. No live wallet, provider credentials or
production database are used in automated verification.

The service read now returns current and next round IDs. Explicit round reads still
win over the default, and private entry projection is unchanged. Tests cover opening
the next week without redirecting the current one, deadline rollover, historical
selection, partial/negative/captain points, background refresh, outage retention,
fresh next-week selection, saves and edits isolated from the current team.

The database summary also honors the existing marked dummy-game close timestamp.
It does not fetch full squads to choose a gameweek, and unmarked real rounds ignore
synthetic timestamps. Disposable PostgreSQL checks cover immediate current-team
selection, persistence after creating another dummy round and the real-round guard.

Verification: Five domain/service and automatic-feed tests pass. The six existing
workspace journeys and both-browser local-game mode checks pass. The extended
automatic-gameweek suite covers 320/390/1440px Chromium and WebKit, including a
timer-driven score update and a failed refresh that retains the saved total. The
final build, lint and static policies pass separately. Browser fixtures
use synthetic players, isolated in-memory stores and blocked external requests.
Evidence: `.quality-artifacts/five-live-browser.log`, `five-live-workspace-browser.log`,
`five-live-games-browser.log`, `five-live-build.log`, `five-live-lint.log` and
`.quality-artifacts/five-auto/*-live-points.png`.

Preserve the separate pending Survivor wallet acceptance and release work. This
increment is not a full release-gate receipt or hosted acceptance result. The
complete gate remains required before publication; no hosted CI was enabled.

# Automatic EPL gameweeks and player scouting, 21 October 2026

The owner requested current EPL gameweeks without JSON imports, automatic weekly
progression, player history/form/transfers and a game-focused layout. This work
extends the existing Five runtime; it does not change prediction payments.

## Player journey

- The nearest upcoming official FPL deadline opens a free Five gameweek. Pick
  five eligible EPL players and a captain; save before that deadline.
- A compact gameweek bar, team pitch, bank and dense player browser replace the
  introductory layout. Mobile has separate My five and Players views.
- Click a player on the pitch or list for season statistics, availability news,
  recent match points and upcoming fixture difficulty. Add/remove from the same
  profile. Form, points and transfer-in/out sorting use FPL scouting data.
- FPL form, ownership and transfers describe the FPL community. Recent match
  history labels FPL points separately from points calculated under Five rules.
  The published Five scoring model, captain multiplier and frozen prices remain
  authoritative. Version-one non-appearance remains zero, including unused
  substitutes who received cards; raw card observations are retained.
- Player-data failures do not erase the squad. History and scouting have separate
  animated loading, retained data, retry controls and minute-long caches.

## Automatic lifecycle

`STREAK_FIVE_FPL_ENABLED=1` enables both the FPL adapter and an API-owned background
loop. It runs immediately and every minute, independently of page traffic or the
rewards worker. Custom local launchers that import the server without calling its
`boot()` must call `startFiveProgression()` and attach its cleanup to server close.

The service reads official season events, creates stable `fpl-SEASON-EVENT` IDs
and uses the database clock. Published catalogues/prices/terms never change on a
refresh. The nearest upcoming round is the default selection; previous rounds
remain selectable. Each week needs a fresh saved squad; this version does not
silently carry entries forward.

Locked rounds receive provisional fixture observations, complete records and
finalization. Finalization requires the official event to be finished and data
checked, complete player records, the published correction window and at least
30 hours after the latest actual fixture kickoff. Submitted contributions must
finish reconciliation; confirmed prize backing requires its verifier. This loop
does not sign or send any reward transaction.

At most six delayed rounds are processed per tick using fair rotation. Identical
statistics compare semantically, including PostgreSQL jsonb key reordering, so
unchanged polls do not create score revisions. A fresh complete observation after
the correction window is retained. Source failure preserves entries, scores and
recovery records; preparation of a later catalogue cannot block an earlier round.

Version one still allows one fixture per player. Players with no fixture or a
double gameweek are excluded. Changed fixture assignments pause scoring for
review. No invented result, missing-player zero or stale snapshot can finalize
an award. Manual admin import tools remain available when automation is disabled,
but the automatic player journey contains no JSON/import/publish step.

## Data and operational boundaries

Public FPL responses are fetched only by the server. Requests have a ten-second
timeout, 5 MB limit, minute cache, 80-path bound, eight active provider requests
and a per-IP scouting rate limit. Profile IDs and response bodies are validated.
Private entries retain account-scoped queries and pre-deadline privacy.

Automatic rounds use the existing defaults: 40 credits, 1 GK/1 DEF/2 MID/1 FWD,
max two per club, free entry, 1,000 entries, top 5%, optional sponsorship with a
100 tCKB minimum. Published rules stay fixed. Dedicated rewards wallet activation
is separate; unsponsored play does not need one. Mainnet remains unsupported.

The owner authorized using the public FPL integration for this local development
journey. Endpoint availability does not establish a redistribution license.
Hosted release and data-use review remain separate from local verification.

## Verification record

Focused unit tests cover automatic opening/locking/next-week selection, restart
idempotence, immutable terms, private entries, source outages, fair catch-up,
jsonb-style key ordering, bench cards and correction/funding finalization gates.
Adapter fixtures cover official deadlines, coalescing, live/final scores,
negative form, transfer statistics and distinct FPL/Five history points.

The browser suite exercises automatic opening, scouting/profile failures and
retry, sorting, keyboard focus, player selection, captain, save and reload at
320/390/1440 px in Chromium and WebKit. All network fixtures are synthetic.
The PostgreSQL suite additionally covers concurrent schedulers and actual jsonb
deduplication. The major regression gate includes these suites.

Screenshot evidence is under `.quality-artifacts/five-auto/`. Independent source
review accepted the identity/recovery/funding boundaries after correcting jsonb
deduplication, fair catch-up and zero-minute card observations. The first major
run passed 38 checks before the new browser width assertion caught insufficient
space for player names. The layout was corrected without weakening the assertion;
all six focused browser journeys now pass. The next full run passed the same 38
backend/build/database checks and stopped on an ambiguous new browser selector:
price and form both displayed 7.0. The assertion now targets the Form column and
waits for its actual statistic. No assertion was removed or weakened.

Final coverage: **66 required checks have passing coverage**: 38 from the major
run, all 18 browser-group checks at 20:18:30 UTC and all 10 contract-group checks
at 20:03:54 UTC. The failed full-run receipt remains failed; successful remaining
groups are recorded separately, not rewritten into a fictitious clean full run.
Runtime code is unchanged between these final checks. The browser runner now
builds before its new Five suite, and all nine tooling regressions passed after
that ordering correction. No required suite was skipped. Logs:

- `.quality-artifacts/five-auto-major-final.log` and `all.json`
- `.quality-artifacts/five-auto-all-browser.log` and `browser.json`
- `.quality-artifacts/five-auto-contracts.log` and `contracts.json`

The isolated Five chain harness now probes readiness from Windows as well as WSL
before testing, resolving the earlier localhost-forwarding startup race. Signed
transaction assertions and recovery checks remain unchanged. The temporary
`streak-quality-postgres` container is stopped after verification; the persistent
development database remains running.

Separate live-source inspection: the existing local API was restarted alone as
PID 10996 with FPL enabled. Its persistent development database opened
`fpl-2026-8`, 562 eligible players, deadline 23 October at 17:30 UTC (18:30 Lagos).
Scouting returns 668 players; Raya's profile returns seven past matches and eight
future fixtures. Anonymous desktop/mobile inspection found no horizontal overflow
or page errors. No wallet login/signature, entries or sponsorship was submitted.
Payment sponsor, watchdog, settlement worker and development database were not
restarted. No commit, push, hosted deployment or reward funding occurred.

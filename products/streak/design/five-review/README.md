# Streak Five squad-builder review

20 October 2026. Private interactive design increment, not a production game.

Start with `node products/streak/design/five-review/serve.cjs`, then open
<http://127.0.0.1:4195/>. The listener is loopback-only. It does not change the
running app, operator, wallet, database or hosted deployment.

## What to review

Build a five-player EPL squad on a compact pitch. Search and filter the scouting
list, compare FPL form and prices, remove players, choose a captain and review
the budget. Saving a preview entry persists only to this browser. Round-state
controls demonstrate locked picks, provisional/final points, per-player scoring
explanations and a delayed feed without inventing a zero.

The baseline is 40 credits, 1 GK, 1 DEF, 2 MID, 1 FWD and double captain points.
Maximum two players per club is a proposed balancing rule, not yet a published
competition rule. Prices are integer tenths internally. Credits are not CKB.
The jersey's small N-shaped crest is a CKB-inspired design detail, not an
official club or partnership claim.

This has no wallet request, backend entry, shared standings, prize or real
scoring feed. Keep the production Five route marked coming soon. The owner
originally requested all supported leagues, then offered EPL-only as a fallback
after asking about Champions League fantasy. This preview takes that simpler
first-release direction; broader coverage remains a later decision.

## Source investigation

The public [FPL bootstrap endpoint](https://fantasy.premierleague.com/api/bootstrap-static/)
responded during research with 668 players and 20 teams. It exposes `now_cost`,
`form`, `points_per_game`, `total_points`, minutes and underlying statistics.
`now_cost / 10` is the FPL game price. Form and ICT are not universal match
ratings. An own-domain public endpoint does not establish third-party support
or permission to redistribute its contents.

[UEFA Champions League Fantasy rules](https://www.uefa.com/uefachampionsleague/news/025f-0fd4b42cc0a7-74498b7df63b-1000--uefa-champions-league-fantasy-football-rules-2025-26/)
describe a separate 100m budget and performance-based price changes after
Matchday 2. UCL covers its participating clubs, not every non-EPL player.
Its prices and rounds cannot simply be mixed into FPL's economy. UEFA's
own-domain Swagger URL responded, but a supported player feed, reuse permission
and current-season coverage have not been established.

The [Premier League terms](https://www.premierleague.com/en/terms-and-conditions)
restrict redistribution and commercial reuse. Do not promote this research
snapshot to production or commit player data. An unofficial wrapper does not
remove those restrictions. Obtain appropriate permission or use a provider
whose agreement covers the required data and use.

[API-Football's own guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
describes per-fixture player statistics and ratings. Verify the account's
coverage and permitted use before integration. Existing Streak league/team
multipliers rank fixtures; they are not a player pricing or player rating engine.

## Private data and recovery

The server only reads an existing ignored snapshot at
`.quality-artifacts/five-preview-fpl.json`. It never fetches provider data itself.
The dated local research snapshot is excluded from Git. A missing snapshot
shows a retry state; there is no synthetic player fallback presented as real.

Expected snapshot: `fetchedAt` and `players[]` with positive integer `id` and
`teamId`, strings `name`, `fullName`, `team`, `teamCode`, `status`, position
`GK|DEF|MID|FWD`, integer `cost` in tenths, and numeric `form` and `points`.
Player IDs, positions and budget are revalidated against the loaded catalogue
when restoring local drafts. Local saves are not official entries or frozen
price guarantees. A production entry needs a server-owned catalogue version.

Only the draft IDs, captain ID and preview-save flag enter localStorage.
No account or wallet information is stored. A storage failure leaves the
current in-memory squad visible and reports that the draft was not saved.

## Proposed scoring and next implementation boundary

The Rules dialog and pure `rules.mjs` define the prototype's scoring. Missing or
invalid statistics remain pending. Confirmed non-appearance is zero. Captain
multiplies positive and negative points. These are proposed Streak rules, not
FPL's full scoring system or bonus implementation.

Before public entries: approve the player-data source and final rules; freeze
round catalogues, prices and cutoffs; implement authenticated PostgreSQL entries,
cutoff race protection, provider observations, deterministic score revisions,
leaderboards and correction explanations. Decide postponed/double fixtures,
DNP captain handling, ties and finality. No paid entry or award is introduced.

## Verification

Focused commands:

```text
node --test products/streak/design/five-review/rules.test.mjs
node products/streak/design/five-review/verify.cjs
```

Browser checks intercept only the local player endpoint with synthetic data.
They exercise Chromium and WebKit at 320, 390 and 1440 pixels, squad limits,
captain/save/reload, locked edits, scoring explanations, delayed data,
search/filter, clear confirmation, Escape, snapshot retry and blocked browser
storage. They reject
external requests and HTTP writes. Screenshots and results are written under
ignored `.quality-artifacts/five-review/`. These checks do not establish
production game readiness or provider integration.

20 October results: all four rules tests, all six browser viewport journeys,
both engines' snapshot retry/storage failure checks, foundation formatting and
static policies passed. Desktop/mobile screenshots were visually inspected.
A separate read-only local inspection rendered all 668 players from the private
research snapshot. That inspection is distinct from synthetic regression tests.
No full production/contract gate, commit, push or deployment was performed.

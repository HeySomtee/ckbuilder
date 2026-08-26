# Week 14: A Real Multi-League Football Oracle

Week 9 gave Streak a provider interface and a clock-driven Premier League
simulator. That proved the market lifecycle, but it still did not answer the
important question: can the same engine consume current fixtures, follow live
scores, survive a feed outage, and settle from an external result without
inventing data?

Week 14 replaces the simulator with an API-SPORTS/API-Football provider for the
Premier League, La Liga, Bundesliga, Serie A, Ligue 1 and UEFA Champions League.
The work is larger than translating one JSON response. This feed is an oracle
for a prediction market, so quota handling, postponed games, terminal-state
confirmation and failure behaviour are part of correctness.

**Code:** [products/streak](../products/streak)
**Provider:** [football.ts](../products/streak/src/providers/football.ts)
**Run:** `MATCH_PROVIDER=football npm run streak`

## One provider, several competitions

API-Football assigns stable numeric identifiers to competitions and fixtures.
The default configuration covers six competitions:

```text
39   Premier League
140  La Liga
78   Bundesliga
135  Serie A
61   Ligue 1
2    UEFA Champions League
```

They are configuration rather than application logic:

```env
API_SPORTS_KEY=...
MATCH_PROVIDER=football
FOOTBALL_LEAGUE_IDS=39,140,78,135,61,2
```

Every upstream fixture is normalized into the existing `Match` shape. Week 14
adds optional sport, competition and oracle metadata so older World Cup and
dummy rows remain valid while real football rows carry their provenance:

```ts
{
  id: "api-football-1379231",
  sport: "football",
  competition: { id: "39", name: "Premier League", country: "England" },
  oracle: {
    provider: "api-football",
    fixtureId: "1379231",
    source: "https://v3.football.api-sports.io",
    status: "NS"
  }
}
```

The upstream id is namespaced before it enters Streak. That prevents a fixture
from another provider accidentally sharing a market id and gives receipts a
stable audit trail back to the source.

## Async outside, synchronous inside

The provider seam deliberately requires `loadFixtures()` to be synchronous
because the engine calls it while holding the serialized database write lock.
The real provider preserves that invariant:

1. `init()` fetches a rolling schedule window into memory.
2. `fetchResults()` performs any due network refresh before the write begins.
3. `loadFixtures()` only maps the in-memory cache.

The schedule covers the previous two days for downtime recovery and the next 21
days for open markets. It refreshes every six hours. A fixture near kickoff is
polled more frequently, while an idle weekday causes no live-score requests.
All application visitors read the server cache; the browser never receives the
API key and never calls API-SPORTS directly.

## Quota-aware polling

The Streak settlement loop still wakes every 20 seconds, but that no longer
means one upstream request every 20 seconds. The provider maintains its own next
poll deadline:

- idle: no live request;
- inside a match window: every five minutes;
- within 15 minutes of kickoff: every minute;
- live or confirming full-time: every 20 seconds.

Live fixture ids are requested in batches of 20, so five simultaneous Premier
League matches cost one request rather than five. API-Football's rate-limit
headers are captured after every call and exposed through `/api/status`; the
terminal status bar shows the remaining daily allowance.

Concurrent HTTP requests can trigger `syncMatches()` at the same moment as the
background loop. In-flight promise guards make those callers share the same
schedule or result refresh instead of spending quota twice.

## The most important rule: no synthetic real result

The old engine had a useful demo fallback: after kickoff plus 110 minutes, a
missing oracle response produced a deterministic score derived from the match
id. That is acceptable for a simulator and dangerous for a real market. A
network outage at full-time could otherwise pay the wrong users consistently.

`MatchDataProvider` now has an `allowSimulatedFallback` policy. The real
football provider sets it to `false`. Once its market reaches kickoff, the
market closes and waits as long as necessary for an authoritative terminal
response. World Cup demo mode and the dummy provider retain their existing
offline behaviour.

## Full-time is observed, then confirmed

One `FT` response is not enough to move money. The provider records a signature
of the terminal state—status plus home and away score—and requires two
identical observations. If the score is corrected between reads, the counter
restarts. Old completed fixtures recovered after extended downtime can be
accepted immediately because their correction window has long passed.

For Champions League knockout games, the three-way Home/Draw/Away market uses
`score.fulltime`, the score at the end of regulation. Extra-time and penalty
goals therefore do not silently change a 90-minute draw market into a home or
away win.

API status codes are handled explicitly:

- `FT`, `AET`, `PEN`: confirm and resolve;
- `CANC`, `ABD`, `AWD`, `WO`: confirm and void/refund;
- `SUSP`, `INT`: show suspended and wait;
- `PST`, `TBD`: show postponed and wait for a new kickoff;
- in-play states: update the running score without settling.

When a postponed fixture receives a new kickoff, the stored fixture and any
still-open market move with it. A closed market reopens only when it has no bets;
existing positions are never exposed to a changed deadline.

## Multi-league interface

Competition identity now reaches market summaries and fixture responses. Both
the Markets and Schedule screens have competition filters, display club crests,
and distinguish the league from the round. The API also accepts server-side
filters:

```text
GET /api/markets?status=open&competition=39
GET /api/matches?competition=140
```

The same additions are backward compatible with legacy rows whose competition
field is absent.

## Verification

`npm run test:week14` checks fixture normalization, competition provenance,
live-state mapping, delayed terminal confirmation, cancellations,
postponements, suspensions, regulation-time settlement after extra time, and
the rule that an unavailable authoritative feed cannot simulate a result.

The TypeScript build and browser JavaScript syntax check pass. The first probe
reached API-SPORTS without exposing the key and correctly surfaced the free
plan's current-season restriction. After the plan upgrade, a second live
validation on 26 August 2026 loaded 161 fixtures across all six configured
competitions with no provider errors: 30 Premier League, 43 La Liga, 27
Bundesliga, 30 Serie A, 27 Ligue 1 and four Champions League fixtures in the
rolling window. The provider reported 7,494 of 7,500 daily requests remaining
after the six schedule calls.

## What this week proved

- A provider abstraction is only useful when its failure policy is explicit.
- Server-side caching is both a quota optimization and a credential boundary.
- Oracle correctness includes lifecycle states, not only score parsing.
- Competition metadata belongs in the domain model if one engine serves many
  leagues.
- A market should wait during uncertainty, never manufacture certainty.

## Next

Week 15 can use the same API's predictions, bookmaker odds, form, injuries,
lineups, match events and player statistics to build **Market vs Machine**: a
comparison between Streak's crowd probability, the provider model and market
consensus, with the displayed pre-match snapshot committed into the settlement
receipt.

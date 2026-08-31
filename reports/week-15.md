# Week 15: Market vs Machine

Week 14 made Streak's fixtures and settlement oracle real. Week 15 asks a more
interesting product question: before the result is known, how does the crowd's
belief compare with a statistical model and the betting market?

**Code:** [products/streak](../products/streak)
**Analytics:** [insights.ts](../products/streak/src/insights.ts)
**Provider:** [football.ts](../products/streak/src/providers/football.ts)
**Run tests:** `npm run test:week15`

## Three probability sources

Every real football market now exposes three normalized home/draw/away views:

1. **Crowd probability** comes from the live parimutuel pool. If 50% of the
   escrow is on home, 25% on draw and 25% on away, the crowd column displays
   50/25/25. An empty pool displays no crowd sample rather than pretending all
   outcomes are equally likely.
2. **Machine probability** maps API-Football's `/predictions` percentage object.
   The response also preserves its advice, predicted winner, goal guidance and
   comparison drivers.
3. **Bookmaker probability** reads bet id `1` (`Match Winner`) from `/odds`.
   Decimal odds are converted to implied probability, normalized separately for
   each bookmaker to remove the overround, then averaged. The UI reports both
   bookmaker count and mean raw margin.

The market detail page highlights the strongest outcome in each column. The
comparison is descriptive: Streak does not copy bookmaker prices into its
parimutuel pool and does not present API-Football's forecast as certainty.

## Context, with coverage first

The provider checks `/leagues?id=...&season=...` before spending quota on
downstream endpoints. Coverage flags record predictions, odds, standings,
injuries, events, lineups, fixture statistics and player statistics. Week 15's
first slice then combines:

- `/predictions?fixture=...`;
- `/odds?fixture=...&bet=1` during the final seven days;
- `/standings?league=...&season=...` for rank, points and form;
- `/fixtures/headtohead?h2h=TEAM-TEAM&last=5`.

Unavailable data is not an exceptional page failure. Each independent request
can produce a compact warning while the other sources continue rendering. This
matters because an endpoint may be covered for a league but still have no row
for a particular fixture.

## Quota-aware caching

The caches follow the upstream data's natural update frequency:

| Data | Cache |
| --- | ---: |
| Competition coverage | 24 hours |
| Predictions | 1 hour |
| Standings | 1 hour |
| Match Winner odds | 3 hours |
| Head-to-head results | 12 hours |

Each cache also stores an in-flight promise, so two users opening the same
market simultaneously share one API call. The regular 20-second settlement
loop does not imply 20-second analytics polling.

On-demand page requests populate the cache and persist the latest compact
analytics on the market. A background warmer begins 90 minutes before kickoff,
processing no more than four stale fixtures per pass. That gives unvisited
markets an auditable pre-match record without fetching rich analytics for all
161 rolling-window fixtures at boot.

## Freezing the pre-match state

At the first sync at or after `closesAt`, the engine creates one immutable
snapshot containing:

- exact crowd probabilities, bet count, bettor count and pool size;
- the latest machine prediction and its capture time;
- vig-free bookmaker consensus and source count;
- table and head-to-head context;
- fixture id, provider URL, coverage flags and warnings.

The snapshot is canonicalized and SHA-256 hashed. Once written it is never
updated, even if the API later changes a prediction or corrects odds. Receipt
schema v3 embeds the full snapshot and hash alongside the final-score oracle,
bet Merkle root and payout accounting.

## API and interface

`GET /api/markets/:marketId/insights` is public. Before kickoff it composes the
current crowd pool with cached provider analytics. After kickoff it returns the
frozen snapshot. The browser renders this in a responsive **Market vs Machine**
panel with probability columns, model advice, bookmaker coverage, team form,
recent meetings, warnings and the shortened snapshot hash.

## Verification

`test:week15` covers prediction parsing, percentage normalization, bookmaker
margin removal, coverage mapping, table extraction, head-to-head mapping,
crowd composition, immutable snapshot hashing and receipt v3 provenance.

A live validation on 31 August 2026 used EPL fixture `1557377`, Aston Villa vs
Arsenal. The paid feed reported all relevant EPL coverage flags as enabled,
returned machine probabilities of 10% home, 45% draw and 45% away, table ranks
for both clubs and five head-to-head matches. The odds endpoint had no row for
that individual fixture, and the pipeline correctly returned a visible
`Bookmaker odds returned no data` warning instead of synthesizing consensus.

## Next layer

The coverage model already records injuries, lineups, events and player
statistics. The next slice can add availability and confirmed-XI cards close
to kickoff, then compare the frozen pre-match forecast with live match events
without changing the snapshot or settlement semantics.

# Featured fixture ranking

Implemented 15 October 2026. Version 1 is an editorial discovery policy. It ranks real API fixtures; it never creates matches, changes pools, affects odds or implies a team's chance of winning.

The landing lineup and Season market browser default to `sort=featured`. The browser also offers `sort=kickoff`. The existing unpaginated legacy API retains its existing order. Filtering by date, search and competition happens before ranking, and ranking happens before pagination. A Sunday headline match can therefore lead the Friday-to-Monday preview even if more than 24 earlier fixtures exist.

## Score

```text
score = round((20 + home profile + away profile
              + 0.8 × smaller profile
              + marquee bonus + rivalry bonus + round bonus)
              × league multiplier)
```

| Input               | Version 1 policy                                                                     |
| ------------------- | ------------------------------------------------------------------------------------ |
| League multiplier   | EPL 1.20; La Liga 1.12; Italian Serie A 1.06; other competitions 1.00                |
| Team profile        | Reviewed club preferences from 15 to 50; unknown clubs receive 10                    |
| Big Six             | All six have profiles of at least 40                                                 |
| Strength of pairing | 80% of the smaller profile rewards two prominent opponents over a one-sided headline |
| Marquee bonus       | 20 when both profiles are at least 40                                                |
| Rivalry bonus       | 25 to 45 for explicitly configured pairs, independent of home/away order             |
| Round bonus         | Final 35; semifinal 20; quarterfinal 10, using explicit provider round labels        |

Examples with scheduled fixtures and regular-season rounds:

| Fixture                                       | Score |
| --------------------------------------------- | ----: |
| Barcelona vs Real Madrid                      |   252 |
| Inter vs AC Milan                             |   218 |
| Manchester United vs Tottenham                |   188 |
| Two clubs without configured profiles in EPL  |    58 |
| The equivalent fixture in La Liga             |    54 |
| The equivalent fixture in Italian Serie A     |    51 |
| The equivalent fixture in another competition |    48 |

League preferences are a modest boost, not separate league buckets. A major match outside England can lead. A cup final also receives a bonus, including in competitions with the base multiplier.

Scheduled/live fixtures come first, then finished fixtures, then postponed/suspended/cancelled fixtures. Within each group, higher scores lead, with kickoff and stable fixture ID as tie-breakers. All fixtures remain available. An old or postponed El Clásico does not displace the current weekend's scheduled matches.

## Identity and boundaries

Configuration lives in [fixture-ranking.ts](../../src/fixture-ranking.ts). Exact normalized club aliases and competition country prevent common namesakes from borrowing another club's profile. Diacritics and punctuation are normalized. Ambiguous league names such as Premier League and Serie A require their country; missing metadata receives conservative defaults. Explicit women's, youth and reserve league names do not inherit these men's club profiles. Selected international club competitions can recognize the same clubs across countries.

These weights express the owner's audience preferences. They are not official power rankings or current standings. Version 1 does not infer title races, relegation battles, injuries or current form. Adding those signals requires verified, fresh provider coverage and bounded bonuses. No additional provider calls are made by ranking. Pool size, prediction count and user spending do not influence it.

Changes to these preferences should update the version, example scores and regressions together. The tests protect the owner's El Clásico example, all six EPL clubs, cross-league ordering, aliases, country guards, known rivalries, round recognition, stable ties, full-catalogue pagination and the browser's chronological alternative.

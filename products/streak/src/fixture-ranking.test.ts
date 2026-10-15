import assert from 'node:assert/strict';
import { fixturePriority, rankFeaturedFixtures } from './fixture-ranking';
import type { Match } from './types';

function fixture(
  id: string,
  home: string,
  away: string,
  league = 'Premier League',
  country = 'England',
): { id: string; match: Match } {
  return {
    id,
    match: {
      id,
      date: '2030-10-18',
      kickoff: '2030-10-18T18:00:00Z',
      status: 'scheduled',
      stage: 'Regular Season - 8',
      competition: { id: 'synthetic', name: league, country },
      home: { name: home, code: 'HOM', flag: '' },
      away: { name: away, code: 'AWY', flag: '' },
    },
  };
}
const clasico = fixture('clasico', 'Barcelona', 'Real Madrid', 'La Liga', 'Spain');
const unitedSpurs = fixture('united-spurs', 'Manchester United', 'Tottenham');
const ordinaryEpl = fixture('ordinary-epl', 'Home FC', 'Away FC');
const ordinaryLaLiga = fixture('ordinary-la-liga', 'Home FC', 'Away FC', 'La Liga', 'Spain');
const ordinarySerieA = fixture('ordinary-serie-a', 'Home FC', 'Away FC', 'Serie A', 'Italy');
const ordinaryOther = fixture('ordinary-other', 'Home FC', 'Away FC', 'Ligue 1', 'France');
const milanDerby = fixture('milan', 'Inter', 'AC Milan', 'Serie A', 'Italy');
const fixtures = [
  ordinaryEpl,
  unitedSpurs,
  ordinaryOther,
  ordinarySerieA,
  milanDerby,
  ordinaryLaLiga,
  clasico,
];
const original = structuredClone(fixtures);
assert.deepEqual(
  rankFeaturedFixtures(fixtures).map((row) => row.id),
  [
    'clasico',
    'milan',
    'united-spurs',
    'ordinary-epl',
    'ordinary-la-liga',
    'ordinary-serie-a',
    'ordinary-other',
  ],
);
assert.deepEqual(fixtures, original, 'Ranking never changes source records or financial state.');
assert.deepEqual(fixturePriority(clasico.match).reasons, ['El Clásico', 'High-profile matchup']);
assert.ok(fixturePriority(unitedSpurs.match).reasons.includes('Big Six clash'));
const reversed = { ...clasico.match, home: clasico.match.away, away: clasico.match.home };
assert.equal(fixturePriority(reversed).score, fixturePriority(clasico.match).score);
const aliases = fixture('aliases', 'FC Barcelona', 'Real Madrid', 'LaLiga', 'Spain');
assert.equal(fixturePriority(aliases.match).score, fixturePriority(clasico.match).score);
const atletico = fixture('madrid', 'Real Madrid', 'Atlético de Madrid', 'La Liga', 'Spain');
assert.ok(fixturePriority(atletico.match).reasons.includes('Madrid derby'));
for (const team of [
  'Arsenal',
  'Chelsea',
  'Liverpool',
  'Manchester City',
  'Manchester United',
  'Tottenham Hotspur',
]) {
  assert.ok(
    fixturePriority(fixture(team, team, 'Away FC').match).score >
      fixturePriority(ordinaryEpl.match).score,
  );
}
const oneBigClub = fixture('one-big', 'Liverpool', 'Away FC');
assert.ok(fixturePriority(unitedSpurs.match).score > fixturePriority(oneBigClub.match).score);
// Country and exact-name checks prevent similarly named competitions/clubs
// from receiving a bonus intended for a different league or team.
const brazil = fixture('brazil', 'Inter', 'Milan', 'Serie A', 'Brazil');
assert.equal(fixturePriority(brazil.match).score, fixturePriority(ordinaryOther.match).score);
const youth = fixture('youth', 'Liverpool U21', 'Manchester City U21');
assert.equal(fixturePriority(youth.match).score, fixturePriority(ordinaryEpl.match).score);
const women = fixture('women', 'Liverpool', 'Manchester City', "Women's Super League");
assert.equal(fixturePriority(women.match).score, fixturePriority(ordinaryOther.match).score);
const unknown = { ...clasico.match, competition: undefined };
assert.equal(fixturePriority(unknown).score, fixturePriority(ordinaryOther.match).score);
const semi = { ...ordinaryOther.match, stage: 'Semi-finals' };
const final = { ...ordinaryOther.match, stage: 'Final' };
assert.ok(fixturePriority(final).score > fixturePriority(semi).score);
assert.equal(
  fixturePriority({ ...ordinaryOther.match, stage: 'Final round - Group 1' }).score,
  fixturePriority(ordinaryOther.match).score,
);
// A major cup final can outrank a routine EPL fixture without changing the
// league preferences. Postponed/final games remain visible below live/upcoming.
const europeanFinal = fixture(
  'european-final',
  'Bayern München',
  'Paris Saint-Germain',
  'UEFA Champions League',
  'World',
);
europeanFinal.match.stage = 'Final';
assert.ok(fixturePriority(europeanFinal.match).score > fixturePriority(unitedSpurs.match).score);
for (const status of ['final', 'postponed', 'cancelled', 'suspended'] as const) {
  assert.equal(
    rankFeaturedFixtures([{ ...clasico, match: { ...clasico.match, status } }, ordinaryEpl])[0].id,
    ordinaryEpl.id,
  );
}
const tieA = fixture('a', 'Home FC', 'Away FC');
const tieB = fixture('b', 'Home FC', 'Away FC');
assert.deepEqual(
  rankFeaturedFixtures([tieB, tieA]).map((row) => row.id),
  ['a', 'b'],
);
tieB.match.kickoff = '2030-10-18T17:00:00Z';
assert.deepEqual(
  rankFeaturedFixtures([tieA, tieB]).map((row) => row.id),
  ['b', 'a'],
);
console.log(
  'Fixture ranking passed: league preferences, marquee overrides, Big Six, aliases, competition guards, rivalries, knockout stages, lifecycle and stable ties.',
);

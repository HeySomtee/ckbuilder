import type { Competition, Match, Team } from './types';

/** Editorial discovery preferences, not odds, current form or official team rankings. */
export const FIXTURE_RANKING_VERSION = 1;
type Fixture = Pick<Match, 'competition' | 'home' | 'away' | 'stage' | 'status' | 'kickoff'>;
type Region = 'england' | 'spain' | 'italy' | 'germany' | 'france' | 'scotland';
interface Club {
  key: string;
  region: Region;
  profile: number;
  aliases: string[];
}
const clubs: Club[] = [
  { key: 'arsenal', region: 'england', profile: 45, aliases: ['Arsenal'] },
  { key: 'chelsea', region: 'england', profile: 45, aliases: ['Chelsea'] },
  { key: 'liverpool', region: 'england', profile: 50, aliases: ['Liverpool'] },
  { key: 'man-city', region: 'england', profile: 50, aliases: ['Manchester City', 'Man City'] },
  {
    key: 'man-utd',
    region: 'england',
    profile: 45,
    aliases: ['Manchester United', 'Man United', 'Man Utd'],
  },
  { key: 'spurs', region: 'england', profile: 40, aliases: ['Tottenham', 'Tottenham Hotspur'] },
  { key: 'newcastle', region: 'england', profile: 30, aliases: ['Newcastle', 'Newcastle United'] },
  { key: 'villa', region: 'england', profile: 28, aliases: ['Aston Villa'] },
  { key: 'everton', region: 'england', profile: 20, aliases: ['Everton'] },
  { key: 'sunderland', region: 'england', profile: 15, aliases: ['Sunderland'] },
  {
    key: 'barcelona',
    region: 'spain',
    profile: 50,
    aliases: ['Barcelona', 'FC Barcelona', 'Barca'],
  },
  { key: 'real-madrid', region: 'spain', profile: 50, aliases: ['Real Madrid'] },
  {
    key: 'atletico',
    region: 'spain',
    profile: 40,
    aliases: ['Atletico Madrid', 'Atletico de Madrid'],
  },
  { key: 'athletic', region: 'spain', profile: 28, aliases: ['Athletic Club', 'Athletic Bilbao'] },
  { key: 'sociedad', region: 'spain', profile: 25, aliases: ['Real Sociedad'] },
  { key: 'sevilla', region: 'spain', profile: 25, aliases: ['Sevilla', 'Sevilla FC'] },
  { key: 'betis', region: 'spain', profile: 22, aliases: ['Real Betis'] },
  {
    key: 'inter',
    region: 'italy',
    profile: 45,
    aliases: ['Inter', 'Inter Milan', 'Internazionale'],
  },
  { key: 'milan', region: 'italy', profile: 45, aliases: ['AC Milan', 'Milan'] },
  { key: 'juventus', region: 'italy', profile: 45, aliases: ['Juventus'] },
  { key: 'napoli', region: 'italy', profile: 35, aliases: ['Napoli'] },
  { key: 'roma', region: 'italy', profile: 30, aliases: ['AS Roma', 'Roma'] },
  { key: 'lazio', region: 'italy', profile: 28, aliases: ['Lazio'] },
  { key: 'atalanta', region: 'italy', profile: 28, aliases: ['Atalanta'] },
  {
    key: 'bayern',
    region: 'germany',
    profile: 50,
    aliases: ['Bayern Munich', 'Bayern Munchen', 'FC Bayern Munchen'],
  },
  { key: 'dortmund', region: 'germany', profile: 40, aliases: ['Borussia Dortmund', 'Dortmund'] },
  {
    key: 'leverkusen',
    region: 'germany',
    profile: 30,
    aliases: ['Bayer Leverkusen', 'Bayer 04 Leverkusen'],
  },
  {
    key: 'psg',
    region: 'france',
    profile: 45,
    aliases: ['Paris Saint Germain', 'Paris Saint-Germain', 'PSG'],
  },
  {
    key: 'marseille',
    region: 'france',
    profile: 30,
    aliases: ['Marseille', 'Olympique Marseille', 'Olympique de Marseille'],
  },
  { key: 'lyon', region: 'france', profile: 28, aliases: ['Lyon', 'Olympique Lyonnais'] },
  { key: 'celtic', region: 'scotland', profile: 30, aliases: ['Celtic'] },
  { key: 'rangers', region: 'scotland', profile: 30, aliases: ['Rangers'] },
];
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
const clubByAlias = new Map(
  clubs.flatMap((club) => club.aliases.map((alias) => [normalize(alias), club] as const)),
);
const bigSix = new Set(['arsenal', 'chelsea', 'liverpool', 'man-city', 'man-utd', 'spurs']);
const pair = (a: string, b: string) => [a, b].sort().join(':');
const rivalries = new Map([
  [pair('barcelona', 'real-madrid'), { bonus: 45, label: 'El Clásico' }],
  [pair('man-utd', 'liverpool'), { bonus: 35, label: 'Historic rivalry' }],
  [pair('arsenal', 'spurs'), { bonus: 35, label: 'North London derby' }],
  [pair('man-city', 'man-utd'), { bonus: 35, label: 'Manchester derby' }],
  [pair('liverpool', 'everton'), { bonus: 30, label: 'Merseyside derby' }],
  [pair('newcastle', 'sunderland'), { bonus: 25, label: 'Tyne-Wear derby' }],
  [pair('real-madrid', 'atletico'), { bonus: 35, label: 'Madrid derby' }],
  [pair('athletic', 'sociedad'), { bonus: 25, label: 'Basque derby' }],
  [pair('sevilla', 'betis'), { bonus: 25, label: 'Seville derby' }],
  [pair('inter', 'milan'), { bonus: 40, label: 'Milan derby' }],
  [pair('inter', 'juventus'), { bonus: 35, label: 'Derby d’Italia' }],
  [pair('roma', 'lazio'), { bonus: 30, label: 'Rome derby' }],
  [pair('bayern', 'dortmund'), { bonus: 30, label: 'Major rivalry' }],
  [pair('psg', 'marseille'), { bonus: 30, label: 'Le Classique' }],
  [pair('celtic', 'rangers'), { bonus: 35, label: 'Old Firm' }],
]);
function leagueMultiplier(competition?: Competition): number {
  const country = normalize(competition?.country ?? '');
  const name = normalize(competition?.name ?? '');
  if (country === 'england' && ['premier league', 'english premier league', 'epl'].includes(name))
    return 120;
  if (country === 'spain' && ['la liga', 'laliga', 'primera division'].includes(name)) return 112;
  if (country === 'italy' && ['serie a', 'serie a tim'].includes(name)) return 106;
  return 100;
}
function clubFor(team: Team, competition?: Competition): Club | undefined {
  const club = clubByAlias.get(normalize(team.name));
  if (!club) return undefined;
  const country = normalize(competition?.country ?? '');
  // Country guards prevent namesakes and similarly named youth/women's leagues
  // from borrowing the men's club profile. Exact aliases only, never substrings.
  const leagueName = normalize(competition?.name ?? '');
  if (/\b(women|womens|youth|u\s?\d{2}|under\s?\d{2}|reserve)\b/.test(leagueName)) return undefined;
  if (country === club.region) return club;
  if (
    country === 'world' &&
    [
      'uefa champions league',
      'uefa europa league',
      'uefa conference league',
      'fifa club world cup',
    ].includes(leagueName)
  )
    return club;
  return undefined;
}

export function fixturePriority(match: Fixture) {
  const home = clubFor(match.home, match.competition);
  const away = clubFor(match.away, match.competition);
  const homeProfile = home?.profile ?? 10;
  const awayProfile = away?.profile ?? 10;
  const strengthOfPair = Math.min(homeProfile, awayProfile) * 0.8;
  const marquee = homeProfile >= 40 && awayProfile >= 40 ? 20 : 0;
  const rivalry = home && away ? rivalries.get(pair(home.key, away.key)) : undefined;
  const stage = normalize(match.stage);
  // Exact stages avoid treating "semi-final", "quarter-final" or a group
  // called "final round" as the tournament final.
  const stageBonus =
    stage === 'final'
      ? 35
      : /^semi finals?(?: \d+(?:st|nd) leg)?$/.test(stage)
        ? 20
        : /^quarter finals?(?: \d+(?:st|nd) leg)?$/.test(stage)
          ? 10
          : 0;
  const multiplier = leagueMultiplier(match.competition);
  const score = Math.round(
    ((20 +
      homeProfile +
      awayProfile +
      strengthOfPair +
      marquee +
      (rivalry?.bonus ?? 0) +
      stageBonus) *
      multiplier) /
      100,
  );
  const reasons = [
    ...(rivalry ? [rivalry.label] : []),
    ...(home && away && bigSix.has(home.key) && bigSix.has(away.key)
      ? ['Big Six clash']
      : marquee
        ? ['High-profile matchup']
        : []),
    ...(stageBonus ? [stage === 'final' ? 'Cup final' : 'Knockout tie'] : []),
  ];
  // Keep unavailable and completed fixtures discoverable without letting an
  // old marquee game displace the weekend's playable/live matches.
  const lifecycle =
    match.status === 'scheduled' || match.status === 'live' ? 0 : match.status === 'final' ? 1 : 2;
  return { version: FIXTURE_RANKING_VERSION, score, lifecycle, reasons, multiplier };
}

/** Rank the full filtered catalogue before pagination, without mutating it. */
export function rankFeaturedFixtures<T extends { id: string; match: Fixture }>(fixtures: T[]): T[] {
  return fixtures
    .map((fixture) => ({ fixture, priority: fixturePriority(fixture.match) }))
    .sort(
      (a, b) =>
        a.priority.lifecycle - b.priority.lifecycle ||
        b.priority.score - a.priority.score ||
        a.fixture.match.kickoff.localeCompare(b.fixture.match.kickoff) ||
        a.fixture.id.localeCompare(b.fixture.id),
    )
    .map((row) => row.fixture);
}

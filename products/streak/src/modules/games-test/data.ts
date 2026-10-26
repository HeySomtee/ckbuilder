import type { FiveFeed } from '../five/service';
import type { Player, Stats, Terms } from '../five/domain';
import { FiveError, scorePlayer } from '../five/domain';
import type { PlayerProfile, ScoutPlayer } from '../five/scouting';
import type { Match } from '../../types';

export const clubs = [
  'Arsenal',
  'Aston Villa',
  'Bournemouth',
  'Brentford',
  'Brighton',
  'Chelsea',
  'Crystal Palace',
  'Everton',
  'Fulham',
  'Ipswich',
  'Leeds',
  'Leicester',
  'Liverpool',
  'Manchester City',
  'Manchester United',
  'Newcastle',
  'Nottingham Forest',
  'Southampton',
  'Tottenham',
  'West Ham',
];
const roles = ['GK', 'DEF', 'MID', 'MID', 'FWD'] as const;
export const samplePlayers: Player[] = clubs.slice(0, 8).flatMap((team, t) =>
  roles.map((position, p) => ({
    id: String(t * 5 + p + 1),
    name: `${['Alex', 'Jordan', 'Sam', 'Morgan', 'Jamie'][p]} ${String.fromCharCode(65 + t)}.`,
    teamId: String(t + 1),
    team,
    position,
    cost: 45 + p * 8 + t,
    fixtureId: `test-fixture-${Math.floor(t / 2)}`,
  })),
);
export function sampleStats(id: string, event: number): Stats {
  const n = Number(id) + event;
  if (n % 13 === 0)
    return {
      minutes: 0,
      goals: 0,
      assists: 0,
      conceded: 0,
      saves: 0,
      penaltySaves: 0,
      yellow: 0,
      red: 0,
      ownGoals: 0,
      penaltyMisses: 0,
    };
  return {
    minutes: n % 13 === 0 ? 0 : 90,
    goals: n % 5 === 0 ? 2 : n % 3 === 0 ? 1 : 0,
    assists: n % 4 === 0 ? 1 : 0,
    conceded: n % 3,
    saves: n % 7,
    penaltySaves: 0,
    yellow: n % 11 === 0 ? 1 : 0,
    red: 0,
    ownGoals: 0,
    penaltyMisses: 0,
  };
}
/** Synthetic provider, selected explicitly. Never a fallback for an unavailable live feed. */
export class DummyFiveFeed implements FiveFeed {
  readonly available = true;
  async catalogue(event: number): Promise<Terms> {
    const now = Date.now();
    return {
      name: `Test gameweek ${event}`,
      lockAt: new Date(now + 7 * 86400000).toISOString(),
      finalizeAfter: new Date(now + 8 * 86400000).toISOString(),
      limit: 1000,
      qualifyingBps: 500,
      sponsorship: true,
      sponsorshipMode: 'auction',
      minimumShannons: '10000000000',
      source: `Synthetic gameweek ${event}`,
      players: samplePlayers,
    };
  }
  async scouting() {
    return {
      observedAt: new Date().toISOString(),
      players: samplePlayers.map((p): ScoutPlayer => ({
        id: p.id,
        name: p.name,
        fullName: `${p.name} (sample player)`,
        team: p.team,
        teamCode: p.team.slice(0, 3).toUpperCase(),
        position: p.position,
        price: p.cost,
        form: 3 + (Number(p.id) % 7),
        totalPoints: 30 + Number(p.id),
        eventPoints: Number(p.id) % 12,
        pointsPerGame: 4.2,
        selectedPercent: Number(p.id) % 30,
        transfersIn: 1000 + Number(p.id) * 100,
        transfersOut: Number(p.id) * 20,
        minutes: 630,
        goals: Number(p.id) % 5,
        assists: Number(p.id) % 4,
        cleanSheets: 2,
        status: 'a',
        news: 'Synthetic scouting statistics for testing.',
        chance: 100,
      })),
    };
  }
  async schedule() {
    const teams: Record<string, PlayerProfile['fixtures']> = {};
    for (const player of samplePlayers) {
      teams[player.teamId] ??= [1, 2, 3].map((event) => ({
        event,
        opponent: clubs[event + 5].slice(0, 3).toUpperCase(),
        home: event % 2 === 0,
        kickoff: new Date(Date.now() + event * 7 * 86400000).toISOString(),
        difficulty: event + 1,
      }));
    }
    return { observedAt: new Date().toISOString(), teams };
  }
  async profile(id: number): Promise<PlayerProfile> {
    const player = (await this.scouting()).players.find((p) => p.id === String(id));
    const p = samplePlayers.find((p) => p.id === String(id));
    if (!player || !p) throw new FiveError('Sample player not found.', 404);
    return {
      observedAt: new Date().toISOString(),
      player,
      history: [1, 2, 3, 4, 5].map((event) => {
        const stats = sampleStats(String(id), event);
        return {
          fixtureId: `sample-${event}`,
          event,
          opponent: clubs[event],
          home: event % 2 === 0,
          kickoff: new Date(Date.now() - event * 7 * 86400000).toISOString(),
          minutes: stats.minutes,
          goals: stats.goals,
          assists: stats.assists,
          fplPoints: scorePlayer(p.position, stats).points,
          fivePoints: scorePlayer(p.position, stats).points,
        };
      }),
      fixtures: [1, 2, 3].map((event) => ({
        event,
        opponent: clubs[event + 5],
        home: event % 2 === 0,
        kickoff: new Date(Date.now() + event * 7 * 86400000).toISOString(),
        difficulty: event + 1,
      })),
    };
  }
  async results(event: number, terms: Terms) {
    return {
      stats: Object.fromEntries(terms.players.map((p) => [p.id, sampleStats(p.id, event)])),
      source: 'Synthetic results, controlled by the test admin',
      complete: true,
    };
  }
}
export function sampleFixtures(anchor: number): Match[] {
  return [0, 1, 2].flatMap((round) =>
    Array.from({ length: 10 }, (_, i): Match => {
      const kickoff = new Date(anchor + (round + 1) * 7 * 86400000).toISOString();
      const team = (n: number) => ({
        id: String(n + 1),
        name: clubs[n],
        code: clubs[n].slice(0, 3).toUpperCase(),
        flag: '',
      });
      return {
        id: `test-${anchor}-${round}-${i}`,
        competition: { id: '39', name: 'Synthetic Premier League' },
        oracle: {
          provider: 'api-football',
          fixtureId: `test-${round}-${i}`,
          source: 'Synthetic test adapter',
        },
        date: kickoff.slice(0, 10),
        kickoff,
        stage: 'league',
        matchday: `Test round ${round + 1}`,
        home: team(i * 2),
        away: team(i * 2 + 1),
        status: 'scheduled',
      };
    }),
  );
}

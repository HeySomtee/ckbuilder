import { gamesPath } from '../../lib/games-data';
import { isRecord, request } from '../../lib/http';
import type { FixtureOutlook } from '../../components/fixture-run';
export type ScoutPlayer = {
  id: string;
  name: string;
  fullName: string;
  team: string;
  teamCode: string;
  position: string;
  price: number;
  form: number;
  totalPoints: number;
  eventPoints: number;
  pointsPerGame: number;
  selectedPercent: number;
  transfersIn: number;
  transfersOut: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  status: string;
  news: string;
  chance: number | null;
};
const bad = (): never => {
  throw Error('Player statistics could not be verified. Please retry.');
};
const obj = (v: unknown) => (isRecord(v) ? v : bad());
const str = (v: unknown) => (typeof v === 'string' && v.length <= 1000 ? v : bad());
const num = (v: unknown) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1000000000 ? v : bad();
const arr = (v: unknown, max = 1000): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : bad();
const bool = (v: unknown) => (typeof v === 'boolean' ? v : bad());
function player(v: unknown): ScoutPlayer {
  const p = obj(v);
  return {
    id: str(p.id),
    name: str(p.name),
    fullName: str(p.fullName),
    team: str(p.team),
    teamCode: str(p.teamCode),
    position: str(p.position),
    price: num(p.price),
    form: num(p.form),
    totalPoints: num(p.totalPoints),
    eventPoints: num(p.eventPoints),
    pointsPerGame: num(p.pointsPerGame),
    selectedPercent: num(p.selectedPercent),
    transfersIn: num(p.transfersIn),
    transfersOut: num(p.transfersOut),
    minutes: num(p.minutes),
    goals: num(p.goals),
    assists: num(p.assists),
    cleanSheets: num(p.cleanSheets),
    status: str(p.status),
    news: str(p.news),
    chance: p.chance === null ? null : num(p.chance),
  };
}
export async function loadScouting(signal?: AbortSignal) {
  const data = obj(await request(gamesPath('/five?scout=1'), signal));
  return { observedAt: str(data.observedAt), players: arr(data.players).map(player) };
}
export async function loadSchedule(signal?: AbortSignal) {
  const data = obj(await request(gamesPath('/five?schedule=1'), signal));
  const teams = obj(data.teams),
    result: Record<string, FixtureOutlook[]> = {};
  if (Object.keys(teams).length > 30) bad();
  for (const [id, fixtures] of Object.entries(teams)) {
    if (!/^[1-9][0-9]{0,2}$/.test(id)) bad();
    result[id] = arr(fixtures, 3).map((v) => {
      const f = obj(v),
        kickoff = f.kickoff === null ? null : str(f.kickoff),
        difficulty = num(f.difficulty);
      if (
        (kickoff !== null && !Number.isFinite(Date.parse(kickoff))) ||
        !Number.isInteger(difficulty) ||
        difficulty < 1 ||
        difficulty > 5
      )
        bad();
      return {
        opponent: str(f.opponent),
        home: bool(f.home),
        kickoff,
        event: f.event === null ? null : num(f.event),
        difficulty,
      };
    });
  }
  return { observedAt: str(data.observedAt), teams: result };
}
export async function loadPlayer(id: string, signal?: AbortSignal) {
  const data = obj(await request(gamesPath(`/five?player=${encodeURIComponent(id)}`), signal));
  const p = player(data.player);
  if (p.id !== id) bad();
  return {
    observedAt: str(data.observedAt),
    player: p,
    history: arr(data.history, 100).map((v) => {
      const h = obj(v);
      return {
        fixtureId: str(h.fixtureId),
        event: num(h.event),
        opponent: str(h.opponent),
        home: bool(h.home),
        kickoff: str(h.kickoff),
        minutes: num(h.minutes),
        goals: num(h.goals),
        assists: num(h.assists),
        fplPoints: num(h.fplPoints),
        fivePoints: num(h.fivePoints),
      };
    }),
    fixtures: arr(data.fixtures, 8).map((v) => {
      const f = obj(v);
      return {
        event: f.event === null ? null : num(f.event),
        opponent: str(f.opponent),
        home: bool(f.home),
        kickoff: f.kickoff === null ? null : str(f.kickoff),
        difficulty: num(f.difficulty),
      };
    }),
  };
}

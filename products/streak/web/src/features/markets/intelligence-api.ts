import { isRecord, request, text } from '../../lib/http';
import type { Outcome } from '../predictions/draft';

type Probabilities = Record<Outcome, number>;
export interface TeamForm {
  name: string;
  rank: number;
  points: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  form: string;
}
export interface MatchIntelligence {
  fetchedAt: string;
  frozen: boolean;
  refreshing: boolean;
  warnings: string[];
  machine?: { probabilities: Probabilities; advice: string; comment: string };
  books?: { probabilities: Probabilities; count: number; margin: number };
  home?: TeamForm;
  away?: TeamForm;
  meetings: { date: string; home: string; away: string; homeGoals: number; awayGoals: number }[];
}
function integer(value: unknown, max = 100_000, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw Error('Match statistics could not be verified.');
  return value;
}
function probabilities(value: unknown): Probabilities {
  if (!isRecord(value)) throw Error('Forecast is unavailable.');
  const result = { home: 0, draw: 0, away: 0 };
  for (const side of ['home', 'draw', 'away'] as const) {
    const n = value[side];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1)
      throw Error('Forecast is unavailable.');
    result[side] = n;
  }
  return result;
}
function team(value: unknown): TeamForm | undefined {
  if (!isRecord(value)) return undefined;
  return {
    name: text(value.name),
    rank: integer(value.rank),
    points: integer(value.points, 100_000, -100),
    played: integer(value.played),
    won: integer(value.won),
    drawn: integer(value.drawn),
    lost: integer(value.lost),
    goalsFor: integer(value.goalsFor),
    goalsAgainst: integer(value.goalsAgainst),
    form: typeof value.form === 'string' ? value.form.replace(/[^WDL]/g, '').slice(-5) : '',
  };
}
export async function getMatchIntelligence(
  id: string,
  fixtureId: string,
  signal: AbortSignal,
): Promise<MatchIntelligence> {
  const response = await request(`/markets/${encodeURIComponent(id)}/insights`, signal);
  if (!isRecord(response) || !isRecord(response.insights))
    throw Error('Match intelligence is unavailable.');
  const value = response.insights;
  if (
    value.matchId !== fixtureId ||
    typeof value.frozen !== 'boolean' ||
    typeof value.fetchedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.fetchedAt))
  )
    throw Error('Match intelligence does not match this fixture.');
  const machine = isRecord(value.machine) ? value.machine : undefined,
    books = isRecord(value.bookmakers) ? value.bookmakers : undefined;
  const result: MatchIntelligence = {
    fetchedAt: value.fetchedAt,
    frozen: value.frozen,
    refreshing: response.refreshing === true,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((v): v is string => typeof v === 'string').slice(0, 6)
      : [],
    home: team(isRecord(value.table) ? value.table.home : undefined),
    away: team(isRecord(value.table) ? value.table.away : undefined),
    meetings: Array.isArray(value.headToHead)
      ? value.headToHead.slice(0, 5).map((row) => {
          if (
            !isRecord(row) ||
            typeof row.date !== 'string' ||
            !Number.isFinite(Date.parse(row.date))
          )
            throw Error('Match history is unavailable.');
          return {
            date: row.date,
            home: text(row.home),
            away: text(row.away),
            homeGoals: integer(row.homeGoals, 100),
            awayGoals: integer(row.awayGoals, 100),
          };
        })
      : [],
  };
  if (machine)
    result.machine = {
      probabilities: probabilities(machine.probabilities),
      advice: typeof machine.advice === 'string' ? machine.advice : '',
      comment:
        isRecord(machine.predictedWinner) && typeof machine.predictedWinner.comment === 'string'
          ? machine.predictedWinner.comment
          : '',
    };
  if (books) {
    if (
      typeof books.averageMargin !== 'number' ||
      !Number.isFinite(books.averageMargin) ||
      books.averageMargin < 0 ||
      books.averageMargin > 5
    )
      throw Error('Bookmaker data is unavailable.');
    result.books = {
      probabilities: probabilities(books.probabilities),
      count: integer(books.bookmakerCount, 1000),
      margin: books.averageMargin,
    };
  }
  return result;
}

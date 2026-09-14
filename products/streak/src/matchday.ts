/** Live match context is observational: it never writes bets, snapshots or results. */
import { createHash } from "crypto";
import type { InsightCoverage, Match } from "./types";

export type SectionState = "ready" | "empty" | "loading" | "scheduled" | "unavailable" | "not-covered" | "stale";
export interface MatchdaySection<T> {
  state: SectionState;
  data: T;
  updatedAt?: string;
  maxAgeSeconds?: number;
  message?: string;
}
export interface MatchdayScore {
  status: string;
  label: string;
  minute: number | null;
  extra: number | null;
  home: number | null;
  away: number | null;
  regulation: { home: number | null; away: number | null };
  venue?: string;
}
export interface MatchdayEvent {
  id: string;
  minute: number | null;
  extra: number | null;
  teamId: string;
  player: string;
  assist?: string;
  type: "goal" | "card" | "substitution" | "var" | "other";
  detail: string;
}
export interface MatchdayPlayer {
  id: string;
  name: string;
  number: number | null;
  position?: string;
  grid?: { row: number; column: number };
}
export interface MatchdayLineup {
  teamId: string;
  formation?: string;
  coach?: string;
  confirmed: boolean;
  starters: MatchdayPlayer[];
  substitutes: MatchdayPlayer[];
}
export interface MatchdayStat {
  key: string;
  label: string;
  percent: boolean;
  home: number | null;
  away: number | null;
}
export interface MatchdayData {
  matchId: string;
  provider: string;
  supported: boolean;
  fetchedAt?: string;
  scoreboard: MatchdaySection<MatchdayScore | null>;
  events: MatchdaySection<MatchdayEvent[]>;
  lineups: MatchdaySection<MatchdayLineup[]>;
  statistics: MatchdaySection<MatchdayStat[]>;
}

function nonnegative(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean" || String(value).trim() === "") return null;
  const n = Number(String(value).replace(/%$/, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const clean = (value: unknown): string => typeof value === "string" ? value.trim().slice(0, 180) : "";

export function mapMatchdayScore(row: any): MatchdayScore | null {
  if (!row?.fixture?.status?.short) return null;
  return {
    status: clean(row.fixture.status.short), label: clean(row.fixture.status.long),
    minute: nonnegative(row.fixture.status.elapsed), extra: nonnegative(row.fixture.status.extra),
    home: nonnegative(row.goals?.home), away: nonnegative(row.goals?.away),
    regulation: { home: nonnegative(row.score?.fulltime?.home), away: nonnegative(row.score?.fulltime?.away) },
    venue: clean(row.fixture.venue?.name) || undefined,
  };
}

export function mapMatchdayEvents(rows: any[], match: Match): MatchdayEvent[] {
  const events = new Map<string, MatchdayEvent>();
  for (const row of rows) {
    const teamId = String(row?.team?.id ?? "");
    if (![match.home.id, match.away.id].includes(teamId)) continue;
    const type = ({ Goal: "goal", Card: "card", subst: "substitution", Var: "var" } as const)[row.type as "Goal"] ?? "other";
    const event = {
      minute: nonnegative(row.time?.elapsed), extra: nonnegative(row.time?.extra), teamId,
      player: clean(row.player?.name) || "Player unavailable",
      assist: clean(row.assist?.name) || undefined, type,
      detail: clean(row.detail) || clean(row.type) || "Match event",
    };
    const id = createHash("sha256").update(JSON.stringify(event)).digest("hex").slice(0, 20);
    events.set(id, { id, ...event });
  }
  return [...events.values()].sort((a, b) => (b.minute ?? -1) - (a.minute ?? -1) || (b.extra ?? 0) - (a.extra ?? 0));
}

function players(rows: any): MatchdayPlayer[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const p = row?.player;
    if (!p || !clean(p.name)) return [];
    const grid = /^(\d+):(\d+)$/.exec(String(p.grid ?? ""));
    const rowNo = Number(grid?.[1]), column = Number(grid?.[2]);
    return [{
      id: String(p.id ?? ""), name: clean(p.name), number: nonnegative(p.number),
      position: clean(p.pos) || undefined,
      ...(grid && rowNo >= 1 && rowNo <= 6 && column >= 1 && column <= 6 ? { grid: { row: rowNo, column } } : {}),
    }];
  });
}

export function mapMatchdayLineups(rows: any[], match: Match): MatchdayLineup[] {
  const teams = new Map<string, MatchdayLineup>();
  for (const row of rows) {
    const teamId = String(row?.team?.id ?? "");
    if (![match.home.id, match.away.id].includes(teamId)) continue;
    const starters = players(row.startXI);
    teams.set(teamId, {
      teamId, formation: /^\d(?:-\d){1,5}$/.test(row.formation) ? row.formation : undefined,
      coach: clean(row.coach?.name) || undefined,
      confirmed: starters.length === 11, starters, substitutes: players(row.substitutes),
    });
  }
  return [...teams.values()].filter((team) => team.starters.length > 0);
}

const STATS = [
  ["Ball Possession", "Possession", true], ["Shots on Goal", "Shots on target", false],
  ["Total Shots", "Total shots", false], ["Corner Kicks", "Corners", false],
  ["Fouls", "Fouls", false], ["Yellow Cards", "Yellow cards", false],
] as const;
export function mapMatchdayStats(rows: any[], match: Match): MatchdayStat[] {
  const side = (id: string | undefined, key: string, percent: boolean) => {
    const team = rows.find((row) => id !== undefined && String(row?.team?.id) === id);
    const value = nonnegative(team?.statistics?.find((stat: any) => stat?.type === key)?.value);
    return percent && value !== null && value > 100 ? null : value;
  };
  return STATS.map(([key, label, percent]) => ({ key, label, percent, home: side(match.home.id, key, percent), away: side(match.away.id, key, percent) }));
}

export function emptyMatchday(matchId: string, supported: boolean): MatchdayData {
  const state = supported ? "loading" : "unavailable";
  const message = supported ? "Fetching match coverage…" : "Matchday detail is unavailable from this feed.";
  return { matchId, supported, provider: supported ? "api-football" : "unavailable",
    scoreboard: { state, message, data: null }, events: { state, message, data: [] },
    lineups: { state, message, data: [] }, statistics: { state, message, data: [] } };
}

/** Mark aging responses honestly, including when an entire refresh is still pending. */
export function withMatchdayFreshness(data: MatchdayData, now = Date.now()): MatchdayData {
  const fresh = <T>(section: MatchdaySection<T>): MatchdaySection<T> =>
    (section.state === "ready" || section.state === "empty") && section.updatedAt &&
    now - Date.parse(section.updatedAt) > (section.maxAgeSeconds ?? 60) * 1000
      ? { ...section, state: "stale", message: "Update delayed. Showing the last available data." } : section;
  return { ...data, scoreboard: fresh(data.scoreboard), events: fresh(data.events), lineups: fresh(data.lineups), statistics: fresh(data.statistics) };
}

type Request = (path: string, params: Record<string, string>) => Promise<any[]>;
type CacheEntry = { value?: MatchdaySection<any>; expiresAt: number; pending?: Promise<MatchdaySection<any>> };

/** Per-section TTLs, shared requests, failure backoff and bounded in-memory storage. */
export class MatchdayFeed {
  private cache = new Map<string, CacheEntry>();
  constructor(private request: Request, private coverage: (match: Match) => Promise<InsightCoverage>, private now = Date.now) {}

  private section<T>(key: string, ttl: number, empty: T, load: () => Promise<T>, hasData: (value: T) => boolean): Promise<MatchdaySection<T>> {
    let entry = this.cache.get(key);
    if (entry?.pending) return entry.pending;
    if (entry?.value && entry.expiresAt > this.now()) return Promise.resolve(entry.value);
    if (!entry) {
      for (const [oldKey, old] of this.cache) {
        if (this.cache.size < 512) break;
        if (!old.pending) this.cache.delete(oldKey);
      }
      if (this.cache.size >= 512) return Promise.resolve({ state: "unavailable", data: empty, message: "Match feed is busy. Please try again shortly." });
      entry = { expiresAt: 0 };
      this.cache.set(key, entry);
    }
    const target = entry;
    target.pending = Promise.resolve().then(load).then((data): MatchdaySection<T> => {
      target.expiresAt = this.now() + ttl;
      return target.value = { state: hasData(data) ? "ready" : "empty", data, updatedAt: new Date(this.now()).toISOString(), maxAgeSeconds: ttl / 1000 + 30 };
    }).catch((): MatchdaySection<T> => {
      target.expiresAt = this.now() + 20_000;
      return target.value = target.value?.updatedAt
        ? { ...target.value, state: "stale", message: "Update delayed. Showing the last available data." }
        : { state: "unavailable", data: empty, message: "The provider is temporarily unavailable. Retrying automatically." };
    }).finally(() => { target.pending = undefined; });
    return target.pending;
  }

  async load(match: Match): Promise<MatchdayData> {
    const id = match.oracle?.fixtureId;
    if (!id) return emptyMatchday(match.id, false);
    const data = emptyMatchday(match.id, true);
    const tooEarly = match.status === "scheduled" && Date.parse(match.kickoff) - this.now() > 90 * 60_000;
    if (tooEarly) {
      for (const key of ["scoreboard", "events", "lineups", "statistics"] as const) {
        data[key].state = "scheduled";
        data[key].message = "Match coverage opens 90 minutes before kickoff.";
      }
      return data;
    }
    let coverage: InsightCoverage;
    try { coverage = await this.coverage(match); }
    catch { return { ...emptyMatchday(match.id, false), supported: true, provider: "api-football" }; }
    const before = match.status === "scheduled" && Date.parse(match.kickoff) > this.now();
    const finished = ["final", "cancelled"].includes(match.status);
    const ttl = finished ? 300_000 : before ? 60_000 : 20_000;
    const key = `${id}:${finished ? "final" : before ? "pre" : "live"}`;
    const optional = <T>(name: string, flag: boolean | undefined, seconds: number, empty: T, loader: () => Promise<T>, present: (value: T) => boolean, wait = false): Promise<MatchdaySection<T>> => {
      if (flag === false) return Promise.resolve({ state: "not-covered", data: empty, message: `${name} are not covered for this competition.` });
      if (wait) return Promise.resolve({ state: "scheduled", data: empty, message: `${name} will appear after kickoff.` });
      return this.section(`${key}:${name}`, seconds, empty, loader, present);
    };
    const [scoreboard, events, lineups, statistics] = await Promise.all([
      this.section(`${key}:score`, ttl, null, async () => {
        const rows = await this.request("/fixtures", { id });
        return mapMatchdayScore(rows.find((row) => String(row?.fixture?.id) === id));
      }, (score) => score !== null),
      optional("Match events", coverage.events, ttl, [], async () => mapMatchdayEvents(await this.request("/fixtures/events", { fixture: id }), match), (rows) => rows.length > 0, before),
      optional("Lineups", coverage.lineups, finished ? 3_600_000 : 300_000, [], async () => mapMatchdayLineups(await this.request("/fixtures/lineups", { fixture: id }), match), (rows) => rows.length > 0),
      optional("Statistics", coverage.fixtureStatistics, finished ? 300_000 : 60_000, [], async () => mapMatchdayStats(await this.request("/fixtures/statistics", { fixture: id }), match), (rows) => rows.some((stat) => stat.home !== null || stat.away !== null), before),
    ]);
    return { ...data, fetchedAt: new Date(this.now()).toISOString(), scoreboard, events, lineups, statistics };
  }
}

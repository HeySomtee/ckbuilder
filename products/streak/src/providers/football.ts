/**
 * API-SPORTS / API-Football multi-league provider.
 *
 * The provider keeps all network I/O outside the store write lock. `init()`
 * and `fetchResults()` refresh an in-memory fixture cache; `loadFixtures()` is
 * therefore synchronous, as required by MatchDataProvider.
 *
 * Environment:
 *   API_SPORTS_KEY                 server-side API key (required)
 *   FOOTBALL_LEAGUE_IDS            comma-separated API-Football league ids
 *   FOOTBALL_SEASON                starting year, e.g. 2026 for 2026/27
 *   FOOTBALL_FIXTURE_PAST_DAYS     recovery window after downtime (default 2)
 *   FOOTBALL_FIXTURE_FUTURE_DAYS   upcoming market window (default 21)
 *   FOOTBALL_LIVE_POLL_SECONDS     live polling interval (default 20)
 *   FOOTBALL_FINAL_CONFIRMATIONS   identical terminal reads required (default 2)
 */

import type { Competition, Match, Outcome, Team } from "../types";
import type { LiveResult, MatchDataProvider, ProviderStatus } from "./types";

export const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

interface CompetitionConfig extends Competition {
  id: string;
}

const KNOWN_COMPETITIONS: Record<string, CompetitionConfig> = {
  "39": { id: "39", name: "Premier League", country: "England" },
  "140": { id: "140", name: "La Liga", country: "Spain" },
  "78": { id: "78", name: "Bundesliga", country: "Germany" },
  "135": { id: "135", name: "Serie A", country: "Italy" },
  "61": { id: "61", name: "Ligue 1", country: "France" },
  "2": { id: "2", name: "UEFA Champions League", country: "Europe" },
  "3": { id: "3", name: "UEFA Europa League", country: "Europe" },
  "848": { id: "848", name: "UEFA Conference League", country: "Europe" },
};

export const DEFAULT_FOOTBALL_LEAGUE_IDS = ["39", "140", "78", "135", "61", "2"];

const TERMINAL_STATUSES = new Set(["FT", "AET", "PEN"]);
const VOID_STATUSES = new Set(["CANC", "ABD", "AWD", "WO"]);
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);
const SUSPENDED_STATUSES = new Set(["SUSP", "INT"]);
const POSTPONED_STATUSES = new Set(["PST", "TBD"]);

type ApiFixture = any;

export interface TerminalObservation {
  signature: string;
  count: number;
}

export function nextTerminalObservation(
  previous: TerminalObservation | undefined,
  signature: string,
  required: number,
  increment: boolean,
  safelyOld: boolean,
): TerminalObservation {
  return {
    signature,
    count: safelyOld
      ? required
      : previous?.signature === signature
        ? previous.count + (increment ? 1 : 0)
        : 1,
  };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function currentEuropeanSeason(now = new Date()): number {
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

export function parseCompetitionIds(raw: string | undefined): string[] {
  const values = (raw ?? DEFAULT_FOOTBALL_LEAGUE_IDS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value));
  return [...new Set(values.length ? values : DEFAULT_FOOTBALL_LEAGUE_IDS)];
}

function competitionForId(id: string): CompetitionConfig {
  return { ...(KNOWN_COMPETITIONS[id] ?? { id, name: `Competition ${id}` }) };
}

function utcDate(offsetDays = 0, now = new Date()): string {
  const shifted = new Date(now.getTime() + offsetDays * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** Compact fallback when the fixture endpoint does not include a team code. */
export function fallbackTeamCode(name: string): string {
  const cleaned = name
    .replace(/\b(football club|futbol club|club de football|afc|fc|cf|calcio)\b/gi, " ")
    .replace(/[^a-z0-9 ]/gi, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "TBD";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  if (words.length === 2) return (words[0][0] + words[1].slice(0, 2)).toUpperCase();
  return words.map((word) => word[0]).join("").toUpperCase().slice(0, 3);
}

function teamFromApi(value: any): Team {
  const name = String(value?.name ?? "TBD");
  return {
    id: value?.id === undefined || value?.id === null ? undefined : String(value.id),
    code: String(value?.code ?? fallbackTeamCode(name)),
    name,
    flag: "⚽",
    logo: typeof value?.logo === "string" ? value.logo : undefined,
  };
}

function scorePair(fixture: ApiFixture, final: boolean): { home: number; away: number } {
  // Three-way football markets settle on the 90-minute result. For AET/PEN,
  // score.fulltime preserves that result while goals may include extra time.
  const preferred = final ? fixture?.score?.fulltime : fixture?.goals;
  const fallback = fixture?.goals;
  return {
    home: Number(preferred?.home ?? fallback?.home ?? 0),
    away: Number(preferred?.away ?? fallback?.away ?? 0),
  };
}

function outcomeFromScore(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

function apiStatus(fixture: ApiFixture): string {
  return String(fixture?.fixture?.status?.short ?? "NS").toUpperCase();
}

function fixtureId(fixture: ApiFixture): string {
  return String(fixture?.fixture?.id ?? "");
}

function internalFixtureId(fixture: ApiFixture): string {
  return `api-football-${fixtureId(fixture)}`;
}

function terminalSignature(fixture: ApiFixture): string {
  const status = apiStatus(fixture);
  const score = scorePair(fixture, TERMINAL_STATUSES.has(status));
  return `${status}:${score.home}:${score.away}`;
}

function isTrackable(status: string): boolean {
  return !TERMINAL_STATUSES.has(status) && !VOID_STATUSES.has(status) && !POSTPONED_STATUSES.has(status);
}

export function mapApiFixture(fixture: ApiFixture): Match {
  const leagueId = String(fixture?.league?.id ?? "unknown");
  const configured = competitionForId(leagueId);
  const competition: Competition = {
    id: leagueId,
    name: String(fixture?.league?.name ?? configured.name),
    country: String(fixture?.league?.country ?? configured.country ?? "") || undefined,
    logo: typeof fixture?.league?.logo === "string" ? fixture.league.logo : undefined,
  };
  const kickoff = new Date(fixture?.fixture?.date ?? Number(fixture?.fixture?.timestamp ?? 0) * 1000);
  const kickoffIso = Number.isNaN(kickoff.getTime()) ? new Date(0).toISOString() : kickoff.toISOString();
  const status = apiStatus(fixture);
  const mappedStatus: Match["status"] = LIVE_STATUSES.has(status)
    ? "live"
    : SUSPENDED_STATUSES.has(status)
      ? "suspended"
      : POSTPONED_STATUSES.has(status)
        ? "postponed"
        : VOID_STATUSES.has(status)
          ? "cancelled"
          : TERMINAL_STATUSES.has(status)
            ? "final"
            : "scheduled";

  return {
    id: internalFixtureId(fixture),
    sport: "football",
    competition,
    oracle: {
      provider: "api-football",
      fixtureId: fixtureId(fixture),
      source: API_FOOTBALL_BASE,
      status,
    },
    date: kickoffIso.slice(0, 10),
    stage: String(fixture?.league?.round ?? "Fixture"),
    home: teamFromApi(fixture?.teams?.home),
    away: teamFromApi(fixture?.teams?.away),
    kickoff: kickoffIso,
    status: mappedStatus,
    venue: String(fixture?.fixture?.venue?.name ?? "") || undefined,
    matchday: String(fixture?.league?.round ?? "") || undefined,
  };
}

export function mapApiLiveResult(
  fixture: ApiFixture,
  terminalConfirmed = false,
): LiveResult | undefined {
  const status = apiStatus(fixture);
  const liveScore = scorePair(fixture, false);
  const common = {
    home: liveScore.home,
    away: liveScore.away,
    providerStatus: status,
    source: API_FOOTBALL_BASE,
  };

  if (LIVE_STATUSES.has(status)) {
    return { ...common, finished: false, live: true };
  }
  if (SUSPENDED_STATUSES.has(status)) {
    return { ...common, finished: false, live: false, suspended: true };
  }
  if (POSTPONED_STATUSES.has(status)) {
    return { ...common, finished: false, live: false, postponed: true };
  }
  if (VOID_STATUSES.has(status) && terminalConfirmed) {
    return {
      ...common,
      finished: false,
      live: false,
      voided: true,
      confirmedAt: new Date().toISOString(),
    };
  }
  if (TERMINAL_STATUSES.has(status) && terminalConfirmed) {
    const finalScore = scorePair(fixture, true);
    return {
      ...common,
      finished: true,
      live: false,
      home: finalScore.home,
      away: finalScore.away,
      result: outcomeFromScore(finalScore.home, finalScore.away),
      confirmedAt: new Date().toISOString(),
    };
  }
  return undefined;
}

/** Distinguish paid-feed rows from legacy simulator/World Cup data in one DB. */
export function isApiFootballMatch(match: Match): boolean {
  return match.oracle?.provider === "api-football" || match.id.startsWith("api-football-");
}

class ApiFootballProvider implements MatchDataProvider {
  readonly id = "football";
  readonly allowSimulatedFallback = false;

  ownsMatch(match: Match): boolean {
    return isApiFootballMatch(match);
  }

  private readonly apiKey = process.env.API_SPORTS_KEY?.trim() ?? "";
  private readonly season = clampInt(
    process.env.FOOTBALL_SEASON,
    currentEuropeanSeason(),
    2000,
    2100,
  );
  private readonly competitionIds = parseCompetitionIds(process.env.FOOTBALL_LEAGUE_IDS);
  private readonly pastDays = clampInt(process.env.FOOTBALL_FIXTURE_PAST_DAYS, 2, 0, 14);
  private readonly futureDays = clampInt(process.env.FOOTBALL_FIXTURE_FUTURE_DAYS, 21, 1, 120);
  private readonly livePollMs = clampInt(process.env.FOOTBALL_LIVE_POLL_SECONDS, 20, 15, 300) * 1000;
  private readonly finalConfirmations = clampInt(process.env.FOOTBALL_FINAL_CONFIRMATIONS, 2, 2, 5);
  private readonly scheduleTtlMs = clampInt(process.env.FOOTBALL_SCHEDULE_REFRESH_MINUTES, 360, 30, 1440) * 60_000;
  private readonly requestTimeoutMs = clampInt(process.env.FOOTBALL_REQUEST_TIMEOUT_MS, 12_000, 3_000, 30_000);

  private fixtures = new Map<string, ApiFixture>();
  private trackedFixtureIds = new Set<string>();
  private observations = new Map<string, TerminalObservation>();
  private competitionMeta = new Map<string, CompetitionConfig>();
  private lastSyncIso?: string;
  private lastError?: string;
  private nextResultsPollAt = 0;
  private nextScheduleRefreshAt = 0;
  private pollMode = "idle";
  private requestsUsedThisProcess = 0;
  private quotaLimit?: number;
  private quotaRemaining?: number;
  private initialized = false;
  private scheduleInFlight: Promise<void> | null = null;
  private resultsInFlight: Promise<Record<string, LiveResult>> | null = null;

  async init(): Promise<void> {
    if (!this.apiKey) {
      this.lastError = "API_SPORTS_KEY is not configured";
      return;
    }
    await this.refreshSchedule(true);
  }

  loadFixtures(): Match[] {
    return [...this.fixtures.values()]
      .filter((fixture) => this.trackedFixtureIds.has(fixtureId(fixture)))
      .map(mapApiFixture)
      .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  }

  async fetchResults(): Promise<Record<string, LiveResult>> {
    if (this.resultsInFlight) return this.resultsInFlight;
    this.resultsInFlight = this.fetchResultsInner().finally(() => {
      this.resultsInFlight = null;
    });
    return this.resultsInFlight;
  }

  private async fetchResultsInner(): Promise<Record<string, LiveResult>> {
    if (!this.apiKey) return {};
    await this.refreshSchedule(false);

    const now = Date.now();
    const candidates = [...this.fixtures.values()].filter((fixture) => {
      const kickoff = Date.parse(String(fixture?.fixture?.date ?? ""));
      if (!Number.isFinite(kickoff)) return false;
      const id = fixtureId(fixture);
      const status = apiStatus(fixture);
      const unconfirmedTerminal =
        (TERMINAL_STATUSES.has(status) || VOID_STATUSES.has(status)) &&
        (this.observations.get(id)?.count ?? 0) < this.finalConfirmations;
      return kickoff - 90 * 60_000 <= now && now <= kickoff + 4 * 60 * 60_000 &&
        (!TERMINAL_STATUSES.has(status) && !VOID_STATUSES.has(status) || unconfirmedTerminal);
    });

    if (candidates.length > 0 && now >= this.nextResultsPollAt) {
      try {
        for (let i = 0; i < candidates.length; i += 20) {
          const ids = candidates.slice(i, i + 20).map(fixtureId).join("-");
          const response = await this.request("/fixtures", { ids });
          for (const fixture of response) this.mergeFixture(fixture, true);
        }
        this.lastSyncIso = new Date().toISOString();
        this.lastError = undefined;
      } catch (error) {
        this.lastError = (error as Error).message;
      }
    }

    const hasLive = [...this.fixtures.values()].some((fixture) => LIVE_STATUSES.has(apiStatus(fixture)));
    const hasUnconfirmedTerminal = candidates.some((fixture) => {
      const current = this.fixtures.get(fixtureId(fixture)) ?? fixture;
      const status = apiStatus(current);
      const count = this.observations.get(fixtureId(current))?.count ?? 0;
      return (TERMINAL_STATUSES.has(status) || VOID_STATUSES.has(status)) &&
        count < this.finalConfirmations;
    });
    const imminent = candidates.some((fixture) => {
      const kickoff = Date.parse(String(fixture?.fixture?.date ?? ""));
      return kickoff > now && kickoff - now <= 15 * 60_000;
    });

    const interval = hasLive || hasUnconfirmedTerminal
      ? this.livePollMs
      : imminent
        ? 60_000
        : candidates.length
          ? 5 * 60_000
          : 30 * 60_000;
    this.pollMode = hasLive
      ? "live"
      : hasUnconfirmedTerminal
        ? "confirming-final"
        : imminent
          ? "kickoff-watch"
          : candidates.length
            ? "match-window"
            : "idle";
    // Do not slide the deadline forward on every 20-second application tick.
    // Keep an already-armed deadline, but allow a newly-imminent/live fixture
    // to accelerate a previously idle poll.
    this.nextResultsPollAt = this.nextResultsPollAt > now
      ? Math.min(this.nextResultsPollAt, now + interval)
      : now + interval;

    return this.currentResults();
  }

  private currentResults(): Record<string, LiveResult> {
    const results: Record<string, LiveResult> = {};
    for (const fixture of this.fixtures.values()) {
      const id = fixtureId(fixture);
      const status = apiStatus(fixture);
      const terminal = TERMINAL_STATUSES.has(status) || VOID_STATUSES.has(status);
      const confirmed = !terminal || (this.observations.get(id)?.count ?? 0) >= this.finalConfirmations;
      const mapped = mapApiLiveResult(fixture, confirmed);
      if (mapped) results[internalFixtureId(fixture)] = mapped;
    }
    return results;
  }

  private async refreshSchedule(force: boolean): Promise<void> {
    if (!this.apiKey) return;
    if (!force && Date.now() < this.nextScheduleRefreshAt) return;
    if (this.scheduleInFlight) return this.scheduleInFlight;

    this.scheduleInFlight = (async () => {
      const from = utcDate(-this.pastDays);
      const to = utcDate(this.futureDays);
      let successes = 0;
      const errors: string[] = [];

      const settled = await Promise.allSettled(
        this.competitionIds.map(async (league) => {
          const response = await this.request("/fixtures", {
            league,
            season: String(this.season),
            from,
            to,
            timezone: "UTC",
          });
          for (const fixture of response) this.mergeFixture(fixture, false);
          successes += 1;
        }),
      );
      for (const result of settled) {
        if (result.status === "rejected") errors.push((result.reason as Error)?.message ?? String(result.reason));
      }

      // Keep successful competition caches, but retry a missing league quickly
      // instead of accepting a partial schedule for the full six-hour TTL.
      this.nextScheduleRefreshAt = Date.now() + (errors.length ? 60_000 : this.scheduleTtlMs);
      this.initialized = successes > 0 || this.initialized;
      if (successes > 0) {
        this.lastSyncIso = new Date().toISOString();
        this.lastError = errors.length ? `${errors.length} competition refresh(es) failed` : undefined;
      } else if (errors.length) {
        this.lastError = errors[0];
      }
    })().finally(() => {
      this.scheduleInFlight = null;
    });

    return this.scheduleInFlight;
  }

  private mergeFixture(fixture: ApiFixture, resultPoll: boolean): void {
    const id = fixtureId(fixture);
    if (!id) return;
    const status = apiStatus(fixture);
    this.fixtures.set(id, fixture);
    if (isTrackable(status)) this.trackedFixtureIds.add(id);

    const leagueId = String(fixture?.league?.id ?? "");
    if (leagueId) {
      const configured = competitionForId(leagueId);
      this.competitionMeta.set(leagueId, {
        id: leagueId,
        name: String(fixture?.league?.name ?? configured.name),
        country: String(fixture?.league?.country ?? configured.country ?? "") || undefined,
        logo: typeof fixture?.league?.logo === "string" ? fixture.league.logo : undefined,
      });
    }

    if (TERMINAL_STATUSES.has(status) || VOID_STATUSES.has(status)) {
      const signature = terminalSignature(fixture);
      const previous = this.observations.get(id);
      const kickoff = Date.parse(String(fixture?.fixture?.date ?? ""));
      const safelyOld = Number.isFinite(kickoff) && Date.now() - kickoff > 6 * 60 * 60_000;
      this.observations.set(
        id,
        nextTerminalObservation(
          previous,
          signature,
          this.finalConfirmations,
          resultPoll,
          safelyOld,
        ),
      );
    } else {
      this.observations.delete(id);
    }
  }

  private async request(path: string, params: Record<string, string>): Promise<ApiFixture[]> {
    const url = new URL(path, API_FOOTBALL_BASE);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    this.requestsUsedThisProcess += 1;

    try {
      const response = await fetch(url, {
        headers: { "x-apisports-key": this.apiKey },
        signal: controller.signal,
      });
      this.readQuota(response.headers);
      const body: any = await response.json().catch(() => ({}));
      const apiErrors = body?.errors;
      const hasApiErrors = Array.isArray(apiErrors)
        ? apiErrors.length > 0
        : apiErrors && typeof apiErrors === "object"
          ? Object.keys(apiErrors).length > 0
          : Boolean(apiErrors);
      if (!response.ok || hasApiErrors) {
        const detail = hasApiErrors ? JSON.stringify(apiErrors) : `HTTP ${response.status}`;
        throw new Error(`API-Football request failed: ${detail}`);
      }
      return Array.isArray(body?.response) ? body.response : [];
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error(`API-Football request timed out after ${this.requestTimeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private readQuota(headers: Headers): void {
    const limitHeader = headers.get("x-ratelimit-requests-limit");
    const remainingHeader = headers.get("x-ratelimit-requests-remaining");
    const limit = limitHeader === null ? Number.NaN : Number(limitHeader);
    const remaining = remainingHeader === null ? Number.NaN : Number(remainingHeader);
    if (Number.isFinite(limit)) this.quotaLimit = limit;
    if (Number.isFinite(remaining)) this.quotaRemaining = remaining;
  }

  async status(): Promise<ProviderStatus> {
    const results = this.currentResults();
    const values = Object.values(results);
    const competitions = this.competitionIds.map((id) => this.competitionMeta.get(id) ?? competitionForId(id));
    return {
      provider: "football",
      league: "Top Football",
      enabled: Boolean(this.apiKey && this.initialized),
      simulated: false,
      source: this.apiKey ? "api-key" : "missing-key",
      base: API_FOOTBALL_BASE,
      detail: `${competitions.length} competitions · ${this.season}/${String(this.season + 1).slice(-2)} · ${this.pollMode}`,
      lastSyncIso: this.lastSyncIso,
      lastError: this.lastError,
      matchCount: this.trackedFixtureIds.size,
      liveMatches: values.filter((result) => result.live).length,
      finishedMatches: values.filter((result) => result.finished).length,
      competitions,
      quota: {
        requestsLimit: this.quotaLimit,
        requestsRemaining: this.quotaRemaining,
        requestsUsedThisProcess: this.requestsUsedThisProcess,
      },
      polling: {
        mode: this.pollMode,
        nextPollIso: this.nextResultsPollAt ? new Date(this.nextResultsPollAt).toISOString() : undefined,
        scheduleRefreshIso: this.nextScheduleRefreshAt
          ? new Date(this.nextScheduleRefreshAt).toISOString()
          : undefined,
      },
    };
  }
}

export const footballProvider: MatchDataProvider = new ApiFootballProvider();

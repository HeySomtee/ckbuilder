import {
  FiveError,
  integer,
  object,
  text,
  normalizeStats,
  scorePlayer,
  type Player,
  type Position,
  type Terms,
} from './domain';
import type { FiveFeed } from './service';
import type { FplSeason, ScoutData, ScoutPlayer, PlayerProfile, FixtureSchedule } from './scouting';
const list = (value: unknown, max: number) => {
  if (!Array.isArray(value) || value.length > max)
    throw new FiveError('The player feed returned incomplete data.', 503);
  return value as unknown[];
};
/** Explicitly opt-in. Public endpoint accessibility does not grant redistribution permission. */
export class FplFiveFeed implements FiveFeed {
  private cache = new Map<string, { at: number; promise: Promise<unknown> }>();
  private activeRequests = 0;
  constructor(
    public readonly available: boolean,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async season(): Promise<FplSeason> {
    const boot = object(await this.get('bootstrap-static/'));
    const events = list(boot.events, 38).map((v) => {
      const e = object(v),
        deadline = text(e.deadline_time, 40);
      if (!Number.isFinite(Date.parse(deadline)))
        throw new FiveError('Gameweek deadline is unavailable.', 503);
      return {
        id: integer(e.id, 1, 38),
        name: text(e.name, 64),
        deadline,
        finished: e.finished === true,
        checked: e.data_checked === true,
      };
    });
    if (!events.length || new Set(events.map((e) => e.id)).size !== events.length)
      throw new FiveError('Gameweek schedule is incomplete.', 503);
    events.sort((a, b) => a.id - b.id);
    return { season: events[0].deadline.slice(0, 4), events };
  }
  async scouting(): Promise<ScoutData> {
    const boot = object(await this.get('bootstrap-static/'));
    const teams = new Map(
      list(boot.teams, 30).map((v) => {
        const t = object(v);
        return [
          integer(t.id, 1, 100),
          { name: text(t.name, 80), code: text(t.short_name ?? t.name, 80) },
        ];
      }),
    );
    const decimal = (v: unknown, max = 100000000, min = 0) => {
      const n = Number(v);
      if (v === null || v === undefined || !Number.isFinite(n) || n < min || n > max) return 0;
      return n;
    };
    return {
      observedAt: new Date().toISOString(),
      players: list(boot.elements, 1000).map((v) => {
        const p = object(v),
          team = teams.get(integer(p.team, 1, 100));
        return {
          id: String(integer(p.id, 1, 1000000)),
          name: text(p.web_name, 80),
          fullName:
            `${text(p.first_name ?? p.web_name, 80)} ${text(p.second_name ?? '', 80)}`.trim(),
          team: team?.name ?? 'Unknown club',
          teamCode: team?.code ?? '',
          position: ['GK', 'DEF', 'MID', 'FWD'][integer(p.element_type, 1, 4) - 1],
          price: integer(p.now_cost, 1, 200),
          form: decimal(p.form, 100, -100),
          totalPoints: integer(p.total_points ?? 0, -1000, 10000),
          eventPoints: integer(p.event_points ?? 0, -100, 200),
          pointsPerGame: decimal(p.points_per_game, 100, -100),
          selectedPercent: decimal(p.selected_by_percent, 100),
          transfersIn: integer(p.transfers_in_event ?? 0, 0, 100000000),
          transfersOut: integer(p.transfers_out_event ?? 0, 0, 100000000),
          minutes: integer(p.minutes ?? 0, 0, 10000),
          goals: integer(p.goals_scored ?? 0, 0, 200),
          assists: integer(p.assists ?? 0, 0, 200),
          cleanSheets: integer(p.clean_sheets ?? 0, 0, 100),
          status: text(p.status ?? 'a', 10),
          news: text(p.news ?? '', 500),
          chance:
            p.chance_of_playing_next_round == null
              ? null
              : integer(p.chance_of_playing_next_round, 0, 100),
        } satisfies ScoutPlayer;
      }),
    };
  }
  async schedule(): Promise<FixtureSchedule> {
    const [bootstrap, raw] = await Promise.all([
      this.get('bootstrap-static/'),
      this.get('fixtures/'),
    ]);
    const teams = new Map(
      list(object(bootstrap).teams, 30).map((v) => {
        const t = object(v);
        return [integer(t.id, 1, 100), text(t.short_name ?? t.name, 80)];
      }),
    );
    const outlook: FixtureSchedule['teams'] = {};
    const now = Date.now();
    const fixtures = list(raw, 500)
      .map((value) => {
        const f = object(value);
        if (
          f.kickoff_time != null &&
          (typeof f.kickoff_time !== 'string' || !Number.isFinite(Date.parse(f.kickoff_time)))
        )
          throw new FiveError('Fixture dates are unavailable.', 503);
        return f;
      })
      .filter(
        (f) =>
          f.finished !== true &&
          f.started !== true &&
          (f.kickoff_time == null || Date.parse(String(f.kickoff_time)) > now),
      );
    fixtures.sort(
      (a, b) =>
        (a.kickoff_time == null ? Infinity : Date.parse(String(a.kickoff_time))) -
        (b.kickoff_time == null ? Infinity : Date.parse(String(b.kickoff_time))),
    );
    for (const f of fixtures) {
      const h = integer(f.team_h, 1, 100),
        a = integer(f.team_a, 1, 100);
      if (!teams.has(h) || !teams.has(a))
        throw new FiveError('Fixture teams are unavailable.', 503);
      const kickoff = f.kickoff_time == null ? null : text(f.kickoff_time, 40);
      if (kickoff !== null && !Number.isFinite(Date.parse(kickoff)))
        throw new FiveError('Fixture dates are unavailable.', 503);
      for (const [id, opponent, home, difficulty] of [
        [h, a, true, f.team_h_difficulty],
        [a, h, false, f.team_a_difficulty],
      ] as const) {
        const next = (outlook[String(id)] ??= []);
        if (next.length < 3)
          next.push({
            event: f.event == null ? null : integer(f.event, 1, 38),
            opponent: teams.get(opponent)!,
            home,
            kickoff,
            difficulty: integer(difficulty, 1, 5),
          });
      }
    }
    return { observedAt: new Date().toISOString(), teams: outlook };
  }
  async profile(id: number): Promise<PlayerProfile> {
    integer(id, 1, 1000000);
    const scout = await this.scouting(),
      player = scout.players.find((p) => p.id === String(id));
    if (!player) throw new FiveError('Player not found.', 404);
    const [raw, bootstrap] = await Promise.all([
      this.get(`element-summary/${id}/`),
      this.get('bootstrap-static/'),
    ]);
    const summary = object(raw),
      teams = new Map(
        list(object(bootstrap).teams, 30).map((v) => {
          const t = object(v);
          return [integer(t.id, 1, 100), text(t.short_name ?? t.name, 80)];
        }),
      );
    const history = list(summary.history, 100)
      .map((v) => {
        const h = object(v),
          kickoff = text(h.kickoff_time, 40);
        if (!Number.isFinite(Date.parse(kickoff)))
          throw new FiveError('Player history is incomplete.', 503);
        return {
          fixtureId: String(integer(h.fixture, 1, 1000000)),
          event: integer(h.round, 1, 38),
          opponent: teams.get(integer(h.opponent_team, 1, 100)) ?? 'Unknown',
          home: h.was_home === true,
          kickoff,
          minutes: integer(h.minutes, 0, 130),
          goals: integer(h.goals_scored, 0, 20),
          assists: integer(h.assists, 0, 20),
          fplPoints: integer(h.total_points, -100, 200),
          fivePoints: scorePlayer(player.position as Position, normalizeStats(this.statistics(h)))
            .points,
        };
      })
      .sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
    const fixtures = list(summary.fixtures, 100)
      .slice(0, 8)
      .map((v) => {
        const f = object(v);
        const home = f.is_home === true;
        return {
          event: f.event == null ? null : integer(f.event, 1, 38),
          opponent: teams.get(integer(home ? f.team_a : f.team_h, 1, 100)) ?? 'Unknown',
          home,
          kickoff: f.kickoff_time == null ? null : text(f.kickoff_time, 40),
          difficulty: integer(f.difficulty, 1, 5),
        };
      });
    return { observedAt: scout.observedAt, player, history, fixtures };
  }
  private statistics(s: Record<string, unknown>) {
    return {
      minutes: s.minutes,
      goals: s.goals_scored,
      assists: s.assists,
      conceded: s.goals_conceded,
      saves: s.saves,
      penaltySaves: s.penalties_saved,
      yellow: s.yellow_cards,
      red: s.red_cards,
      ownGoals: s.own_goals,
      penaltyMisses: s.penalties_missed,
    };
  }
  private async get(path: string): Promise<unknown> {
    if (!this.available) throw new FiveError('Approved player-data access is not configured.', 503);
    const cached = this.cache.get(path);
    if (cached && Date.now() - cached.at < 60_000) return cached.promise;
    if (this.activeRequests >= 8)
      throw new FiveError('Player data is busy. Please retry in a moment.', 503);
    this.activeRequests++;
    const promise = (async () => {
      const response = await this.fetcher(`https://fantasy.premierleague.com/api/${path}`, {
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      if (!response.ok)
        throw new FiveError('The player-data provider is unavailable. Try again shortly.', 503);
      if (Number(response.headers.get('content-length') ?? 0) > 5_000_000)
        throw new FiveError('Player feed exceeded its size limit.', 503);
      const reader = response.body?.getReader();
      if (!reader) throw new FiveError('Player feed is empty.', 503);
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          size += result.value.length;
          if (size > 5_000_000) {
            await reader.cancel();
            throw new FiveError('Player feed exceeded its size limit.', 503);
          }
          chunks.push(result.value);
        }
      } finally {
        reader.releaseLock();
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
    })()
      .finally(() => {
        this.activeRequests--;
      })
      .catch((error) => {
        this.cache.delete(path);
        throw error;
      });
    if (this.cache.size >= 80) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(path, { at: Date.now(), promise });
    return promise;
  }
  async catalogue(event: number): Promise<Terms> {
    integer(event, 1, 38);
    const [raw, fixturesRaw] = await Promise.all([
      this.get('bootstrap-static/'),
      this.get(`fixtures/?event=${event}`),
    ]);
    const boot = object(raw),
      teams = new Map(
        list(boot.teams, 30).map((v) => {
          const t = object(v);
          return [integer(t.id, 1, 100), text(t.name, 80)];
        }),
      );
    const fixtures = list(fixturesRaw, 30).map(object);
    if (
      !fixtures.length ||
      fixtures.some(
        (f) =>
          f.event !== event ||
          f.started !== false ||
          typeof f.kickoff_time !== 'string' ||
          !Number.isFinite(Date.parse(f.kickoff_time)),
      )
    )
      throw new FiveError('Choose an upcoming gameweek with confirmed kickoffs.', 409);
    const byTeam = new Map<number, string[]>();
    for (const f of fixtures)
      for (const team of [integer(f.team_h, 1, 100), integer(f.team_a, 1, 100)])
        byTeam.set(team, [...(byTeam.get(team) ?? []), String(integer(f.id, 1, 1_000_000))]);
    const players: Player[] = [];
    for (const v of list(boot.elements, 1000)) {
      const p = object(v),
        teamId = integer(p.team, 1, 100),
        games = byTeam.get(teamId);
      // A single fixture per player keeps the first ruleset comparable and replayable.
      if (!games || games.length !== 1 || p.status === 'u') continue;
      const pos = integer(p.element_type, 1, 4);
      players.push({
        id: String(integer(p.id, 1, 1_000_000)),
        name: text(p.web_name, 80),
        teamId: String(teamId),
        team: teams.get(teamId) ?? 'Unknown club',
        position: (['GK', 'DEF', 'MID', 'FWD'] as Position[])[pos - 1],
        cost: integer(p.now_cost, 1, 200),
        fixtureId: games[0],
      });
    }
    const dates = fixtures.map((f) => Date.parse(String(f.kickoff_time)));
    const eventRows = Array.isArray(boot.events)
      ? boot.events.map(object).filter((e) => e.id === event)
      : [];
    const official = eventRows.length === 1 ? eventRows[0].deadline_time : undefined;
    const deadline = typeof official === 'string' ? Date.parse(official) : NaN;
    if (!Number.isFinite(deadline) || deadline >= Math.min(...dates))
      throw new FiveError('The official deadline is unavailable.', 503);
    return {
      name: `Gameweek ${event}`,
      lockAt: new Date(deadline).toISOString(),
      finalizeAfter: new Date(Math.max(...dates) + 30 * 3_600_000).toISOString(),
      limit: 1000,
      qualifyingBps: 500,
      sponsorship: false,
      minimumShannons: '10000000000',
      source: `FPL event ${event}`,
      players,
    };
  }
  async results(event: number, terms: Terms) {
    integer(event, 1, 38);
    const [live, rawFixtures] = await Promise.all([
      this.get(`event/${event}/live/`),
      this.get(`fixtures/?event=${event}`),
    ]);
    const fixtures = new Map(
      list(rawFixtures, 30).map((v) => {
        const f = object(v);
        return [String(integer(f.id, 1, 1_000_000)), f];
      }),
    );
    const elements = new Map(
      list(object(live).elements, 1000).map((v) => {
        const p = object(v);
        return [String(integer(p.id, 1, 1_000_000)), object(p.stats)];
      }),
    );
    const stats: Record<string, unknown> = {};
    let complete = true;
    for (const player of terms.players) {
      const fixture = fixtures.get(player.fixtureId),
        s = elements.get(player.id);
      const teamFixtures = [...fixtures.entries()].filter(([, f]) =>
        [f.team_h, f.team_a].map(String).includes(player.teamId),
      );
      if (teamFixtures.length !== 1 || teamFixtures[0][0] !== player.fixtureId)
        throw new FiveError(
          'The fixture slate changed. Automatic scoring is paused for review.',
          409,
        );
      if (!fixture || (fixture.started !== true && fixture.finished !== true) || !s) {
        complete = false;
        continue;
      }
      if (fixture.finished !== true || fixture.finished_provisional !== true) complete = false;
      if (![fixture.team_h, fixture.team_a].map(String).includes(player.teamId))
        throw new FiveError('Fixture teams changed. Scores need review.', 409);
      const values = {
        minutes: s.minutes,
        goals: s.goals_scored,
        assists: s.assists,
        conceded: s.goals_conceded,
        saves: s.saves,
        penaltySaves: s.penalties_saved,
        yellow: s.yellow_cards,
        red: s.red_cards,
        ownGoals: s.own_goals,
        penaltyMisses: s.penalties_missed,
      };
      stats[player.id] = values;
    }
    const kickoffs = [...fixtures.values()].map((f) => Date.parse(String(f.kickoff_time)));
    const finalizeNotBefore =
      kickoffs.length > 0 && kickoffs.every(Number.isFinite)
        ? Math.max(...kickoffs) + 30 * 3600000
        : undefined;
    return {
      stats,
      complete,
      finalizeNotBefore,
      source: `FPL event ${event}; observed ${new Date().toISOString()}`,
    };
  }
}

import assert from 'node:assert/strict';
import { FiveService, type FiveFeed } from './modules/five/service';
import { FplFiveFeed } from './modules/five/feed';
import {
  newRound,
  normalizeStats,
  parseTerms,
  saveEntry,
  scorePlayer,
  type Round,
} from './modules/five/domain';
import type { FiveStorage, Summary } from './modules/five/storage';
import type { FplSeason } from './modules/five/scouting';

const start = Date.parse('2030-08-01T00:00:00Z');
const hour = 3600000;
const players = ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
  id: String(i + 1),
  name: `Player ${i}`,
  teamId: String(i + 1),
  team: `Club ${i}`,
  position,
  cost: 75,
  fixtureId: String(i + 1),
}));
const zero = {
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
function terms(event: number) {
  return parseTerms({
    name: `Gameweek ${event}`,
    lockAt: new Date(start + event * 24 * hour).toISOString(),
    finalizeAfter: new Date(start + (event * 24 + 32) * hour).toISOString(),
    limit: 100,
    qualifyingBps: 500,
    sponsorship: false,
    minimumShannons: '10000000000',
    source: `FPL event ${event}`,
    players,
  });
}
class Store implements FiveStorage {
  now = start;
  rows = new Map<string, Round>();
  async clock() {
    return this.now;
  }
  async list(): Promise<Summary[]> {
    return [...this.rows.values()].map((r) => ({
      id: r.id,
      state: r.state,
      name: r.terms.name,
      lockAt: r.terms.lockAt,
      createdAt: r.createdAt,
    }));
  }
  async load(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id: string, creator: string, build: (now: number) => Round) {
    const old = this.rows.get(id);
    if (old) return structuredClone(old);
    const r = build(this.now);
    this.rows.set(id, structuredClone(r));
    return r;
  }
  async change(id: string, mutate: (r: Round, now: number) => void) {
    const r = await this.load(id);
    assert.ok(r);
    mutate(r, this.now);
    r.revision++;
    this.rows.set(id, structuredClone(r));
    return r;
  }
}
async function progression() {
  const store = new Store();
  const season: FplSeason = {
    season: '2030',
    events: [1, 2, 3].map((id) => ({
      id,
      name: `Gameweek ${id}`,
      deadline: terms(id).lockAt,
      finished: false,
      checked: false,
    })),
  };
  let offline = false,
    catalogueUnavailable = false,
    complete = false;
  let cutoff = start + 100 * hour;
  const stats: Record<string, unknown> = Object.fromEntries(
    players.map((p) => [p.id, { ...zero, minutes: 90 }]),
  );
  const feed: FiveFeed = {
    available: true,
    season: async () => {
      if (offline) throw new Error('Synthetic outage');
      return structuredClone(season);
    },
    catalogue: async (event) => {
      if (catalogueUnavailable) throw new Error('Synthetic slate delay');
      return terms(event);
    },
    results: async () => ({
      stats,
      complete,
      source: 'Synthetic results',
      finalizeNotBefore: cutoff,
    }),
  };
  const svc = new FiveService(store, [], feed, undefined, undefined, true);
  await Promise.all([svc.progress(), svc.progress()]);
  assert.equal(store.rows.size, 1);
  const id = 'fpl-2030-1';
  const first = store.rows.get(id)!;
  assert.equal(first.state, 'open');
  assert.equal(first.terms.lockAt, terms(1).lockAt);
  assert.equal(first.terms.sponsorship, true);
  const hash = first.termsHash;
  await svc.progress();
  assert.equal(store.rows.get(id)!.termsHash, hash);
  const actor = { id: 'one', name: 'One', wallet: 'synthetic-one' };
  await store.change(id, (r) =>
    saveEntry(
      r,
      actor,
      players.map((p) => p.id),
      '3',
      r.termsHash,
      store.now,
    ),
  );
  assert.equal(
    (await svc.read(null)).detail!.entries[0].players,
    undefined,
    'unlocked squads stay private',
  );
  store.now = start + 25 * hour;
  catalogueUnavailable = true;
  await svc.progress();
  assert.equal(store.rows.get(id)!.scoreRevision, 1, 'next feed failure cannot block scoring');
  assert.equal((await svc.read(null)).automation.state, 'delayed');
  await assert.rejects(
    store.change(id, (r) =>
      saveEntry(
        r,
        actor,
        players.map((p) => p.id),
        '3',
        r.termsHash,
        store.now,
      ),
    ),
    /closed to squad changes/,
  );
  catalogueUnavailable = false;
  await svc.progress();
  assert.ok(store.rows.has('fpl-2030-2'));
  assert.equal((await svc.read(null)).detail!.id, 'fpl-2030-2');
  // Simulate PostgreSQL jsonb changing property order on both levels.
  const row = store.rows.get(id)!;
  row.rawStats = Object.fromEntries(
    Object.entries(row.rawStats)
      .reverse()
      .map(([k, v]) => [k, Object.fromEntries(Object.entries(v).reverse())]),
  ) as Round['rawStats'];
  const revision = row.scoreRevision;
  await svc.progress();
  assert.equal(store.rows.get(id)!.scoreRevision, revision);
  const rebooted = new FiveService(store, [], feed, undefined, undefined, true);
  await rebooted.progress();
  assert.equal(store.rows.size, 2);
  assert.equal(store.rows.get(id)!.scoreRevision, revision);
  offline = true;
  await svc.progress();
  assert.equal((await svc.read(actor, id)).detail!.entries.length, 1);
  offline = false;
  complete = true;
  store.now = start + 57 * hour;
  season.events[0].finished = true;
  await svc.progress();
  assert.equal(
    store.rows.get(id)!.state,
    'open',
    'unchecked or rescheduled result stays provisional',
  );
  season.events[0].checked = true;
  await svc.progress();
  assert.equal(store.rows.get(id)!.state, 'open', 'actual fixture correction window matters');
  cutoff = store.now;
  store.rows.get(id)!.sponsors.push({
    id: 'gift',
    accountId: 'supporter',
    wallet: 'synthetic-supporter',
    amountShannons: '10000000000',
    display: 'anonymous',
    name: '',
    logo: '',
    link: '',
    moderation: 'hidden',
    createdAt: new Date(start).toISOString(),
    funding: 'submitted',
  });
  await svc.progress();
  assert.equal(
    store.rows.get(id)!.state,
    'open',
    'signed contributions must finish recovery first',
  );
  store.rows.get(id)!.sponsors[0].funding = 'confirmed';
  await svc.progress();
  assert.equal(
    store.rows.get(id)!.state,
    'open',
    'confirmed prize funds require a backing verifier',
  );
  store.rows.get(id)!.sponsors[0].funding = 'conflicted';
  await svc.progress();
  assert.equal(store.rows.get(id)!.state, 'final');
  assert.ok(Date.parse(store.rows.get(id)!.scoresAt!) >= Date.parse(first.terms.finalizeAfter));
  const final = structuredClone(store.rows.get(id));
  stats['1'] = { ...zero, minutes: 90, goals: 1 };
  await svc.progress();
  assert.deepEqual(store.rows.get(id), final);

  // More than six delayed rounds must all eventually receive a refresh.
  const fair = new Store();
  const many: FplSeason = { season: '2030', events: [] };
  for (let n = 1; n <= 9; n++) {
    const t = terms(n);
    const r = newRound(`fpl-2030-${n}`, 'fpl-scheduler', t, start);
    r.state = 'open';
    fair.rows.set(r.id, r);
    many.events.push({ id: n, name: t.name, deadline: t.lockAt, finished: false, checked: false });
  }
  fair.now = start + 300 * hour;
  const fairService = new FiveService(
    fair,
    [],
    { ...feed, season: async () => many },
    undefined,
    undefined,
    true,
  );
  await fairService.progress();
  await fairService.progress();
  assert.ok(
    [...fair.rows.values()].every((r) => r.scoreRevision === 1),
    'all delayed gameweeks refreshed without duplicating unchanged scores',
  );
  assert.equal(
    scorePlayer('DEF', { ...zero, yellow: 1 }).points,
    0,
    'published non-appearance rule preserved with bench card observation',
  );
  assert.equal(normalizeStats({ ...zero, red: 1 }).red, 1);
  assert.throws(() => normalizeStats({ ...zero, goals: 1 }), /Non-appearance/);
}

async function adapter() {
  const p = {
    id: 1,
    web_name: 'Keeper',
    first_name: 'Test',
    second_name: 'Keeper',
    team: 1,
    element_type: 1,
    now_cost: 55,
    form: '-0.5',
    total_points: 24,
    event_points: 7,
    points_per_game: '4.2',
    selected_by_percent: '12.3',
    transfers_in_event: 1234,
    transfers_out_event: 234,
    minutes: 450,
    goals_scored: 0,
    assists: 1,
    clean_sheets: 2,
    status: 'd',
    news: 'Fitness check',
    chance_of_playing_next_round: 75,
  };
  const official = new Date(start + 24 * hour).toISOString();
  const boot = {
    teams: [
      { id: 1, name: 'Club One', short_name: 'ONE' },
      { id: 2, name: 'Club Two', short_name: 'TWO' },
    ],
    elements: [p],
    events: [
      { id: 1, name: 'Gameweek 1', deadline_time: official, finished: false, data_checked: false },
    ],
  };
  const fplStats = {
    minutes: 90,
    goals_scored: 0,
    assists: 0,
    goals_conceded: 0,
    saves: 3,
    penalties_saved: 0,
    yellow_cards: 0,
    red_cards: 0,
    own_goals: 0,
    penalties_missed: 0,
  };
  const fixture = {
    id: 1,
    event: 1,
    team_h: 1,
    team_a: 2,
    started: false,
    kickoff_time: new Date(start + 26 * hour).toISOString(),
    finished: false,
    finished_provisional: false,
  };
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    const result = url.endsWith('bootstrap-static/')
      ? boot
      : url.includes('element-summary')
        ? {
            history: [
              {
                ...fplStats,
                fixture: 3,
                round: 1,
                opponent_team: 2,
                was_home: true,
                kickoff_time: official,
                total_points: 10,
              },
            ],
            fixtures: [
              {
                event: 2,
                team_a: 2,
                team_h: 1,
                is_home: true,
                kickoff_time: official,
                difficulty: 3,
              },
            ],
          }
        : url.includes('/live/')
          ? { elements: [{ id: 1, stats: fplStats }] }
          : [fixture];
    return new Response(JSON.stringify(result));
  };
  const feed = new FplFiveFeed(true, fetcher);
  const [season, scout] = await Promise.all([feed.season(), feed.scouting()]);
  assert.equal(calls.filter((x) => x.endsWith('bootstrap-static/')).length, 1);
  assert.equal(season.season, '2030');
  assert.equal(scout.players[0].form, -0.5);
  assert.equal(scout.players[0].transfersIn, 1234);
  assert.equal(scout.players[0].chance, 75);
  const profile = await feed.profile(1);
  assert.equal(profile.history[0].fivePoints, 7);
  assert.equal(profile.history[0].fplPoints, 10);
  assert.equal(profile.fixtures[0].opponent, 'TWO');
  await assert.rejects(feed.profile(2), /not found/);
  const cat = await feed.catalogue(1);
  assert.equal(cat.lockAt, official);
  for (const events of [
    undefined,
    [],
    [{ ...boot.events[0], id: 2 }],
    [boot.events[0], boot.events[0]],
    [{ ...boot.events[0], deadline_time: null }],
    [{ ...boot.events[0], deadline_time: 1 }],
    [{ ...boot.events[0], deadline_time: 'invalid' }],
    [{ ...boot.events[0], deadline_time: fixture.kickoff_time }],
    [{ ...boot.events[0], deadline_time: new Date(start + 27 * hour).toISOString() }],
  ]) {
    const missingDeadline: typeof fetch = async (input) =>
      String(input).endsWith('bootstrap-static/')
        ? new Response(JSON.stringify({ ...boot, events }))
        : fetcher(input);
    await assert.rejects(
      new FplFiveFeed(true, missingDeadline).catalogue(1),
      /official deadline is unavailable/,
      'Never invent a late cutoff when official event data is missing or invalid',
    );
  }
  fixture.started = true; // New adapter avoids the intentional minute cache.
  const liveFeed = new FplFiveFeed(true, fetcher);
  const live = await liveFeed.results(1, cat);
  assert.equal(live.complete, false);
  assert.equal(Object.keys(live.stats).length, 1);
  assert.equal(live.finalizeNotBefore, start + 56 * hour);
  fixture.finished = true;
  fixture.finished_provisional = true;
  assert.equal((await new FplFiveFeed(true, fetcher).results(1, cat)).complete, true);
  await assert.rejects(new FplFiveFeed(false, fetcher).season(), /not configured/);
}
void Promise.all([progression(), adapter()]).then(() =>
  console.log('Five automatic progression, fair recovery, deduplication and FPL scouting passed.'),
);

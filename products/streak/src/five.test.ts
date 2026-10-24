import assert from 'node:assert/strict';
import {
  affordableSquad,
  allocate,
  identifier,
  newRound,
  normalizeStats,
  parseTerms,
  project,
  saveEntry,
  scorePlayer,
  standings,
  type Round,
} from './modules/five/domain';
import { FiveService } from './modules/five/service';
import { FplFiveFeed } from './modules/five/feed';
import type { FiveStorage, Summary } from './modules/five/storage';
const now = Date.now();
const players = ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
  id: `p${i}`,
  name: `Player ${i}`,
  teamId: `t${i}`,
  team: `Club ${i}`,
  position,
  cost: 80,
  fixtureId: `f${i}`,
}));
const terms = parseTerms({
  name: 'Synthetic round',
  players,
  lockAt: new Date(now + 600_000).toISOString(),
  finalizeAfter: new Date(now + 7_200_000).toISOString(),
  limit: 2,
  qualifyingBps: 500,
  sponsorship: false,
  minimumShannons: '10000000000',
  source: 'Synthetic unit test',
});
const actor = { id: 'one', name: 'Player One', wallet: 'wallet-one' },
  admin = { id: 'admin', name: 'Admin', wallet: 'admin-wallet' };
class MemoryStore implements FiveStorage {
  async clock() {
    return this.now;
  }
  rows = new Map<string, Round>();
  now = now;
  async list(): Promise<Summary[]> {
    return [...this.rows.values()].map((r) => ({
      id: r.id,
      state: r.state,
      createdAt: r.createdAt,
      name: r.terms.name,
      lockAt: r.terms.lockAt,
    }));
  }
  async load(id: string) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id: string, creator: string, build: (time: number) => Round) {
    const r = build(this.now);
    this.rows.set(id, structuredClone(r));
    return r;
  }
  async change(id: string, mutate: (r: Round, time: number) => void) {
    const r = await this.load(id);
    assert.ok(r);
    mutate(r, this.now);
    r.revision++;
    this.rows.set(id, structuredClone(r));
    return r;
  }
}
async function main() {
  assert.equal(affordableSquad(terms.players), true);
  assert.equal(affordableSquad(terms.players.map((p) => ({ ...p, teamId: 'same' }))), false);
  assert.equal(affordableSquad(terms.players.map((p) => ({ ...p, cost: 81 }))), false);
  for (const id of ['constructor', 'toString', '__proto__'])
    assert.throws(() => identifier(id), /Invalid/);
  const r = newRound('round', 'admin', terms, now);
  r.state = 'open';
  saveEntry(
    r,
    actor,
    players.map((p) => p.id),
    'p2',
    r.termsHash,
    now,
  );
  assert.throws(
    () =>
      saveEntry(
        r,
        { ...actor, id: 'other' },
        players.map((p) => p.id),
        'p2',
        r.termsHash,
        now,
      ),
    /wallet already/,
  );
  assert.throws(
    () =>
      saveEntry(
        r,
        actor,
        players.map((p) => p.id),
        'p2',
        r.termsHash,
        now + 600_000,
      ),
    /closed/,
  );
  assert.throws(
    () =>
      saveEntry(
        r,
        actor,
        players.map((p) => p.id),
        'p2',
        'wrong',
        now,
      ),
    /current gameweek/,
  );
  assert.equal(standings(r)[0].pending, true);
  assert.equal(project(r, 'admin', true, now).entries[0].players, undefined);
  assert.equal(project(r, actor.id, false, now).entries[0].players?.length, 5);
  assert.equal(project(r, null, false, now + 600_000).entries[0].players?.length, 5);
  const stats = normalizeStats({
    minutes: 90,
    goals: 1,
    assists: 1,
    conceded: 0,
    saves: 0,
    penaltySaves: 0,
    yellow: 0,
    red: 0,
    ownGoals: 0,
    penaltyMisses: 0,
  });
  assert.equal(scorePlayer('MID', stats).points, 11);
  assert.equal(scorePlayer('FWD', stats).points, 9);
  assert.throws(() => normalizeStats({ ...stats, minutes: 0 }), /Non-appearance/);
  assert.throws(() => scorePlayer('GK', { minutes: 90 }), /whole number/);
  const rows = Array.from({ length: 40 }, (_, i) => ({
    id: `e${i}`,
    points: i === 0 ? 120 : i === 1 ? 100 : 1,
    pending: false,
  }));
  const award = allocate('22000000000', rows, 500);
  assert.equal(award.rewards.e0, '12000000000');
  assert.equal(award.rewards.e1, '10000000000');
  assert.equal(award.remainderShannons, '0');
  const tie = allocate(
    '10',
    [
      { id: 'a', points: 2, pending: false },
      { id: 'b', points: 2, pending: false },
      { id: 'c', points: 2, pending: false },
    ],
    500,
  );
  assert.equal(Object.keys(tie.rewards).length, 3);
  assert.equal(tie.remainderShannons, '1');
  for (const count of [19, 20, 21])
    assert.equal(
      Object.keys(
        allocate(
          '1000',
          Array.from({ length: count }, (_, i) => ({
            id: String(i),
            points: 100 - i,
            pending: false,
          })),
          500,
        ).rewards,
      ).length,
      Math.ceil(count * 0.05),
    );
  assert.equal(
    allocate('100', [{ id: 'z', points: 0, pending: false }], 500).remainderShannons,
    '100',
  );
  assert.throws(() => allocate('100', [{ id: 'p', points: 10, pending: true }], 500), /complete/);
  assert.equal(allocate('100', [], 500).remainderShannons, '100');
  const store = new MemoryStore(),
    svc = new FiveService(store, ['admin-wallet']);
  await assert.rejects(svc.action(actor, { action: 'create', id: 'r', terms }), /configured/);
  await svc.action(admin, { action: 'create', id: 'r', terms });
  assert.equal((await svc.read(actor)).rounds.length, 0);
  const draft = await store.load('r');
  assert.ok(draft);
  await svc.action(admin, { action: 'publish', id: 'r', termsHash: draft.termsHash });
  await svc.action(actor, {
    action: 'enter',
    id: 'r',
    players: players.map((p) => p.id),
    captain: 'p2',
    termsHash: draft.termsHash,
  });
  await assert.rejects(svc.action(actor, { action: 'sponsor', id: 'r' }), /not activated/);
  await assert.rejects(
    svc.action(admin, { action: 'edit', id: 'r', revision: 2, terms }),
    /cannot be edited/,
  );
  await assert.rejects(svc.action(actor, { action: 'scores', id: 'r' }), /configured/);
  store.now = now + 7_300_000;
  const raw = Object.fromEntries(players.map((p) => [p.id, stats]));
  await svc.action(admin, {
    action: 'scores',
    id: 'r',
    stats: raw,
    source: 'Synthetic final',
    complete: true,
  });
  const scored = await store.load('r');
  assert.ok(scored);
  assert.deepEqual(scored.rawStats, raw);
  assert.equal(scored.rulesVersion, 1);
  await assert.rejects(
    svc.action(admin, { action: 'finalize', id: 'r', revision: 0 }),
    /Scores changed/,
  );
  await svc.action(admin, { action: 'finalize', id: 'r', revision: scored.revision });
  await assert.rejects(
    svc.action(admin, { action: 'scores', id: 'r', stats: raw, source: 'Later', complete: true }),
    /only update/,
  );
  const fixtures = [
    { id: 1, team_h: 1, team_a: 2, finished: true, finished_provisional: true },
    { id: 2, team_h: 1, team_a: 3, finished: true, finished_provisional: true },
  ];
  const mock: typeof fetch = async (url) =>
    new Response(
      JSON.stringify(
        String(url).includes('/live/')
          ? { elements: [{ id: 1, stats: { minutes: 180 } }] }
          : fixtures,
      ),
    );
  const feed = new FplFiveFeed(true, mock);
  await assert.rejects(
    feed.results(1, {
      ...terms,
      players: [{ ...terms.players[0], id: '1', teamId: '1', fixtureId: '1' }],
    }),
    /slate changed/,
  );
  await assert.rejects(new FplFiveFeed(false, mock).catalogue(1), /not configured/);
  console.log(
    'Five domain, service, identity, replay, payout boundaries and changed-fixture regression passed.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import {
  advance,
  createCompetition,
  join,
  observe,
  parseTerms,
  project,
  publish,
  savePick,
  type Competition,
  type Result,
  type Slate,
} from './modules/survivor/domain';
import { nextFixtureObservation } from './providers/fixture-observation';
import { confirmedResults, SurvivorService } from './modules/survivor/service';
import type { SurvivorStorage } from './modules/survivor/storage';

const now = Date.now();
const iso = (offset: number) => new Date(now + offset).toISOString();
const slate = (offset = 0): Slate => ({
  key: `round${offset}`,
  label: `Round ${offset}`,
  lockAt: iso(offset + 1000),
  resolveAt: iso(offset + 5000),
  fixtures: [
    {
      id: `fixture${offset}`,
      kickoff: iso(offset + 2000),
      home: { id: 'a', name: 'A', code: 'A' },
      away: { id: 'b', name: 'B', code: 'B' },
    },
    {
      id: `other${offset}`,
      kickoff: iso(offset + 2000),
      home: { id: 'c', name: 'C', code: 'C' },
      away: { id: 'd', name: 'D', code: 'D' },
    },
  ],
});
const terms = parseTerms({
  name: 'Test Survivor',
  mode: 'free',
  feeShannons: '0',
  prizeShannons: '100000000',
  limit: 3,
});
function competition() {
  const c = createCompetition('competition', 'admin', terms, [slate(), slate(10_000)], now);
  publish(c, now);
  join(c, 'one', 'One', c.termsHash, now);
  join(c, 'two', 'Two', c.termsHash, now);
  return c;
}
const result = (outcome: 'home' | 'draw' | 'away'): Record<string, Result> => ({
  fixture0: {
    outcome,
    home: outcome === 'away' ? 0 : 1,
    away: outcome === 'home' ? 0 : 1,
    confirmedAt: iso(3000),
  },
});
{
  const c = competition();
  savePick(c, 'one', 0, 'a', now);
  savePick(c, 'two', 0, 'b', now);
  assert.deepEqual(Object.keys(project(c, 'one', now).entries[1].picks), []);
  assert.deepEqual(Object.keys(project(c, 'admin', now).entries[0].picks), []);
  assert.equal(project(c, null, now + 1000).entries[0].picks['0'].teamId, 'a');
  assert.throws(() => savePick(c, 'one', 0, 'b', now + 1000), /locked/);
  assert.throws(() => join(c, 'three', 'Three', c.termsHash, now + 1000), /closed/);
  advance(c, result('home'), now + 3500);
  assert.equal(
    c.state,
    'running',
    'confirmed results stay provisional until published resolution time',
  );
  const corrected = result('away');
  corrected.fixture0.confirmedAt = iso(4000);
  advance(c, corrected, now + 5000);
  assert.equal(c.entries[1].status, 'winner');
  assert.equal(c.entries[0].status, 'out');
  const saved = JSON.stringify(c);
  advance(c, result('home'), now + 6000);
  assert.equal(
    JSON.stringify(c),
    saved,
    'finalization and later corrections cannot rewrite winners',
  );
}
{
  const c = competition();
  savePick(c, 'one', 0, 'a', now);
  savePick(c, 'two', 0, 'a', now);
  advance(c, result('draw'), now + 5000);
  assert.equal(c.currentRound, 1);
  assert.equal(c.entries[0].picks['0'].result, 'rescued');
  assert.throws(() => savePick(c, 'one', 1, 'a', now + 6000), /already/);
  savePick(c, 'one', 1, 'b', now + 6000);
  savePick(c, 'two', 1, 'c', now + 6000);
  advance(c, {}, now + 15000);
  assert.equal(c.state, 'complete');
  assert.equal(c.entries.filter((e) => e.status === 'winner').length, 2);
  assert.deepEqual(c.entries[0].used, ['a'], 'void restores only the affected team');
}
{
  const c = competition();
  savePick(c, 'one', 0, 'a', now);
  advance(c, result('away'), now + 5000);
  assert.equal(c.entries[1].status, 'out', 'missed picks never join the all-loss rescue');
  assert.equal(c.entries[0].status, 'winner');
}
{
  const c = competition();
  savePick(c, 'one', 0, 'a', now);
  savePick(c, 'two', 0, 'c', now);
  advance(c, result('away'), now + 5000);
  assert.equal(c.entries[0].status, 'out', 'a void advancement prevents all-loss rescue');
  assert.equal(c.entries[1].status, 'winner');
  assert.deepEqual(c.entries[1].used, []);
}
{
  const c = competition();
  advance(c, {}, now + 5000);
  assert.equal(c.state, 'cancelled');
  const single = createCompetition('one', 'admin', terms, [slate()], now);
  publish(single, now);
  join(single, 'one', 'One', single.termsHash, now);
  advance(single, {}, now + 1000);
  assert.equal(single.state, 'cancelled');
}
{
  const c = competition();
  assert.throws(() => join(c, 'three', 'Three', 'stale', now), /terms/);
  join(c, 'three', 'Three', c.termsHash, now);
  join(c, 'three', 'Three', c.termsHash, now);
  assert.equal(c.entries.length, 3);
  assert.throws(() => join(c, 'four', 'Four', c.termsHash, now), /full/);
  assert.throws(() => parseTerms({ ...terms, feeShannons: '0.5' }), /exact/);
  assert.throws(() => parseTerms({ ...terms, feeShannons: '1' }), /Free/);
  const paid = createCompetition(
    'paid',
    'admin',
    { ...terms, mode: 'paid', feeShannons: '100' },
    [slate()],
    now,
  );
  assert.throws(() => publish(paid, now), /Fee-gated/);
}
assert.deepEqual(
  confirmedResults({
    bad: {
      finished: true,
      live: false,
      home: 1,
      away: 0,
      result: 'away',
      source: 'api',
      confirmedAt: iso(3000),
    },
  }),
  {},
);
{
  const c = competition();
  savePick(c, 'one', 0, 'a', now);
  savePick(c, 'two', 0, 'b', now);
  const metadata = { kickoff: iso(2000), homeTeamId: 'a', awayTeamId: 'b' };
  observe(
    c,
    { fixture0: { ...metadata, observedAt: iso(3000), result: result('home').fixture0 } },
    now + 3500,
  );
  observe(c, {}, now + 3700);
  assert.equal(c.rounds[0].results.fixture0.outcome, 'home', 'Outage retains last observation.');
  observe(c, { fixture0: { ...metadata, observedAt: iso(4000), result: null } }, now + 4500);
  advance(c, {}, now + 5000);
  assert.equal(
    c.entries[0].picks['0'].result,
    'void',
    'Explicit withdrawal replaces the old result.',
  );
  assert.equal(c.entries[1].picks['0'].result, 'void');
  const changed = competition();
  observe(
    changed,
    { fixture0: { ...metadata, kickoff: iso(-1000), observedAt: iso(0), result: null } },
    now,
  );
  assert.throws(() => savePick(changed, 'one', 0, 'a', now), /fixture changed/);
  const first = nextFixtureObservation(
    undefined,
    metadata,
    {
      finished: true,
      live: false,
      home: 1,
      away: 0,
      result: 'home',
      source: 'api',
      confirmedAt: iso(3000),
    },
    now + 3000,
  );
  const cached = nextFixtureObservation(
    first,
    metadata,
    { ...first.result!, confirmedAt: iso(4000) },
    now + 4000,
  );
  assert.equal(
    cached.observedAt,
    iso(3000),
    'Cached reads cannot regenerate the observation timestamp.',
  );
  assert.equal(
    nextFixtureObservation(first, metadata, undefined, now + 4000).result,
    null,
    'An unconfirmed correction withdraws the old result.',
  );
  const boundary = competition();
  savePick(boundary, 'one', 0, 'a', now);
  savePick(boundary, 'two', 0, 'b', now);
  observe(
    boundary,
    {
      fixture0: [
        { ...metadata, observedAt: iso(3000), result: result('home').fixture0 },
        { ...metadata, observedAt: iso(4999), result: null },
        {
          ...metadata,
          observedAt: iso(5001),
          result: { ...result('away').fixture0, confirmedAt: iso(5001) },
        },
      ],
    },
    now + 5100,
  );
  advance(boundary, {}, now + 5100);
  assert.equal(
    boundary.entries[0].picks['0'].result,
    'void',
    'A retained pre-cutoff withdrawal cannot be overwritten by a late result.',
  );
  const noSlate = competition();
  savePick(noSlate, 'one', 0, 'a', now);
  savePick(noSlate, 'two', 0, 'a', now);
  observe(
    noSlate,
    Object.fromEntries(
      noSlate.rounds[1].fixtures.map((f) => [
        f.id,
        {
          kickoff: iso(22000),
          homeTeamId: f.home.id,
          awayTeamId: f.away.id,
          observedAt: iso(3000),
          result: null,
        },
      ]),
    ),
    now + 3000,
  );
  advance(noSlate, result('home'), now + 5000);
  assert.equal(noSlate.state, 'complete');
  assert.equal(
    noSlate.entries.filter((e) => e.status === 'winner').length,
    2,
    'A wholly changed next slate makes joint winners, never missed-pick eliminations.',
  );
  const gap = competition();
  savePick(gap, 'one', 0, 'a', now);
  savePick(gap, 'two', 0, 'b', now);
  observe(
    gap,
    { fixture0: { ...metadata, observedAt: iso(3000), result: result('home').fixture0 } },
    now + 3500,
  );
  observe(
    gap,
    { fixture0: { ...metadata, observedAt: iso(6000), result: null, historyGap: true } },
    now + 6500,
  );
  advance(gap, {}, now + 6500);
  assert.equal(
    gap.entries[0].picks['0'].result,
    'void',
    'A gap ending after cutoff cannot preserve a possibly withdrawn win.',
  );
  const newSchedule = competition();
  observe(
    newSchedule,
    { fixture0: { ...metadata, kickoff: iso(-5000), observedAt: iso(-1000), result: null } },
    now,
  );
  assert.deepEqual(
    newSchedule.rounds[0].voidFixtures,
    [],
    'Old schedule history cannot invalidate a freshly pinned schedule.',
  );
}

class MemoryStore implements SurvivorStorage {
  data: Competition[] = [competition()];
  async list() {
    return structuredClone(this.data);
  }
  async load(id: string) {
    return structuredClone(this.data.find((c) => c.id === id) ?? null);
  }
  async create(id: string, _creator: string, build: (time: number) => Competition) {
    const c = build(now);
    this.data.push(c);
    return c;
  }
  async change(id: string, change: (c: Competition, time: number) => void) {
    const c = this.data.find((c) => c.id === id)!;
    change(c, now);
    return c;
  }
  async remove(id: string) {
    const c = this.data.find((c) => c.id === id)!;
    if (c.entries.length) throw Error('Competition has entrants');
    this.data = this.data.filter((c) => c.id !== id);
  }
}
async function main() {
  const store = new MemoryStore();
  const service = new SurvivorService(store, ['admin-wallet'], () => []);
  const player = { id: 'one', name: 'One', wallet: 'player-wallet' };
  const admin = { id: 'admin', name: 'Admin', wallet: 'admin-wallet' };
  await assert.rejects(service.action(player, { action: 'delete', id: 'competition' }), /Only/);
  await assert.rejects(service.action(null, { action: 'delete', id: 'competition' }), /sign in/);
  await assert.rejects(service.action(admin, { action: 'delete', id: 'competition' }), /entrants/);
  const empty = competition();
  empty.id = 'empty';
  empty.entries = [];
  store.data.push(empty);
  const deleted = await service.action(admin, { action: 'delete', id: 'empty' });
  assert.equal(
    deleted.competitions.some((c) => c.id === 'empty'),
    false,
  );
  assert.equal(await store.load('empty'), null);
  await assert.rejects(service.action(player, { action: 'publish', id: 'competition' }), /Only/);
  await assert.rejects(service.action(null, { action: 'join', id: 'competition' }), /sign in/);
  savePick(store.data[0], 'two', 0, 'a', now);
  const read = await service.read({ id: 'admin', name: 'Admin', wallet: 'admin-wallet' });
  assert.deepEqual(
    read.detail?.entries[1].picks,
    {},
    'admin API never reveals another player before lock',
  );
  assert.equal(
    'creator' in read.competitions[0],
    false,
    'public summaries never include creator account identifiers',
  );
  console.log(
    'PASS Survivor deadlines, privacy, admin authorization, fees disabled, no-repeat, corrections, rescue, voids, winners and idempotence.',
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

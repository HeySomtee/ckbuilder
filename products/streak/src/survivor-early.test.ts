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
import { confirmedResults } from './modules/survivor/service';

const start = Date.parse('2026-11-01T00:00:00Z');
const time = (seconds: number) => start + seconds * 1000;
const iso = (seconds: number) => new Date(time(seconds)).toISOString();
const slate = (week = 0): Slate => ({
  key: `week-${week}`,
  label: `Week ${week + 1}`,
  lockAt: iso(100 + week * 1000),
  resolveAt: iso(900 + week * 1000),
  fixtures: ['a', 'c', 'e'].map((home, index) => ({
    id: `${home}-${week}`,
    kickoff: iso(200 + index * 100 + week * 1000),
    home: { id: home, name: home, code: home },
    away: { id: String.fromCharCode(home.charCodeAt(0) + 1), name: 'Away', code: 'AWY' },
  })),
});
function setup(picks: (string | null)[], rounds = 2): Competition {
  const c = createCompetition(
    'early',
    'admin',
    parseTerms({
      name: 'Early Survivor',
      mode: 'free',
      feeShannons: '0',
      prizeShannons: '0',
      limit: 10,
    }),
    Array.from({ length: rounds }, (_, week) => slate(week)),
    start,
  );
  publish(c, start);
  picks.forEach((pick, index) => {
    const id = `player-${index}`;
    join(c, id, id, c.termsHash, start);
    if (pick) savePick(c, id, 0, pick, start);
  });
  return c;
}
const result = (outcome: Result['outcome'], at = 350): Result => ({
  outcome,
  home: outcome === 'away' ? 0 : 1,
  away: outcome === 'home' ? 0 : 1,
  confirmedAt: iso(at),
});
const statuses = (c: Competition) => c.entries.map((e) => e.status);
function test(name: string, run: () => void) {
  run();
  console.log(`PASS Survivor early completion: ${name}`);
}

test('one valid picker wins at lock, never before lock or before admission closes', () => {
  const c = setup(['a', null, null]);
  assert.equal(c.ruleVersion, 'survivor-free-v2');
  const hash = c.termsHash;
  advance(c, {}, time(99));
  assert.equal(c.state, 'open');
  assert.deepEqual(project(c, null, time(99)).entries[0].picks, {});
  advance(c, {}, time(100));
  assert.equal(c.state, 'complete');
  assert.deepEqual(statuses(c), ['winner', 'out', 'out']);
  assert.equal(c.entries[1].missedRound, 0);
  assert.equal(c.entries[0].picks['0'].result, undefined, 'No fabricated match win.');
  assert.equal(c.rounds[0].state, 'final');
  assert.equal(c.rounds[0].finalizedAt, iso(100));
  assert.equal(c.termsHash, hash);
  assert.throws(() => savePick(c, 'player-0', 0, 'b', time(100)), /locked/);
});

test('one joined entrant, no entrants or everyone missing cancels, never awards a winner', () => {
  for (const picks of [[], ['a'], [null, null]]) {
    const c = setup(picks);
    advance(c, {}, time(100));
    assert.equal(c.state, 'cancelled');
    assert.ok(!statuses(c).includes('winner'));
  }
});

test('opposing confirmed picks finish before unrelated fixtures and replay cannot change winner', () => {
  const c = setup(['a', 'b']);
  advance(c, { 'a-0': result('home') }, time(350));
  assert.equal(c.state, 'complete');
  assert.deepEqual(statuses(c), ['winner', 'out']);
  assert.equal(c.entries[0].picks['0'].result, 'won');
  assert.equal(c.entries[1].picks['0'].result, 'lost');
  assert.ok(Date.parse(c.rounds[0].finalizedAt!) < Date.parse(c.rounds[0].fixtures[2].kickoff));
  const frozen = JSON.stringify(c);
  const restored = JSON.parse(frozen) as Competition;
  observe(
    restored,
    {
      'a-0': {
        observedAt: iso(450),
        kickoff: iso(200),
        homeTeamId: 'a',
        awayTeamId: 'b',
        result: result('away', 450),
      },
    },
    time(450),
  );
  advance(restored, { 'a-0': result('away', 450) }, time(950));
  assert.equal(
    JSON.stringify(restored),
    frozen,
    'Restart, replay and late correction are immutable.',
  );
});

test('published v1 keeps its correction window, including a sole picker', () => {
  const c = setup(['a', 'b']);
  c.ruleVersion = 'survivor-free-v1';
  advance(c, { 'a-0': result('home') }, time(350));
  assert.equal(c.state, 'running');
  advance(c, { 'a-0': result('away', 500) }, time(900));
  assert.deepEqual(statuses(c), ['out', 'winner']);
  const sole = setup(['a', null]);
  sole.ruleVersion = 'survivor-free-v1';
  advance(sole, {}, time(100));
  assert.equal(sole.state, 'running');
  advance(sole, {}, time(900));
  assert.equal(sole.state, 'complete');
});

test('partial losses cannot eliminate players before a pending pick might trigger all-loss rescue', () => {
  for (const last of ['home', 'away'] as const) {
    const c = setup(['a', 'c', null]);
    advance(c, { 'a-0': result('away') }, time(350));
    assert.equal(c.state, 'running');
    assert.deepEqual(statuses(c), ['active', 'active', 'out']);
    assert.equal(c.entries[0].picks['0'].result, undefined);
    advance(c, { 'c-0': result(last, 500) }, time(500));
    if (last === 'home') {
      assert.equal(c.state, 'complete');
      assert.deepEqual(statuses(c), ['out', 'winner', 'out']);
    } else {
      assert.equal(c.state, 'running', 'All-loss rescue waits for the correction cutoff.');
      advance(c, {}, time(900));
      assert.equal(c.currentRound, 1);
      assert.deepEqual(statuses(c), ['active', 'active', 'out']);
      assert.deepEqual(
        c.entries.slice(0, 2).map((e) => e.picks['0'].result),
        ['rescued', 'rescued'],
      );
      assert.deepEqual(
        c.entries.slice(0, 2).map((e) => e.used),
        [['a'], ['c']],
      );
      assert.throws(() => savePick(c, 'player-2', 1, 'e', time(950)), /run has ended/);
    }
  }
});

test('all draws are rescued at cutoff; final-round rescue shares the result', () => {
  for (const rounds of [1, 2]) {
    const c = setup(['a', 'b', null], rounds);
    advance(c, { 'a-0': result('draw') }, time(350));
    assert.equal(c.state, 'running');
    advance(c, {}, time(900));
    assert.deepEqual(
      c.entries.slice(0, 2).map((e) => e.picks['0'].result),
      ['rescued', 'rescued'],
    );
    assert.equal(c.state, rounds === 1 ? 'complete' : 'running');
    assert.deepEqual(
      statuses(c),
      rounds === 1 ? ['winner', 'winner', 'out'] : ['active', 'active', 'out'],
    );
  }
});

test('a confirmed winner still waits for another unresolved pick', () => {
  const c = setup(['a', 'c']);
  advance(c, { 'a-0': result('home') }, time(350));
  assert.equal(c.state, 'running');
  advance(c, { 'c-0': result('home', 500) }, time(500));
  assert.equal(c.state, 'running', 'Multiple winners do not open the next round prematurely.');
  advance(c, {}, time(900));
  assert.equal(c.currentRound, 1);
  assert.deepEqual(statuses(c), ['active', 'active']);
});

test('explicit voids outrank stale results, restore teams and prevent all-loss rescue', () => {
  const c = setup(['a', 'c']);
  c.rounds[0].voidFixtures.push('c-0');
  c.rounds[0].results['c-0'] = result('away');
  advance(c, { 'a-0': result('away'), 'c-0': result('away') }, time(350));
  assert.deepEqual(statuses(c), ['out', 'winner']);
  assert.equal(c.entries[1].picks['0'].result, 'void');
  assert.deepEqual(c.entries[1].used, []);
  assert.equal(c.rounds[0].results['c-0'], undefined);
  const sole = setup(['a', null]);
  sole.rounds[0].voidFixtures.push('a-0');
  advance(sole, {}, time(100));
  assert.equal(sole.state, 'complete');
  assert.equal(sole.entries[0].picks['0'].result, 'void');
  assert.deepEqual(sole.entries[0].used, []);
});

test('missing provider results stay pending until cutoff; outage then voids instead of inventing losses', () => {
  const c = setup(['a', 'c']);
  advance(c, {}, time(500));
  assert.equal(c.state, 'running');
  advance(c, {}, time(900));
  assert.equal(c.currentRound, 1);
  assert.deepEqual(
    c.entries.map((e) => e.used),
    [[], []],
  );
  assert.deepEqual(
    c.entries.map((e) => e.picks['0'].result),
    ['void', 'void'],
  );
});

test('withdrawn and corrected results before a decisive snapshot remain effective', () => {
  const c = setup(['a', 'c']);
  advance(c, { 'a-0': result('home') }, time(350));
  observe(
    c,
    {
      'a-0': {
        observedAt: iso(400),
        kickoff: iso(200),
        homeTeamId: 'a',
        awayTeamId: 'b',
        result: null,
      },
    },
    time(400),
  );
  advance(c, { 'c-0': result('home', 500) }, time(500));
  assert.equal(c.state, 'running');
  advance(c, { 'a-0': result('away', 600) }, time(600));
  assert.deepEqual(statuses(c), ['out', 'winner']);
});

test('invalid, premature or future-dated results cannot authorize an early winner', () => {
  const invalid: Result[] = [
    { ...result('home'), confirmedAt: iso(600) },
    { ...result('home'), confirmedAt: iso(199) },
    { ...result('home'), confirmedAt: 'invalid' },
    { ...result('home'), home: -1 },
    { ...result('home'), away: 0.5 },
    { ...result('home'), home: Number.MAX_SAFE_INTEGER + 1 },
    { ...result('home'), outcome: 'away' },
  ];
  for (const malformed of invalid) {
    const c = setup(['a', 'b']);
    c.rounds[0].results['a-0'] = malformed;
    advance(c, { 'a-0': malformed }, time(350));
    assert.equal(c.state, 'running');
    assert.equal(c.rounds[0].results['a-0'], undefined);
  }
  const c = setup(['a', 'b']);
  observe(
    c,
    {
      'a-0': {
        observedAt: iso(350),
        kickoff: iso(200),
        homeTeamId: 'a',
        awayTeamId: 'b',
        result: result('home', 450),
      },
    },
    time(500),
  );
  advance(c, {}, time(500));
  assert.equal(c.state, 'running', 'A confirmation cannot be later than its observation.');
  assert.deepEqual(
    confirmedResults({
      fixture: {
        finished: true,
        live: true,
        home: 1,
        away: 0,
        result: 'home',
        confirmedAt: iso(350),
        source: 'api',
      },
    }),
    {},
    'A live fixture is not a final result.',
  );
});

test('unplayable opening cancels; exhausted next choices or missed opening produce joint winners', () => {
  const opening = setup(['a', 'c']);
  opening.rounds[0].voidFixtures = opening.rounds[0].fixtures.map((f) => f.id);
  advance(opening, {}, time(50));
  assert.equal(opening.state, 'cancelled');
  for (const mode of ['exhausted', 'late', 'void'] as const) {
    const c = setup(['a', 'a']);
    if (mode === 'exhausted') c.entries[0].used = ['b', 'c', 'd', 'e', 'f'];
    if (mode === 'void') c.rounds[1].voidFixtures = c.rounds[1].fixtures.map((f) => f.id);
    advance(c, { 'a-0': result('home') }, time(mode === 'late' ? 1200 : 900));
    assert.equal(c.state, 'complete');
    assert.deepEqual(statuses(c), ['winner', 'winner']);
    assert.equal(c.currentRound, 0);
  }
});

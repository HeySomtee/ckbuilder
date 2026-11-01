import assert from 'node:assert/strict';
import { ccc } from '@ckb-ccc/core';
import type { Pool } from 'pg';
import { FiveRewards } from './modules/five/rewards';
import { SurvivorPrizes, prizeKey, prizeRound } from './modules/survivor/prizes';
import { sampleFixtures } from './modules/games-test/data';
import { sharedPrizeDatabase } from './modules/survivor/config';
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
import { confirmedResults, eligibleSlates, SurvivorService } from './modules/survivor/service';
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
  c.ruleVersion = 'survivor-free-v1';
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
  now = now;
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
    const index = this.data.findIndex((c) => c.id === id);
    assert.ok(index >= 0);
    const c = structuredClone(this.data[index]);
    change(c, this.now);
    this.data[index] = c;
    return c;
  }
  async remove(id: string) {
    const c = this.data.find((c) => c.id === id)!;
    if (c.entries.length) throw Error('Competition has entrants');
    this.data = this.data.filter((c) => c.id !== id);
  }
}
async function main() {
  await seasonAndPrizes();
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
async function seasonAndPrizes() {
  assert.equal(sharedPrizeDatabase({ DATABASE_URL: 'postgres://user:dummy@localhost/app' }), true);
  assert.equal(
    sharedPrizeDatabase({
      DATABASE_URL: 'postgres://user:dummy@localhost/app',
      STREAK_FIVE_DATABASE_URL: 'postgres://user:dummy@localhost/other',
    }),
    false,
  );
  assert.equal(
    sharedPrizeDatabase({
      DATABASE_URL: 'postgres://user:dummy@localhost/app',
      STREAK_SURVIVOR_DATABASE_URL: 'postgres://user:dummy@localhost/other',
      STREAK_FIVE_DATABASE_URL: 'postgres://user:dummy@localhost/app',
    }),
    false,
  );
  assert.equal(
    sharedPrizeDatabase({ STREAK_SURVIVOR_DATABASE_URL: 'postgres://user:dummy@localhost/shared' }),
    true,
  );
  assert.equal(
    sharedPrizeDatabase({
      STREAK_SURVIVOR_DATABASE_URL: 'postgres://one:dummy@localhost/shared',
      STREAK_FIVE_DATABASE_URL: 'postgres://two:dummy@localhost/shared',
    }),
    false,
  );
  const store = new MemoryStore();
  store.data = [];
  const fixtures = Array.from({ length: 30 }, (_, week) =>
    sampleFixtures(now)
      .slice(0, 10)
      .map((f) => ({
        ...f,
        id: `season-${week}-${f.id}`,
        matchday: `Regular Season - ${week + 9}`,
        kickoff: iso((week + 1) * 7 * 86400000),
      })),
  ).flat();
  const deadlines = new Map(
    Array.from({ length: 30 }, (_, week) => [
      week + 9,
      iso((week + 1) * 7 * 86400000 - 90 * 60000),
    ]),
  );
  const slates = eligibleSlates(fixtures, now, deadlines);
  assert.equal(slates.length, 30);
  assert.equal(slates[0].lockAt, deadlines.get(9));
  assert.equal(eligibleSlates(fixtures, Date.parse(slates[0].lockAt), deadlines).length, 29);
  assert.equal(
    eligibleSlates(fixtures, now, new Map()).length,
    0,
    'No fabricated official deadline',
  );
  const long = createCompetition(
    'long',
    'admin',
    { ...terms, prizeShannons: '0' },
    slates,
    now,
    'creator-wallet',
  );
  publish(long, now);
  assert.equal(long.rounds.length, 30);
  const noPrize = project(long, 'admin', now);
  assert.equal(noPrize.prizeStatus, 'none');
  const calendar = new SurvivorService(
    store,
    ['creator-wallet'],
    () => fixtures,
    () => ({}),
    false,
    async () => deadlines,
  );
  await calendar.action(
    { id: 'admin', name: 'Admin', wallet: 'creator-wallet' },
    {
      action: 'create',
      id: 'thirty',
      terms: { ...terms, prizeShannons: '0' },
      roundKeys: slates.map((s) => s.key),
    },
  );
  assert.equal((await store.load('thirty'))!.rounds.length, 30);

  const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  const lock = (byte: string) =>
    ccc.Script.from({
      codeHash: '0x' + '11'.repeat(32),
      hashType: 'type',
      args: '0x' + byte.repeat(20),
    });
  const address = async (byte: string) =>
    (await ccc.Address.fromScript(lock(byte), client)).toString();
  const owner = { id: 'creator', name: 'Creator', wallet: await address('22') };
  const other = { id: 'other', name: 'Other', wallet: await address('33') };
  const rewards = new FiveRewards({} as Pool, client, await address('44'));
  rewards.active = async () => true;
  rewards.account = async () => ({
    availableShannons: '0',
    pendingShannons: '0',
    paidShannons: '0',
    minimumShannons: '6100000000',
    transactionHash: '',
    status: 'none',
  });
  const credited: { id: string; prize: string; automatic: boolean }[] = [];
  rewards.credit = async (round, automatic = false) => {
    credited.push({
      id: round.id,
      prize:
        round.state === 'cancelled'
          ? round.sponsors[0].amountShannons
          : Object.values(round.rewards)
              .reduce((n, v) => n + BigInt(v), 0n)
              .toString(),
      automatic,
    });
  };
  const prizes = new SurvivorPrizes(store, rewards);
  const service = new SurvivorService(
    store,
    [owner.wallet, other.wallet],
    () => fixtures,
    () => ({}),
    false,
    async () => deadlines,
    prizes,
  );
  const c = createCompetition(
    'funded',
    owner.id,
    { ...terms, prizeShannons: '20000000001' },
    [slates[0]],
    now,
    owner.wallet,
  );
  store.data.push(c);
  await assert.rejects(service.action(owner, { action: 'publish', id: c.id }), /confirm/);
  await assert.rejects(prizes.prepare(other, c.id, true), /Only/);
  await assert.rejects(prizes.prepare(owner, c.id, false), /custody/);
  await prizes.prepare(owner, c.id, true);
  const intent = (await store.load(c.id))!.prizeFunding!;
  assert.equal(project((await store.load(c.id))!, other.id, now).prizeFunding, null);
  const cell = ccc.Cell.from({
    outPoint: { txHash: '0x' + '55'.repeat(32), index: 0 },
    cellOutput: { capacity: 100_000_000_000n, lock: lock('22') },
    outputData: '0x',
  });
  client.getCellLiveNoCache = async () => cell;
  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: cell.outPoint }],
    outputs: [
      { capacity: 20_000_000_001n, lock: lock('44') },
      { capacity: 79_999_998_999n, lock: lock('22') },
    ],
    outputsData: [intent.tag!, '0x'],
    witnesses: ['0x' + '66'.repeat(85)],
  });
  client.sendTransactionDry = async () => {
    throw Error('Synthetic invalid signature');
  };
  const bytes = ccc.hexFrom(tx.toBytes());
  await assert.rejects(prizes.submit(owner, c.id, intent.id, bytes), /Synthetic invalid/);
  assert.equal((await store.load(c.id))!.prizeFunding!.signedBytes, undefined);
  client.sendTransactionDry = async () => 1n;
  await prizes.submit(owner, c.id, intent.id, bytes);
  await prizes.submit(owner, c.id, intent.id, bytes);
  assert.equal((await store.load(c.id))!.prizeFunding!.signedBytes, bytes);
  await assert.rejects(
    service.action(owner, { action: 'edit', id: c.id, terms: c.terms, roundKeys: [slates[0].key] }),
    /funded draft/,
  );
  await assert.rejects(service.action(owner, { action: 'delete', id: c.id }), /Cancel and refund/);
  await assert.rejects(service.action(owner, { action: 'publish', id: c.id }), /confirm/);
  // Synthetic canonical headers, never a public chain transaction.
  let canonical = true;
  client.getTransactionNoCache = async () =>
    ccc.ClientTransactionResponse.from({
      status: 'committed',
      transaction: tx,
      blockHash: '0x' + '77'.repeat(32),
      blockNumber: 1n,
    });
  client.getHeaderByNumberNoCache = async () =>
    ({ hash: '0x' + (canonical ? '77' : '88').repeat(32) }) as ccc.ClientBlockHeader;
  client.getTipHeader = async () => ({ number: 24n }) as ccc.ClientBlockHeader;
  await prizes.funding.reconcile(prizeKey(c.id));
  assert.equal((await store.load(c.id))!.prizeFunding!.funding, 'confirmed');
  canonical = false;
  await assert.rejects(service.action(owner, { action: 'publish', id: c.id }), /confirmations/);
  canonical = true;
  await service.action(owner, { action: 'publish', id: c.id });
  await service.action(owner, { action: 'join', id: c.id, termsHash: c.termsHash });
  await service.action(other, { action: 'join', id: c.id, termsHash: c.termsHash });
  await assert.rejects(service.action(owner, { action: 'cancel-prize', id: c.id }), /entrants/);
  await store.change(c.id, (current) => {
    current.state = 'complete';
    current.entries.forEach((e) => {
      e.status = 'winner';
    });
  });
  const payout = prizeRound((await store.load(c.id))!);
  assert.equal(
    Object.values(payout.rewards).reduce((n, v) => n + BigInt(v), 0n),
    20_000_000_001n,
  );
  assert.equal(payout.rewards['creator-remainder'], '1');
  canonical = false;
  await assert.rejects(prizes.tick(c.id), /confirmations/);
  assert.equal(credited.length, 0);
  canonical = true;
  await prizes.tick(c.id);
  assert.equal(credited[0].automatic, true);
  assert.equal(credited[0].prize, '20000000001');
  const expired = structuredClone((await store.load(c.id))!);
  expired.id = 'expired';
  expired.entries = [];
  expired.state = 'draft';
  store.data.push(expired);
  store.now = Date.parse(expired.rounds[0].lockAt);
  await prizes.tick(expired.id);
  assert.equal((await store.load(expired.id))!.state, 'cancelled');
  assert.equal(credited.at(-1)!.prize, expired.terms.prizeShannons);
  console.log(
    'PASS Survivor 30-round/FPL deadlines, creator custody, immutable funding, canonical backing, equal shares and expiry refunds (synthetic).',
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

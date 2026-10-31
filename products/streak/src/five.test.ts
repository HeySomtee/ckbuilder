import assert from 'node:assert/strict';
import { ccc } from '@ckb-ccc/core';
import { FiveFunding } from './modules/five/funding';
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
  await fundingWitnesses();
  const metadataStore = new MemoryStore();
  const metadataRound = newRound('metadata', 'admin', { ...terms, sponsorship: true }, now);
  metadataRound.state = 'open';
  metadataStore.rows.set(metadataRound.id, metadataRound);
  const offlineClient = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  const address = async (byte: string) =>
    (
      await ccc.Address.fromScript(
        { codeHash: '0x' + '11'.repeat(32), hashType: 'type', args: '0x' + byte.repeat(20) },
        offlineClient,
      )
    ).toString();
  const funding = new FiveFunding(metadataStore, offlineClient, await address('22'));
  const sponsorActor = { ...actor, wallet: await address('33') };
  const contribution = {
    sponsorId: 'profile',
    amountShannons: '10000000000',
    display: 'named',
    name: 'Independent builder',
    logo: '',
    link: 'https://example.com',
    introduction: 'A community project',
    description: 'Tools for players and builders.',
    custodyAccepted: true,
  };
  await funding.intent(sponsorActor, metadataRound.id, contribution);
  await funding.intent(sponsorActor, metadataRound.id, contribution);
  assert.equal(
    (await metadataStore.load(metadataRound.id))!.sponsors.length,
    1,
    'Exact metadata retry is idempotent',
  );
  await assert.rejects(
    funding.intent(sponsorActor, metadataRound.id, { ...contribution, description: 'Changed' }),
    /different details/,
  );
  await assert.rejects(
    funding.intent(sponsorActor, metadataRound.id, {
      ...contribution,
      sponsorId: 'too-long',
      description: 'x'.repeat(241),
    }),
    /too long/,
  );
  await assert.rejects(
    funding.intent(sponsorActor, metadataRound.id, {
      ...contribution,
      sponsorId: 'bad-copy',
      description: 'line\nbreak',
    }),
    /Text/,
  );
  await metadataStore.change(metadataRound.id, (round) => {
    round.sponsors[0].funding = 'confirmed';
  });
  let record = (await metadataStore.load(metadataRound.id))!;
  assert.equal(
    project(record, null, false, now).sponsors[0].description,
    '',
    'Unapproved description stays private',
  );
  assert.equal(
    project(record, admin.id, true, now).moderation?.[0].description,
    contribution.description,
  );
  await metadataStore.change(metadataRound.id, (round) => {
    round.sponsors[0].moderation = 'approved';
  });
  record = (await metadataStore.load(metadataRound.id))!;
  assert.equal(project(record, null, false, now).sponsors[0].description, contribution.description);
  record.sponsors[0].display = 'anonymous';
  assert.equal(
    project(record, null, false, now).sponsors[0].introduction,
    '',
    'Anonymous profile fields never leak',
  );
  record.sponsors[0].display = 'named';
  record.sponsors[0].moderation = 'hidden';
  assert.equal(
    project(record, null, false, now).sponsors[0].description,
    '',
    'Hidden descriptions never leak',
  );
  record.sponsors[0].moderation = 'approved';
  delete record.sponsors[0].introduction;
  delete record.sponsors[0].description;
  assert.equal(
    project(record, null, false, now).sponsors[0].description,
    '',
    'Legacy profiles remain readable',
  );
  record.sponsors[0].description = contribution.description;
  record.sponsors[0].submittedSequence = 1;
  record.sponsors[0].confirmedAt = new Date(now).toISOString();
  record.terms.sponsorshipMode = 'auction';
  assert.deepEqual(
    project(record, null, false, now).sponsors,
    [],
    'Open bids do not expose branding',
  );
  record.auction = {
    closedAt: new Date(now).toISOString(),
    winnerWallet: 'another-wallet',
    winnerSponsorIds: ['other'],
    amountShannons: '20000000000',
  };
  assert.deepEqual(
    project(record, null, false, now).sponsors,
    [],
    'Losing bids do not expose branding',
  );
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
async function fundingWitnesses() {
  const store = new MemoryStore();
  const round = newRound('witnesses', 'admin', { ...terms, sponsorship: true }, now);
  round.state = 'open';
  store.rows.set(round.id, round);
  const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
  const owner = ccc.Script.from({
    codeHash: '0x' + '11'.repeat(32),
    hashType: 'type',
    args: '0x' + '22'.repeat(20),
  });
  const target = ccc.Script.from({ ...owner, args: '0x' + '33'.repeat(20) });
  const wallet = (await ccc.Address.fromScript(owner, client)).toString();
  const funding = new FiveFunding(
    store,
    client,
    (await ccc.Address.fromScript(target, client)).toString(),
  );
  const sponsorActor = { ...actor, wallet };
  await funding.intent(sponsorActor, round.id, {
    sponsorId: 'group',
    amountShannons: '10000000000',
    display: 'anonymous',
    custodyAccepted: true,
  });
  const sponsor = (await store.load(round.id))!.sponsors[0];
  const cells = [1, 2].map((n) =>
    ccc.Cell.from({
      outPoint: { txHash: '0x' + String(n).repeat(64), index: 0 },
      cellOutput: { capacity: 100_000_000_000n, lock: owner },
      outputData: '0x',
    }),
  );
  client.getCell = client.getCellLiveNoCache = async (point) =>
    cells.find((cell) => cell.outPoint.toHex() === ccc.OutPoint.from(point).toHex());
  const tx = ccc.Transaction.from({
    inputs: cells.map((cell) => ({ previousOutput: cell.outPoint, since: 0 })),
    outputs: [
      { capacity: 10_000_000_000n, lock: target },
      { capacity: 189_999_999_000n, lock: owner },
    ],
    outputsData: [sponsor.tag!, '0x'],
  });
  await tx.prepareSighashAllWitness(owner, 85, client);
  assert.equal(tx.inputs.length, 2);
  assert.equal(tx.witnesses.length, 1, 'CCC prepares one witness for the shared owner group');
  // Synthetic signature bytes. The mocked dry-run below tests the authority boundary, not CKB cryptography.
  tx.setWitnessArgs(0, { lock: '0x' + '44'.repeat(85) });
  const bytes = ccc.hexFrom(tx.toBytes());
  let rejectDry = true,
    checked = '';
  client.sendTransactionDry = async (candidate) => {
    checked = ccc.hexFrom(ccc.Transaction.from(candidate).toBytes());
    if (rejectDry) throw Error('Synthetic chain rejection');
    return 1n;
  };
  const request = { sponsorId: sponsor.id, signedBytes: bytes };
  await assert.rejects(
    funding.submit(sponsorActor, round.id, request),
    /Synthetic chain rejection/,
  );
  assert.equal(
    (await store.load(round.id))!.sponsors[0].signedBytes,
    undefined,
    'Rejected dry-run cannot persist funding',
  );
  assert.equal(checked, bytes, 'Chain validation receives the exact unpadded bytes');
  rejectDry = false;
  await funding.submit(sponsorActor, round.id, request);
  await funding.submit(sponsorActor, round.id, request);
  assert.equal(
    (await store.load(round.id))!.sponsors[0].signedBytes,
    bytes,
    'Retries preserve the exact same signed payment',
  );
  for (const kind of ['unsigned', 'duplicate', 'change', 'fee'] as const) {
    const bad = tx.clone();
    if (kind === 'unsigned') bad.witnesses = [];
    if (kind === 'duplicate') bad.inputs[1] = bad.inputs[0].clone();
    if (kind === 'change') bad.outputs[1].lock = target;
    if (kind === 'fee') bad.outputs[1].capacity -= 10_000_000n;
    await assert.rejects(
      funding.validate(sponsor, ccc.hexFrom(bad.toBytes())),
      /shape|input|Change|fee/,
    );
  }
  console.log('Five grouped-witness validation, mandatory dry-run and exact signed retry passed.');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import {
  assertRevision,
  deleteCampaign,
  editCampaign,
  finalizeCampaign,
  joinCampaign,
  newCampaign,
  parseDraft,
  project,
  publishCampaign,
  rankedEntries,
  reconcileCampaign,
  recordPayout,
  saveReceivingAddress,
  type Actor,
  type Campaign,
  type CampaignEvidence,
  type PredictionEvidence,
  type PayoutProof,
} from './modules/campaigns/domain';
import type { CampaignDraftInput, CampaignOptions } from '../shared/campaign-wire';

// Pure synthetic domain tests: no environment loading, providers, wallets or database.
const start = Date.parse('2026-11-05T10:00:00.000Z');
const at = (seconds: number) => new Date(start + seconds * 1000).toISOString();
const hex = (value: number) => `0x${value.toString(16).padStart(64, '0')}`;
const actor = (id: number): Actor => ({
  id: `account-${id}`,
  name: `Player ${id}`,
  wallet: `synthetic-wallet-${id}`,
  ownerHash: hex(id),
});
const options: CampaignOptions = {
  fixtures: [0, 1].map((i) => ({
    fixtureId: `fixture-${i}`,
    marketId: `market-${i}`,
    marketKey: `canonical-${i}`,
    home: `Home ${i}`,
    away: `Away ${i}`,
    league: 'Test league',
    kickoffAt: at(400),
    cutoffAt: at(300),
    capacity: 32,
    occupied: 0,
    updatedAt: at(0),
  })),
  gameweeks: [{ id: 'five-11', name: 'Gameweek 11', lockAt: at(300), state: 'open' }],
};
const draft = (kind: 'predictions' | 'five' = 'predictions'): CampaignDraftInput => ({
  name: 'Test campaign',
  description: 'Synthetic domain evidence',
  kind,
  registrationClosesAt: at(200),
  fixtureIds: kind === 'predictions' ? ['fixture-0', 'fixture-1'] : [],
  fiveRoundId: kind === 'five' ? 'five-11' : null,
  prizes: [
    { place: 1, amountShannons: '10000000000', usdReference: '25' },
    { place: 2, amountShannons: '8000000000', usdReference: '15' },
  ],
  rehearsal: false,
});
function campaign(kind: 'predictions' | 'five' = 'predictions'): Campaign {
  const c = newCampaign(`test-${kind}`, actor(99), parseDraft(draft(kind)), start);
  publishCampaign(c, options, start);
  for (const id of [1, 2, 3]) joinCampaign(c, actor(id), c.termsHash, start + id * 1000);
  return c;
}
const prediction = (
  owner: number,
  fixture: number,
  block: number,
  outcome: 0 | 1 | 2 = 0,
  seconds = 20 + block,
): PredictionEvidence => ({
  id: `position-${owner}-${fixture}-${block}`,
  ownerHash: hex(owner),
  fixtureId: `fixture-${fixture}`,
  marketKey: `canonical-${fixture}`,
  outcome,
  committedAt: at(seconds),
  blockNumber: String(block),
  transactionIndex: 0,
  outputIndex: fixture,
  transactionHash: hex(100 + block),
  blockHash: hex(200 + block),
  principalShannons: '10000000000',
  status: 'accepted',
});
const evidence = (
  positions: PredictionEvidence[],
  revision = '1',
  final = true,
): CampaignEvidence => ({
  revision,
  verifiedAt: at(500),
  complete: true,
  final,
  predictions: positions,
  results: options.fixtures.map((f) => ({
    fixtureId: f.fixtureId,
    marketKey: f.marketKey,
    outcome: 0,
    void: false,
    final,
  })),
  five: [],
});
let checks = 0;
function check(name: string, run: () => void) {
  run();
  checks++;
  console.log(`ok ${checks} - ${name}`);
}
check('configuration validates exact money and ordered dynamic prize places', () => {
  assert.throws(() => parseDraft({ ...draft(), fixtureIds: ['same', 'same'] }), /once/);
  for (const reserved of ['__proto__', 'constructor', 'prototype'])
    assert.throws(() => parseDraft({ ...draft(), fixtureIds: [reserved] }), /identifier/);
  assert.throws(
    () =>
      parseDraft({ ...draft(), prizes: [{ place: 1, amountShannons: '1.2', usdReference: '25' }] }),
    /exact/,
  );
  assert.throws(
    () =>
      parseDraft({ ...draft(), prizes: [{ place: 2, amountShannons: '10', usdReference: '25' }] }),
    /order/,
  );
  const many = Array.from({ length: 12 }, (_, i) => ({
    place: i + 1,
    amountShannons: '10000000000',
    usdReference: '1',
  }));
  assert.equal(parseDraft({ ...draft(), prizes: many }).prizes.length, 12);
});
check('publication freezes canonical identities and never borrows mutable source objects', () => {
  const tiny = newCampaign('tiny', actor(99), draft(), start);
  tiny.draft.prizes[0].amountShannons = '6099999999';
  assert.throws(() => publishCampaign(tiny, options, start), /at least 61 CKB/);
  const c = newCampaign('publish', actor(99), draft(), start),
    source = structuredClone(options);
  publishCampaign(c, source, start);
  source.fixtures[0].marketKey = 'changed';
  assert.equal(c.fixtures[0].marketKey, 'canonical-0');
  assert.equal(c.bindings['fixture-0'], 'canonical-0');
  assert.throws(() => editCampaign(c, draft(), c.revision), /cannot be edited/);
});
check('registration creates rank immediately and duplicate requests retain first join time', () => {
  const c = campaign(),
    first = c.entries[0].joinedAt;
  joinCampaign(c, actor(1), c.termsHash, start + 50_000);
  assert.equal(c.entries.length, 3);
  assert.equal(c.entries[0].joinedAt, first);
  assert.equal(project(c, actor(1), false, start).own?.rank, 1);
  assert.ok(rankedEntries(c).every((e) => e.points === 0 && !e.participated));
  assert.throws(
    () =>
      joinCampaign(c, { ...actor(4), ownerHash: actor(1).ownerHash }, c.termsHash, start + 50_000),
    /already joined/,
  );
});
check('registration deadline and current rules are checked at write time', () => {
  const c = campaign();
  assert.throws(() => joinCampaign(c, actor(4), 'wrong', start + 50_000), /Review/);
  assert.throws(() => joinCampaign(c, actor(4), c.termsHash, start + 200_000), /closed/);
});
check(
  'first canonical qualifying prediction counts, independent of later outcome or larger stake',
  () => {
    const c = campaign();
    const second = { ...prediction(1, 0, 2, 0), principalShannons: '900000000000' };
    reconcileCampaign(
      c,
      evidence([prediction(1, 0, 1, 2), second, prediction(2, 0, 3, 0)]),
      start + 500_000,
    );
    assert.equal(c.entries[0].points, 0);
    assert.equal(c.entries[0].calls[0].outcome, 2);
    assert.equal(c.entries[1].points, 3);
    assert.equal(c.entries[0].qualifyingEntries, 1);
  },
);
check('pre-registration and late deposits never qualify', () => {
  const c = campaign();
  reconcileCampaign(
    c,
    evidence([prediction(1, 0, 1, 0, 0), prediction(1, 1, 2, 0, 300)]),
    start + 500_000,
  );
  assert.equal(c.entries[0].participated, false);
  assert.equal(c.entries[0].points, 0);
});
check('a multi-pick payment has separate positions and only one score per fixture', () => {
  const c = campaign();
  reconcileCampaign(c, evidence([prediction(1, 0, 1), prediction(1, 1, 1)]), start + 500_000);
  assert.equal(c.entries[0].points, 6);
  assert.equal(c.entries[0].evidence.length, 2);
  assert.equal(new Set(c.entries[0].evidence.map((p) => p.transactionHash)).size, 1);
});
check('prediction ties use earlier last qualifying call', () => {
  const c = campaign();
  reconcileCampaign(
    c,
    evidence([prediction(1, 0, 1), prediction(1, 1, 9, 2), prediction(2, 0, 3)]),
    start + 500_000,
  );
  assert.equal(rankedEntries(c)[0].accountId, actor(2).id);
  assert.equal(c.entries[0].tieBreakAt, at(29));
});
check(
  'prediction ties follow canonical inclusion order when header timestamps are not monotonic',
  () => {
    const c = campaign();
    reconcileCampaign(
      c,
      evidence([prediction(1, 0, 9, 0, 25), prediction(2, 0, 3, 0, 30)]),
      start + 500_000,
    );
    assert.equal(rankedEntries(c)[0].accountId, actor(2).id);
    assert.equal(
      c.entries[0].tieBreakAt,
      at(25),
      'The actual timestamp remains available for display and deadline evidence.',
    );
  },
);
check(
  'Five active negative score stays ahead of registered nonparticipants and uses meaningful save',
  () => {
    const c = campaign('five');
    const e = evidence([]);
    e.five = [
      {
        accountId: actor(1).id,
        meaningfulSavedAt: at(10),
        players: ['1', '2', '3', '4', '5'],
        captain: '3',
        points: -2,
        valid: true,
        final: true,
      },
      {
        accountId: actor(2).id,
        meaningfulSavedAt: at(11),
        players: ['1', '2', '3', '4', '5'],
        captain: '3',
        points: -2,
        valid: true,
        final: true,
      },
    ];
    reconcileCampaign(c, e, start + 500_000);
    assert.deepEqual(
      rankedEntries(c).map((x) => x.accountId),
      [actor(1).id, actor(2).id, actor(3).id],
    );
  },
);
check('unavailable evidence retains checked scores and blocks finalization', () => {
  const c = campaign();
  reconcileCampaign(c, evidence([prediction(1, 0, 1)]), start + 500_000);
  reconcileCampaign(c, { ...evidence([], '2'), complete: false }, start + 500_000);
  assert.equal(c.entries[0].points, 3);
  assert.equal(c.scoreStatus, 'unavailable');
  assert.throws(() => finalizeCampaign(c, start + 500_000), /complete/);
});
check(
  'canonical replay is idempotent and reorg removes old scoring records before finalization',
  () => {
    const c = campaign(),
      e = evidence([prediction(1, 0, 1)]);
    reconcileCampaign(c, e, start + 500_000);
    const saved = JSON.stringify(c);
    reconcileCampaign(c, e, start + 500_000);
    assert.equal(JSON.stringify(c), saved);
    reconcileCampaign(c, evidence([], '2'), start + 500_000);
    assert.equal(c.entries[0].points, 0);
    assert.equal(c.entries[0].participated, false);
  },
);
check('duplicate canonical IDs and conflicting market generations are rejected', () => {
  const c = campaign(),
    p = prediction(1, 0, 1);
  assert.throws(() => reconcileCampaign(c, evidence([p, p]), start + 500_000), /Duplicate/);
  assert.throws(
    () =>
      reconcileCampaign(
        c,
        {
          ...evidence([]),
          bindings: [{ fixtureId: 'fixture-0', marketKey: 'another-generation' }],
        },
        start + 500_000,
      ),
    /binding changed/,
  );
});
check('unused prize places remain unawarded, including zero-point inactive accounts', () => {
  const c = campaign();
  reconcileCampaign(c, evidence([prediction(1, 0, 1)]), start + 500_000);
  finalizeCampaign(c, start + 500_000);
  assert.equal(c.awards[0].publicId, c.entries[0].publicId);
  assert.equal(c.awards[1].status, 'unawarded');
});
check('post-finalization canonical changes preserve awards and require review', () => {
  const c = campaign();
  reconcileCampaign(c, evidence([prediction(1, 0, 1)]), start + 500_000);
  finalizeCampaign(c, start + 500_000);
  const awards = JSON.stringify(c.awards);
  reconcileCampaign(c, evidence([], '2'), start + 500_000);
  assert.equal(JSON.stringify(c.awards), awards);
  assert.equal(c.scoreStatus, 'review-required');
  assert.throws(() => finalizeCampaign(c, start + 500_000), /review/);
});
check('exact-name deletion and stale review protection preserve entrants and awards', () => {
  const c = campaign();
  reconcileCampaign(c, evidence([prediction(1, 0, 1)]), start + 500_000);
  finalizeCampaign(c, start + 500_000);
  assert.throws(
    () => deleteCampaign(c, actor(99), c.revision, 'test campaign', start + 500_000),
    /exact/,
  );
  assert.throws(
    () => deleteCampaign(c, actor(99), c.revision + 1, c.draft.name, start + 500_000),
    /changed/,
  );
  const entries = JSON.stringify(c.entries),
    awards = JSON.stringify(c.awards);
  deleteCampaign(c, actor(99), c.revision, c.draft.name, start + 500_000);
  deleteCampaign(c, actor(99), 0, c.draft.name, start + 600_000);
  assert.equal(c.deletedAt, at(500));
  assert.equal(JSON.stringify(c.entries), entries);
  assert.equal(JSON.stringify(c.awards), awards);
  assert.throws(() => joinCampaign(c, actor(4), c.termsHash, start + 10_000), /closed/);
});
check('mainnet payouts require exact recipient/amount and cannot fund a rehearsal', () => {
  const c = campaign();
  reconcileCampaign(c, evidence([prediction(1, 0, 1)]), start + 500_000);
  finalizeCampaign(c, start + 500_000);
  saveReceivingAddress(c, actor(1), 'ckb-synthetic-address');
  saveReceivingAddress(c, actor(1), 'ckb-synthetic-address');
  assert.throws(
    () => saveReceivingAddress(c, actor(1), 'ckb-another-address'),
    /already confirmed/,
  );
  const proof: PayoutProof = {
    transactionHash: hex(500),
    outputIndex: 0,
    address: 'ckb-synthetic-address',
    amountShannons: '10000000000',
    blockHash: hex(600),
    blockNumber: '500',
    confirmedAt: at(600),
  };
  assert.throws(
    () => recordPayout(c, c.entries[0].publicId, { ...proof, amountShannons: '1' }),
    /does not match/,
  );
  recordPayout(c, c.entries[0].publicId, proof);
  recordPayout(c, c.entries[0].publicId, proof);
  recordPayout(c, c.entries[0].publicId, { ...proof, blockHash: hex(601), confirmedAt: at(601) });
  assert.equal(c.payouts[c.entries[0].publicId].blockHash, hex(601));
  assert.equal(c.awards[0].status, 'paid');
  assert.throws(
    () => recordPayout(c, c.entries[0].publicId, { ...proof, transactionHash: hex(501) }),
    /different/,
  );
  c.draft.rehearsal = true;
  assert.throws(() => recordPayout(c, c.entries[0].publicId, proof), /Rehearsal/);
});
check('public projections omit private wallet/account links and receiving addresses', () => {
  const c = campaign();
  reconcileCampaign(c, evidence([prediction(1, 0, 1)]), start + 500_000);
  finalizeCampaign(c, start + 500_000);
  saveReceivingAddress(c, actor(1), 'ckb-synthetic-address');
  const value = JSON.stringify(project(c, null, false, start + 500_000));
  assert.ok(!value.includes('synthetic-wallet'));
  assert.ok(!value.includes('ownerHash'));
  assert.ok(!value.includes('accountId'));
  assert.ok(!value.includes('ckb-synthetic-address'));
  assert.equal(
    project(c, actor(1), false, start + 500_000).awards[0].receivingAddress,
    'ckb-synthetic-address',
  );
  assert.throws(() => assertRevision(c, 999), /changed/);
});
console.log(`${checks} campaign domain checks passed.`);

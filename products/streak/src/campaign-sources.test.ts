import assert from 'node:assert/strict';
import type { CampaignDraftInput, CampaignOptions } from '../shared/campaign-wire';
import type { ActivityPosition } from '../shared/activity-wire';
import type { ActivitySourceSnapshot } from './modules/activity/storage';
import { V4_DIRECT_CONFIG, type DirectMarketDescriptor } from './modules/direct/registry';
import { newRound, parseTerms, saveEntry } from './modules/five/domain';
import { TEST_TIMING_POLICY } from './modules/five/timing';
import {
  joinCampaign,
  newCampaign,
  publishCampaign,
  reconcileCampaign,
  type Campaign,
} from './modules/campaigns/domain';
import { parseCampaignAbsenceSnapshot } from './modules/campaigns/absence';
import type { CampaignAbsenceSnapshot } from './modules/direct/campaign-absence';
import {
  campaignMarketPin,
  createCampaignSources,
  fiveCampaignEvidence,
  predictionCampaignEvidence,
} from './modules/campaigns/sources';

// Synthetic durable snapshots only. No chain RPC, provider, database or wallet keys.
const now = Date.parse('2030-01-01T10:00:00Z');
const cutoff = now + 120_000;
const H = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;
const iso = (n: number) => new Date(n).toISOString();
const actor = { id: 'admin', name: 'Admin', wallet: 'synthetic', ownerHash: H(1) };
const descriptor: DirectMarketDescriptor = {
  id: 'api-football-123',
  fixtureId: '123',
  label: 'Synthetic Home vs Away',
  cutoffMs: cutoff,
  creationTxHash: H(2),
  type: { codeHash: V4_DIRECT_CONFIG.protocolHash, hashType: 'data2', args: '0x' },
  termsHash: H(3),
  terms: {
    provider: 'football',
    providerFixtureId: '123',
    source: 'api-football',
    rules: 'regulation-time-1x2-v1',
    deadlineMs: cutoff,
  },
  entryEnabled: false,
};
const options: CampaignOptions = {
  fixtures: [
    {
      fixtureId: '123',
      marketId: descriptor.id,
      marketKey: campaignMarketPin('123'),
      home: 'Home',
      away: 'Away',
      league: 'Synthetic',
      kickoffAt: iso(cutoff),
      cutoffAt: iso(cutoff),
      capacity: 32,
      occupied: 0,
      updatedAt: null,
    },
  ],
  gameweeks: [{ id: 'five-week', name: 'Synthetic gameweek', lockAt: iso(cutoff), state: 'open' }],
};
function campaign(kind: 'five' | 'predictions' = 'predictions'): Campaign {
  const draft: CampaignDraftInput = {
    name: 'Synthetic competition',
    description: 'Source tests',
    kind,
    registrationClosesAt: iso(cutoff),
    fiveRoundId: kind === 'five' ? 'five-week' : null,
    fixtureIds: kind === 'predictions' ? ['123'] : [],
    prizes: [{ place: 1, amountShannons: '10000000000', usdReference: '' }],
    rehearsal: false,
  };
  const c = newCampaign('campaign', actor, draft, now);
  publishCampaign(c, options, now);
  return c;
}
function position(index = 1, status: ActivityPosition['status'] = 'accepted'): ActivityPosition {
  return {
    id: `${H(10 + index)}:${index}`,
    status,
    outcome: 0,
    principalShannons: '10000000000',
    storageShannons: '32100000000',
    entitlementShannons: null,
    // The current carrier is deliberately different from the original deposit output.
    outPoint: { txHash: H(70), index: 7 },
    transactionHash: H(10 + index),
    commit: {
      blockHash: H(8),
      blockNumber: '8',
      timestamp: cutoff - 1,
      transactionIndex: 2,
      outputIndex: index,
    },
  };
}
function source(): ActivitySourceSnapshot {
  return {
    marketKey: 'actual-market',
    descriptor: structuredClone(descriptor),
    revision: '9',
    stale: false,
    checkedAt: now,
    projection: {
      evidenceVersion: 1,
      descriptor: structuredClone(descriptor),
      phase: 'open',
      checkedAt: now,
      checkpoint: { blockNumber: '10', blockHash: H(10) },
      observedTip: { blockNumber: '13', blockHash: H(13) },
      transactionHashes: [H(2), H(11), H(70)],
      occupancy: { accepted: 1, pending: 1, limit: 32 },
      owners: {
        [H(1)]: {
          phase: 'open',
          positions: [
            position(),
            position(2, 'pending-validation'),
            position(3, 'refund-required'),
          ],
          checkedAt: now,
          historyComplete: true,
        },
      },
    },
  };
}

async function main() {
  const c = campaign();
  const missing = predictionCampaignEvidence(c, [], now);
  assert.equal(missing.complete, true, 'an uncreated lazy market has no counted entries yet');
  assert.equal(missing.final, false, 'absence of a market is not proof of a settled result');
  assert.equal(
    missing.notice,
    undefined,
    'an upcoming fixture should not show finalization warnings',
  );
  assert.match(predictionCampaignEvidence(c, [], cutoff).notice ?? '', /Home vs Away/);
  const row = source();
  const accepted = predictionCampaignEvidence(c, [row], now);
  assert.equal(accepted.complete, true);
  assert.equal(accepted.predictions.length, 1, 'pending and late-refundable tickets do not count');
  assert.equal(accepted.predictions[0].ownerHash, H(1));
  assert.equal(
    accepted.predictions[0].outputIndex,
    1,
    'tie order uses original deposit, not carrier',
  );
  assert.equal(accepted.predictions[0].committedAt, iso(cutoff - 1));
  assert.equal(accepted.predictions[0].principalShannons, '10000000000', 'stake excludes storage');
  assert.deepEqual(accepted.bindings, [{ fixtureId: '123', marketKey: row.marketKey }]);
  assert.equal(accepted.occupancy?.['123'].occupied, 2, 'pending tickets also occupy finite slots');
  for (const mutate of [
    (s: ActivitySourceSnapshot) => {
      s.stale = true;
    },
    (s: ActivitySourceSnapshot) => {
      s.descriptor.cutoffMs += 1;
    },
    (s: ActivitySourceSnapshot) => {
      s.projection!.descriptor.termsHash = H(99);
    },
    (s: ActivitySourceSnapshot) => {
      delete s.projection!.evidenceVersion;
    },
    (s: ActivitySourceSnapshot) => {
      delete s.projection!.owners[H(1)].positions[0].commit;
    },
    (s: ActivitySourceSnapshot) => {
      s.projection!.owners[H(1)].positions[0].commit!.timestamp = cutoff;
    },
  ]) {
    const invalid = structuredClone(row);
    mutate(invalid);
    assert.equal(predictionCampaignEvidence(c, [invalid], now).complete, false);
  }
  assert.equal(
    predictionCampaignEvidence(c, [row, structuredClone(row)], now).complete,
    false,
    'ambiguous duplicate deployments cannot silently switch a published competition',
  );
  const bound = structuredClone(c);
  bound.bindings['123'] = 'different-market';
  assert.equal(predictionCampaignEvidence(bound, [row], now).complete, false);
  const oldGeneration = structuredClone(row);
  oldGeneration.descriptor.type.codeHash = H(97);
  assert.equal(predictionCampaignEvidence(bound, [oldGeneration], now).complete, false);
  const finalRow = structuredClone(row);
  finalRow.projection!.phase = 'settled';
  finalRow.projection!.settlement = { outcome: 0, emptyWinner: false };
  finalRow.projection!.settlementCheckpoint = { blockNumber: '10', blockHash: H(10) };
  const final = predictionCampaignEvidence(c, [finalRow], now);
  assert.equal(final.final, true);
  for (const ageField of ['checkedAt', 'projection'] as const) {
    const aged = structuredClone(finalRow);
    if (ageField === 'checkedAt') aged.checkedAt = now - 300_001;
    else aged.projection!.checkedAt = now - 300_001;
    const expired = predictionCampaignEvidence(c, [aged], now);
    assert.equal(expired.complete, false, 'stale=false cannot make aged chain evidence current');
    assert.equal(expired.final, false, 'final awards require a recent canonical check');
    assert.match(expired.notice ?? '', /Refreshing verified activity/);
  }
  assert.equal(
    predictionCampaignEvidence(c, [finalRow], now + 300_000).final,
    true,
    'a queued refresh can retain verified evidence within its five-minute window',
  );
  const futureChecked = structuredClone(finalRow);
  futureChecked.projection!.checkedAt = now + 60_001;
  assert.equal(predictionCampaignEvidence(c, [futureChecked], now).complete, false);
  finalRow.projection!.checkpoint = { blockNumber: '13', blockHash: H(13) };
  assert.equal(
    predictionCampaignEvidence(c, [finalRow], now).final,
    true,
    'a new collection after mature settlement cannot make settled points provisional again',
  );
  assert.equal(final.occupancy?.['123'].occupied, 1, 'settled occupancy retains admitted history');
  finalRow.projection!.observedTip!.blockNumber = '12';
  assert.equal(
    predictionCampaignEvidence(c, [finalRow], now).final,
    false,
    'settlement needs four canonical confirmations before campaign awards can finalize',
  );
  const rollback = source();
  rollback.projection!.owners = {};
  rollback.projection!.occupancy = { accepted: 0, pending: 0, limit: 32 };
  rollback.revision = '10';
  const rolledBack = predictionCampaignEvidence(c, [rollback], now);
  assert.equal(rolledBack.complete, true);
  assert.deepEqual(
    rolledBack.predictions,
    [],
    'complete canonical reorg projection removes entries',
  );
  assert.notEqual(rolledBack.revision, accepted.revision);

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
    name: 'Synthetic gameweek',
    players,
    lockAt: iso(cutoff),
    finalizeAfter: iso(cutoff + 3_600_000),
    limit: 10,
    qualifyingBps: 500,
    sponsorship: false,
    minimumShannons: '10000000000',
    source: 'Synthetic source adapter test',
  });
  const round = newRound('five-week', actor.id, terms, now);
  round.state = 'open';
  saveEntry(
    round,
    actor,
    players.map((p) => p.id),
    'p2',
    round.termsHash,
    now,
  );
  saveEntry(round, actor, players.map((p) => p.id).reverse(), 'p2', round.termsHash, now + 1000);
  const fc = campaign('five');
  const liveFive = fiveCampaignEvidence(fc, round, now);
  assert.equal(liveFive.five[0].meaningfulSavedAt, iso(now));
  assert.equal(liveFive.final, false);
  round.state = 'final';
  round.scoresComplete = true;
  round.scores = Object.fromEntries(players.map((p) => [p.id, { points: 5, lines: [] }]));
  const finalFive = fiveCampaignEvidence(fc, round, cutoff + 1000);
  assert.equal(finalFive.final, true);
  assert.equal(finalFive.five[0].points, 30, 'five player scores plus one captain multiplier');
  delete round.scores.p4;
  assert.equal(fiveCampaignEvidence(fc, round, cutoff + 1000).final, false);
  round.terms.testingPolicy = TEST_TIMING_POLICY;
  assert.equal(
    fiveCampaignEvidence(fc, round, cutoff + 1000).complete,
    false,
    'dummy gameweeks must never count toward a regular campaign',
  );
  let reads = 0;
  const adapter = createCampaignSources({
    activity: () => ({
      readSources: async (ids) => {
        reads++;
        assert.deepEqual(ids, ['123']);
        return [row];
      },
    }),
    five: () => undefined,
    options: async () => options,
    now: () => now,
  });
  assert.equal((await adapter.observe(c)).predictions.length, 1);
  assert.equal(reads, 1, 'one bulk read serves all registered wallets without wallet chain scans');
  const history = structuredClone(row);
  history.projection!.owners[H(1)].positions[0].commit!.timestamp = now - 60_000;
  history.projection!.owners[H(99)] = {
    ...structuredClone(history.projection!.owners[H(1)]),
    positions: [position(99)],
  };
  const historicalCampaign = campaign();
  joinCampaign(historicalCampaign, actor, historicalCampaign.termsHash, now + 10_000);
  const historicalAdapter = createCampaignSources({
    activity: () => ({
      readSources: async (ids) => {
        reads++;
        assert.deepEqual(ids, ['123']);
        return [history];
      },
    }),
    five: () => undefined,
    options: async () => options,
    now: () => now + 10_000,
  });
  reconcileCampaign(
    historicalCampaign,
    await historicalAdapter.observe(historicalCampaign),
    now + 10_000,
  );
  assert.equal(reads, 2, 'pre-registration history reuses one market snapshot read');
  assert.equal(
    historicalCampaign.entries.length,
    1,
    'unregistered owners in Activity cannot enter the competition',
  );
  assert.equal(historicalCampaign.entries[0].calls[0].status, 'pending');
  assert.equal(historicalCampaign.entries[0].calls[0].outcome, 0);
  assert.equal(historicalCampaign.entries[0].tieBreakAt, iso(now - 60_000));
  assert.equal(historicalCampaign.entries[0].qualifyingEntries, 1);
  assert.equal((await adapter.observe(fc)).complete, false, 'unavailable Five DB fails closed');

  const absentCampaign = structuredClone(c);
  const absentId = 'api-football-123';
  absentCampaign.draft.fixtureIds = [absentId];
  absentCampaign.fixtures[0].fixtureId = absentId;
  absentCampaign.fixtures[0].marketKey = campaignMarketPin(absentId);
  const pins = [
    { fixtureId: absentId, cutoffMs: cutoff, protocolHash: V4_DIRECT_CONFIG.protocolHash },
  ];
  let proofNow = cutoff + 180_000;
  let absenceReads = 0;
  let proof: CampaignAbsenceSnapshot = {
    version: 1,
    basis: 'operator-attested-empty',
    network: 'testnet',
    protocolHash: V4_DIRECT_CONFIG.protocolHash,
    checkedAt: proofNow,
    checkpoint: { blockHash: H(200), blockNumber: '200', timestamp: proofNow - 1000 },
    historyDigest: 'a'.repeat(64),
    fixtures: [{ fixtureId: absentId, cutoffMs: cutoff, status: 'absent' }],
  };
  const validProof = structuredClone(proof);
  assert.deepEqual(parseCampaignAbsenceSnapshot(proof, pins, proofNow), proof);
  assert.equal(
    predictionCampaignEvidence(absentCampaign, [], proofNow + 60_001, [proof]).final,
    false,
    'retained certificates are audit evidence, not a reusable forever-final cache',
  );
  for (const mutate of [
    (p: CampaignAbsenceSnapshot) => {
      p.protocolHash = H(80);
    },
    (p: CampaignAbsenceSnapshot) => {
      p.fixtures[0].fixtureId = 'api-football-124';
    },
    (p: CampaignAbsenceSnapshot) => {
      p.fixtures[0].cutoffMs += 1;
    },
    (p: CampaignAbsenceSnapshot) => {
      p.fixtures.push(structuredClone(p.fixtures[0]));
    },
    (p: CampaignAbsenceSnapshot) => {
      p.checkedAt = proofNow - 60_001;
    },
    (p: CampaignAbsenceSnapshot) => {
      p.checkedAt = proofNow + 5001;
    },
    (p: CampaignAbsenceSnapshot) => {
      p.checkpoint.blockHash = 'missing';
    },
    (p: CampaignAbsenceSnapshot) => {
      p.checkpoint.blockNumber = '-1';
    },
    (p: CampaignAbsenceSnapshot) => {
      p.checkpoint.timestamp = cutoff + 119_999;
    },
    (p: CampaignAbsenceSnapshot) => {
      p.historyDigest = 'missing';
    },
  ]) {
    const invalid = structuredClone(proof);
    mutate(invalid);
    assert.throws(() => parseCampaignAbsenceSnapshot(invalid, pins, proofNow));
  }
  let absentSources: ActivitySourceSnapshot[] = [];
  const absenceAdapter = createCampaignSources({
    activity: () => ({ readSources: async () => absentSources }),
    five: () => undefined,
    options: async () => options,
    now: () => proofNow,
    absence: async (requested) => {
      absenceReads++;
      assert.deepEqual(requested, pins);
      return proof;
    },
  });
  const certifiedEmpty = await absenceAdapter.observe(absentCampaign);
  assert.equal(
    certifiedEmpty.final,
    true,
    'fresh operator evidence can finalize a never-created fixture',
  );
  assert.deepEqual(
    certifiedEmpty.predictions,
    [],
    'absence never invents a qualifying paid prediction',
  );
  assert.deepEqual(certifiedEmpty.results, [], 'absence never invents a match outcome');
  assert.equal(certifiedEmpty.occupancy?.[absentId].occupied, 0);
  assert.deepEqual(
    certifiedEmpty.absenceProofs,
    [validProof],
    'retain private operator audit evidence',
  );
  proof.checkpoint.blockHash = H(201);
  proof.checkpoint.blockNumber = '201';
  proof.historyDigest = 'b'.repeat(64);
  proof.checkedAt += 1000;
  proofNow += 1000;
  assert.equal(
    (await absenceAdapter.observe(absentCampaign)).revision,
    certifiedEmpty.revision,
    'new checkpoints and unrelated journal traffic do not change semantic scoring evidence',
  );
  proof.fixtures[0].status = 'unresolved';
  assert.equal(
    (await absenceAdapter.observe(absentCampaign)).final,
    false,
    'an accepted partial signature or unresolved creation cannot be treated as absence',
  );
  proof = structuredClone(validProof);
  proof.fixtures[0].cutoffMs += 1;
  assert.equal(
    (await absenceAdapter.observe(absentCampaign)).final,
    false,
    'invalid attestations fail closed without removing otherwise verified entries',
  );
  proofNow = cutoff;
  let previousReads = absenceReads;
  await absenceAdapter.observe(absentCampaign);
  assert.equal(
    absenceReads,
    previousReads,
    'never request absence before the cutoff safety window',
  );
  proofNow = cutoff + 180_000;
  absentCampaign.bindings[absentId] = 'prior-market';
  assert.equal((await absenceAdapter.observe(absentCampaign)).complete, false);
  assert.equal(absenceReads, previousReads, 'a bound market cannot be replaced with zero activity');
  delete absentCampaign.bindings[absentId];
  const indexed = source();
  indexed.descriptor.fixtureId = absentId;
  indexed.projection!.descriptor.fixtureId = absentId;
  absentSources = [indexed];
  previousReads = absenceReads;
  assert.equal((await absenceAdapter.observe(absentCampaign)).predictions.length, 1);
  assert.equal(
    absenceReads,
    previousReads,
    'indexed markets use verified Activity, not absence RPC',
  );
  console.log(
    'campaign source projections: canonical timing, binding, finality, reorg and Five scores passed',
  );
}
void main();

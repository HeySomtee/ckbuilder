import { createHash } from 'node:crypto';
import type { CampaignOptions } from '../../../shared/campaign-wire';
import type { ActivitySourceSnapshot, PgActivityStorage } from '../activity/storage';
import type { CampaignAbsenceSnapshot } from '../direct/campaign-absence';
import { V4_DIRECT_CONFIG } from '../direct/registry';
import { standings, validateSquad, type Round } from '../five/domain';
import type { FiveStorage } from '../five/storage';
import { lockTime, TEST_TIMING_POLICY } from '../five/timing';
import { parseCampaignAbsenceSnapshot, type CampaignAbsenceFixtures } from './absence';
import type {
  Campaign,
  CampaignEvidence,
  CampaignSources,
  FiveEvidence,
  PredictionEvidence,
} from './domain';

type FiveReadSource = Pick<FiveStorage, 'load' | 'clock'>;
export interface CampaignSourceDependencies {
  activity(): Pick<PgActivityStorage, 'readSources'> | undefined;
  five(): FiveReadSource | undefined;
  options(): Promise<CampaignOptions>;
  absence?(fixtures: CampaignAbsenceFixtures): Promise<unknown>;
  validateReceivingAddress?(address: string, amountShannons?: string): Promise<string>;
  now?(): number;
}

/** Frozen testnet generation/fixture identity before first-payment market creation. */
export const campaignMarketPin = (fixtureId: string): string =>
  `v4:${V4_DIRECT_CONFIG.protocolHash}:${fixtureId}`;
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (value: number) => new Date(value).toISOString();
const empty = (revision: unknown, now: number): CampaignEvidence => ({
  revision: digest(revision),
  verifiedAt: iso(now),
  complete: false,
  final: false,
  predictions: [],
  results: [],
  five: [],
  bindings: [],
  occupancy: {},
});

/** No wallet RPC calls: one verified market snapshot is reused for all entrants. */
export function predictionCampaignEvidence(
  campaign: Campaign,
  sources: readonly ActivitySourceSnapshot[],
  now: number,
  absenceProofs: readonly CampaignAbsenceSnapshot[] = [],
): CampaignEvidence {
  const evidence = empty(['predictions', campaign.id], now);
  evidence.complete = true;
  evidence.final = campaign.fixtures.length > 0;
  const revisions: unknown[] = [];
  const checks: number[] = [];
  const freshProofs: CampaignAbsenceSnapshot[] = [];
  for (const proof of absenceProofs) {
    try {
      const pins = proof.fixtures.map((row) => {
        const fixture = campaign.fixtures.find((f) => f.fixtureId === row.fixtureId);
        if (!fixture) throw Error('Unrecognized campaign fixture.');
        return {
          fixtureId: fixture.fixtureId,
          cutoffMs: Date.parse(fixture.cutoffAt),
          protocolHash: V4_DIRECT_CONFIG.protocolHash,
        };
      });
      freshProofs.push(parseCampaignAbsenceSnapshot(proof, pins, now));
    } catch {
      // A cached or mismatched proof never upgrades missing activity to final.
    }
  }
  for (const fixture of campaign.fixtures) {
    const bound = campaign.bindings[fixture.fixtureId];
    const lazy = fixture.marketKey === campaignMarketPin(fixture.fixtureId);
    const rows = sources.filter(
      (source) =>
        source.descriptor.fixtureId === fixture.fixtureId &&
        source.descriptor.type.codeHash === V4_DIRECT_CONFIG.protocolHash,
    );
    const row = rows[0];
    const expectedKey = bound ?? (lazy ? null : fixture.marketKey);
    revisions.push([
      fixture.fixtureId,
      expectedKey,
      rows.map((r) => [r.marketKey, r.revision, r.stale]),
    ]);
    // Only a fresh operator history attestation can finalize an uncreated fixture.
    if (!rows.length && lazy && !bound) {
      const proof = freshProofs.find((p) =>
        p.fixtures.some(
          (f) =>
            f.fixtureId === fixture.fixtureId &&
            f.cutoffMs === Date.parse(fixture.cutoffAt) &&
            f.status === 'absent',
        ),
      );
      if (proof) {
        revisions.push(['operator-attested-empty', fixture.fixtureId, fixture.cutoffAt]);
        checks.push(proof.checkedAt);
        evidence.absenceProofs ??= [];
        if (!evidence.absenceProofs.includes(proof)) evidence.absenceProofs.push(proof);
        evidence.occupancy![fixture.fixtureId] = { occupied: 0, updatedAt: iso(proof.checkedAt) };
        continue;
      }
      evidence.final = false;
      if (now >= Date.parse(fixture.cutoffAt))
        evidence.notice ??= `Waiting for verified market activity for ${fixture.home} vs ${fixture.away}. No market is indexed yet, so final results cannot be published safely.`;
      continue;
    }
    if (
      rows.length !== 1 ||
      !row ||
      (expectedKey && row.marketKey !== expectedKey) ||
      row.descriptor.cutoffMs !== Date.parse(fixture.cutoffAt) ||
      row.descriptor.type.hashType !== 'data2' ||
      row.stale ||
      row.projection?.evidenceVersion !== 1 ||
      !row.projection.observedTip
    ) {
      evidence.complete = false;
      evidence.final = false;
      continue;
    }
    const projection = row.projection;
    if (
      !Number.isSafeInteger(row.checkedAt) ||
      row.checkedAt! < now - 300_000 ||
      row.checkedAt! > now + 60_000 ||
      !Number.isSafeInteger(projection.checkedAt) ||
      projection.checkedAt < now - 300_000 ||
      projection.checkedAt > now + 60_000
    ) {
      evidence.complete = false;
      evidence.final = false;
      evidence.notice ??= `Refreshing verified activity for ${fixture.home} vs ${fixture.away}. Previously checked points are retained until the chain check completes.`;
      continue;
    }
    const observedTip = projection.observedTip;
    if (
      !observedTip ||
      projection.descriptor.termsHash !== row.descriptor.termsHash ||
      projection.descriptor.creationTxHash !== row.descriptor.creationTxHash
    ) {
      evidence.complete = false;
      evidence.final = false;
      continue;
    }
    checks.push(projection.checkedAt);
    evidence.bindings!.push({ fixtureId: fixture.fixtureId, marketKey: row.marketKey });
    const snapshots = Object.entries(projection.owners);
    let admitted = 0;
    for (const [ownerHash, snapshot] of snapshots) {
      if (!snapshot.historyComplete || snapshot.uncertainty) evidence.complete = false;
      for (const position of snapshot.positions) {
        if (!['accepted', 'claimable', 'claimed'].includes(position.status)) continue;
        const commit = position.commit;
        if (
          !commit ||
          !Number.isSafeInteger(commit.timestamp) ||
          commit.timestamp < 0 ||
          commit.timestamp >= row.descriptor.cutoffMs ||
          !Number.isSafeInteger(commit.transactionIndex) ||
          commit.transactionIndex < 0 ||
          !Number.isSafeInteger(commit.outputIndex) ||
          commit.outputIndex < 0 ||
          !/^(?:0|[1-9]\d*)$/.test(commit.blockNumber) ||
          !/^0x[0-9a-f]{64}$/.test(commit.blockHash) ||
          position.id !== `${position.transactionHash}:${commit.outputIndex}`
        ) {
          evidence.complete = false;
          continue;
        }
        admitted++;
        evidence.predictions.push({
          id: `${row.marketKey}:${position.id}`,
          ownerHash,
          fixtureId: fixture.fixtureId,
          marketKey: row.marketKey,
          outcome: position.outcome,
          committedAt: iso(commit.timestamp),
          blockNumber: commit.blockNumber,
          transactionIndex: commit.transactionIndex,
          outputIndex: commit.outputIndex,
          transactionHash: position.transactionHash,
          blockHash: commit.blockHash,
          principalShannons: position.principalShannons,
          status: position.status as PredictionEvidence['status'],
        });
      }
    }
    const settled = projection.phase === 'settled' || projection.phase === 'voided';
    const settlement = projection.settlement ?? snapshots[0]?.[1].settlement;
    const deep =
      !!projection.settlementCheckpoint &&
      BigInt(observedTip.blockNumber) - BigInt(projection.settlementCheckpoint.blockNumber) >= 3n;
    const final = settled && !!settlement && deep && evidence.complete;
    evidence.results.push({
      fixtureId: fixture.fixtureId,
      marketKey: row.marketKey,
      outcome: settlement?.outcome ?? null,
      final,
      void: projection.phase === 'voided',
    });
    evidence.final &&= final;
    if (projection.occupancy)
      evidence.occupancy![fixture.fixtureId] = {
        occupied: settled ? admitted : projection.occupancy.accepted + projection.occupancy.pending,
        updatedAt: iso(projection.checkedAt),
      };
  }
  evidence.verifiedAt = iso(checks.length ? Math.min(...checks) : now);
  evidence.final &&= evidence.complete;
  evidence.revision = digest(['predictions-v1', revisions, evidence.complete, evidence.final]);
  return evidence;
}

export function fiveCampaignEvidence(
  campaign: Campaign,
  round: Round | null,
  now: number,
): CampaignEvidence {
  const evidence = empty(['five', campaign.id, round?.revision ?? null], now);
  if (
    !round ||
    !campaign.gameweek ||
    round.id !== campaign.gameweek.id ||
    round.id !== campaign.draft.fiveRoundId ||
    round.state === 'draft' ||
    round.state === 'cancelled' ||
    (round.terms.testingPolicy && !campaign.draft.rehearsal)
  )
    return evidence;
  const rehearsalClock =
    campaign.draft.rehearsal && round.terms.testingPolicy === TEST_TIMING_POLICY;
  if (!rehearsalClock && Date.parse(campaign.gameweek.lockAt) !== lockTime(round)) return evidence;
  const scores = new Map(standings(round).map((row) => [row.id, row]));
  evidence.complete = true;
  evidence.final = round.state === 'final' && round.scoresComplete && now >= lockTime(round);
  for (const entry of round.entries) {
    try {
      validateSquad(round.terms, entry.players, entry.captain);
    } catch {
      evidence.complete = false;
      continue;
    }
    const score = scores.get(entry.publicId);
    const saved = Date.parse(entry.savedAt);
    if (!score || !Number.isFinite(saved) || saved >= lockTime(round)) {
      evidence.complete = false;
      continue;
    }
    if (score.pending) evidence.final = false;
    const value: FiveEvidence = {
      accountId: entry.accountId,
      meaningfulSavedAt: iso(saved),
      players: [...entry.players],
      captain: entry.captain,
      points: score.points,
      valid: true,
      final: evidence.final && !score.pending,
    };
    evidence.five.push(value);
  }
  evidence.final &&= evidence.complete;
  for (const entry of evidence.five) entry.final = evidence.final;
  evidence.revision = digest([
    'five-v1',
    round.id,
    round.revision,
    round.scoreRevision,
    evidence.complete,
    evidence.final,
    evidence.five,
  ]);
  return evidence;
}

export function createCampaignSources(dependencies: CampaignSourceDependencies): CampaignSources {
  return {
    options: dependencies.options,
    ...(dependencies.validateReceivingAddress
      ? { validateReceivingAddress: dependencies.validateReceivingAddress }
      : {}),
    async observe(campaign) {
      if (campaign.draft.kind === 'five') {
        const store = dependencies.five();
        if (!store)
          return empty(['five-unavailable', campaign.id], dependencies.now?.() ?? Date.now());
        const [round, now] = await Promise.all([
          store.load(campaign.draft.fiveRoundId!),
          store.clock(),
        ]);
        return fiveCampaignEvidence(campaign, round, now);
      }
      const store = dependencies.activity();
      const now = dependencies.now?.() ?? Date.now();
      if (!store) return empty(['activity-unavailable', campaign.id], now);
      const sources = await store.readSources(
        campaign.fixtures.map((fixture) => fixture.fixtureId),
      );
      const absent = campaign.fixtures.filter(
        (fixture) =>
          !campaign.bindings[fixture.fixtureId] &&
          fixture.marketKey === campaignMarketPin(fixture.fixtureId) &&
          now >= Date.parse(fixture.cutoffAt) + 120_000 &&
          !sources.some(
            (s) =>
              s.descriptor.fixtureId === fixture.fixtureId &&
              s.descriptor.type.codeHash === V4_DIRECT_CONFIG.protocolHash,
          ),
      );
      const proofs: CampaignAbsenceSnapshot[] = [];
      if (dependencies.absence)
        for (let offset = 0; offset < absent.length; offset += 64) {
          const fixtures = absent.slice(offset, offset + 64).map((f) => ({
            fixtureId: f.fixtureId,
            cutoffMs: Date.parse(f.cutoffAt),
            protocolHash: V4_DIRECT_CONFIG.protocolHash,
          }));
          try {
            const raw = await dependencies.absence(fixtures);
            proofs.push(
              parseCampaignAbsenceSnapshot(raw, fixtures, dependencies.now?.() ?? Date.now()),
            );
          } catch {
            // Existing positions stay usable; unproven empty fixtures remain nonfinal.
          }
        }
      return predictionCampaignEvidence(
        campaign,
        sources,
        dependencies.now?.() ?? Date.now(),
        proofs,
      );
    },
  };
}

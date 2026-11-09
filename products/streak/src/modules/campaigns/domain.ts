import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { CampaignAbsenceSnapshot } from '../direct/campaign-absence';
import { fiveWalletLabel } from '../five/domain';
import type {
  CampaignArtwork,
  CampaignAward,
  CampaignDetail,
  CampaignDraftInput,
  CampaignFixture,
  CampaignGameweek,
  CampaignOptions,
  CampaignOwnEntry,
  CampaignPredictionEntryPolicy,
  CampaignStanding,
  CampaignSummary,
} from '../../../shared/campaign-wire';

export class CampaignError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export type CampaignActor = { id: string; name: string; wallet: string; ownerHash: string } | null;
export type Actor = NonNullable<CampaignActor>;
export interface PredictionEvidence {
  id: string;
  ownerHash: string;
  fixtureId: string;
  marketKey: string;
  outcome: 0 | 1 | 2;
  committedAt: string;
  blockNumber: string;
  transactionIndex: number;
  outputIndex: number;
  transactionHash: string;
  blockHash: string;
  principalShannons: string;
  status: 'accepted' | 'claimable' | 'claimed';
}
export interface ResultEvidence {
  fixtureId: string;
  marketKey: string;
  outcome: 0 | 1 | 2 | null;
  final: boolean;
  void: boolean;
}
export interface FiveEvidence {
  accountId: string;
  meaningfulSavedAt: string;
  players: string[];
  captain: string;
  points: number;
  valid: boolean;
  final: boolean;
}
export interface CampaignEvidence {
  revision: string;
  verifiedAt: string;
  complete: boolean;
  final: boolean;
  predictions: PredictionEvidence[];
  results: ResultEvidence[];
  five: FiveEvidence[];
  notice?: string;
  bindings?: Array<{ fixtureId: string; marketKey: string }>;
  occupancy?: Record<string, { occupied: number; updatedAt: string }>;
  absenceProofs?: CampaignAbsenceSnapshot[];
}
export interface CampaignSources {
  options(): Promise<CampaignOptions>;
  observe(campaign: Campaign): Promise<CampaignEvidence>;
  validateReceivingAddress?(address: string, amountShannons?: string): Promise<string>;
}
export interface CampaignEntry {
  predictionSlots?: PredictionSlot[];
  accountId: string;
  publicId: string;
  ownerHash: string;
  wallet: string;
  name: string;
  joinedAt: string;
  points: number;
  participated: boolean;
  qualifyingEntries: number;
  tieBreakAt: string | null;
  tieBreakOrder: string;
  calls: CampaignOwnEntry['calls'];
  evidence: PredictionEvidence[];
  five: FiveEvidence | null;
  receivingAddress: string | null;
}
export interface PredictionSlot {
  fixtureId: string;
  offerId: string;
  rawHash: string;
  outputIndex: number;
  outcome: 0 | 1 | 2;
  principalShannons: string;
  expiresAt: number;
  state: 'reserved' | 'started';
}
export interface PayoutProof {
  transactionHash: string;
  outputIndex: number;
  address: string;
  amountShannons: string;
  blockHash: string;
  blockNumber: string;
  confirmedAt: string;
}
export interface Campaign {
  id: string;
  /** Admin-managed presentation only. Historical records have no artwork. */
  artwork?: CampaignArtwork;
  creator: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  state: 'draft' | 'published' | 'finished';
  draft: CampaignDraftInput;
  publishedAt: string | null;
  termsHash: string | null;
  /** Missing on historical records means the original post-registration rule. */
  predictionEntryPolicy?: CampaignPredictionEntryPolicy;
  fixtures: CampaignFixture[];
  gameweek: CampaignGameweek | null;
  bindings: Record<string, string>;
  entries: CampaignEntry[];
  scoreStatus: CampaignDetail['scoreStatus'];
  evidenceRevision: string | null;
  evidenceFinal: boolean;
  verifiedAt: string | null;
  notice: string | null;
  finalAt: string | null;
  finalEvidenceRevision: string | null;
  awards: CampaignAward[];
  payouts: Record<string, PayoutProof>;
  deletedAt: string | null;
  deletedBy: string | null;
  /** Private durable source attestations, never exposed as a public payment proof. */
  absenceProofs?: CampaignAbsenceSnapshot[];
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const iso = (now: number) => new Date(now).toISOString();
const ownValue = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CampaignError('Invalid request.');
  return value as Record<string, unknown>;
}
export function identifier(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9_:.~-]{1,180}$/.test(value) ||
    ['__proto__', 'constructor', 'prototype'].includes(value)
  )
    throw new CampaignError('Invalid identifier.');
  return value;
}
function text(value: unknown, limit: number, empty = false): string {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim()))
    throw new CampaignError('Check the competition details.');
  return value.trim();
}
export function timestamp(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new CampaignError('Use a valid UTC timestamp.');
  return new Date(value).toISOString();
}
export function shannons(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[1-9]\d{0,19}$/.test(value) ||
    BigInt(value) > 18_446_744_073_709_551_615n
  )
    throw new CampaignError('Enter an exact positive CKB prize amount.');
  return value;
}
export function parseDraft(value: unknown): CampaignDraftInput {
  const d = object(value);
  if (d.kind !== 'predictions' && d.kind !== 'five')
    throw new CampaignError('Choose a competition type.');
  // Resource bounds match the existing payment catalogue and keep one admin request bounded.
  if (
    !Array.isArray(d.fixtureIds) ||
    d.fixtureIds.length > 512 ||
    !Array.isArray(d.prizes) ||
    d.prizes.length > 256
  )
    throw new CampaignError('This setup exceeds the request size limit.');
  const fixtureIds = d.fixtureIds.map(identifier);
  if (new Set(fixtureIds).size !== fixtureIds.length)
    throw new CampaignError('Each fixture can be selected once.');
  const prizes = d.prizes.map((raw, index) => {
    const p = object(raw);
    if (p.place !== index + 1)
      throw new CampaignError('Prize places must start at first and stay in order.');
    if (typeof p.usdReference !== 'string' || !/^(?:\d{1,7}(?:\.\d{1,2})?)?$/.test(p.usdReference))
      throw new CampaignError('Check the optional USD prize reference.');
    return {
      place: index + 1,
      amountShannons: shannons(p.amountShannons),
      usdReference: p.usdReference,
    };
  });
  if (typeof d.rehearsal !== 'boolean')
    throw new CampaignError('Choose whether this is a rehearsal.');
  return {
    name: text(d.name, 80),
    description: text(d.description, 4000, true),
    kind: d.kind,
    registrationClosesAt: d.registrationClosesAt === '' ? '' : timestamp(d.registrationClosesAt),
    fiveRoundId: d.fiveRoundId === null || d.fiveRoundId === '' ? null : identifier(d.fiveRoundId),
    fixtureIds,
    prizes,
    rehearsal: d.rehearsal,
  };
}
export function newCampaign(
  id: string,
  actor: Actor,
  draft: CampaignDraftInput,
  now: number,
): Campaign {
  return {
    id: identifier(id),
    creator: actor.id,
    revision: 1,
    createdAt: iso(now),
    updatedAt: iso(now),
    state: 'draft',
    draft,
    publishedAt: null,
    termsHash: null,
    fixtures: [],
    gameweek: null,
    bindings: {},
    entries: [],
    scoreStatus: 'waiting',
    evidenceRevision: null,
    evidenceFinal: false,
    verifiedAt: null,
    notice: null,
    finalAt: null,
    finalEvidenceRevision: null,
    awards: [],
    payouts: {},
    deletedAt: null,
    deletedBy: null,
  };
}
export function assertRevision(c: Campaign, revision: unknown): void {
  if (revision !== c.revision)
    throw new CampaignError('This competition changed. Refresh and review it again.', 409);
}
export function editCampaign(c: Campaign, draft: CampaignDraftInput, revision: unknown): void {
  assertRevision(c, revision);
  if (c.state !== 'draft' || c.deletedAt)
    throw new CampaignError('Published competition rules cannot be edited.', 409);
  c.draft = draft;
}
export function predictionEntryPolicy(c: Campaign): CampaignPredictionEntryPolicy | null {
  if (c.draft.kind !== 'predictions') return null;
  return c.state === 'draft'
    ? 'explicit-entry-v3'
    : (c.predictionEntryPolicy ?? 'after-registration-v1');
}
function publishedTermsHash(c: Campaign): string {
  const policy = predictionEntryPolicy(c);
  return hash({
    version: policy === 'explicit-entry-v3' ? 3 : policy === 'first-admitted-v2' ? 2 : 1,
    draft: c.draft,
    fixtures: c.fixtures.map(({ occupied: _o, updatedAt: _u, ...f }) => f),
    gameweek: c.gameweek,
    ...(policy === 'first-admitted-v2' || policy === 'explicit-entry-v3'
      ? { predictionEntryPolicy: policy }
      : {}),
  });
}
export function publishCampaign(c: Campaign, options: CampaignOptions, now: number): void {
  if (c.deletedAt || c.state !== 'draft')
    throw new CampaignError('Only an active draft can be published.', 409);
  const d = c.draft;
  if (!d.prizes.length || !d.registrationClosesAt || Date.parse(d.registrationClosesAt) <= now)
    throw new CampaignError('Set prize places and a future registration deadline.');
  if (d.prizes.some((prize) => BigInt(prize.amountShannons) < 6_100_000_000n))
    throw new CampaignError('Each prize must be at least 61 CKB to fit a standard receiving cell.');
  if (d.kind === 'predictions') {
    if (!d.fixtureIds.length || d.fiveRoundId)
      throw new CampaignError('Select fixtures for this prediction competition.');
    c.fixtures = d.fixtureIds.map((id) => {
      const candidates = options.fixtures.filter((f) => f.fixtureId === id);
      if (candidates.length !== 1)
        throw new CampaignError('A selected fixture is unavailable or ambiguous.', 409);
      const f = structuredClone(candidates[0]);
      identifier(f.fixtureId);
      identifier(f.marketId);
      if (
        !f.marketKey ||
        f.marketKey.length > 400 ||
        !Number.isSafeInteger(f.capacity) ||
        f.capacity <= 0
      )
        throw new CampaignError('The fixture protocol could not be pinned.', 503);
      timestamp(f.cutoffAt);
      timestamp(f.kickoffAt);
      if (
        Date.parse(f.cutoffAt) <= now ||
        Date.parse(d.registrationClosesAt) > Date.parse(f.cutoffAt)
      )
        throw new CampaignError(
          'Registration must close by the first selected prediction deadline.',
          409,
        );
      if (!f.marketKey.startsWith('v4:')) c.bindings[id] = f.marketKey;
      return f;
    });
  } else {
    if (!d.fiveRoundId || d.fixtureIds.length)
      throw new CampaignError('Choose one Five gameweek, without prediction fixtures.');
    const weeks = options.gameweeks.filter((w) => w.id === d.fiveRoundId);
    if (weeks.length !== 1 || weeks[0].state !== 'open')
      throw new CampaignError('Choose an open Five gameweek.', 409);
    const w = structuredClone(weeks[0]);
    timestamp(w.lockAt);
    if (Date.parse(w.lockAt) <= now || Date.parse(d.registrationClosesAt) > Date.parse(w.lockAt))
      throw new CampaignError('Registration must close by the Five deadline.', 409);
    c.gameweek = w;
  }
  if (d.kind === 'predictions') c.predictionEntryPolicy = 'explicit-entry-v3';
  c.termsHash = publishedTermsHash(c);
  c.publishedAt = iso(now);
  c.state = 'published';
}
export function joinCampaign(c: Campaign, actor: Actor, reviewedHash: unknown, now: number): void {
  if (c.deletedAt || c.state !== 'published' || now >= Date.parse(c.draft.registrationClosesAt))
    throw new CampaignError('Registration has closed for this competition.', 409);
  if (reviewedHash !== c.termsHash)
    throw new CampaignError('Review the published competition rules before joining.', 409);
  if (!/^0x[0-9a-f]{64}$/.test(actor.ownerHash))
    throw new CampaignError('Your verified wallet identity is unavailable.', 403);
  const existing = c.entries.find((e) => e.accountId === actor.id);
  if (existing) {
    if (existing.ownerHash !== actor.ownerHash)
      throw new CampaignError('This entry is linked to a different wallet.', 409);
    return;
  }
  if (c.entries.some((e) => e.ownerHash === actor.ownerHash))
    throw new CampaignError('This wallet already joined the competition.', 409);
  c.entries.push({
    accountId: actor.id,
    publicId: hash([c.id, actor.id]).slice(0, 24),
    ownerHash: actor.ownerHash,
    wallet: actor.wallet,
    name: actor.name.slice(0, 64),
    joinedAt: iso(now),
    points: 0,
    participated: false,
    qualifyingEntries: 0,
    tieBreakAt: null,
    tieBreakOrder: '',
    calls: [],
    evidence: [],
    five: null,
    receivingAddress: null,
  });
}
export function deleteCampaign(
  c: Campaign,
  actor: Actor,
  revision: unknown,
  confirmName: unknown,
  now: number,
): void {
  if (confirmName !== c.draft.name)
    throw new CampaignError('Type the exact competition name to delete it.');
  // A repeated request for this same object is harmless; it never reopens or erases records.
  if (c.deletedAt) return;
  assertRevision(c, revision);
  c.deletedAt = iso(now);
  c.deletedBy = actor.id;
}
function predictionOrder(a: PredictionEvidence, b: PredictionEvidence): number {
  const left = BigInt(a.blockNumber),
    right = BigInt(b.blockNumber);
  return left < right
    ? -1
    : left > right
      ? 1
      : a.transactionIndex - b.transactionIndex ||
        a.outputIndex - b.outputIndex ||
        a.id.localeCompare(b.id);
}
function assertEvidence(e: CampaignEvidence, now: number): void {
  if (
    !e.revision ||
    e.revision.length > 200 ||
    !Array.isArray(e.predictions) ||
    !Array.isArray(e.results) ||
    !Array.isArray(e.five)
  )
    throw new CampaignError('Campaign evidence is unavailable.', 503);
  if (Date.parse(timestamp(e.verifiedAt)) > now + 60_000)
    throw new CampaignError('Evidence timestamp is in the future.', 503);
  if (e.notice !== undefined && (typeof e.notice !== 'string' || e.notice.length > 1000))
    throw new CampaignError('Invalid evidence status.', 503);
  for (const result of e.results) {
    if (
      typeof result.final !== 'boolean' ||
      typeof result.void !== 'boolean' ||
      (result.outcome !== null && ![0, 1, 2].includes(result.outcome)) ||
      (result.final && !result.void && result.outcome === null)
    )
      throw new CampaignError('Market result evidence is incomplete.', 503);
  }
  for (const p of e.predictions) {
    if (
      !p.id ||
      !/^0x[0-9a-f]{64}$/.test(p.ownerHash) ||
      !/^(?:0|[1-9]\d*)$/.test(p.blockNumber) ||
      !Number.isSafeInteger(p.transactionIndex) ||
      p.transactionIndex < 0 ||
      !Number.isSafeInteger(p.outputIndex) ||
      p.outputIndex < 0 ||
      !/^0x[0-9a-f]{64}$/.test(p.transactionHash) ||
      !/^0x[0-9a-f]{64}$/.test(p.blockHash) ||
      ![0, 1, 2].includes(p.outcome) ||
      !['accepted', 'claimable', 'claimed'].includes(p.status)
    )
      throw new CampaignError('Prediction evidence is incomplete.', 503);
    timestamp(p.committedAt);
    shannons(p.principalShannons);
  }
}
function rankingKey(e: CampaignEntry) {
  return [
    e.accountId,
    e.points,
    e.participated,
    e.qualifyingEntries,
    e.tieBreakAt,
    e.tieBreakOrder,
    e.calls,
    e.five,
  ];
}
/** Replace projections from a complete canonical snapshot. Repeated evidence is idempotent. */
export function reconcileCampaign(c: Campaign, evidence: CampaignEvidence, now: number): void {
  if (c.state === 'draft') return;
  assertEvidence(evidence, now);
  if (!evidence.complete) {
    c.scoreStatus = c.state === 'finished' ? 'review-required' : 'unavailable';
    c.notice =
      evidence.notice ?? 'Verification is catching up. Previously checked points are retained.';
    c.evidenceFinal = false;
    return;
  }
  // The owner approved this eligibility correction for ongoing rehearsal runs.
  // Mainnet prize promises and finalized/archived rehearsal results stay frozen.
  // Persist policy, new terms hash and recalculated entries in the same audited write.
  const upgradeRehearsal =
    c.draft.kind === 'predictions' &&
    c.draft.rehearsal &&
    c.state === 'published' &&
    !c.deletedAt &&
    predictionEntryPolicy(c) === 'after-registration-v1';
  const policy = upgradeRehearsal ? 'first-admitted-v2' : predictionEntryPolicy(c);
  const bindings = { ...c.bindings };
  for (const b of evidence.bindings ?? []) {
    if (
      !c.fixtures.some((f) => f.fixtureId === b.fixtureId) ||
      !b.marketKey ||
      b.marketKey.startsWith('v4:')
    )
      throw new CampaignError('Invalid canonical market binding.', 503);
    if (ownValue(bindings, b.fixtureId) && ownValue(bindings, b.fixtureId) !== b.marketKey)
      throw new CampaignError(
        'A campaign market binding changed. Review the canonical market.',
        409,
      );
    bindings[b.fixtureId] = b.marketKey;
  }
  const ids = new Set<string>();
  for (const p of evidence.predictions) {
    if (ids.has(p.id)) throw new CampaignError('Duplicate canonical prediction identity.', 503);
    ids.add(p.id);
  }
  const projected = structuredClone(c.entries);
  for (const entry of projected) {
    entry.points = 0;
    entry.participated = false;
    entry.qualifyingEntries = 0;
    entry.tieBreakAt = null;
    entry.tieBreakOrder = '';
    entry.calls = [];
    entry.evidence = [];
    entry.five = null;
    if (c.draft.kind === 'predictions') {
      for (const f of c.fixtures) {
        const eligible = evidence.predictions
          .filter(
            (p) =>
              p.ownerHash === entry.ownerHash &&
              p.fixtureId === f.fixtureId &&
              p.marketKey === ownValue(bindings, f.fixtureId) &&
              (policy === 'first-admitted-v2' ||
                Date.parse(p.committedAt) >= Date.parse(entry.joinedAt)) &&
              (policy !== 'explicit-entry-v3' ||
                entry.predictionSlots?.some(
                  (slot) =>
                    slot.state === 'started' &&
                    slot.fixtureId === p.fixtureId &&
                    slot.rawHash === p.transactionHash &&
                    slot.outputIndex === p.outputIndex &&
                    slot.outcome === p.outcome &&
                    slot.principalShannons === p.principalShannons,
                )) &&
              Date.parse(p.committedAt) < Date.parse(f.cutoffAt),
          )
          .sort(predictionOrder);
        const first = eligible[0];
        if (!first) continue;
        const results = evidence.results.filter(
          (r) => r.fixtureId === f.fixtureId && r.marketKey === ownValue(bindings, f.fixtureId),
        );
        if (results.length > 1) throw new CampaignError('Conflicting market results.', 503);
        const result = results[0];
        const status = !result?.final
          ? 'pending'
          : result.void
            ? 'void'
            : first.outcome === result.outcome
              ? 'correct'
              : 'incorrect';
        const points = status === 'correct' ? 3 : 0;
        entry.calls.push({
          fixtureId: f.fixtureId,
          outcome: first.outcome,
          points,
          status,
          transactionHash: first.transactionHash,
        });
        entry.evidence.push(first);
        entry.points += points;
      }
      entry.qualifyingEntries = entry.calls.length;
      entry.participated = !!entry.calls.length;
      const ordered = [...entry.evidence].sort(predictionOrder);
      const last = ordered[ordered.length - 1];
      if (last) {
        entry.tieBreakAt = last.committedAt;
        entry.tieBreakOrder = `${last.blockNumber.padStart(24, '0')}:${String(last.transactionIndex).padStart(12, '0')}:${String(last.outputIndex).padStart(12, '0')}`;
      }
    } else {
      const matches = evidence.five.filter((f) => f.accountId === entry.accountId);
      if (matches.length > 1) throw new CampaignError('Duplicate Five entry evidence.', 503);
      const f = matches[0];
      if (
        f &&
        f.valid &&
        f.players.length === 5 &&
        new Set(f.players).size === 5 &&
        f.players.includes(f.captain) &&
        Number.isSafeInteger(f.points) &&
        Date.parse(timestamp(f.meaningfulSavedAt)) < Date.parse(c.gameweek!.lockAt)
      ) {
        entry.five = f;
        entry.points = f.points;
        entry.participated = true;
        entry.qualifyingEntries = 1;
        entry.tieBreakAt = f.meaningfulSavedAt;
        entry.tieBreakOrder = f.meaningfulSavedAt;
      }
    }
  }
  if (
    c.state === 'finished' &&
    !isDeepStrictEqual(projected.map(rankingKey), c.entries.map(rankingKey))
  ) {
    c.scoreStatus = 'review-required';
    c.notice = 'Verified results changed after finalization. Award review is required.';
    c.evidenceFinal = false;
    return;
  }
  c.entries = projected;
  if (upgradeRehearsal) {
    c.predictionEntryPolicy = 'first-admitted-v2';
    c.termsHash = publishedTermsHash(c);
  }
  c.bindings = bindings;
  c.evidenceRevision = evidence.revision;
  c.absenceProofs = structuredClone(evidence.absenceProofs ?? []);
  c.verifiedAt = timestamp(evidence.verifiedAt);
  c.evidenceFinal = evidence.final;
  c.scoreStatus = evidence.final ? 'final' : 'provisional';
  c.notice = evidence.notice ?? null;
  for (const f of c.fixtures) {
    const occupancy = evidence.occupancy ? ownValue(evidence.occupancy, f.fixtureId) : undefined;
    if (
      occupancy &&
      Number.isSafeInteger(occupancy.occupied) &&
      occupancy.occupied >= 0 &&
      occupancy.occupied <= f.capacity
    ) {
      f.occupied = occupancy.occupied;
      f.updatedAt = timestamp(occupancy.updatedAt);
    }
  }
}
export function rankedEntries(c: Campaign): CampaignEntry[] {
  return [...c.entries].sort(
    (a, b) =>
      Number(b.participated) - Number(a.participated) ||
      b.points - a.points ||
      (c.draft.kind === 'predictions' && a.participated && b.participated
        ? a.tieBreakOrder.localeCompare(b.tieBreakOrder)
        : 0) ||
      (a.tieBreakAt ?? a.joinedAt).localeCompare(b.tieBreakAt ?? b.joinedAt) ||
      a.tieBreakOrder.localeCompare(b.tieBreakOrder) ||
      a.joinedAt.localeCompare(b.joinedAt) ||
      a.publicId.localeCompare(b.publicId),
  );
}
export function finalizeCampaign(c: Campaign, now: number): void {
  if (c.state === 'finished') {
    if (c.scoreStatus === 'review-required')
      throw new CampaignError('Final results need an administrator review before payouts.', 409);
    return;
  }
  const lastCutoff = Math.max(
    Date.parse(c.draft.registrationClosesAt),
    ...c.fixtures.map((f) => Date.parse(f.cutoffAt)),
    ...(c.gameweek ? [Date.parse(c.gameweek.lockAt)] : []),
  );
  if (c.state !== 'published' || now < lastCutoff || !c.evidenceFinal || c.scoreStatus !== 'final')
    throw new CampaignError('Wait for complete, verified final results.', 409);
  const active = rankedEntries(c).filter((e) => e.participated);
  c.awards = c.draft.prizes.map((prize) => {
    const winner = active[prize.place - 1];
    return {
      ...prize,
      publicId: winner?.publicId ?? null,
      name: winner?.name ?? null,
      status: !winner ? 'unawarded' : winner.receivingAddress ? 'ready' : 'address-needed',
      transactionHash: null,
      ...(winner?.receivingAddress ? { receivingAddress: winner.receivingAddress } : {}),
    };
  });
  c.state = 'finished';
  c.finalAt = iso(now);
  c.finalEvidenceRevision = c.evidenceRevision;
}
export function saveReceivingAddress(c: Campaign, actor: Actor, address: string): void {
  if (c.draft.rehearsal)
    throw new CampaignError('Rehearsal competitions do not collect mainnet payout addresses.', 409);
  const entry = c.entries.find((e) => e.accountId === actor.id);
  const award = c.awards.find((a) => a.publicId === entry?.publicId);
  if (!entry || !award || c.state !== 'finished')
    throw new CampaignError('A finalized winning place is required.', 409);
  if (entry.receivingAddress) {
    if (entry.receivingAddress === address) return;
    throw new CampaignError(
      'Your receiving address is already confirmed. Contact the organizer before payment if it needs correction.',
      409,
    );
  }
  if (award.status === 'submitted' || award.status === 'paid') {
    if (entry.receivingAddress === address) return;
    throw new CampaignError('The receiving address is locked for this payment.', 409);
  }
  entry.receivingAddress = address;
  award.receivingAddress = address;
  award.status = 'ready';
}
export function recordPayout(c: Campaign, publicId: string, proof: PayoutProof): void {
  identifier(publicId);
  if (c.draft.rehearsal)
    throw new CampaignError('Rehearsal awards cannot be paid on mainnet.', 409);
  if (c.state !== 'finished' || c.scoreStatus !== 'final')
    throw new CampaignError('Review final results before recording a payout.', 409);
  const award = c.awards.find((a) => a.publicId === publicId);
  if (
    !award ||
    !award.receivingAddress ||
    award.receivingAddress !== proof.address ||
    award.amountShannons !== proof.amountShannons
  )
    throw new CampaignError('The verified payment does not match this award.', 409);
  if (
    !/^0x[0-9a-f]{64}$/.test(proof.transactionHash) ||
    !/^0x[0-9a-f]{64}$/.test(proof.blockHash) ||
    !Number.isSafeInteger(proof.outputIndex) ||
    proof.outputIndex < 0 ||
    !/^(?:0|[1-9]\d*)$/.test(proof.blockNumber)
  )
    throw new CampaignError('The payout proof is incomplete.');
  timestamp(proof.confirmedAt);
  const old = ownValue(c.payouts, publicId);
  if (old) {
    if (old.transactionHash !== proof.transactionHash || old.outputIndex !== proof.outputIndex)
      throw new CampaignError('This award already has a different recorded payment.', 409);
    // A fresh canonical verification may move the same transaction after a reorg.
    c.payouts[publicId] = proof;
    return;
  }
  c.payouts[publicId] = proof;
  award.status = 'paid';
  award.transactionHash = proof.transactionHash;
}
export function summary(c: Campaign, actor: CampaignActor, now: number): CampaignSummary {
  const ownEntry = actor ? c.entries.find((entry) => entry.accountId === actor.id) : undefined;
  return {
    id: c.id,
    artwork: c.artwork ?? { icon: null, banner: null },
    name: c.draft.name,
    description: c.draft.description,
    kind: c.draft.kind,
    state: c.deletedAt
      ? 'deleted'
      : c.state === 'draft'
        ? 'draft'
        : c.state === 'finished'
          ? 'finished'
          : c.evidenceFinal
            ? 'finalizing'
            : now < Date.parse(c.draft.registrationClosesAt)
              ? 'open'
              : 'live',
    rehearsal: c.draft.rehearsal,
    registrationClosesAt: c.draft.registrationClosesAt,
    fiveRoundId: c.draft.fiveRoundId,
    fixtureCount: c.fixtures.length || c.draft.fixtureIds.length,
    registeredCount: c.entries.length,
    activeCount: c.entries.filter((e) => e.participated).length,
    prizeTotalShannons: c.draft.prizes
      .reduce((n, p) => n + BigInt(p.amountShannons), 0n)
      .toString(),
    prizePlaces: c.draft.prizes.length,
    joined: !!ownEntry,
    predictionEntryPolicy: predictionEntryPolicy(c),
    ...(ownEntry && c.draft.kind === 'predictions'
      ? {
          joinedFixtureIds: c.fixtures.map((fixture) => fixture.fixtureId),
          qualifyingFixtureIds: [...new Set(ownEntry.calls.map((call) => call.fixtureId))],
          pendingFixtureIds: (ownEntry.predictionSlots ?? [])
            .filter(
              (slot) =>
                (slot.state === 'started' || slot.expiresAt > now) &&
                !ownEntry.calls.some((call) => call.fixtureId === slot.fixtureId),
            )
            .map((slot) => slot.fixtureId),
        }
      : {}),
  };
}
export function project(
  c: Campaign,
  actor: CampaignActor,
  admin: boolean,
  now: number,
  offset = 0,
  limit = 100,
): CampaignDetail {
  const sorted = rankedEntries(c);
  // Prediction registrations use wallet identity, not the login's generic name.
  // Five may have a saved public name; older unnamed entries retain a short label.
  const publicNames = new Map(
    sorted.map((e) => [
      e.publicId,
      c.draft.kind === 'five' && e.name.trim() && !/^player$/i.test(e.name.trim())
        ? e.name
        : fiveWalletLabel(e.wallet),
    ]),
  );
  const standings: CampaignStanding[] = sorted.map((e, i) => ({
    publicId: e.publicId,
    name: publicNames.get(e.publicId)!,
    rank: i + 1,
    points: e.points,
    participated: e.participated,
    qualifyingEntries: e.qualifyingEntries,
    tieBreakAt: e.tieBreakAt,
    own: e.accountId === actor?.id,
    awardShannons: c.awards.find((a) => a.publicId === e.publicId)?.amountShannons ?? null,
  }));
  const ownIndex = sorted.findIndex((e) => e.accountId === actor?.id),
    ownEntry = sorted[ownIndex];
  return {
    ...summary(c, actor, now),
    revision: c.revision,
    termsHash: c.termsHash,
    predictionEntryPolicy: predictionEntryPolicy(c),
    draft: structuredClone(c.draft),
    fixtures: structuredClone(c.fixtures),
    gameweek: structuredClone(c.gameweek),
    leaderboard: standings.slice(offset, offset + limit),
    leaderboardTotal: sorted.length,
    leaderboardOffset: offset,
    own: ownEntry
      ? {
          publicId: ownEntry.publicId,
          joinedAt: ownEntry.joinedAt,
          rank: ownIndex + 1,
          points: ownEntry.points,
          participated: ownEntry.participated,
          tieBreakAt: ownEntry.tieBreakAt,
          calls: structuredClone(ownEntry.calls),
          fiveRoundId: c.draft.fiveRoundId,
        }
      : null,
    awards: c.awards.map(({ receivingAddress, ...award }) => ({
      ...award,
      name: award.publicId ? (publicNames.get(award.publicId) ?? award.name) : award.name,
      ...(receivingAddress && (admin || award.publicId === ownEntry?.publicId)
        ? { receivingAddress }
        : {}),
    })),
    scoreStatus: c.scoreStatus,
    verifiedAt: c.verifiedAt,
    notice: c.notice,
    deletedAt: c.deletedAt,
    ...(admin
      ? {
          adminEntries: standings.slice(offset, offset + limit).map((standing) => {
            const e = sorted[standing.rank - 1];
            return { ...standing, accountId: e.accountId, joinedAt: e.joinedAt };
          }),
        }
      : {}),
  };
}

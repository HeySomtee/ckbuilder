import { isRecord, request } from '../../lib/http';
import type {
  CampaignAdminEntry,
  CampaignAward,
  CampaignDetail,
  CampaignDraftInput,
  CampaignFixture,
  CampaignGameweek,
  CampaignOptions,
  CampaignOwnEntry,
  CampaignPage,
  CampaignPrize,
  CampaignStanding,
  CampaignSummary,
} from '../../../../shared/campaign-wire';
export type * from '../../../../shared/campaign-wire';

const invalid = (): never => {
  throw new Error('Competition details are incomplete. Please refresh.');
};
const object = (v: unknown) => (isRecord(v) ? v : invalid());
const string = (v: unknown, max = 400) =>
  typeof v === 'string' && v.length <= max ? v : invalid();
const boolean = (v: unknown) => (typeof v === 'boolean' ? v : invalid());
const integer = (v: unknown, negative = false): number =>
  typeof v === 'number' && Number.isSafeInteger(v) && (negative || v >= 0) ? v : invalid();
const list = (v: unknown, max = 10000): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : invalid();
const choice = <T extends string>(v: unknown, values: readonly T[]): T =>
  typeof v === 'string' && values.includes(v as T) ? (v as T) : invalid();
const date = (v: unknown) => {
  const s = string(v, 60);
  return Number.isFinite(Date.parse(s)) ? s : invalid();
};
const nullableDate = (v: unknown) => (v === null ? null : date(v));
const draftDeadline = (v: unknown) => (v === '' ? '' : date(v));
const nullableString = (v: unknown) => (v === null ? null : string(v));
const amount = (v: unknown) => {
  const s = string(v, 30);
  return /^(0|[1-9]\d*)$/.test(s) ? s : invalid();
};
function prize(v: unknown): CampaignPrize {
  const x = object(v);
  return {
    place: integer(x.place),
    amountShannons: amount(x.amountShannons),
    usdReference: string(x.usdReference, 60),
  };
}
function draft(v: unknown): CampaignDraftInput {
  const x = object(v);
  return {
    name: string(x.name, 120),
    description: string(x.description, 4000),
    kind: choice(x.kind, ['predictions', 'five']),
    registrationClosesAt: draftDeadline(x.registrationClosesAt),
    fiveRoundId: nullableString(x.fiveRoundId),
    fixtureIds: list(x.fixtureIds).map((id) => string(id)),
    prizes: list(x.prizes).map(prize),
    rehearsal: boolean(x.rehearsal),
  };
}
function fixture(v: unknown): CampaignFixture {
  const x = object(v);
  return {
    fixtureId: string(x.fixtureId),
    marketId: string(x.marketId),
    marketKey: string(x.marketKey),
    home: string(x.home),
    away: string(x.away),
    league: string(x.league),
    kickoffAt: date(x.kickoffAt),
    cutoffAt: date(x.cutoffAt),
    capacity: integer(x.capacity),
    occupied: x.occupied === null ? null : integer(x.occupied),
    updatedAt: nullableDate(x.updatedAt),
  };
}
function gameweek(v: unknown): CampaignGameweek {
  const x = object(v);
  const event = x.event === undefined ? undefined : integer(x.event);
  if (event !== undefined && (event < 1 || event > 38)) return invalid();
  return {
    id: string(x.id),
    name: string(x.name),
    lockAt: date(x.lockAt),
    state: string(x.state),
    ...(event === undefined ? {} : { event }),
  };
}
function standing(v: unknown): CampaignStanding {
  const x = object(v);
  return {
    publicId: string(x.publicId),
    name: string(x.name),
    rank: integer(x.rank),
    points: integer(x.points, true),
    participated: boolean(x.participated),
    qualifyingEntries: integer(x.qualifyingEntries),
    tieBreakAt: nullableDate(x.tieBreakAt),
    own: boolean(x.own),
    awardShannons: x.awardShannons === null ? null : amount(x.awardShannons),
  };
}
function summary(v: unknown): CampaignSummary {
  const x = object(v);
  return {
    id: string(x.id),
    name: string(x.name, 120),
    description: string(x.description, 4000),
    kind: choice(x.kind, ['predictions', 'five']),
    state: choice(x.state, ['draft', 'open', 'live', 'finalizing', 'finished', 'deleted']),
    rehearsal: boolean(x.rehearsal),
    registrationClosesAt: draftDeadline(x.registrationClosesAt),
    fiveRoundId: nullableString(x.fiveRoundId),
    fixtureCount: integer(x.fixtureCount),
    registeredCount: integer(x.registeredCount),
    activeCount: integer(x.activeCount),
    prizeTotalShannons: amount(x.prizeTotalShannons),
    prizePlaces: integer(x.prizePlaces),
    joined: boolean(x.joined),
  };
}
function award(v: unknown): CampaignAward {
  const x = object(v);
  return {
    place: integer(x.place),
    publicId: nullableString(x.publicId),
    name: nullableString(x.name),
    amountShannons: amount(x.amountShannons),
    usdReference: string(x.usdReference, 60),
    status: choice(x.status, ['unawarded', 'address-needed', 'ready', 'submitted', 'paid']),
    transactionHash: nullableString(x.transactionHash),
    ...(x.receivingAddress === undefined ? {} : { receivingAddress: string(x.receivingAddress) }),
  };
}
function own(v: unknown): CampaignOwnEntry {
  const x = object(v);
  return {
    publicId: string(x.publicId),
    joinedAt: date(x.joinedAt),
    rank: integer(x.rank),
    points: integer(x.points, true),
    participated: boolean(x.participated),
    tieBreakAt: nullableDate(x.tieBreakAt),
    fiveRoundId: nullableString(x.fiveRoundId),
    calls: list(x.calls).map((c) => {
      const call = object(c);
      const outcome = call.outcome;
      if (outcome !== 0 && outcome !== 1 && outcome !== 2) return invalid();
      return {
        fixtureId: string(call.fixtureId),
        outcome,
        points: integer(call.points, true),
        status: choice(call.status, ['pending', 'correct', 'incorrect', 'void']),
        transactionHash: string(call.transactionHash),
      };
    }),
  };
}
function adminEntry(v: unknown): CampaignAdminEntry {
  const x = object(v);
  return { ...standing(x), accountId: string(x.accountId), joinedAt: date(x.joinedAt) };
}
function detail(v: unknown): CampaignDetail {
  const x = object(v);
  return {
    ...summary(x),
    revision: integer(x.revision),
    termsHash: nullableString(x.termsHash),
    draft: draft(x.draft),
    fixtures: list(x.fixtures).map(fixture),
    gameweek: x.gameweek === null ? null : gameweek(x.gameweek),
    leaderboard: list(x.leaderboard).map(standing),
    leaderboardTotal: integer(x.leaderboardTotal),
    leaderboardOffset: integer(x.leaderboardOffset),
    own: x.own === null ? null : own(x.own),
    awards: list(x.awards).map(award),
    scoreStatus: choice(x.scoreStatus, [
      'waiting',
      'provisional',
      'final',
      'unavailable',
      'review-required',
    ]),
    verifiedAt: nullableDate(x.verifiedAt),
    notice: nullableString(x.notice),
    deletedAt: nullableDate(x.deletedAt),
    ...(x.adminEntries === undefined ? {} : { adminEntries: list(x.adminEntries).map(adminEntry) }),
  };
}
function options(v: unknown): CampaignOptions {
  const x = object(v);
  return { fixtures: list(x.fixtures).map(fixture), gameweeks: list(x.gameweeks).map(gameweek) };
}
export function parseCampaignPage(v: unknown): CampaignPage {
  const x = object(v);
  return {
    admin: boolean(x.admin),
    viewerId: nullableString(x.viewerId),
    now: date(x.now),
    campaigns: list(x.campaigns).map(summary),
    detail: x.detail === null ? null : detail(x.detail),
    ...(x.options === undefined ? {} : { options: options(x.options) }),
  };
}
export function loadCampaigns(
  id: string | null,
  signal?: AbortSignal,
  offset = 0,
): Promise<CampaignPage> {
  const query = new URLSearchParams();
  if (id) query.set('id', id);
  if (offset) query.set('offset', String(offset));
  return request(`/campaigns${query.size ? `?${query}` : ''}`, signal).then(parseCampaignPage);
}
export function loadCampaignOptions(signal?: AbortSignal): Promise<CampaignOptions> {
  return request('/campaigns?action=options', signal).then(options);
}
export function prepareCampaignGameweek(event: number): Promise<CampaignOptions> {
  return request('/campaigns', undefined, { action: 'prepare-gameweek', event }).then(options);
}
export type CampaignAction =
  | { action: 'create'; draft: CampaignDraftInput }
  | { action: 'update'; id: string; revision: number; draft: CampaignDraftInput }
  | { action: 'publish' | 'finalize'; id: string; revision: number }
  | { action: 'join'; id: string; termsHash: string }
  | { action: 'delete'; id: string; revision: number; confirmName: string }
  | { action: 'payout-address'; id: string; address: string }
  | {
      action: 'record-payout';
      id: string;
      publicId: string;
      transactionHash: string;
      outputIndex: number;
    };
export function actCampaign(action: CampaignAction): Promise<CampaignPage> {
  return request('/campaigns', undefined, action).then(parseCampaignPage);
}

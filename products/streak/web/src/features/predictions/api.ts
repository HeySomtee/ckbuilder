import { isRecord, request, text } from '../../lib/http';
import { parseMarket } from '../markets/api';
import type { Market } from '../markets/api';
import { totalShannons } from './draft';
import type { Draft, Pick } from './draft';
export interface PublicMarket {
  evaluatedAt: number;
  market: Market;
  accepting: boolean;
  termsId: string;
  terms: {
    kind: 'custodial-ledger';
    minimumShannons: string;
    maximumShannons: string;
    protocolFeeBps: number;
    creatorFeeBps: number;
    kickoff: string;
    closesAt: string;
  };
}
export interface ReviewedLine extends Pick {
  detail: PublicMarket | null;
  errors: string[];
}
export interface Review {
  revision: string;
  valid: boolean;
  expiresAt: number;
  expiresMonotonic: number;
  totalPrincipalShannons: string | null;
  lines: ReviewedLine[];
}
function integer(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,40}$/.test(value)) throw Error('Invalid market amount.');
  return value;
}
function date(value: unknown): string {
  const result = text(value);
  if (!Number.isFinite(Date.parse(result))) throw Error('Invalid market time.');
  return result;
}
function bps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000)
    throw Error('Invalid market fee.');
  return value;
}
export function parsePublicMarket(data: unknown): PublicMarket {
  if (
    !isRecord(data) ||
    !isRecord(data.terms) ||
    data.terms.kind !== 'custodial-ledger' ||
    data.paymentAvailable !== false ||
    typeof data.accepting !== 'boolean' ||
    typeof data.termsId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.termsId)
  )
    throw Error('Market rules are incomplete. Please retry.');
  const terms = {
    kind: 'custodial-ledger' as const,
    minimumShannons: integer(data.terms.minimumShannons),
    maximumShannons: integer(data.terms.maximumShannons),
    protocolFeeBps: bps(data.terms.protocolFeeBps),
    creatorFeeBps: bps(data.terms.creatorFeeBps),
    kickoff: date(data.terms.kickoff),
    closesAt: date(data.terms.closesAt),
  };
  if (
    BigInt(terms.minimumShannons) <= 0n ||
    BigInt(terms.maximumShannons) < BigInt(terms.minimumShannons) ||
    terms.protocolFeeBps + terms.creatorFeeBps > 10_000
  )
    throw Error('Invalid market rules.');
  return {
    evaluatedAt: Date.parse(date(data.evaluatedAt)),
    market: parseMarket(data.market),
    accepting: data.accepting,
    termsId: data.termsId,
    terms,
  };
}
export async function getPublicMarket(id: string, signal?: AbortSignal): Promise<PublicMarket> {
  const detail = parsePublicMarket(
    await request(`/markets/${encodeURIComponent(id)}/public`, signal),
  );
  if (detail.market.id !== id) throw Error('The returned market does not match this selection.');
  return detail;
}
export async function reviewDraft(draft: Draft, signal: AbortSignal): Promise<Review> {
  const started = performance.now();
  const data = await request('/slips/review', signal, draft);
  if (
    !isRecord(data) ||
    data.v !== 1 ||
    data.revision !== draft.revision ||
    data.paymentAvailable !== false ||
    typeof data.valid !== 'boolean' ||
    !Array.isArray(data.lines) ||
    data.lines.length !== draft.picks.length
  )
    throw Error('The review did not match your slip. Please retry.');
  const evaluated = Date.parse(date(data.evaluatedAt));
  const expiresAt = Date.parse(date(data.expiresAt));
  if (expiresAt < evaluated || expiresAt - evaluated > 30_000)
    throw Error('Invalid review expiry.');
  const expected = totalShannons(draft.picks)?.toString() ?? null;
  if (data.totalPrincipalShannons !== expected)
    throw Error('The review total did not match your slip.');
  const lines = data.lines.map((line, index): ReviewedLine => {
    const pick = draft.picks[index];
    if (
      !isRecord(line) ||
      !Object.entries(pick).every(([key, value]) => line[key] === value) ||
      !Array.isArray(line.errors) ||
      line.errors.some((error) => typeof error !== 'string')
    )
      throw Error('A reviewed selection changed. Please retry.');
    return {
      ...pick,
      errors: line.errors.map(text),
      detail: line.detail === null ? null : parsePublicMarket(line.detail),
    };
  });
  if (
    data.valid &&
    lines.some(
      (line) =>
        line.errors.length ||
        !line.detail ||
        line.detail.market.id !== line.marketId ||
        line.detail.market.matchId !== line.matchId,
    )
  )
    throw Error('The review contains an unavailable selection.');
  return {
    revision: draft.revision,
    valid: data.valid,
    expiresAt,
    expiresMonotonic: started + expiresAt - evaluated,
    totalPrincipalShannons: expected,
    lines,
  };
}

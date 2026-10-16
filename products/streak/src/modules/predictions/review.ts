import { createHash } from 'node:crypto';
import { MIN_BET_CKB, MAX_BET_CKB } from '../../config';
import { toMarketSummary } from '../../markets';
import type { Match, Market, StreakDB, Outcome } from '../../types';

export const MAX_SLIP_PICKS = 8;
export class InvalidSlip extends Error {}
interface Pick {
  lineId: string;
  marketId: string;
  matchId: string;
  outcome: Outcome;
  amountCkb: string;
}
export interface SlipInput {
  v: 1;
  revision: string;
  picks: Pick[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,120}$/.test(value);
export function parseSlip(value: unknown): SlipInput {
  if (
    !record(value) ||
    value.v !== 1 ||
    !identifier(value.revision) ||
    !Array.isArray(value.picks) ||
    value.picks.length < 1 ||
    value.picks.length > MAX_SLIP_PICKS
  )
    throw new InvalidSlip('Choose between one and eight predictions.');
  const picks = value.picks.map((pick): Pick => {
    if (
      !record(pick) ||
      !identifier(pick.lineId) ||
      !identifier(pick.marketId) ||
      !identifier(pick.matchId) ||
      (pick.outcome !== 'home' && pick.outcome !== 'draw' && pick.outcome !== 'away') ||
      typeof pick.amountCkb !== 'string' ||
      pick.amountCkb.length > 32
    )
      throw new InvalidSlip('The prediction draft is malformed.');
    return {
      lineId: pick.lineId,
      marketId: pick.marketId,
      matchId: pick.matchId,
      outcome: pick.outcome,
      amountCkb: pick.amountCkb,
    };
  });
  if (new Set(picks.map((pick) => pick.lineId)).size !== picks.length)
    throw new InvalidSlip('Prediction line identifiers must be unique.');
  return { v: 1, revision: value.revision, picks };
}
export function parseAmount(value: string): bigint | null {
  if (value.length > 32 || !/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
}
function identity(match: Match): string | null {
  return match.oracle?.provider && match.oracle.fixtureId
    ? JSON.stringify([match.oracle.provider, match.oracle.fixtureId])
    : null;
}
export function publicPredictionMarket(market: Market, match: Match, now: number) {
  const terms = {
    kind: 'custodial-ledger' as const,
    minimumShannons: (BigInt(MIN_BET_CKB) * 100_000_000n).toString(),
    maximumShannons: (BigInt(MAX_BET_CKB) * 100_000_000n).toString(),
    protocolFeeBps: market.feeBps.protocol,
    creatorFeeBps: market.feeBps.creator,
    kickoff: match.kickoff,
    closesAt: market.closesAt,
  };
  const accepting =
    market.status === 'open' &&
    match.status === 'scheduled' &&
    now < Date.parse(match.kickoff) &&
    now < Date.parse(market.closesAt) &&
    identity(match) !== null;
  const termsId = createHash('sha256')
    .update(
      JSON.stringify([market.id, match.id, identity(match), market.status, match.status, terms]),
    )
    .digest('hex');
  // Explicit public projection. Never return a MarketDetail or ledger record.
  return {
    market: {
      ...toMarketSummary(market, match),
      status: market.status === 'open' && !accepting ? ('closed' as const) : market.status,
    },
    terms,
    termsId,
    accepting,
    evaluatedAt: new Date(now).toISOString(),
    paymentAvailable: false as const,
  };
}
export function findPublicPredictionMarket(
  db: StreakDB,
  id: string,
  active: (match: Match) => boolean,
  now: number,
) {
  const market = db.markets.find((row) => row.id === id);
  const match = market && db.matches.find((row) => row.id === market.matchId);
  return market && match && active(match) ? publicPredictionMarket(market, match, now) : null;
}
export function reviewPredictions(
  db: StreakDB,
  input: SlipInput,
  active: (match: Match) => boolean,
  now: number,
) {
  const markets = new Map(db.markets.map((row) => [row.id, row]));
  const matches = new Map(db.matches.map((row) => [row.id, row]));
  const contexts = input.picks.map((pick) => {
    const market = markets.get(pick.marketId);
    const match = market && matches.get(market.matchId);
    return market && match && active(match) ? { market, match, key: identity(match) } : null;
  });
  const counts = new Map<string, number>();
  for (const context of contexts)
    if (context?.key) counts.set(context.key, (counts.get(context.key) ?? 0) + 1);
  let total = 0n;
  let exactTotal = true;
  let expires = now + 30_000;
  const lines = input.picks.map((pick, index) => {
    const context = contexts[index];
    const amount = parseAmount(pick.amountCkb);
    const errors: string[] = [];
    if (amount === null) {
      exactTotal = false;
      errors.push('Enter a decimal amount with at most eight decimal places.');
    } else total += amount;
    const detail = context ? publicPredictionMarket(context.market, context.match, now) : null;
    if (!context || !detail) errors.push('This market is no longer available.');
    else {
      if (context.match.id !== pick.matchId)
        errors.push('The fixture identity changed. Remove this pick and choose it again.');
      if (!context.key) errors.push('Verified fixture identity is unavailable.');
      if (context.key && (counts.get(context.key) ?? 0) > 1)
        errors.push('Choose only one prediction for this fixture.');
      if (!detail.accepting) errors.push('This market is not accepting predictions.');
      if (
        amount !== null &&
        (amount < BigInt(detail.terms.minimumShannons) ||
          amount > BigInt(detail.terms.maximumShannons))
      )
        errors.push(
          `Stake must be between ${MIN_BET_CKB} and ${MAX_BET_CKB} tCKB under current ledger rules.`,
        );
      for (const date of [context.match.kickoff, context.market.closesAt]) {
        const cutoff = Date.parse(date);
        expires = Math.min(expires, Number.isFinite(cutoff) ? Math.max(now, cutoff) : now);
      }
    }
    return { ...pick, amountShannons: amount?.toString() ?? null, detail, errors };
  });
  return {
    v: 1 as const,
    revision: input.revision,
    evaluatedAt: new Date(now).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    valid: lines.every((line) => line.errors.length === 0),
    paymentAvailable: false as const,
    totalPrincipalShannons: exactTotal ? total.toString() : null,
    lines,
  };
}

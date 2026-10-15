import { isRecord, request, text } from '../../lib/http';

export type MarketStatus = 'open' | 'closed' | 'resolved' | 'void';
export type MarketSort = 'featured' | 'kickoff';
export interface Market {
  id: string;
  status: MarketStatus;
  available: boolean;
  fixtureStatus: string;
  home: string;
  away: string;
  homeCode: string;
  awayCode: string;
  competition: string;
  homeLogo: string | null;
  awayLogo: string | null;
  competitionLogo: string | null;
  kickoff: string;
  totalPoolCkb: string;
  totalBets: number;
  prices: { home: number; draw: number; away: number };
}
export interface MarketPage {
  markets: Market[];
  total: number;
  nextOffset: number | null;
  covered: boolean;
}
export const outcomes = ['home', 'draw', 'away'] as const;
function price(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
    throw new Error('Invalid market percentages.');
  return value;
}
function logo(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value, location.origin);
    return url.protocol === 'https:' ||
      (url.origin === location.origin && value.startsWith('/') && !value.startsWith('//'))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
function market(value: unknown): Market {
  if (
    !isRecord(value) ||
    !isRecord(value.match) ||
    !isRecord(value.match.home) ||
    !isRecord(value.match.away) ||
    (value.available !== false && !isRecord(value.prices))
  )
    throw new Error('The market feed is incomplete. Please retry.');
  const status = value.status;
  if (status !== 'open' && status !== 'closed' && status !== 'resolved' && status !== 'void')
    throw new Error('Unknown market state.');
  const kickoff = text(value.match.kickoff);
  if (!Number.isFinite(Date.parse(kickoff))) throw new Error('Invalid fixture date.');
  const available = value.available !== false;
  const totalPoolCkb = available ? text(value.totalPoolCkb) : '0';
  const totalBets = available ? value.totalBets : 0;
  const prices = isRecord(value.prices) ? value.prices : { home: 0, draw: 0, away: 0 };
  if (
    !/^\d+(\.\d{1,8})?$/.test(totalPoolCkb) ||
    typeof totalBets !== 'number' ||
    !Number.isSafeInteger(totalBets) ||
    totalBets < 0
  )
    throw new Error('Invalid market totals.');
  return {
    id: text(value.id),
    status,
    available,
    fixtureStatus: text(value.match.status),
    kickoff,
    totalPoolCkb,
    totalBets,
    homeLogo: logo(value.match.home.logo),
    awayLogo: logo(value.match.away.logo),
    competitionLogo: isRecord(value.match.competition) ? logo(value.match.competition.logo) : null,
    home: text(value.match.home.name),
    away: text(value.match.away.name),
    homeCode: text(value.match.home.code),
    awayCode: text(value.match.away.code),
    competition: isRecord(value.match.competition)
      ? text(value.match.competition.name)
      : text(value.match.stage),
    prices: { home: price(prices.home), draw: price(prices.draw), away: price(prices.away) },
  };
}
export async function getMarkets(
  status: string,
  search: string,
  offset: number,
  from: string,
  to: string,
  signal: AbortSignal,
  sort: MarketSort = 'featured',
): Promise<MarketPage> {
  const query = new URLSearchParams({
    limit: '24',
    offset: String(offset),
    q: search,
    from,
    to,
    catalogue: '1',
    sort,
  });
  if (status !== 'all') query.set('status', status);
  const data = await request(`/markets?${query}`, signal);
  if (
    !isRecord(data) ||
    !Array.isArray(data.markets) ||
    data.markets.length > 24 ||
    typeof data.total !== 'number' ||
    !(
      data.nextOffset === null ||
      (typeof data.nextOffset === 'number' &&
        Number.isSafeInteger(data.nextOffset) &&
        data.nextOffset > offset)
    )
  )
    throw new Error('The market feed is incomplete. Please retry.');
  const covered =
    isRecord(data.coverage) &&
    data.coverage.complete === true &&
    typeof data.coverage.from === 'string' &&
    typeof data.coverage.to === 'string' &&
    Date.parse(data.coverage.from) <= Date.parse(from) &&
    Date.parse(data.coverage.to) >= Date.parse(to);
  return {
    markets: data.markets.map(market),
    total: data.total,
    nextOffset: data.nextOffset,
    covered,
  };
}
export function formatCkb(value: string): string {
  const [whole, fraction] = value.split('.');
  return (
    BigInt(whole).toLocaleString('en-GB') +
    (fraction && /[1-9]/.test(fraction) ? `.${fraction.replace(/0+$/, '')}` : '')
  );
}

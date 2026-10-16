import { isRecord, request } from '../../lib/http';
import { parseDescriptor, parseManifest } from './protocol';
import type { Descriptor, Manifest } from './protocol';

export async function getDirectConfig(signal?: AbortSignal): Promise<Manifest> {
  return parseManifest(await request('/direct/config', signal));
}

export async function getDirectMarkets(
  signal?: AbortSignal,
  fixtureId?: string,
): Promise<Descriptor[]> {
  const query = fixtureId ? `?matchId=${encodeURIComponent(fixtureId)}` : '';
  const data = await request(`/direct/markets${query}`, signal);
  if (!isRecord(data) || !Array.isArray(data.markets) || data.markets.length > 256)
    throw Error('The testnet market catalogue could not be verified.');
  const markets = await Promise.all(data.markets.map(parseDescriptor));
  if (
    new Set(markets.map((market) => market.id)).size !== markets.length ||
    markets.some((market) => fixtureId && market.fixtureId !== fixtureId)
  )
    throw Error('The testnet catalogue returned conflicting fixtures.');
  return markets;
}

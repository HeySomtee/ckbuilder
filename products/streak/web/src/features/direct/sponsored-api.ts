import { isRecord, request } from '../../lib/http';
import { parseDemandFixture, parseSponsorOffer, parseSponsorStatus } from './sponsored-protocol';
import type { DemandFixture, SponsorTransport } from './sponsored-protocol';

export async function getDemandFixtures(
  signal?: AbortSignal,
  fixtureId?: string,
): Promise<DemandFixture[]> {
  const value = await request(
    `/direct/demand${fixtureId ? `?matchId=${encodeURIComponent(fixtureId)}` : ''}`,
    signal,
  );
  if (!isRecord(value) || !Array.isArray(value.fixtures) || value.fixtures.length > 512)
    throw Error('Fixture payment availability could not be verified.');
  const fixtures = await Promise.all(value.fixtures.map(parseDemandFixture));
  if (
    new Set(fixtures.map((fixture) => fixture.fixtureId)).size !== fixtures.length ||
    fixtures.some((fixture) => fixtureId && fixture.fixtureId !== fixtureId)
  )
    throw Error('The fixture catalogue contains conflicting identities.');
  return fixtures;
}
export const sponsorTransport: SponsorTransport = {
  offer: async (body) => parseSponsorOffer(await request('/direct/sponsor/offer', undefined, body)),
  submit: async (body) =>
    parseSponsorStatus(await request('/direct/sponsor/submit', undefined, body)),
  status: async (offerId, rawHash) =>
    parseSponsorStatus(
      await request(
        `/direct/sponsor/status?offerId=${encodeURIComponent(offerId)}&rawHash=${encodeURIComponent(rawHash)}`,
      ),
    ),
  resolve: async (body) => {
    await request('/direct/sponsor/resolve', undefined, body);
  },
};

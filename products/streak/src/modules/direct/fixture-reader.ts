import type { Match } from '../../types';
import { validateScheduledFixture } from './oracle';
import { parseProvisionCatalogue } from './provision';

/** A fresh catalogue per operation, shared only by its selected fixtures. */
export function createFixtureReader(options: {
  catalogue: () => Promise<unknown>;
  fixture: (providerId: string) => Promise<unknown>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  return async (ids: string[]): Promise<Match[]> => {
    if (
      ids.length < 1 ||
      ids.length > 8 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !/^api-football-[1-9][0-9]{0,14}$/.test(id))
    )
      throw Error('Invalid football fixture batch');
    const catalogue = parseProvisionCatalogue(await options.catalogue(), now());
    const owned = ids.map((id) => {
      const fixture = catalogue.fixtures.find((row) => row.fixtureId === id);
      if (!fixture) throw Error('Fixture is outside the active real API catalogue');
      return fixture;
    });
    const matches: Match[] = [];
    for (let offset = 0; offset < ids.length; offset += 4) {
      const results = await Promise.allSettled(
        ids.slice(offset, offset + 4).map(async (id, index) => {
          const match = validateScheduledFixture(
            await options.fixture(id.slice(13)),
            id.slice(13),
            now(),
          );
          const expected = owned[offset + index];
          if (
            Date.parse(match.kickoff) !== expected.kickoffMs ||
            match.home.id !== expected.homeId ||
            match.away.id !== expected.awayId
          )
            throw Error('Football catalogue changed');
          return match;
        }),
      );
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') throw failed.reason;
      for (const result of results) if (result.status === 'fulfilled') matches.push(result.value);
    }
    return matches;
  };
}

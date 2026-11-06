import assert from 'node:assert/strict';
import { ApiFootballProvider, FOOTBALL_RESOURCE_LIMITS } from './football';

async function main() {
  const oldFetch = globalThis.fetch;
  const saved = { key: process.env.API_SPORTS_KEY, leagues: process.env.FOOTBALL_LEAGUE_IDS };
  process.env.API_SPORTS_KEY = 'synthetic-provider-key';
  process.env.FOOTBALL_LEAGUE_IDS = '39';
  const fixture = (id: number, extra = '') => ({
    fixture: { id, date: new Date(Date.now() + 3_600_000).toISOString(), status: { short: 'NS' } },
    league: { id: 39, name: 'Synthetic league' },
    teams: { home: { id: 1, name: 'Home' }, away: { id: 2, name: 'Away' } },
    goals: { home: null, away: null },
    extra,
  });
  let response = [fixture(1)];
  let declaredOversize = false;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ response, errors: [] }), {
      headers: declaredOversize
        ? { 'content-length': String(FOOTBALL_RESOURCE_LIMITS.responseBytes + 1) }
        : {},
    });
  try {
    const provider = new ApiFootballProvider();
    await provider.init();
    const initial = provider.scheduleFixtures();
    const history = provider.fixtureObservationHistory();
    response = [fixture(1, 'x'.repeat(FOOTBALL_RESOURCE_LIMITS.fixtureBytes))];
    await provider.init();
    assert.deepEqual(
      provider.scheduleFixtures(),
      initial,
      'oversized replacement cannot overwrite a previously accepted fixture',
    );
    assert.deepEqual(
      provider.fixtureObservationHistory(),
      history,
      'rejected payload cannot partially mutate correction history',
    );
    assert.match((await provider.status()).lastError!, /capacity reached/);
    declaredOversize = true;
    await provider.init();
    assert.match((await provider.status()).lastError!, /byte limit/);
    assert.deepEqual(provider.scheduleFixtures(), initial);
    declaredOversize = false;
    response = Array.from({ length: FOOTBALL_RESOURCE_LIMITS.fixtureCount }, (_, id) =>
      fixture(id + 1),
    );
    await provider.init();
    assert.equal(provider.scheduleFixtures().length, FOOTBALL_RESOURCE_LIMITS.fixtureCount);
    response = [fixture(FOOTBALL_RESOURCE_LIMITS.fixtureCount + 1)];
    await provider.init();
    assert.equal(
      provider.scheduleFixtures().length,
      FOOTBALL_RESOURCE_LIMITS.fixtureCount,
      'fixture count is bounded without dropping already observed fixtures',
    );
    assert.equal(
      Object.keys(provider.fixtureObservationHistory()).length,
      FOOTBALL_RESOURCE_LIMITS.fixtureCount,
    );

    const bytes = new ApiFootballProvider();
    for (let batch = 0; batch < 5; batch++) {
      response = Array.from({ length: 60 }, (_, id) =>
        fixture(batch * 60 + id + 1, 'x'.repeat(60 * 1024)),
      );
      await bytes.init();
    }
    const retained = bytes.scheduleFixtures();
    assert.ok(
      retained.length > 240 && retained.length < 300,
      'serialized evidence budget bounds retained fixture payloads before the record count limit',
    );
    assert.equal(
      retained[0].id,
      'api-football-1',
      'capacity failure retains the earliest unresolved fixture',
    );
    assert.equal(
      Object.keys(bytes.fixtureObservationHistory()).length,
      retained.length,
      'fixture and observation admission remain atomic',
    );
    assert.match((await bytes.status()).lastError!, /evidence cache capacity reached/);
    console.log(
      'Football resource limits passed: body, fixture bytes/count, retained evidence budget, rollback and preserved unresolved history.',
    );
  } finally {
    globalThis.fetch = oldFetch;
    if (saved.key === undefined) delete process.env.API_SPORTS_KEY;
    else process.env.API_SPORTS_KEY = saved.key;
    if (saved.leagues === undefined) delete process.env.FOOTBALL_LEAGUE_IDS;
    else process.env.FOOTBALL_LEAGUE_IDS = saved.leagues;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

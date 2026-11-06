import assert from 'node:assert/strict';

async function main(): Promise<void> {
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.DATABASE_URL = '';
  process.env.SUPABASE_URL = '';
  process.env.SUPABASE_KEY = '';
  process.env.MATCH_PROVIDER = 'worldcup';
  const originalNow = Date.now;
  const now = Date.parse('2030-08-01T12:00:00Z');
  Date.now = () => now;
  const { FplFiveFeed } = await import('./modules/five/feed');
  const { provider } = await import('./providers');
  const game = await import('./game');
  const survivor = await import('./modules/survivor/runtime');
  const { tickFixtureProgression } = await import('./server');
  const original = {
    init: provider.init,
    nextSyncAt: provider.nextSyncAt,
    status: provider.status,
    syncMatches: game.syncMatches,
    tickSurvivor: survivor.tickSurvivor,
  };
  try {
    const feed = (fixtures: unknown[]) =>
      new FplFiveFeed(true, async () => Response.json(fixtures));
    assert.equal(
      await feed([
        { kickoff_time: new Date(now - 1000).toISOString(), started: false, finished: false },
      ]).nextUpdateAt(),
      now + 60_000,
      'An upstream/cached started flag cannot delay points for fifteen minutes after kickoff.',
    );
    assert.equal(
      await feed([
        { kickoff_time: new Date(now + 5000).toISOString(), started: false, finished: false },
      ]).nextUpdateAt(),
      now + 5000,
      'Upcoming kickoff becomes the next wake time.',
    );
    assert.equal(
      await feed([
        { kickoff_time: new Date(now - 3_600_000).toISOString(), started: true, finished: true },
      ]).nextUpdateAt(),
      now + 15 * 60_000,
      'Finished fixtures do not keep idle minute polling alive.',
    );

    let syncs = 0,
      survivors = 0,
      inits = 0;
    const state = { initialized: false };
    provider.init = async () => {
      inits++;
      throw Error('Synthetic provider initialization outage');
    };
    game.syncMatches = async () => {
      syncs++;
      return [];
    };
    survivor.tickSurvivor = async () => {
      survivors++;
      return 2000;
    };
    assert.equal(await tickFixtureProgression(state), 2000);
    assert.equal(
      survivors,
      1,
      'Survivor deadline checks survive a provider initialization outage.',
    );
    assert.equal(state.initialized, false);
    assert.equal(syncs, 0);

    provider.init = async () => {
      inits++;
    };
    game.syncMatches = async () => {
      syncs++;
      throw Error('Synthetic fixture persistence outage');
    };
    survivor.tickSurvivor = async () => {
      survivors++;
      return 15 * 60_000;
    };
    assert.equal(await tickFixtureProgression(state), 30_000);
    assert.equal(state.initialized, true);
    assert.equal(
      survivors,
      2,
      'Survivor still advances using saved observations when fixture sync fails.',
    );
    game.syncMatches = async () => {
      syncs++;
      return [];
    };
    provider.nextSyncAt = () => now + 5000;
    provider.status = async () => {
      throw Error('Synthetic optional provider status outage');
    };
    survivor.tickSurvivor = async () => {
      survivors++;
      throw Error('Synthetic Survivor database outage');
    };
    assert.equal(
      await tickFixtureProgression(state),
      5000,
      'Failed Survivor work cannot delay a due fixture refresh.',
    );
    assert.equal(syncs, 2);
    assert.equal(inits, 2, 'Successful initialization is not repeated on every retry.');
    survivor.tickSurvivor = async () => 15 * 60_000;
    provider.nextSyncAt = () => now + 15 * 60_000;
    assert.equal(await tickFixtureProgression(state), 15 * 60_000);
    console.log(
      'Fixture/Five scheduler regressions passed: independent failure retries, deadlines, kickoff lag and idle sleep.',
    );
  } finally {
    Object.assign(provider, {
      init: original.init,
      nextSyncAt: original.nextSyncAt,
      status: original.status,
    });
    game.syncMatches = original.syncMatches;
    survivor.tickSurvivor = original.tickSurvivor;
    Date.now = originalNow;
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

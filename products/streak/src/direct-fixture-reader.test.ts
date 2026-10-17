import assert from 'node:assert/strict';
import { createFixtureReader } from './modules/direct/fixture-reader';
import { validateScheduledFixture } from './modules/direct/oracle';
import { PROVIDER_ORIGIN } from './modules/direct/registry';

const NOW = 1_800_000_000_000;
const kickoff = NOW + 3_600_000;
const ids = Array.from({ length: 8 }, (_, i) => `api-football-${i + 1}`);
const payload = (id: string) => ({
  errors: [],
  response: [
    {
      fixture: {
        id: Number(id),
        date: new Date(kickoff).toISOString(),
        timestamp: kickoff / 1000,
        status: { short: 'NS' },
      },
      teams: { home: { id: 1, name: 'Synthetic Home' }, away: { id: 2, name: 'Synthetic Away' } },
    },
  ],
});
async function main() {
  let reads = 0,
    current = 0,
    peak = 0,
    completed = 0,
    mode = '',
    now = NOW;
  const reader = createFixtureReader({
    now: () => now,
    catalogue: async () => {
      reads++;
      return {
        format: 'streak-direct-fixtures-v1',
        provider: 'football',
        source: PROVIDER_ORIGIN,
        enabled: true,
        simulated: false,
        observedAtMs: mode === 'stale' ? NOW - 86_400_000 : now,
        coverage: { from: '2027-01-01', to: '2027-01-31', complete: true },
        fixtures: ids
          .slice(mode === 'missing' ? 1 : 0)
          .map((id) => validateScheduledFixture(payload(id.slice(13)), id.slice(13), NOW)),
      };
    },
    fixture: async (id) => {
      current++;
      peak = Math.max(peak, current);
      try {
        await new Promise((done) => setTimeout(done, 5 - (Number(id) % 4)));
        if (mode === 'failure' && id === '1') throw Error('Synthetic provider failure');
        const value = payload(id);
        if (mode === 'mismatch') value.response[0].teams.home.id = 3;
        return value;
      } finally {
        current--;
        completed++;
      }
    },
  });
  assert.deepEqual(
    (await reader(ids)).map((row) => row.id),
    ids,
  );
  assert.equal(reads, 1, 'Eight picks share one fresh catalogue request');
  assert.equal(peak, 4);
  assert.equal(completed, 8);
  assert.deepEqual(
    (await reader([...ids].reverse())).map((row) => row.id),
    [...ids].reverse(),
  );
  assert.equal(reads, 2, 'The next operation reads a fresh catalogue');
  mode = 'missing';
  await assert.rejects(() => reader(ids), /outside/);
  mode = 'mismatch';
  await assert.rejects(() => reader(ids), /catalogue changed/);
  mode = 'stale';
  await assert.rejects(() => reader(ids), /fresh|stale|expired/i);
  mode = 'failure';
  completed = 0;
  await assert.rejects(() => reader(ids), /Synthetic provider failure/);
  assert.equal(current, 0);
  assert.equal(completed, 4, 'Started reads drain before the caller releases its lease');
  mode = '';
  now = kickoff - 120_000;
  await assert.rejects(() => reader(ids), /future kickoff|eligible|scheduled|empty/i);
  await assert.rejects(() => reader([ids[0], ids[0]]), /Invalid/);
  console.log(
    'PASS fresh batched fixture reads: 8 catalogue requests become 1; order, bounded concurrency, stale data, mismatch, cutoff and failure checks preserved',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

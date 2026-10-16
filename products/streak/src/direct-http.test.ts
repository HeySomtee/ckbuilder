import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import {
  DirectRegistry,
  PUBLIC_DIRECT_CONFIG,
  LEGACY_DIRECT_CONFIG,
  PROVIDER_ORIGIN,
  createRecord,
} from './modules/direct/registry';
import { ProvisionQueue } from './modules/direct/provision';
import type { Match } from './types';

async function main(): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'streak-direct-http-'));
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.STREAK_DB_FILE = join(directory, 'db.json');
  process.env.STREAK_DIRECT_REGISTRY_DIR = join(directory, 'registry');
  process.env.STREAK_DIRECT_LEGACY_REGISTRY_DIR = join(directory, 'legacy');
  process.env.STREAK_DIRECT_PROGRESS_DIR = join(directory, 'progress');
  process.env.MATCH_PROVIDER = 'worldcup';
  for (const name of [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'SUPABASE_DB_URL',
    'API_SPORTS_KEY',
    'TELEGRAM_BOT_TOKEN',
  ])
    delete process.env[name];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    if (url.hostname !== '127.0.0.1') throw Error('HTTP direct tests only use local fixtures');
    return originalFetch(input, init);
  };
  try {
    const { server } = await import('./server');
    const { read } = await import('./store');
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const before = await read((db) => JSON.stringify(db));
      const config = await fetch(`${base}/api/direct/config`);
      assert.equal(config.status, 200);
      assert.equal(config.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await config.json(), PUBLIC_DIRECT_CONFIG);
      const unreadyFixtures = await fetch(`${base}/api/direct/fixtures`);
      assert.equal(
        unreadyFixtures.status,
        503,
        'a synthetic or unready provider cannot fund markets',
      );
      assert.deepEqual(await (await fetch(`${base}/api/direct/provisioning`)).json(), {
        progress: null,
      });
      const queue = new ProvisionQueue(join(directory, 'queue'));
      const progress = queue.publish(
        process.env.STREAK_DIRECT_PROGRESS_DIR!,
        3050n * 100000000n,
        Date.now(),
      );
      assert.deepEqual(await (await fetch(`${base}/api/direct/provisioning`)).json(), { progress });
      for (const query of ['', '?matchId=api-football-12345', '?matchId=worldcup-1']) {
        const response = await fetch(`${base}/api/direct/markets${query}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await response.json(), { markets: [] });
      }
      assert.equal((await fetch(`${base}/api/direct/markets?matchId=..%2Fprivate`)).status, 400);
      assert.equal(
        (await fetch(`${base}/api/direct/markets`, { method: 'POST' })).status,
        403,
        'direct reads do not bypass the shared mutation origin guard',
      );
      const cutoff = Date.now() + 3_600_000;
      const args = Buffer.alloc(172);
      args.writeBigUInt64LE(BigInt(cutoff), 68);
      Buffer.from(PUBLIC_DIRECT_CONFIG.guardHash.slice(2), 'hex').copy(args, 76);
      const fixture: Match = {
        id: 'api-football-12345',
        sport: 'football',
        kickoff: new Date(cutoff).toISOString(),
        date: new Date(cutoff).toISOString().slice(0, 10),
        status: 'scheduled',
        stage: 'Synthetic HTTP test',
        home: { name: 'Test Home', code: 'H', flag: '' },
        away: { name: 'Test Away', code: 'A', flag: '' },
        oracle: { provider: 'api-football', source: PROVIDER_ORIGIN, fixtureId: '12345' },
      };
      const record = createRecord(
        fixture,
        {
          codeHash: PUBLIC_DIRECT_CONFIG.protocolHash,
          hashType: 'data2',
          args: `0x${args.toString('hex')}`,
        },
        `0x${'11'.repeat(32)}`,
      );
      new DirectRegistry(process.env.STREAK_DIRECT_REGISTRY_DIR).add(record);
      const described = await fetch(`${base}/api/direct/markets?matchId=${fixture.id}`);
      const body = (await described.json()) as {
        markets: { entryEnabled: boolean; entryUnavailableReason: string }[];
      };
      assert.equal(body.markets.length, 1);
      assert.equal(
        body.markets[0].entryEnabled,
        false,
        'inactive catalogue never enables real contract entry',
      );
      assert.match(body.markets[0].entryUnavailableReason, /source is unavailable/);
      const publicText = JSON.stringify(body);
      for (const secret of [
        'privateKey',
        'escrowShannons',
        'signedTransaction',
        'userId',
        'treasury',
      ])
        assert.equal(publicText.includes(secret), false);
      const legacy = createRecord(
        fixture,
        { ...record.type, codeHash: LEGACY_DIRECT_CONFIG.protocolHash },
        `0x${'22'.repeat(32)}`,
        LEGACY_DIRECT_CONFIG,
      );
      new DirectRegistry(process.env.STREAK_DIRECT_LEGACY_REGISTRY_DIR).add(legacy);
      const generations = (await (
        await fetch(`${base}/api/direct/markets?matchId=${fixture.id}`)
      ).json()) as { markets: { id: string; entryEnabled: boolean }[] };
      assert.deepEqual(
        generations.markets.map((row) => row.id),
        [record.id, legacy.id],
      );
      assert.equal(
        generations.markets[1].entryEnabled,
        false,
        'archived positions stay discoverable without accepting new entries',
      );
      writeFileSync(join(directory, 'registry', `${fixture.id}.json`), '{invalid');
      const invalid = await fetch(`${base}/api/direct/markets?matchId=${fixture.id}`);
      assert.equal(invalid.status, 500);
      assert.deepEqual(await invalid.json(), { error: 'Internal server error.' });
      assert.equal(
        await read((db) => JSON.stringify(db)),
        before,
        'direct catalogue requests never mutate the legacy ledger',
      );
      console.log(
        'PASS direct HTTP pinned config, public-only catalogue, no-store, query validation and malformed-registry fail closed',
      );
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  } finally {
    globalThis.fetch = originalFetch;
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert(basename(target).startsWith('streak-direct-http-'));
    rmSync(target, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

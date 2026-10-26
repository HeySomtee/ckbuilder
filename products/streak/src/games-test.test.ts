import assert from 'node:assert/strict';
import { DummyFiveFeed } from './modules/games-test/data';
import { testConfig } from './modules/games-test/runtime';
import { newRound, parseTerms, saveEntry } from './modules/five/domain';
import { lockTime, finalizationTime, TEST_TIMING_POLICY } from './modules/five/timing';
import { auctionCutoff, closeAuction, AUCTION_GRACE_MS } from './modules/five/auction';
import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { configuredGameMode, localGameMode, requestGameMode } from './modules/games-test/mode';

async function main() {
  const env = {
    STREAK_GAMES_TEST_ENABLED: '1',
    STREAK_FIVE_NETWORK: 'testnet',
    STREAK_GAMES_TEST_DATABASE_URL: 'postgresql://dummy:dummy@127.0.0.1:5432/games_test',
    DATABASE_URL: 'postgresql://dummy:dummy@127.0.0.1:5432/ordinary_test',
    STREAK_GAMES_TEST_REWARDS_ADDRESS: 'ckt1' + 'a'.repeat(40),
    STREAK_FIVE_REWARDS_ADDRESS: 'ckt1' + 'b'.repeat(40),
  };
  const localEnv = { ...env, NODE_ENV: 'development', STREAK_GAMES_DATA_MODE: 'test' };
  const request = (peer = '127.0.0.1', host = 'localhost:4100', method = 'GET') => {
    const socket = new Socket();
    Object.defineProperty(socket, 'remoteAddress', { value: peer });
    const req = new IncomingMessage(socket);
    req.headers.host = host;
    req.method = method;
    return req;
  };
  const url = (data = '') => new URL(`http://localhost/api/five${data}`);
  assert.equal(configuredGameMode({}), 'api');
  assert.equal(localGameMode(request(), localEnv), 'test');
  for (const unsafe of [
    { NODE_ENV: 'production' },
    { RENDER: 'true' },
    { STREAK_PUBLIC_ORIGIN: 'https://example.test' },
    { STREAK_FIVE_NETWORK: 'mainnet' },
  ])
    assert.throws(() => configuredGameMode({ ...localEnv, ...unsafe }), /local testnet/);
  assert.throws(() => configuredGameMode({ STREAK_GAMES_DATA_MODE: 'other' }), /api or test/);
  assert.throws(() => localGameMode(request('192.168.1.2'), localEnv), /localhost/);
  assert.throws(() => localGameMode(request('127.0.0.1', 'example.test'), localEnv), /localhost/);
  for (const header of ['forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto']) {
    const req = request();
    req.headers[header] = 'proxy';
    assert.throws(() => localGameMode(req, localEnv), /localhost/);
  }
  assert.equal(
    requestGameMode(request(), url('?games=test'), {}),
    'api',
    'Old page query cannot select dummy data',
  );
  assert.throws(() => requestGameMode(request(), url('?data=test'), {}), /Reload/);
  assert.equal(requestGameMode(request(), url('?data=test'), localEnv), 'test');
  assert.throws(
    () => requestGameMode(request('127.0.0.1', 'localhost', 'POST'), url(), localEnv),
    /Reload/,
  );
  assert.throws(
    () => requestGameMode(request(), url('?data=api'), localEnv),
    /Reload/,
    'Stale normal tab cannot switch stores',
  );
  assert.throws(() => requestGameMode(request(), url('?data=test&data=api'), localEnv), /Reload/);
  assert.equal(testConfig(env).address, env.STREAK_GAMES_TEST_REWARDS_ADDRESS);
  assert.throws(() => testConfig({ ...env, STREAK_GAMES_TEST_ENABLED: '0' }), /not configured/);
  assert.throws(() => testConfig({ ...env, STREAK_FIVE_NETWORK: 'mainnet' }), /not configured/);
  assert.throws(
    () =>
      testConfig({ ...env, STREAK_GAMES_TEST_REWARDS_ADDRESS: env.STREAK_FIVE_REWARDS_ADDRESS }),
    /separate/,
  );
  assert.throws(
    () =>
      testConfig({
        ...env,
        STREAK_GAMES_TEST_DATABASE_URL: env.DATABASE_URL.replace('dummy:dummy', 'other:other'),
      }),
    /separate database/,
  );
  const feed = new DummyFiveFeed(),
    now = Date.now();
  const terms = parseTerms({ ...(await feed.catalogue(1)), testingPolicy: TEST_TIMING_POLICY });
  assert.equal(terms.testingPolicy, undefined, 'Untrusted terms cannot turn on test timing');
  const ordinary = newRound('ordinary', 'admin', terms, now);
  ordinary.testClosedAt = new Date(now).toISOString();
  ordinary.testResultsAt = new Date(now).toISOString();
  assert.equal(lockTime(ordinary), Date.parse(terms.lockAt));
  assert.equal(finalizationTime(ordinary), Date.parse(terms.finalizeAfter));
  const r = newRound('test', 'admin', { ...terms, testingPolicy: TEST_TIMING_POLICY }, now);
  r.state = 'open';
  const originalHash = r.termsHash;
  const actor = { id: 'one', name: 'One', wallet: 'dummy' };
  saveEntry(r, actor, ['1', '7', '13', '19', '25'], '13', originalHash, now);
  r.testClosedAt = new Date(now + 1).toISOString();
  assert.equal(lockTime(r), now + 1);
  assert.equal(auctionCutoff(r), now + 1 + AUCTION_GRACE_MS);
  assert.throws(
    () => saveEntry(r, actor, ['1', '7', '13', '19', '25'], '13', originalHash, now + 1),
    /closed/,
  );
  r.sponsors.push({
    id: 'pending',
    accountId: 'one',
    wallet: 'dummy',
    amountShannons: '10000000000',
    display: 'anonymous',
    name: '',
    logo: '',
    link: '',
    moderation: 'pending',
    createdAt: new Date(now).toISOString(),
    funding: 'submitted',
    submittedSequence: 1,
  });
  assert.equal(
    closeAuction(r, now + 2),
    false,
    'Closing the deadline does not manufacture chain confirmation',
  );
  assert.equal(r.termsHash, originalHash, 'Controlled timing does not rewrite published terms');
  assert.equal((await feed.profile(13)).history.length, 5);
  const { server } = await import('./server');
  const original = {
    mode: process.env.STREAK_GAMES_DATA_MODE,
    enabled: process.env.STREAK_GAMES_TEST_ENABLED,
    network: process.env.STREAK_FIVE_NETWORK,
  };
  process.env.STREAK_GAMES_TEST_ENABLED = '1';
  process.env.STREAK_FIVE_NETWORK = 'testnet';
  process.env.STREAK_GAMES_DATA_MODE = 'test';
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    for (const path of ['/season/?view=five', '/season/index.html']) {
      const res = await fetch(base + path);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.match(await res.text(), /name="streak-games-data" content="test"/);
    }
    const post = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' };
    for (const game of ['five', 'survivor']) {
      assert.equal((await fetch(`${base}/api/${game}?data=api`, post)).status, 409);
      assert.equal((await fetch(`${base}/api/${game}`, post)).status, 409);
    }
    process.env.STREAK_GAMES_DATA_MODE = 'api';
    const page = await fetch(base + '/season/?view=five&games=test');
    assert.match(await page.text(), /name="streak-games-data" content="api"/);
    for (const game of ['five', 'survivor'])
      assert.equal((await fetch(`${base}/api/${game}?data=test`, post)).status, 409);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries({
      STREAK_GAMES_DATA_MODE: original.mode,
      STREAK_GAMES_TEST_ENABLED: original.enabled,
      STREAK_FIVE_NETWORK: original.network,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
  console.log(
    'Game test configuration, unchanged normal deadlines and real confirmation timing passed',
  );
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

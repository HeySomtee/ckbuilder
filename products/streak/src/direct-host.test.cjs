'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { setTimeout: delay } = require('node:timers/promises');
const { buildConfig, prepareState, runHost } = require('../scripts/direct-host.cjs');

function sample(root) {
  return {
    NODE_ENV: 'production',
    MATCH_PROVIDER: 'football',
    PORT: '10000',
    STREAK_HOST_STATE_DIR: root,
    STREAK_DIRECT_DURABLE_STATE_ACK: '1',
    STREAK_DIRECT_OPERATOR_DIR: path.join(root, 'operator'),
    STREAK_DIRECT_REGISTRY_DIR: path.join(root, 'current'),
    STREAK_DIRECT_BATCH_REGISTRY_DIR: path.join(root, 'v4'),
    DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1/streak_test',
    TREASURY_PRIVATE_KEY: '0x' + '11'.repeat(32),
    STREAK_DIRECT_PRIVATE_KEY: '0x' + '22'.repeat(32),
    API_SPORTS_KEY: 'synthetic-provider',
    STREAK_SPONSOR_IPC_SECRET: '33'.repeat(32),
    STREAK_SPONSOR_URL: 'http://127.0.0.1:4101',
    STREAK_PUBLIC_ORIGIN: 'https://streak.example',
    TELEGRAM_BOT_TOKEN: 'synthetic-telegram',
    NODE_OPTIONS: '--inspect',
    AWS_SECRET_ACCESS_KEY: 'synthetic-should-not-leak',
    SECRET_FUTURE: 'synthetic-unknown',
    STREAK_DIRECT_CATALOGUE_URL: 'http://127.0.0.1:10000/api/direct/fixtures',
  };
}
test('hosted child environments isolate signer, database, Telegram and inherited injection', () => {
  const env = sample(path.resolve(os.tmpdir(), 'synthetic-streak-mount'));
  const {
    environments: { api, sponsor, worker },
  } = buildConfig(env);
  assert.equal(api.STREAK_DIRECT_PRIVATE_KEY, undefined);
  assert.equal(api.STREAK_DIRECT_OPERATOR_DIR, undefined);
  assert.equal(api.TREASURY_PRIVATE_KEY, env.TREASURY_PRIVATE_KEY);
  for (const child of [api, sponsor, worker]) {
    assert.equal(child.NODE_OPTIONS, undefined);
    assert.equal(child.AWS_SECRET_ACCESS_KEY, undefined);
    assert.equal(child.SECRET_FUTURE, undefined);
    assert.equal(child.STREAK_SKIP_ENV_FILE, '1');
  }
  for (const child of [sponsor, worker]) {
    assert.equal(child.DATABASE_URL, undefined);
    assert.equal(child.TREASURY_PRIVATE_KEY, undefined);
    assert.equal(child.TELEGRAM_BOT_TOKEN, undefined);
    assert.equal(child.STREAK_DIRECT_PRIVATE_KEY, env.STREAK_DIRECT_PRIVATE_KEY);
  }
  assert.equal(worker.STREAK_SPONSOR_IPC_SECRET, undefined);
  assert.equal(worker.STREAK_DIRECT_CATALOGUE_URL, undefined);
  assert.equal(worker.STREAK_DIRECT_PROGRESS_DIR, undefined);
  assert.equal(sponsor.STREAK_DIRECT_CATALOGUE_URL, env.STREAK_DIRECT_CATALOGUE_URL);
  const unprefixed = buildConfig({
    ...env,
    STREAK_DIRECT_PRIVATE_KEY: env.STREAK_DIRECT_PRIVATE_KEY.slice(2),
  });
  assert.equal(
    unprefixed.environments.worker.STREAK_DIRECT_PRIVATE_KEY,
    env.STREAK_DIRECT_PRIVATE_KEY,
  );
});
test('Five rewards has a separate opt-in signer and shares no keys with API or prediction workers', () => {
  const env = {
    ...sample(path.resolve(os.tmpdir(), 'synthetic-streak-mount')),
    STREAK_FIVE_REWARDS_ENABLED: '1',
    STREAK_FIVE_NETWORK: 'testnet',
    STREAK_FIVE_REWARDS_ADDRESS: 'ckt1' + 'a'.repeat(60),
    STREAK_FIVE_REWARDS_PRIVATE_KEY: '0x' + '44'.repeat(32),
  };
  const { environments } = buildConfig(env);
  assert.equal(
    environments.rewards.STREAK_FIVE_REWARDS_PRIVATE_KEY,
    env.STREAK_FIVE_REWARDS_PRIVATE_KEY,
  );
  assert.equal(environments.rewards.TREASURY_PRIVATE_KEY, undefined);
  assert.equal(environments.rewards.STREAK_DIRECT_PRIVATE_KEY, undefined);
  for (const key of ['api', 'sponsor', 'worker'])
    assert.equal(environments[key].STREAK_FIVE_REWARDS_PRIVATE_KEY, undefined);
  assert.throws(
    () => buildConfig({ ...env, STREAK_FIVE_REWARDS_PRIVATE_KEY: env.TREASURY_PRIVATE_KEY }),
    /dedicated/,
  );
  assert.throws(() => buildConfig({ ...env, STREAK_FIVE_NETWORK: 'mainnet' }), /testnet/);
  assert.equal(
    buildConfig({ ...env, STREAK_FIVE_REWARDS_ENABLED: '0' }).environments.rewards,
    undefined,
  );
});
test('invalid, overlapping, off-mount or bulk configuration fails before spawning', () => {
  const env = sample(path.resolve(os.tmpdir(), 'synthetic-streak-mount'));
  for (const change of [
    { NODE_ENV: 'test' },
    { STREAK_DIRECT_DURABLE_STATE_ACK: '0' },
    { STREAK_DIRECT_PRIVATE_KEY: 'invalid' },
    { STREAK_SPONSOR_IPC_SECRET: 'invalid' },
    { STREAK_DIRECT_BATCH_REGISTRY_DIR: env.STREAK_DIRECT_OPERATOR_DIR },
    { STREAK_DIRECT_REGISTRY_DIR: path.join(env.STREAK_DIRECT_OPERATOR_DIR, 'nested') },
    { STREAK_DIRECT_OPERATOR_DIR: path.resolve(os.tmpdir(), 'outside') },
    { STREAK_SPONSOR_URL: 'https://remote.example' },
    { STREAK_DIRECT_CATALOGUE_URL: 'http://127.0.0.1:4100/api/direct/fixtures' },
    { STREAK_DIRECT_PROVISION_MODE: 'bulk-v2' },
    { STREAK_DIRECT_PROGRESS_DIR: '/tmp/progress' },
    { PORT: '4101' },
    { STREAK_HOST_CONTROL_PORT: '10000' },
  ])
    assert.throws(() => buildConfig({ ...env, ...change }));
});
test('disk preflight verifies mount, preserves journal and refuses symlink escape', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-host-storage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = buildConfig(sample(root));
  const mount = `1 0 0:1 / ${root} rw - ext4 disk rw`;
  assert.throws(() => prepareState(config, ''), /not a mounted disk/);
  prepareState(config, mount);
  const journal = path.join(config.directories[0], 'pending.json');
  fs.writeFileSync(journal, 'synthetic-signed-bytes');
  prepareState(config, mount);
  assert.equal(fs.readFileSync(journal, 'utf8'), 'synthetic-signed-bytes');
  const link = path.join(root, 'link');
  fs.symlinkSync(config.directories[0], link, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(
    () => prepareState({ ...config, directories: [path.join(link, 'new')] }, mount),
    /symlink/,
  );
  assert.equal(fs.existsSync(path.join(config.directories[0], 'new')), false);
  const lease = path.join(config.directories[0], 'worker-lease');
  fs.mkdirSync(lease);
  fs.writeFileSync(path.join(lease, 'operator.lock'), 'synthetic-stale-lease');
  assert.throws(() => prepareState(config, mount), /lease remains/);
  assert.equal(fs.readFileSync(path.join(lease, 'operator.lock'), 'utf8'), 'synthetic-stale-lease');
});

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const result = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return result;
}
const fixture = `
const fs = require('node:fs'), http = require('node:http');
const [role, file, mode] = process.argv.slice(2);
const record = (event) => fs.appendFileSync(file, JSON.stringify({ role, event, time: Date.now(), pid: process.pid, operator: !!process.env.STREAK_DIRECT_PRIVATE_KEY, database: !!process.env.DATABASE_URL, telegram: !!process.env.TELEGRAM_BOT_TOKEN, injection: !!process.env.NODE_OPTIONS })+'\\n');
record('start');
if(role === 'worker') {
  process.on('SIGTERM',()=>record('drain'));
  if(mode === 'hang') setInterval(()=>{},1000);
  else setTimeout(()=>{record('end');process.exit(mode === 'fail' ? 1 : 0)}, 100);
} else {
  if(role === 'sponsor' && mode === 'lock') {
    fs.mkdirSync(process.env.STREAK_DIRECT_OPERATOR_DIR,{recursive:true});
    fs.writeFileSync(require('node:path').join(process.env.STREAK_DIRECT_OPERATOR_DIR,'operator.lock'),'synthetic-active-sponsor-lock');
  }
  const port = role === 'api' ? Number(process.env.PORT) : Number(new URL(process.env.STREAK_SPONSOR_URL).port);
  const server = http.createServer((req,res)=>{
    if (role === 'sponsor' && req.headers.authorization !== 'Bearer '+process.env.STREAK_SPONSOR_IPC_SECRET) return res.writeHead(401).end();
    res.setHeader('content-type','application/json');
    res.end(JSON.stringify(role === 'api' ? {network:'testnet',codeDeps:[{},{}]} : {sponsorLock:{codeHash:'synthetic'}}));
  }).listen(port,'127.0.0.1');
  process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
  if(mode === 'crash') setTimeout(()=>process.exit(2),350);
}
`;
for (const scenario of [
  'healthy',
  'sponsor-lock',
  'worker-drain',
  'api-crash',
  'worker-hang',
  'worker-fail',
  'readiness-fail',
]) {
  test(`real child processes: ${scenario}`, { timeout: 15000 }, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-host-child-'));
    const script = path.join(root, 'child.cjs'),
      events = path.join(root, 'events.jsonl');
    fs.writeFileSync(script, fixture);
    const env = sample(root);
    env.PORT = String(await freePort());
    env.STREAK_HOST_CONTROL_PORT = String(await freePort());
    env.STREAK_SPONSOR_URL = `http://127.0.0.1:${await freePort()}`;
    delete env.STREAK_DIRECT_CATALOGUE_URL;
    const config = buildConfig(env),
      controller = new AbortController(),
      logs = [];
    const running = runHost(config, {
      commands: {
        api: [script, 'api', events, scenario === 'api-crash' ? 'crash' : 'ok'],
        sponsor: [script, 'sponsor', events, scenario === 'sponsor-lock' ? 'lock' : 'ok'],
        worker: [
          script,
          'worker',
          events,
          scenario === 'worker-hang' ? 'hang' : scenario === 'worker-fail' ? 'fail' : 'ok',
        ],
      },
      signal: controller.signal,
      log: (message) => logs.push(message),
      stdio: 'ignore',
      intervalMs: 60,
      workerMs: 500,
      startupMs: 1000,
      shutdownMs: 300,
      pollMs: 20,
      ...(scenario === 'readiness-fail' ? { apiCheck: async () => false } : {}),
    });
    t.after(async () => {
      controller.abort();
      await running;
      fs.rmSync(root, { recursive: true, force: true });
    });
    if (['healthy', 'sponsor-lock', 'worker-drain', 'worker-fail'].includes(scenario)) {
      const deadline = Date.now() + 6000;
      while (
        Date.now() < deadline &&
        (!fs.existsSync(events) ||
          (scenario === 'worker-drain'
            ? !fs.readFileSync(events, 'utf8').includes('"role":"worker"')
            : fs.readFileSync(events, 'utf8').split('"event":"end"').length < 3))
      )
        await delay(25);
      controller.abort();
    }
    const code = await running;
    assert.equal(
      code,
      ['healthy', 'sponsor-lock', 'worker-drain', 'worker-fail'].includes(scenario) ? 0 : 1,
    );
    const rows = fs.readFileSync(events, 'utf8').trim().split('\n').map(JSON.parse);
    for (const row of rows) {
      assert.equal(row.operator, row.role !== 'api');
      assert.equal(row.database, row.role === 'api');
      assert.equal(row.telegram, row.role === 'api');
      assert.equal(row.injection, false);
      assert.throws(
        () => process.kill(row.pid, 0),
        (error) => error.code === 'ESRCH',
      );
    }
    let active = 0,
      starts = 0;
    for (const row of rows.filter((item) => item.role === 'worker' && item.event !== 'drain')) {
      if (row.event === 'start') {
        starts++;
        active++;
        assert.equal(active, 1);
      } else active--;
    }
    if (['healthy', 'sponsor-lock', 'worker-fail'].includes(scenario)) assert.ok(starts >= 2);
    if (scenario === 'worker-drain' && process.platform !== 'win32') {
      assert.ok(rows.some((row) => row.role === 'worker' && row.event === 'drain'));
      assert.ok(rows.some((row) => row.role === 'worker' && row.event === 'end'));
    }
    if (scenario === 'worker-hang' && process.platform !== 'win32') {
      assert.ok(logs.some((line) => line.includes('Forced shutdown')));
    }
    if (scenario === 'readiness-fail')
      assert.equal(
        rows.some((row) => row.role !== 'api'),
        false,
      );
    if (scenario === 'worker-fail')
      assert.ok(logs.some((line) => line.includes('Settlement pass failed')));
  });
}

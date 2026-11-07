'use strict';
// Single-instance Render supervisor. No .env loading, shell spawning or key-file access.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { randomUUID, randomBytes, timingSafeEqual } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '../../..');
const COMMON = ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL', 'TZ'];
const API = [
  'DATABASE_URL',
  'TREASURY_PRIVATE_KEY',
  'API_SPORTS_KEY',
  'STREAK_PUBLIC_ORIGIN',
  'STREAK_SURVIVOR_ADMIN_WALLETS',
  'STREAK_SURVIVOR_DATABASE_URL',
  'STREAK_FIVE_DATABASE_URL',
  'STREAK_FIVE_ADMIN_WALLETS',
  'STREAK_FIVE_FPL_ENABLED',
  'STREAK_FIVE_NETWORK',
  'STREAK_FIVE_REWARDS_ADDRESS',
  'STREAK_CAMPAIGNS_DATABASE_URL',
  'STREAK_CAMPAIGNS_ADMIN_WALLETS',
  'STREAK_CAMPAIGNS_REWARDS_ADDRESS',
  'STREAK_GAMES_TEST_ENABLED',
  'STREAK_GAMES_TEST_DATABASE_URL',
  'STREAK_GAMES_TEST_REWARDS_ADDRESS',
  'APP_PUBLIC_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_BOT_USERNAME',
  'TELEGRAM_WEBHOOK_SECRET',
  'NOTIFY_PROVIDER',
  'STORE_READ_TTL_MS',
  'PG_POOL_MAX',
  'PG_CONNECT_TIMEOUT_MS',
  'FOOTBALL_SEASON',
  'FOOTBALL_LEAGUE_IDS',
  'FOOTBALL_FIXTURE_PAST_DAYS',
  'FOOTBALL_FIXTURE_FUTURE_DAYS',
  'FOOTBALL_LIVE_POLL_SECONDS',
  'FOOTBALL_FINAL_CONFIRMATIONS',
  'FOOTBALL_SCHEDULE_REFRESH_MINUTES',
  'FOOTBALL_REQUEST_TIMEOUT_MS',
  'FOOTBALL_INSIGHT_PREFETCH_MINUTES',
  'FOOTBALL_INSIGHT_PREFETCH_BATCH',
  'BALANCE_CACHE_TTL_MS',
];
function pick(env, names) {
  return Object.fromEntries(
    names.filter((name) => typeof env[name] === 'string').map((name) => [name, env[name]]),
  );
}
function requireValue(env, name, pattern) {
  if (!env[name] || (pattern && !pattern.test(env[name]))) throw Error(`Configure ${name}.`);
  return env[name];
}
function port(value, name) {
  if (!/^[1-9][0-9]{0,4}$/.test(value ?? '') || Number(value) > 65535)
    throw Error(`Invalid ${name}.`);
  return Number(value);
}
function contained(root, target) {
  const relative = path.relative(root, target);
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}
function buildConfig(env) {
  if (env.STREAK_GAMES_DATA_MODE && env.STREAK_GAMES_DATA_MODE !== 'api')
    throw Error('Hosted games use regular API data. STREAK_GAMES_DATA_MODE=test is local only.');
  if (env.NODE_ENV !== 'production') throw Error('Hosted launcher requires NODE_ENV=production.');
  if (env.STREAK_DIRECT_DURABLE_STATE_ACK !== '1')
    throw Error('Verify the durable disk, then set STREAK_DIRECT_DURABLE_STATE_ACK=1.');
  if (env.MATCH_PROVIDER !== 'football')
    throw Error('Hosted launcher requires the real football provider.');
  for (const key of ['DATABASE_URL', 'API_SPORTS_KEY']) requireValue(env, key);
  for (const key of ['TREASURY_PRIVATE_KEY', 'STREAK_DIRECT_PRIVATE_KEY'])
    requireValue(env, key, /^(?:0x)?[0-9a-fA-F]{64}$/);
  requireValue(env, 'STREAK_SPONSOR_IPC_SECRET', /^[0-9a-f]{64}$/);
  const publicOrigin = new URL(requireValue(env, 'STREAK_PUBLIC_ORIGIN'));
  if (publicOrigin.protocol !== 'https:' || publicOrigin.origin !== env.STREAK_PUBLIC_ORIGIN)
    throw Error('STREAK_PUBLIC_ORIGIN must be an exact HTTPS origin.');
  const apiPort = port(env.PORT || '10000', 'PORT');
  const controlPort = port(env.STREAK_HOST_CONTROL_PORT || '4102', 'STREAK_HOST_CONTROL_PORT');
  const sponsor = new URL(requireValue(env, 'STREAK_SPONSOR_URL'));
  if (
    sponsor.protocol !== 'http:' ||
    sponsor.hostname !== '127.0.0.1' ||
    sponsor.pathname !== '/' ||
    sponsor.username ||
    sponsor.password ||
    sponsor.search ||
    sponsor.hash
  )
    throw Error('STREAK_SPONSOR_URL must be an explicit loopback HTTP origin.');
  const sponsorPort = port(sponsor.port, 'sponsor port');
  if (new Set([apiPort, sponsorPort, controlPort]).size !== 3)
    throw Error('API, sponsor and supervisor ports must differ.');
  const stateRoot = env.STREAK_HOST_STATE_DIR || '/var/data/streak';
  if (!path.isAbsolute(stateRoot)) throw Error('STREAK_HOST_STATE_DIR must be absolute.');
  const registry = {
    STREAK_DIRECT_REGISTRY_DIR: requireValue(env, 'STREAK_DIRECT_REGISTRY_DIR'),
    STREAK_DIRECT_BATCH_REGISTRY_DIR: requireValue(env, 'STREAK_DIRECT_BATCH_REGISTRY_DIR'),
    ...pick(env, ['STREAK_DIRECT_LEGACY_REGISTRY_DIR']),
  };
  const operatorDir = requireValue(env, 'STREAK_DIRECT_OPERATOR_DIR');
  const artworkDir = path.join(stateRoot, 'campaign-artwork');
  const directories = [operatorDir, ...Object.values(registry), artworkDir];
  if (
    directories.some(
      (dir) => !path.isAbsolute(dir) || !contained(path.resolve(stateRoot), path.resolve(dir)),
    )
  )
    throw Error('Every operator/registry directory must be inside the durable mount.');
  if (
    directories.some((dir, i) =>
      directories.some(
        (other, j) =>
          i !== j &&
          (path.resolve(dir) === path.resolve(other) ||
            contained(path.resolve(dir), path.resolve(other))),
      ),
    )
  )
    throw Error('Operator and registry directories must be separate, non-nested paths.');
  const catalogue = `http://127.0.0.1:${apiPort}/api/direct/fixtures`;
  if (env.STREAK_DIRECT_CATALOGUE_URL && env.STREAK_DIRECT_CATALOGUE_URL !== catalogue)
    throw Error('STREAK_DIRECT_CATALOGUE_URL must match the hosted API port.');
  if (env.STREAK_DIRECT_PROVISION_MODE || env.STREAK_DIRECT_PROGRESS_DIR)
    throw Error('Unset bulk provisioning mode/progress for first-bettor creation.');
  const common = {
    ...pick(env, COMMON),
    NODE_ENV: 'production',
    STREAK_SKIP_ENV_FILE: '1',
    ...registry,
  };
  // Ephemeral per-supervisor authorization. Never forwarded to payment signers,
  // browser configuration, the database, logs or inherited from external input.
  const workerHealth = {
    STREAK_WORKER_HEALTH_URL: `http://127.0.0.1:${controlPort}`,
    STREAK_WORKER_HEALTH_SECRET: randomBytes(32).toString('hex'),
  };
  const ipc = {
    STREAK_SPONSOR_URL: sponsor.origin,
    STREAK_SPONSOR_IPC_SECRET: env.STREAK_SPONSOR_IPC_SECRET,
  };
  const operator = {
    ...common,
    STREAK_DIRECT_OPERATOR_DIR: operatorDir,
    STREAK_DIRECT_PRIVATE_KEY: `0x${env.STREAK_DIRECT_PRIVATE_KEY.replace(/^0x/, '')}`,
    STREAK_DIRECT_DURABLE_STATE_ACK: '1',
    API_SPORTS_KEY: env.API_SPORTS_KEY,
  };
  let rewards;
  if (env.STREAK_FIVE_REWARDS_ENABLED === '1') {
    requireValue(env, 'STREAK_FIVE_REWARDS_ADDRESS', /^ckt1[a-z0-9]{20,250}$/);
    const rewardKey = requireValue(
      env,
      'STREAK_FIVE_REWARDS_PRIVATE_KEY',
      /^(?:0x)?[0-9a-fA-F]{64}$/,
    );
    if (env.STREAK_FIVE_NETWORK !== 'testnet')
      throw Error('Five rewards require STREAK_FIVE_NETWORK=testnet.');
    if (
      [env.TREASURY_PRIVATE_KEY, env.STREAK_DIRECT_PRIVATE_KEY].some(
        (k) => k.replace(/^0x/, '').toLowerCase() === rewardKey.replace(/^0x/, '').toLowerCase(),
      )
    )
      throw Error('Use a dedicated Five rewards key, separate from prediction and treasury keys.');
    rewards = {
      ...workerHealth,
      ...pick(env, COMMON),
      NODE_ENV: 'production',
      STREAK_SKIP_ENV_FILE: '1',
      ...pick(env, [
        'DATABASE_URL',
        'STREAK_SURVIVOR_DATABASE_URL',
        'STREAK_FIVE_DATABASE_URL',
        'STREAK_FIVE_NETWORK',
        'STREAK_FIVE_REWARDS_ADDRESS',
        'STREAK_FIVE_REWARDS_PRIVATE_KEY',
      ]),
    };
  }
  let testRewards;
  if (env.STREAK_GAMES_TEST_ENABLED === '1') {
    requireValue(env, 'STREAK_GAMES_TEST_DATABASE_URL');
    requireValue(env, 'STREAK_GAMES_TEST_REWARDS_ADDRESS', /^ckt1[a-z0-9]{20,250}$/);
    const testKey = requireValue(
      env,
      'STREAK_GAMES_TEST_REWARDS_PRIVATE_KEY',
      /^(?:0x)?[0-9a-fA-F]{64}$/,
    );
    if (env.STREAK_FIVE_NETWORK !== 'testnet') throw Error('Test games require testnet.');
    if (
      [env.TREASURY_PRIVATE_KEY, env.STREAK_DIRECT_PRIVATE_KEY, env.STREAK_FIVE_REWARDS_PRIVATE_KEY]
        .filter(Boolean)
        .some(
          (k) => k.replace(/^0x/, '').toLowerCase() === testKey.replace(/^0x/, '').toLowerCase(),
        )
    )
      throw Error('Use a separate test games rewards key.');
    const identity = (value) => {
      const url = new URL(value);
      return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
    };
    if (
      [env.DATABASE_URL, env.STREAK_FIVE_DATABASE_URL, env.STREAK_SURVIVOR_DATABASE_URL]
        .filter(Boolean)
        .some((db) => identity(db) === identity(env.STREAK_GAMES_TEST_DATABASE_URL))
    )
      throw Error('Test games require a separate database.');
    if (env.STREAK_GAMES_TEST_REWARDS_ADDRESS === env.STREAK_FIVE_REWARDS_ADDRESS)
      throw Error('Test games require a separate rewards address.');
    testRewards = {
      ...workerHealth,
      ...pick(env, COMMON),
      NODE_ENV: 'production',
      STREAK_SKIP_ENV_FILE: '1',
      ...pick(env, [
        'STREAK_FIVE_NETWORK',
        'STREAK_FIVE_REWARDS_ADDRESS',
        'STREAK_GAMES_TEST_ENABLED',
        'STREAK_GAMES_TEST_DATABASE_URL',
        'STREAK_GAMES_TEST_REWARDS_ADDRESS',
        'STREAK_GAMES_TEST_REWARDS_PRIVATE_KEY',
      ]),
    };
  }
  return {
    stateRoot: path.resolve(stateRoot),
    directories: directories.map((dir) => path.resolve(dir)),
    apiPort,
    sponsorPort,
    controlPort,
    environments: {
      api: {
        ...common,
        ...workerHealth,
        ...pick(env, API),
        ...ipc,
        PORT: String(apiPort),
        MATCH_PROVIDER: 'football',
        STREAK_CAMPAIGNS_ARTWORK_DIR: artworkDir,
      },
      sponsor: {
        ...operator,
        ...ipc,
        STREAK_DIRECT_CATALOGUE_URL: catalogue,
        ...pick(env, ['STREAK_CAMPAIGNS_EMPTY_HISTORY_ACK']),
      },
      worker: operator,
      ...(rewards ? { rewards } : {}),
      ...(testRewards ? { testRewards } : {}),
    },
  };
}

function prepareState(config, mountInfo = fs.readFileSync('/proc/self/mountinfo', 'utf8')) {
  if (
    process.platform === 'linux' &&
    !['/usr/bin/flock', '/bin/flock'].some((file) => fs.existsSync(file))
  )
    throw Error('Hosted settlement scheduling requires util-linux flock.');
  const mounts = mountInfo
    .split('\n')
    .map((line) =>
      line
        .split(' ')[4]
        ?.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8))),
    );
  if (!mounts.includes(config.stateRoot))
    throw Error('The configured state root is not a mounted disk.');
  if (fs.realpathSync(config.stateRoot) !== config.stateRoot)
    throw Error('The disk mount must not be a symlink.');
  for (const dir of config.directories) {
    // Check every existing ancestor before creating anything through a symlink.
    let parent = dir;
    while (!fs.existsSync(parent)) parent = path.dirname(parent);
    if (fs.realpathSync(parent) !== parent)
      throw Error('State directories cannot use symlink ancestors.');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (fs.realpathSync(dir) !== dir) throw Error('State directories cannot be symlinks.');
    const probe = path.join(dir, `.host-write-${randomUUID()}`);
    const fd = fs.openSync(probe, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, 'durability-probe');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(probe);
    }
  }
  if (hasUnreleasedLease(config))
    throw Error(
      'Operator or registry lease remains. Verify no signer is running and reconcile before removing a stale lock.',
    );
}

function hasUnreleasedLease(config) {
  const operator = config.environments.worker.STREAK_DIRECT_OPERATOR_DIR;
  return [
    path.join(operator, 'operator.lock'),
    path.join(operator, 'worker-lease', 'operator.lock'),
    ...config.directories.map((dir) => path.join(dir, '.canonical-selection.lock')),
  ].some((file) => fs.existsSync(file));
}

function listen(portNumber) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end());
    server.once('error', () => reject(Error('A required local service port is already occupied.')));
    server.listen(portNumber, '127.0.0.1', () => resolve(server));
  });
}
async function probe(url, headers, accept) {
  try {
    const response = await fetch(url, {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const text = await response.text();
    return text.length <= 1_000_000 && accept(JSON.parse(text));
  } catch {
    return false;
  }
}

function containerMemory(directory = '/sys/fs/cgroup') {
  try {
    const values = ['current', 'peak', 'max'].map((name) =>
      Number(fs.readFileSync(path.join(directory, `memory.${name}`), 'utf8').trim()),
    );
    if (values.some((value) => !Number.isSafeInteger(value) || value < 0) || !values[2])
      return null;
    return { currentBytes: values[0], peakBytes: values[1], limitBytes: values[2] };
  } catch {
    return null;
  }
}

/** No periodic dependency probes: only authenticated API requests wake a worker. */
async function workerControl(portNumber, secret, childrenByRole) {
  if (typeof secret !== 'string' || !/^[0-9a-f]{64}$/.test(secret))
    throw Error('Worker control requires private supervisor authorization.');
  const pending = new Map();
  const ask = (child, type) => {
    if (!child?.connected || pending.size >= 64) return Promise.resolve(false);
    return new Promise((resolve) => {
      const id = randomUUID();
      const finish = (ready) => {
        const job = pending.get(id);
        if (!job) return;
        clearTimeout(job.timer);
        pending.delete(id);
        resolve(ready === true);
      };
      pending.set(id, { child, finish, timer: setTimeout(() => finish(false), 3000) });
      try {
        child.send({ type: `streak.worker.${type}`, id, token: secret }, (error) => {
          if (error) finish(false);
        });
      } catch {
        finish(false);
      }
    });
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', 'application/json');
    const supplied = req.headers.authorization;
    const expected = `Bearer ${secret}`;
    if (
      typeof supplied !== 'string' ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    )
      return res.writeHead(401).end('{"ready":false}');
    const match = /^\/workers\/(rewards|testRewards)\/(health|wake)$/.exec(req.url || '');
    if (!match || req.method !== (match[2] === 'wake' ? 'POST' : 'GET'))
      return res.writeHead(404).end('{"ready":false}');
    if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] || 0) !== 0)
      return res.writeHead(400).end('{"ready":false}');
    const ready = await ask(childrenByRole.get(match[1]), match[2]);
    res.writeHead(ready ? 200 : 503).end(JSON.stringify({ ready }));
  });
  server.keepAliveTimeout = 1000;
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once('error', () => reject(Error('A required local service port is already occupied.')));
    server.listen(portNumber, '127.0.0.1', resolve);
  });
  return {
    server,
    message(child, value) {
      if (!value || typeof value !== 'object' || value.type !== 'streak.worker.response') return;
      const job = pending.get(value.id);
      if (job?.child === child) job.finish(value.ready);
    },
    disconnected(child) {
      for (const job of pending.values()) if (job.child === child) job.finish(false);
    },
    close() {
      for (const job of pending.values()) job.finish(false);
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

async function runHost(config, options = {}) {
  const runtime = {
    startupMs: 120_000,
    intervalMs: 60_000,
    workerMs: 300_000,
    shutdownMs: 25_000,
    pollMs: 250,
    ...options,
  };
  const commands = options.commands || {
    api: ['products/streak/dist/server.js'],
    sponsor: ['products/streak/scripts/direct-sponsor.cjs', '--serve'],
    worker: ['products/streak/scripts/direct-worker.cjs', '--once'],
    rewards: ['products/streak/dist/modules/five/worker.js'],
    testRewards: ['products/streak/dist/modules/five/worker.js', '--games-test'],
  };
  const log = options.log || ((message) => console.log(`[streak-host] ${message}`));
  const children = new Set();
  const childrenByRole = new Map();
  let stopped = false,
    workerTimer,
    workerDeadline,
    memoryTimer,
    stopPromise;
  let finish;
  const done = new Promise((resolve) => {
    finish = resolve;
  });
  const control = await workerControl(
    config.controlPort,
    config.environments.api.STREAK_WORKER_HEALTH_SECRET,
    childrenByRole,
  );
  const stop = (code, reason) => {
    if (stopPromise) return stopPromise;
    stopped = true;
    clearTimeout(workerTimer);
    clearTimeout(workerDeadline);
    clearInterval(memoryTimer);
    log(reason);
    stopPromise = (async () => {
      const running = [...children];
      for (const child of running) child.kill('SIGTERM');
      let forced = false;
      const deadline = setTimeout(() => {
        forced = children.size > 0;
        if (forced)
          log('Forced shutdown. Preserve journals; inspect stale locks before restarting signing.');
        for (const child of children) child.kill('SIGKILL');
      }, runtime.shutdownMs);
      await Promise.all(running.map((child) => child.completion));
      clearTimeout(deadline);
      await control.close();
      process.off('SIGTERM', terminate);
      process.off('SIGINT', terminate);
      options.signal?.removeEventListener('abort', terminate);
      finish(forced ? 1 : code);
    })();
    return stopPromise;
  };
  const terminate = () => {
    void stop(0, 'Stopping all hosted processes.');
  };
  process.on('SIGTERM', terminate);
  process.on('SIGINT', terminate);
  options.signal?.addEventListener('abort', terminate, { once: true });
  if (options.signal?.aborted) terminate();
  function start(name) {
    if (stopped) return undefined;
    const workerIpc = name === 'rewards' || name === 'testRewards';
    const standard = options.stdio || 'inherit';
    const child = spawn(process.execPath, commands[name], {
      cwd: options.cwd || ROOT,
      env: config.environments[name],
      stdio: workerIpc
        ? [
            ...(Array.isArray(standard) ? standard.slice(0, 3) : [standard, standard, standard]),
            'ipc',
          ]
        : standard,
      windowsHide: true,
      shell: false,
    });
    children.add(child);
    childrenByRole.set(name, child);
    if (workerIpc) {
      child.on('message', (value) => control.message(child, value));
      child.once('disconnect', () => control.disconnected(child));
    }
    let complete;
    child.completion = new Promise((resolve) => {
      complete = resolve;
    });
    child.once('error', () => {
      void stop(1, `${name} could not start.`);
    });
    child.once('close', (code) => {
      children.delete(child);
      if (childrenByRole.get(name) === child) childrenByRole.delete(name);
      control.disconnected(child);
      complete();
      if (stopped) return;
      if (name !== 'worker') {
        void stop(1, `${name} exited. Stopping the service for a supervised restart.`);
        return;
      }
      clearTimeout(workerDeadline);
      if (
        fs.existsSync(
          path.join(
            config.environments.worker.STREAK_DIRECT_OPERATOR_DIR,
            'worker-lease',
            'operator.lock',
          ),
        )
      ) {
        void stop(
          1,
          'A settlement lease remains after worker exit. Preserve state for reconciliation.',
        );
        return;
      }
      // Transient provider/lease failures must not trigger a rapid restart loop.
      log(
        code === 0
          ? 'Settlement pass completed.'
          : 'Settlement pass failed. Existing journals retained; retrying on the next interval.',
      );
      workerTimer = setTimeout(runWorker, runtime.intervalMs);
    });
    return child;
  }
  function runWorker() {
    if (!start('worker')) return;
    workerDeadline = setTimeout(() => {
      void stop(1, 'Settlement pass exceeded its time bound.');
    }, runtime.workerMs);
  }
  async function waitReady(check, name) {
    const until = Date.now() + runtime.startupMs;
    while (!stopped && Date.now() < until) {
      if (await check()) return !stopped;
      await delay(runtime.pollMs);
    }
    if (!stopped) void stop(1, `${name} readiness timed out.`);
    return false;
  }
  try {
    // Refuse attaching this supervisor to an unrelated already-running API/signer.
    for (const portNumber of [config.apiPort, config.sponsorPort]) {
      const reservation = await listen(portNumber);
      await new Promise((resolve) => reservation.close(resolve));
    }
    start('api');
    const apiCheck =
      options.apiCheck ||
      (() =>
        probe(
          `http://127.0.0.1:${config.apiPort}/api/direct/batch/config`,
          {},
          (value) => value.network === 'testnet' && value.codeDeps?.length === 2,
        ));
    if (!(await waitReady(apiCheck, 'API'))) return await done;
    start('sponsor');
    const sponsorCheck =
      options.sponsorCheck ||
      (() =>
        probe(
          `${config.environments.sponsor.STREAK_SPONSOR_URL}/batch/configuration`,
          { authorization: `Bearer ${config.environments.sponsor.STREAK_SPONSOR_IPC_SECRET}` },
          (value) => typeof value.sponsorLock?.codeHash === 'string',
        ));
    if (!(await waitReady(sponsorCheck, 'Sponsor'))) return await done;
    log('API and atomic sponsor are ready. Starting serialized settlement passes.');
    const measureMemory = () => {
      const memory = containerMemory();
      if (memory) log(`Container memory ${JSON.stringify(memory)}`);
    };
    measureMemory();
    memoryTimer = setInterval(measureMemory, 300_000);
    memoryTimer.unref();
    if (config.environments.rewards) start('rewards');
    if (config.environments.testRewards) start('testRewards');
    runWorker();
  } catch {
    void stop(1, 'Hosted startup failed. Check configuration and local port ownership.');
  }
  return await done;
}

module.exports = { buildConfig, prepareState, runHost, workerControl, containerMemory };
if (require.main === module) {
  (async () => {
    if (process.platform !== 'linux')
      throw Error('Hosted launcher requires Linux and a verified persistent mount.');
    const config = buildConfig(process.env);
    prepareState(config);
    process.exitCode = await runHost(config);
  })().catch((error) => {
    // Never print URL parser input, stack traces or inherited configuration.
    const safe =
      error instanceof TypeError || error?.code
        ? 'Check hosted environment and persistent disk permissions.'
        : error.message;
    console.error(`[streak-host] ${safe}`);
    process.exitCode = 1;
  });
}

import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  installWorkerHealthProbe,
  notifyRewardsWorker,
  workerHealthAvailable,
  workerHealthConfigured,
} from './infrastructure/worker-health';

const { workerControl } = require('../scripts/direct-host.cjs');

async function main() {
  const oldUrl = process.env.STREAK_WORKER_HEALTH_URL;
  const oldSecret = process.env.STREAK_WORKER_HEALTH_SECRET;
  const root = mkdtempSync(join(tmpdir(), 'streak-health-ipc-'));
  const script = join(root, 'worker.cjs');
  delete process.env.STREAK_WORKER_HEALTH_URL;
  delete process.env.STREAK_WORKER_HEALTH_SECRET;
  assert.equal(workerHealthConfigured(), false);
  assert.equal(await workerHealthAvailable(), false);
  process.env.STREAK_WORKER_HEALTH_SECRET = '55'.repeat(32);
  assert.equal(workerHealthConfigured(), true);
  assert.equal(await workerHealthAvailable(), false, 'partial configuration fails closed');
  const role = new Map();
  const control = await workerControl(0, '55'.repeat(32), role);
  process.env.STREAK_WORKER_HEALTH_URL = `http://127.0.0.1:${control.server.address().port}`;
  assert.throws(() => installWorkerHealthProbe(async () => true), /supervisor IPC/);
  writeFileSync(
    script,
    `const {installWorkerHealthProbe} = require(${JSON.stringify(resolve(__dirname, 'infrastructure/worker-health.ts'))});
    let wakes=0;
    installWorkerHealthProbe(async()=>wakes===2 ? await new Promise(()=>{}) : wakes>0, ()=>{wakes++;});
    process.send('installed');`,
  );
  const child = fork(script, [], {
    execArgv: ['--require', resolve(__dirname, '../node_modules/ts-node/register')],
    env: {
      NODE_ENV: 'test',
      STREAK_SKIP_ENV_FILE: '1',
      STREAK_WORKER_HEALTH_URL: process.env.STREAK_WORKER_HEALTH_URL,
      STREAK_WORKER_HEALTH_SECRET: process.env.STREAK_WORKER_HEALTH_SECRET,
      ...Object.fromEntries(
        ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) =>
          process.env[key] ? [[key, process.env[key]]] : [],
        ),
      ),
    },
    cwd: resolve(__dirname, '..'),
    stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  child.on('message', (value) => control.message(child, value));
  child.once('disconnect', () => control.disconnected(child));
  try {
    const [installed] = await once(child, 'message', { signal: AbortSignal.timeout(30_000) });
    assert.equal(installed, 'installed');
    role.set('rewards', child);
    assert.equal(await workerHealthAvailable(), false, 'alive but unready worker is unavailable');
    process.env.STREAK_WORKER_HEALTH_SECRET = '66'.repeat(32);
    await notifyRewardsWorker();
    assert.equal(await workerHealthAvailable(), false, 'wrong authorization cannot wake worker');
    process.env.STREAK_WORKER_HEALTH_SECRET = '55'.repeat(32);
    assert.equal(await workerHealthAvailable(), false);
    await notifyRewardsWorker();
    assert.equal(await workerHealthAvailable(), true);
    assert.equal(
      await workerHealthAvailable('testRewards'),
      false,
      'test and regular scopes stay separate',
    );
    await notifyRewardsWorker();
    assert.deepEqual(
      await Promise.all([workerHealthAvailable(), workerHealthAvailable()]),
      [false, false],
      'hung dependency fails closed with bounded requests',
    );
    const closed = once(child, 'exit');
    child.kill('SIGKILL');
    await closed;
    assert.equal(await workerHealthAvailable(), false, 'exited worker cannot retain readiness');
    await notifyRewardsWorker();
    console.log(
      'Worker health: configured failure, authenticated IPC, dependency readiness, wake, scope and exit passed.',
    );
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'exit');
      child.kill('SIGKILL');
      await closed;
    }
    await control.close();
    if (oldUrl === undefined) delete process.env.STREAK_WORKER_HEALTH_URL;
    else process.env.STREAK_WORKER_HEALTH_URL = oldUrl;
    if (oldSecret === undefined) delete process.env.STREAK_WORKER_HEALTH_SECRET;
    else process.env.STREAK_WORKER_HEALTH_SECRET = oldSecret;
    rmSync(root, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

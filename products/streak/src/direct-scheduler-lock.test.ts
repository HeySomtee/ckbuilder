import assert from 'node:assert/strict';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { withWorkerSchedulingLock } from './modules/direct/scheduler-lock';

async function main() {
  const root = mkdtempSync(join(tmpdir(), 'streak-scheduling-'));
  const children = new Set<ChildProcess>();
  const script = join(root, 'worker.cjs');
  writeFileSync(
    script,
    `const { withWorkerSchedulingLock } = require(${JSON.stringify(resolve(__dirname, 'modules/direct/scheduler-lock.ts'))});
    withWorkerSchedulingLock(process.argv[2], async () => {
      process.send('acquired');
      await new Promise(resolve => process.once('message', resolve));
    }).then(() => process.exit(0), error => {process.send(error.message); process.exitCode=1; process.disconnect();});`,
  );
  const start = () => {
    const child = fork(script, [root], {
      execArgv: ['--require', resolve(__dirname, '../node_modules/ts-node/register')],
      env: {
        NODE_ENV: 'test',
        STREAK_SKIP_ENV_FILE: '1',
        ...Object.fromEntries(
          ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) =>
            process.env[key] ? [[key, process.env[key]]] : [],
          ),
        ),
      },
      cwd: resolve(__dirname, '..'),
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    });
    children.add(child);
    child.once('exit', () => children.delete(child));
    return child;
  };
  const message = (child: ChildProcess) =>
    once(child, 'message', { signal: AbortSignal.timeout(30_000) }).then(([value]) => value);
  try {
    const first = start();
    assert.equal(await message(first), 'acquired');
    await assert.rejects(withWorkerSchedulingLock(root, async () => 'must not enter'));
    const firstClosed = once(first, 'exit');
    first.send('release');
    await firstClosed;
    assert.equal(await withWorkerSchedulingLock(root, async () => 'released'), 'released');
    await assert.rejects(
      withWorkerSchedulingLock(root, async () => {
        throw Error('synthetic task failure');
      }),
      /synthetic task failure/,
    );
    assert.equal(
      await withWorkerSchedulingLock(root, async () => 'released after exception'),
      'released after exception',
    );

    const doomed = start();
    assert.equal(await message(doomed), 'acquired');
    const killed = once(doomed, 'exit');
    doomed.kill('SIGKILL');
    await killed;
    const legacy = join(root, 'worker-lease', 'operator.lock');
    if (process.platform === 'linux') {
      assert.equal(existsSync(legacy), false, 'Linux creates no persistent ownership claim');
      assert.ok(existsSync(join(root, 'worker-lease', 'scheduler.flock')));
      assert.equal(await withWorkerSchedulingLock(root, async () => 'recovered'), 'recovered');
      const file = join(root, 'worker-lease', 'scheduler.flock');
      const linked = join(root, 'linked');
      linkSync(file, linked);
      await assert.rejects(
        withWorkerSchedulingLock(root, async () => {}),
        /ordinary private file/,
      );
      unlinkSync(linked);
      unlinkSync(file);
      symlinkSync(linked, file);
      await assert.rejects(
        withWorkerSchedulingLock(root, async () => {}),
        /ELOOP/,
      );
      assert.equal(existsSync(linked), false, 'lock open cannot create a symlink target');
      unlinkSync(file);
      writeFileSync(legacy, 'unknown old process');
      await assert.rejects(
        withWorkerSchedulingLock(root, async () => {}),
        /Legacy/,
      );
      assert.equal(readFileSync(legacy, 'utf8'), 'unknown old process');
    } else {
      assert.ok(existsSync(legacy), 'portable file-lock fallback retains explicit crash recovery');
      await assert.rejects(
        withWorkerSchedulingLock(root, async () => {}),
        /stopped/,
      );
    }
    console.log(
      `Scheduling lock: real process exclusion, normal release, ${process.platform === 'linux' ? 'SIGKILL kernel release and legacy refusal' : 'conservative non-Linux crash refusal'} passed.`,
    );
  } finally {
    await Promise.all(
      [...children].map(async (child) => {
        const closed = once(child, 'exit');
        child.kill('SIGKILL');
        await closed;
      }),
    );
    rmSync(root, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

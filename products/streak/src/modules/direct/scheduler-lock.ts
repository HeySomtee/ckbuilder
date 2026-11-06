import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { OperatorJournal } from './journal';

/**
 * Scheduling only. Financial mutation locks, input reservations and transaction
 * journals are deliberately independent. The flock inode is never removed.
 */
export async function withWorkerSchedulingLock<T>(directory: string, task: () => Promise<T>) {
  const leaseDirectory = join(directory, 'worker-lease');
  if (process.platform !== 'linux') return new OperatorJournal(leaseDirectory).exclusive(task);
  let ancestor = leaseDirectory;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  if (realpathSync(ancestor) !== resolve(ancestor))
    throw Error('Worker scheduling directory cannot use symlink ancestors');
  mkdirSync(leaseDirectory, { recursive: true, mode: 0o700 });
  if (realpathSync(leaseDirectory) !== resolve(leaseDirectory))
    throw Error('Worker scheduling directory cannot use symlinks');
  const legacy = join(leaseDirectory, 'operator.lock');
  if (existsSync(legacy))
    throw Error('Legacy settlement lease remains. Verify its prior owner before migration.');
  const executable = ['/usr/bin/flock', '/bin/flock'].find((file) => existsSync(file));
  if (!executable) throw Error('Linux worker requires util-linux flock for scheduling');
  const file = join(leaseDirectory, 'scheduler.flock');
  const fd = openSync(file, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    const opened = fstatSync(fd);
    if (!opened.isFile() || opened.nlink !== 1 || (opened.mode & 0o077) !== 0)
      throw Error('Worker scheduling lock must be an ordinary private file');
    // flock's fd 3 and our fd refer to the SAME open file description. Linux
    // retains the lock after flock exits, until our fd closes or Node dies.
    const lock = spawnSync(
      executable,
      ['--exclusive', '--nonblock', '--conflict-exit-code', '75', '3'],
      {
        stdio: ['ignore', 'ignore', 'ignore', fd],
        timeout: 5000,
        shell: false,
        windowsHide: true,
      },
    );
    if (lock.status === 75) throw Error('Another settlement worker owns the scheduling lock');
    if (lock.error || lock.status !== 0)
      throw Error('Worker scheduling lock could not be acquired');
    const named = lstatSync(file);
    if (named.dev !== opened.dev || named.ino !== opened.ino || existsSync(legacy))
      throw Error('Worker scheduling state changed during acquisition');
    return await task();
  } finally {
    closeSync(fd);
  }
}

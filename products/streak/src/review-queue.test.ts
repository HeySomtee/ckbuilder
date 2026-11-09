import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { ReviewQueue } from './modules/direct/review-queue';

const directory = mkdtempSync(join(tmpdir(), 'streak-review-queue-'));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const digest = `0x${'1'.repeat(64)}`;
let now = 1000;
try {
  const q = new ReviewQueue(directory, () => now);
  assert.equal(q.touch(id(1), 'synthetic-a', digest), 1);
  assert.equal(q.touch(id(2), 'synthetic-b', digest), 2);
  assert.equal(q.touch(id(3), 'synthetic-c', digest), 3);
  assert.equal(new ReviewQueue(directory, () => now).touch(id(2), 'synthetic-b', digest), 2, 'restart retains FIFO');
  assert.throws(() => q.touch(id(1), 'synthetic-b', digest), /another slip/);
  assert.throws(() => q.touch(id(1), 'synthetic-a', `0x${'2'.repeat(64)}`), /another slip/);
  q.cancel(id(1), 'synthetic-b');
  assert.equal(q.touch(id(2), 'synthetic-b', digest), 2, 'another wallet cannot cancel the head');
  q.cancel(id(1), 'synthetic-a');
  assert.equal(q.touch(id(2), 'synthetic-b', digest), 1, 'leaving immediately advances next owner');
  q.leave(id(2));
  assert.equal(q.touch(id(3), 'synthetic-c', digest), 1);
  assert.equal(q.touch(id(4), 'synthetic-c', digest), 1, 'one review per wallet');
  now += 90_001;
  assert.equal(q.touch(id(5), 'synthetic-d', digest), 1, 'abandoned unsigned waiter expires');
  for (let n = 6; n < 133; n++) q.touch(id(n), `synthetic-${n}`, digest);
  assert.throws(() => q.touch(id(133), 'synthetic-full', digest), /queue is busy/);
  now += 90_001;
  assert.equal(q.touch(id(134), 'synthetic-new', digest), 1, 'capacity recovers after abandoned queue');
  console.log('PASS durable bounded review FIFO, wallet isolation, cancellation, expiry and recovery');
} finally {
  const target = realpathSync(directory);
  if (dirname(target) !== realpathSync(tmpdir()) || !basename(target).startsWith('streak-review-queue-'))
    throw Error('Refusing cleanup outside the owned temporary directory');
  rmSync(target, { recursive: true, force: true });
}

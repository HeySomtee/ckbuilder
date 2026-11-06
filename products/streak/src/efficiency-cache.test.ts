import assert from 'node:assert/strict';
import { BoundedMemo, BoundedRequests, boundedJson } from './infrastructure/bounded-memo';
import { AsyncSnapshotCache } from './async-cache';
import { DueWork } from './infrastructure/due-work';
import { setTimeout as delay } from 'node:timers/promises';

async function main() {
  let now = 0,
    reads = 0;
  const memo = new BoundedMemo<string>(2, 20, () => now);
  const fetch = (key: string) =>
    memo.get(key, 100, async () => {
      reads++;
      return key;
    });
  await Promise.all([fetch('a'), fetch('a')]);
  assert.equal(reads, 1, 'simultaneous reads share one provider request');
  await fetch('b');
  await fetch('a');
  await fetch('c');
  assert.equal(memo.peek('b'), undefined, 'least recently read entry is evicted');
  assert.equal(memo.peek('a'), 'a');
  now = 101;
  assert.equal(memo.peek('a'), undefined, 'expired entries release retained payloads');
  const oversized = 'x'.repeat(30);
  assert.equal(await memo.get('large', 100, async () => oversized), oversized);
  assert.equal(memo.peek('large'), undefined, 'oversized result is not retained');
  await assert.rejects(
    memo.get('retry', 100, async () => {
      throw Error('provider unavailable');
    }),
  );
  assert.equal(await memo.get('retry', 100, async () => 'ok'), 'ok');
  const staleMemo = new BoundedMemo<string>(2, 100, () => now, 2, 500);
  await staleMemo.get('insights', 100, async () => 'previous');
  now += 101;
  assert.equal(staleMemo.isFresh('insights'), false);
  assert.equal(
    staleMemo.peek('insights'),
    'previous',
    'bounded stale peek lets deferred store synchronization persist a completed observation',
  );
  await assert.rejects(
    staleMemo.get('insights', 100, async () => {
      throw Error('temporary outage');
    }),
  );
  assert.equal(
    staleMemo.peek('insights'),
    'previous',
    'failed refresh preserves the previous labelled observation',
  );
  assert.equal(
    await staleMemo.get('insights', 100, async () => 'updated'),
    'updated',
    'expired retained values still refresh',
  );
  now += 601;
  assert.equal(
    staleMemo.peek('insights'),
    undefined,
    'stale retention is bounded in time as well as entries and bytes',
  );

  let unblock!: () => void;
  const pending = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const pendingMemo = new BoundedMemo<string>(2, 100, () => now, 1);
  const firstPending = pendingMemo.get('a', 100, async () => {
    await pending;
    return 'a';
  });
  const duplicatePending = pendingMemo.get('a', 100, async () => assert.fail('duplicate loader'));
  await assert.rejects(
    pendingMemo.get('b', 100, async () => 'b'),
    /busy/,
  );
  unblock();
  await Promise.all([firstPending, duplicatePending]);
  assert.equal(
    await pendingMemo.get('b', 100, async () => 'b'),
    'b',
    'pending capacity is released after completion',
  );

  let unblockSnapshot!: () => void;
  const snapshotWait = new Promise<number>((resolve) => {
    unblockSnapshot = () => resolve(1);
  });
  const snapshots = new AsyncSnapshotCache<string, number>(1000, 1);
  const snapshot = snapshots.refresh('a', () => snapshotWait);
  await assert.rejects(
    snapshots.refresh('b', async () => 2),
    /busy/,
  );
  assert.deepEqual(
    snapshots.read('b', async () => assert.fail('busy cache must not load')),
    { value: undefined, refreshing: false },
  );
  unblockSnapshot();
  await snapshot;
  assert.equal(await snapshots.refresh('b', async () => 2), 2);
  const weighted = new AsyncSnapshotCache<string, string>(1000, 10, 1000, {
    maximumBytes: 6,
    sizeOf: (value) => Buffer.byteLength(value, 'utf8'),
  });
  await weighted.refresh('a', async () => 'aaaa');
  await weighted.refresh('b', async () => 'bbbb');
  assert.equal(
    weighted.peek('a'),
    undefined,
    'outer snapshots also enforce their retained-byte budget',
  );
  assert.equal(await weighted.refresh('b', async () => 'oversized'), 'oversized');
  assert.equal(
    weighted.peek('b'),
    'bbbb',
    'oversized refresh leaves the previous bounded snapshot intact',
  );
  const integers = new AsyncSnapshotCache<string, bigint>(1000);
  assert.equal(
    await integers.refresh('wallet', async () => 123n),
    123n,
    'default caches retain BigInt without JSON serialization',
  );

  const requests = new BoundedRequests(2, 2);
  let releaseRequests!: () => void;
  const requestWait = new Promise<void>((resolve) => {
    releaseRequests = resolve;
  });
  let requestActive = 0,
    requestPeak = 0;
  const remote = async () => {
    requestPeak = Math.max(requestPeak, ++requestActive);
    await requestWait;
    requestActive--;
    return 1;
  };
  const limited = Array.from({ length: 4 }, () => requests.run(remote));
  await assert.rejects(requests.run(remote), /busy/);
  releaseRequests();
  await Promise.all(limited);
  assert.equal(requestPeak, 2, 'provider endpoints share one concurrency limit');
  const queueTimeout = new BoundedRequests(1, 1, 10);
  let releaseTimeout!: () => void;
  const timed = queueTimeout.run(
    () =>
      new Promise<void>((resolve) => {
        releaseTimeout = resolve;
      }),
  );
  const expired = assert.rejects(
    queueTimeout.run(async () => assert.fail('expired queued request must not start')),
    /queue timed out/,
  );
  await delay(20);
  await expired;
  releaseTimeout();
  await timed;
  assert.equal(await queueTimeout.run(async () => 'recovered'), 'recovered');

  assert.deepEqual(await boundedJson(new Response('{"ready":true}'), 100), { ready: true });
  await assert.rejects(
    boundedJson(new Response('{}', { headers: { 'content-length': '101' } }), 100),
    /byte limit/,
  );
  let cancelled = false;
  const chunks = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode('12345678'));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    boundedJson(new Response(chunks, { headers: { 'content-length': '2' } }), 10),
    /byte limit/,
  );
  assert.equal(
    cancelled,
    true,
    'oversized chunked/decompressed bodies stop being read before JSON parsing',
  );
  await assert.rejects(boundedJson(new Response('not JSON'), 100), /JSON/);

  let passes = 0,
    active = 0,
    peak = 0;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const work = new DueWork(
    async () => {
      peak = Math.max(peak, ++active);
      passes++;
      if (passes === 1) await held;
      active--;
      return 60_000;
    },
    () => assert.fail('unexpected job error'),
  );
  work.start();
  await delay(15);
  work.wake();
  work.wake();
  release();
  await delay(30);
  assert.equal(passes, 2, 'wake during work survives completion and is coalesced');
  assert.equal(peak, 1, 'work never overlaps itself');
  work.stop();
  work.wake();
  await delay(15);
  assert.equal(passes, 2, 'stop cancels future wakeups');
  console.log('Bounded provider cache and due-work regression passed');
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

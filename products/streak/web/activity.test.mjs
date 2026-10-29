import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { activityQuery, warmActivity } from './src/features/direct/activity-query.ts';
import {
  activityState,
  isHistory,
  isCollected,
  returnParts,
  pendingClaim,
  collectionLabel,
} from './src/features/direct/activity-model.ts';

const descriptor = { type: { codeHash: 'code', args: 'market' }, creationTxHash: 'creation' };
const position = {
  status: 'accepted',
  outcome: 0,
  principalShannons: '10000000000',
  storageShannons: '32100000000',
  entitlementShannons: null,
  outPoint: { txHash: 'position', index: 1 },
};

const snapshot = () => ({
  phase: 'open',
  positions: [],
  checkedAt: Date.now(),
  historyComplete: true,
});
const gate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
test('startup warmup shares an in-flight foreground query and caps discovery at two unique markets', async () => {
  const cache = new QueryClient();
  const first = gate(),
    second = gate();
  const calls = [];
  const descriptors = ['one', 'two', 'three'].map((args) => ({
    ...descriptor,
    type: { ...descriptor.type, args },
  }));
  const reader = {
    discover: async (d) => {
      calls.push(d.type.args);
      await (d.type.args === 'one' ? first.promise : second.promise);
      return snapshot();
    },
  };
  const lifetime = new AbortController();
  const warm = warmActivity(
    cache,
    reader,
    'owner',
    [descriptors[0], descriptors[0], ...descriptors.slice(1)],
    lifetime.signal,
    () => true,
  );
  const visible = cache.fetchQuery(activityQuery(cache, reader, 'owner', descriptors[0]));
  assert.deepEqual(calls, ['one'], 'foreground reuses the delayed startup read');
  first.resolve();
  await visible;
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(calls, ['one', 'two'], 'only one market runs at a time');
  second.resolve();
  await warm;
  await cache.fetchQuery(activityQuery(cache, reader, 'owner', descriptors[0]));
  await cache.fetchQuery(activityQuery(cache, reader, 'owner', descriptors[1]));
  assert.deepEqual(calls, ['one', 'two'], 'fresh route reads add zero discovery passes');
  cache.clear();
});

test('cancelled warmup never starts a second market or resurrects cleared private rows', async () => {
  const cache = new QueryClient();
  const pending = gate();
  const lifetime = new AbortController();
  let progress;
  let calls = 0;
  const reader = {
    discover: async (_d, callback) => {
      calls++;
      progress = callback;
      await pending.promise;
      return snapshot();
    },
  };
  const options = activityQuery(cache, reader, 'owner', descriptor);
  const warm = warmActivity(
    cache,
    reader,
    'owner',
    [descriptor, { ...descriptor, creationTxHash: 'second' }],
    lifetime.signal,
    () => true,
  );
  lifetime.abort();
  cache.removeQueries({ queryKey: ['direct-private'] });
  progress(snapshot());
  pending.resolve();
  await warm;
  assert.equal(calls, 1);
  assert.equal(cache.getQueryData(options.queryKey), undefined);
  assert.equal(cache.getQueryCache().getAll().length, 0);
  cache.clear();
});

test('account guard blocks delayed progress before React cleanup, including a fresh same-key replacement', async () => {
  const cache = new QueryClient();
  const pending = gate();
  let active = true;
  let progress;
  const reader = {
    discover: async (_d, callback) => {
      progress = callback;
      await pending.promise;
      return snapshot();
    },
  };
  const options = activityQuery(cache, reader, 'owner', descriptor, () => active);
  const read = cache.fetchQuery(options);
  const rejection = assert.rejects(read, /no longer current/);
  active = false;
  progress(snapshot());
  assert.equal(cache.getQueryData(options.queryKey), undefined);
  pending.resolve();
  await rejection;
  cache.clear();

  const next = gate();
  const oldReader = {
    discover: async (_d, callback) => {
      progress = callback;
      await next.promise;
      return snapshot();
    },
  };
  const oldRead = cache.fetchQuery(activityQuery(cache, oldReader, 'owner', descriptor));
  const oldRejected = oldRead.catch(() => undefined);
  cache.removeQueries({ queryKey: options.queryKey, exact: true });
  const fresh = { ...snapshot(), checkedAt: 123 };
  cache.setQueryData(options.queryKey, fresh);
  progress({ ...snapshot(), checkedAt: 999 });
  next.resolve();
  await oldRejected;
  assert.equal(cache.getQueryData(options.queryKey).checkedAt, 123);
  cache.clear();
});

test('startup with no known descriptors or inactive account makes no discovery requests', async () => {
  const cache = new QueryClient();
  let calls = 0;
  const reader = {
    discover: async () => {
      calls++;
      return snapshot();
    },
  };
  const signal = new AbortController().signal;
  await warmActivity(cache, reader, 'owner', [], signal, () => true);
  await warmActivity(cache, reader, 'owner', [descriptor], signal, () => false);
  assert.equal(calls, 0);
  cache.clear();
});
test('activity separates payment admission, football progress and contract settlement', () => {
  const open = { phase: 'open' };
  assert.equal(activityState(position, open, 'scheduled', 200, 100), 'upcoming');
  assert.equal(activityState(position, open, 'live', 50, 100), 'live');
  assert.equal(activityState(position, open, 'final', 50, 100), 'settling');
  assert.equal(
    activityState({ ...position, status: 'pending-validation' }, open, 'live'),
    'verifying',
  );
  assert.equal(activityState({ ...position, status: 'refund-required' }, open), 'refund-pending');
  assert.equal(activityState(position, { phase: 'unknown' }, 'final'), 'unknown');
  assert.equal(isHistory(position), false);
});
test('outcomes use verified settlement, not the amount or football score', () => {
  const claim = { ...position, status: 'claimable', entitlementShannons: '42100000000' };
  assert.equal(activityState(claim, { phase: 'settled' }, 'final'), 'settled');
  assert.equal(
    activityState(claim, { phase: 'settled', settlement: { outcome: 0, emptyWinner: false } }),
    'won',
  );
  assert.equal(
    activityState(claim, { phase: 'settled', settlement: { outcome: 1, emptyWinner: false } }),
    'lost',
  );
  assert.equal(
    activityState(claim, { phase: 'settled', settlement: { outcome: 1, emptyWinner: true } }),
    'refund',
  );
  assert.equal(
    activityState(claim, { phase: 'voided', settlement: { outcome: null, emptyWinner: false } }),
    'refund',
  );
  assert.equal(isHistory(claim), true);
  assert.equal(isCollected(claim), false);
  assert.equal(activityState({ ...claim, status: 'refunded' }, { phase: 'open' }), 'refund');
});
test('returns include storage once, with no false losing profit', () => {
  assert.deepEqual(returnParts({ ...position, entitlementShannons: '42100000000' }), {
    total: 42100000000n,
    storage: 32100000000n,
    prediction: 10000000000n,
  });
  assert.deepEqual(returnParts({ ...position, entitlementShannons: '32100000000' }), {
    total: 32100000000n,
    storage: 32100000000n,
    prediction: 0n,
  });
  assert.equal(returnParts(position), null);
  assert.equal(returnParts({ ...position, entitlementShannons: '1' }), null);
  assert.equal(collectionLabel('lost'), 'Collect storage');
  assert.equal(collectionLabel('refund'), 'Collect refund');
});
test('uncertain and rejected saved claims block duplicates until proved resolved', () => {
  const record = { kind: 'claim', descriptor, inputs: [position.outPoint] };
  for (const status of ['signed', 'submitted', 'unknown', 'committed', 'rejected', 'conflict']) {
    const saved = { ...record, status };
    assert.equal(pendingClaim(position, descriptor, [saved]), saved);
  }
  assert.equal(pendingClaim(position, descriptor, [{ ...record, status: 'resolved' }]), undefined);
  assert.equal(
    pendingClaim(position, { ...descriptor, type: { ...descriptor.type, args: 'other' } }, [
      { ...record, status: 'unknown' },
    ]),
    undefined,
  );
  assert.equal(
    pendingClaim({ ...position, status: 'claimed' }, descriptor, [
      { ...record, status: 'committed' },
    ]),
    undefined,
  );
});

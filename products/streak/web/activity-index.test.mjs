import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { ccc } from '@ckb-ccc/core';
import {
  activityGroups,
  activityIndexKey,
  activityIndexQuery,
  hintActivityIndex,
  parseActivityPage,
} from './src/features/direct/activity-index.ts';
import { descriptorTermsHash, GUARD_HASH, PROTOCOL_HASH } from './src/features/direct/protocol.ts';
import {
  activityState,
  activityPositionKey,
  isHistory,
} from './src/features/direct/activity-model.ts';

const hash = (c) => `0x${c.repeat(64)}`;
const account = { id: 'synthetic-account', walletAddress: 'ckt-synthetic-read-only' };
const gate = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function group() {
  const cutoffMs = 1_800_000_000_000,
    args = new Uint8Array(172);
  args.set(ccc.bytesFrom(GUARD_HASH), 76);
  new DataView(args.buffer).setBigUint64(68, BigInt(cutoffMs), true);
  const descriptor = {
    id: 'synthetic-market',
    fixtureId: 'synthetic-fixture',
    label: 'Arsenal vs Chelsea',
    cutoffMs,
    creationTxHash: hash('2'),
    type: { codeHash: PROTOCOL_HASH, hashType: 'data2', args: ccc.hexFrom(args) },
    terms: {
      provider: 'football',
      providerFixtureId: '1',
      source: 'api-football',
      rules: 'regulation-time-1x2-v1',
      deadlineMs: cutoffMs + 21_600_000,
    },
    entryEnabled: false,
  };
  descriptor.termsHash = await descriptorTermsHash(descriptor);
  return {
    descriptor,
    stale: false,
    snapshot: {
      phase: 'open',
      positions: [
        {
          id: `${hash('3')}:0`,
          status: 'submitted',
          outcome: 0,
          principalShannons: '10000000000',
          storageShannons: '32100000000',
          entitlementShannons: null,
          outPoint: { txHash: hash('3'), index: 0 },
          transactionHash: hash('3'),
        },
      ],
      checkedAt: 100,
      historyComplete: true,
    },
  };
}
function page(groups = []) {
  return {
    version: 1,
    network: 'testnet',
    available: true,
    ownerHash: hash('1'),
    address: account.walletAddress,
    groups,
    nextCursor: null,
    coverage: 'complete',
    updating: false,
    updatedAt: 100,
    summary: { open: groups.length, completed: 0, collectibleShannons: '0', claimable: 0 },
  };
}

test('indexed activity validates account, money, full descriptors and pending admission without a signer', async () => {
  const raw = page([await group()]);
  const parsed = await parseActivityPage(raw, account.walletAddress);
  assert.equal(parsed.groups.length, 1);
  assert.equal(
    activityState(parsed.groups[0].snapshot.positions[0], parsed.groups[0].snapshot),
    'submitted',
  );
  assert.equal(isHistory(parsed.groups[0].snapshot.positions[0]), false);
  await assert.rejects(
    parseActivityPage({ ...raw, address: 'different-wallet' }, account.walletAddress),
  );
  await assert.rejects(parseActivityPage({ ...raw, network: 'mainnet' }, account.walletAddress));
  for (const bad of ['1.5', '-1', '01', '18446744073709551616']) {
    const changed = structuredClone(raw);
    changed.groups[0].snapshot.positions[0].principalShannons = bad;
    await assert.rejects(parseActivityPage(changed, account.walletAddress));
  }
  const changed = structuredClone(raw);
  changed.groups[0].descriptor.terms.deadlineMs++;
  await assert.rejects(parseActivityPage(changed, account.walletAddress));
  await assert.rejects(
    parseActivityPage({ ...raw, groups: [raw.groups[0], raw.groups[0]] }, account.walletAddress),
  );
});

test('startup and foreground share one delayed HTTP read with zero wallet or chain dependencies', async (t) => {
  const cache = new QueryClient(),
    pending = gate();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/activity');
    assert.equal(options.method, 'GET');
    calls++;
    await pending.promise;
    return Response.json(page());
  });
  const read = cache.fetchInfiniteQuery(activityIndexQuery(cache, account));
  const foreground = cache.fetchInfiniteQuery(activityIndexQuery(cache, account));
  assert.equal(calls, 1);
  pending.resolve();
  await Promise.all([read, foreground]);
  await cache.fetchInfiniteQuery(activityIndexQuery(cache, account));
  assert.equal(calls, 1, 'fresh navigation reuses saved activity');
  assert.equal(cache.getQueryData(activityIndexKey(account)).pages[0].available, true);
  cache.clear();
});

test('account changes and signout fence delayed responses without recreating private cache', async (t) => {
  const cache = new QueryClient(),
    pending = gate();
  let current = true;
  t.mock.method(globalThis, 'fetch', async () => {
    await pending.promise;
    return Response.json(page());
  });
  const reading = cache.fetchInfiniteQuery(activityIndexQuery(cache, account, () => current));
  const rejected = assert.rejects(reading, /Activity account changed/);
  current = false;
  pending.resolve();
  await rejected;
  assert.equal(cache.getQueryData(activityIndexKey(account)), undefined);
  cache.clear();

  const next = gate();
  t.mock.method(globalThis, 'fetch', async () => {
    await next.promise;
    return Response.json(page());
  });
  const old = cache.fetchInfiniteQuery(activityIndexQuery(cache, account));
  const stopped = old.catch(() => undefined);
  cache.removeQueries({ queryKey: ['private'] });
  next.resolve();
  await stopped;
  assert.equal(cache.getQueryCache().getAll().length, 0);
  cache.clear();
});

test('failed refresh retains cached rows, pagination deduplicates full market identities', async (t) => {
  const cache = new QueryClient(),
    raw = page([await group()]);
  let failed = false;
  t.mock.method(globalThis, 'fetch', async () =>
    failed ? Response.json({ error: 'Unavailable' }, { status: 503 }) : Response.json(raw),
  );
  const query = activityIndexQuery(cache, account);
  await cache.fetchInfiniteQuery(query);
  failed = true;
  await assert.rejects(cache.fetchInfiniteQuery({ ...query, staleTime: 0 }), /Unavailable/);
  const saved = cache.getQueryData(activityIndexKey(account));
  assert.equal(saved.pages[0].groups[0].descriptor.label, 'Arsenal vs Chelsea');
  const next = structuredClone(saved.pages[0]);
  next.groups[0].snapshot.checkedAt = 200;
  assert.equal(activityGroups([...saved.pages, next]).length, 1);
  assert.equal(activityGroups([...saved.pages, next])[0].snapshot.checkedAt, 200);
  assert.notDeepEqual(
    activityIndexKey(account),
    activityIndexKey({ ...account, id: 'new-account' }),
  );
  cache.clear();
});

test('a missed activity hint never rejects a successful payment and malformed hashes are not sent', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw Error('synthetic outage');
  });
  assert.equal(await hintActivityIndex('bad'), false);
  assert.equal(calls, 0);
  assert.equal(await hintActivityIndex(hash('4'), 'synthetic-market'), false);
  assert.equal(calls, 1);
});

test('a pending detail follows its verified birth identity through admission and settlement', async () => {
  const { descriptor, snapshot } = await group();
  const accepted = { ...snapshot.positions[0], id: `${hash('3')}:0`, status: 'accepted' };
  const submitted = { ...accepted, id: `submitted:${accepted.id}`, status: 'submitted' };
  const claim = {
    ...accepted,
    status: 'claimable',
    outPoint: { txHash: hash('4'), index: 2 },
    entitlementShannons: '42100000000',
  };
  assert.equal(
    activityPositionKey(descriptor, submitted),
    activityPositionKey(descriptor, accepted),
  );
  assert.equal(activityPositionKey(descriptor, accepted), activityPositionKey(descriptor, claim));
  assert.notEqual(
    activityPositionKey(descriptor, accepted),
    activityPositionKey(descriptor, { ...accepted, id: `${hash('3')}:1` }),
  );
});

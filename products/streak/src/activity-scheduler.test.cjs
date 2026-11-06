require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { ActivityService } = require('../dist/modules/activity/service');
const { PgActivityStorage } = require('../dist/modules/activity/storage');

const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
class MemoryJobs extends PgActivityStorage {
  constructor() {
    super({});
    this.takes = 0;
    this.schedules = 0;
    this.deadline = 900_000;
  }
  async initialize() {}
  async bootstrap() {}
  async take() {
    this.takes++;
    return null;
  }
  async nextDueDelay() {
    this.schedules++;
    return Math.max(0, this.deadline - Date.now());
  }
  async hint() {}
}
function fixture(store) {
  let deliveries = 0;
  const service = new ActivityService(store, {
    catalogue: async () => [],
    events: async () => {
      deliveries++;
      return { events: [], hasMore: false };
    },
    acknowledge: async () => {},
    project: async () => {
      throw Error('No synthetic jobs require chain reads');
    },
    canonicalCheckpoint: async () => {
      throw Error('No synthetic checkpoints');
    },
  });
  return { service, deliveries: () => deliveries };
}

test('Activity sleeps PostgreSQL until durable due time while checking the local relay', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const store = new MemoryJobs();
  const { service, deliveries } = fixture(store);
  const stop = service.start();
  try {
    await flush();
    assert.equal(store.takes, 1, 'restart immediately discovers unfinished durable jobs');
    for (let i = 0; i < 20; i++) {
      t.mock.timers.tick(30_000);
      await flush();
    }
    assert.ok(deliveries() >= 20, 'missed events still have bounded local recovery');
    assert.equal(store.takes, 1, 'empty relay responses do not poll the database');
    assert.equal(store.schedules, 1);
    t.mock.timers.tick(300_000);
    await flush();
    assert.equal(store.takes, 2, 'persisted deadline wakes the queue');
  } finally {
    stop();
  }
  const before = store.takes;
  t.mock.timers.tick(900_000);
  await flush();
  assert.equal(store.takes, before, 'shutdown cancels queued timers');
});

test('a local wake during due-time lookup is not lost', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const store = new MemoryJobs();
  let release;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  store.nextDueDelay = async () => {
    store.schedules++;
    if (store.schedules === 1) await waiting;
    return 900_000;
  };
  const { service } = fixture(store);
  const stop = service.start();
  try {
    await flush();
    assert.equal(store.schedules, 1);
    await service.hint('synthetic-owner', 'synthetic-transaction');
    release();
    await flush();
    t.mock.timers.tick(25);
    await flush();
    assert.equal(store.takes, 2, 'new work interrupts the previously selected long idle wait');
  } finally {
    release();
    stop();
  }
});

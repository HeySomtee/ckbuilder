import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from './src/lib/http.ts';
import { waitForReview, waitForReviewRetry } from './src/features/direct/review-wait.ts';

test('only explicitly acknowledged unsigned waits retry, preserving request identity', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const controller = new AbortController(),
    positions = [];
  let attempts = 0;
  const result = waitForReview(
    async () => {
      if (++attempts < 3) throw new ApiError('waiting', 429, { position: 3 - attempts });
      return 'review';
    },
    { signal: controller.signal, beforeAttempt() {}, onWait: (p) => positions.push(p) },
  );
  for (let n = 0; n < 4; n++) await Promise.resolve();
  t.mock.timers.tick(8000);
  for (let n = 0; n < 4; n++) await Promise.resolve();
  t.mock.timers.tick(8000);
  assert.equal(await result, 'review');
  assert.equal(attempts, 3);
  assert.deepEqual(positions, [2, 1]);
});

test('ordinary errors and uncertain network outcomes are never retried automatically', async () => {
  for (const error of [
    new ApiError('invalid', 409),
    new ApiError('rate limit', 429),
    new Error('network timeout'),
  ]) {
    let attempts = 0;
    await assert.rejects(
      waitForReview(
        async () => {
          attempts++;
          throw error;
        },
        {
          signal: new AbortController().signal,
          beforeAttempt() {},
          onWait() {
            assert.fail('not a safe wait');
          },
        },
      ),
      (e) => e === error,
    );
    assert.equal(attempts, 1);
  }
});

test('leaving during preflight never requests a new offer', async () => {
  const controller = new AbortController();
  await assert.rejects(
    waitForReview(async () => assert.fail('cancelled before request'), {
      signal: controller.signal,
      async beforeAttempt() {
        controller.abort();
      },
      onWait() {},
    }),
    { name: 'AbortError' },
  );
});

test('leaving clears retry timer and stops polling', async () => {
  const controller = new AbortController();
  const wait = waitForReviewRetry(controller.signal);
  controller.abort();
  await assert.rejects(wait, { name: 'AbortError' });
});

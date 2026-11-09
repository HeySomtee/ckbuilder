import { ApiError } from '../../lib/http.ts';
import type { BatchWaiting } from '../../../../shared/batch-wire';

export async function waitForReviewRetry(signal: AbortSignal, delay = 8_000): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, delay);
    signal.addEventListener('abort', abort, { once: true });
  });
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        document.removeEventListener('visibilitychange', visible);
        signal.removeEventListener('abort', abort);
      };
      const visible = () => {
        if (document.visibilityState !== 'hidden') {
          cleanup();
          resolve();
        }
      };
      const abort = () => {
        cleanup();
        reject(signal.reason);
      };
      signal.addEventListener('abort', abort, { once: true });
      document.addEventListener('visibilitychange', visible);
      if (signal.aborted) abort();
      else visible();
    });
  }
}

/** Retry only a server-acknowledged unsigned wait. Never replay a payment/signature. */
export async function waitForReview<T>(
  attempt: () => Promise<T>,
  waiting?: BatchWaiting,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    waiting?.signal.throwIfAborted();
    await waiting?.beforeAttempt();
    waiting?.signal.throwIfAborted();
    try {
      return await attempt();
    } catch (error) {
      if (!waiting || !(error instanceof ApiError) || !error.reviewWait) throw error;
      waiting.signal.throwIfAborted();
      if (Date.now() - started >= 10 * 60_000)
        throw Error(
          'Payments are taking longer than usual. Your picks are saved. Try reviewing again shortly.',
        );
      waiting.onWait(error.reviewWait.position);
      await waitForReviewRetry(waiting.signal);
    }
  }
}

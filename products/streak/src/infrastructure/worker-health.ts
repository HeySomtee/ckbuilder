import { timingSafeEqual } from 'node:crypto';

type WorkerRole = 'rewards' | 'testRewards';
interface WorkerRequest {
  type: 'streak.worker.health' | 'streak.worker.wake';
  id: string;
  token: string;
}

function configuration() {
  const endpoint = process.env.STREAK_WORKER_HEALTH_URL;
  const secret = process.env.STREAK_WORKER_HEALTH_SECRET;
  if (!endpoint && !secret) return null;
  if (!endpoint || !secret || !/^[0-9a-f]{64}$/.test(secret))
    throw Error('Worker health configuration is incomplete');
  const url = new URL(endpoint);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw Error('Worker health requires an explicit loopback HTTP origin');
  return { endpoint: url.origin, secret };
}

/** Distinguish an unconfigured local process from a configured but unavailable worker. */
export function workerHealthConfigured(): boolean {
  return !!(process.env.STREAK_WORKER_HEALTH_URL || process.env.STREAK_WORKER_HEALTH_SECRET);
}

async function request(role: WorkerRole, action: 'health' | 'wake'): Promise<boolean> {
  try {
    const config = configuration();
    if (!config) return false;
    const response = await fetch(`${config.endpoint}/workers/${role}/${action}`, {
      method: action === 'wake' ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${config.secret}` },
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return false;
    }
    const text = await response.text();
    if (text.length > 128) return false;
    const result: unknown = JSON.parse(text);
    return !!result && typeof result === 'object' && 'ready' in result && result.ready === true;
  } catch {
    return false;
  }
}

/** Each check asks the current child to verify readiness; cached process IDs are insufficient. */
export function workerHealthAvailable(role: WorkerRole = 'rewards'): Promise<boolean> {
  return request(role, 'health');
}

/** A wake is only a latency hint. The persisted work and bounded fallback scan remain authoritative. */
export async function notifyRewardsWorker(testing = false): Promise<void> {
  await request(testing ? 'testRewards' : 'rewards', 'wake');
}

/** The supervisor owns this IPC channel. Never expose worker signing details in its response. */
export function installWorkerHealthProbe(check: () => Promise<boolean>, wake?: () => void) {
  const config = configuration();
  if (!config) return () => {};
  if (!process.send || !process.connected) throw Error('Worker health requires supervisor IPC');
  let closed = false;
  let checking: Promise<boolean> | undefined;
  const waiting = new Map<string, { respond: (ready: boolean) => void; timer: NodeJS.Timeout }>();
  const onMessage = (message: unknown) => {
    if (!message || typeof message !== 'object') return;
    const value = message as Partial<WorkerRequest>;
    if (
      closed ||
      (value.type !== 'streak.worker.health' && value.type !== 'streak.worker.wake') ||
      typeof value.id !== 'string' ||
      !/^[0-9a-f-]{36}$/.test(value.id) ||
      typeof value.token !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value.token) ||
      !timingSafeEqual(Buffer.from(value.token), Buffer.from(config.secret))
    )
      return;
    const respond = (ready: boolean) => {
      if (closed || !process.connected) return;
      process.send?.({ type: 'streak.worker.response', id: value.id, ready }, () => {});
    };
    if (value.type === 'streak.worker.wake') {
      try {
        wake?.();
        respond(!!wake);
      } catch {
        respond(false);
      }
      return;
    }
    if (waiting.has(value.id)) return;
    if (waiting.size >= 64) return respond(false);
    const id = value.id;
    const timer = setTimeout(() => {
      waiting.delete(id);
      respond(false);
    }, 3000);
    timer.unref();
    waiting.set(id, { respond, timer });
    if (!checking) {
      checking = Promise.resolve()
        .then(check)
        .catch(() => false);
      void checking.then((ready) => {
        checking = undefined;
        for (const pending of waiting.values()) {
          clearTimeout(pending.timer);
          pending.respond(ready);
        }
        waiting.clear();
      });
    }
  };
  process.on('message', onMessage);
  return () => {
    closed = true;
    process.off('message', onMessage);
    for (const pending of waiting.values()) clearTimeout(pending.timer);
    waiting.clear();
  };
}

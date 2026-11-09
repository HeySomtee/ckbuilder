export class ApiError extends Error {
  readonly status: number;
  readonly reviewWait?: { position: number };
  constructor(message: string, status: number, reviewWait?: { position: number }) {
    super(message);
    this.status = status;
    this.reviewWait = reviewWait;
  }
}

export async function request(
  path: string,
  signal?: AbortSignal,
  body?: unknown,
  timeoutMs: 15_000 | 60_000 = 15_000,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      isRecord(data) && typeof data.error === 'string'
        ? data.error
        : 'The request failed. Please try again.',
      response.status,
      response.status === 429 &&
        path === '/direct/batch/offer' &&
        isRecord(data) &&
        isRecord(data.reviewWait) &&
        typeof data.reviewWait.position === 'number' &&
        Number.isInteger(data.reviewWait.position) &&
        data.reviewWait.position >= 0 &&
        data.reviewWait.position <= 128
        ? { position: data.reviewWait.position }
        : undefined,
    );
  return data;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function text(value: unknown): string {
  if (typeof value !== 'string')
    throw new Error('The server returned incomplete data. Please refresh.');
  return value;
}

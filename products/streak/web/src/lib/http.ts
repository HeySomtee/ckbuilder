export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
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

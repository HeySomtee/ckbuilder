/** Shared in-flight requests, with explicit bounds on retained provider payloads. */
export class BoundedMemo<T> {
  private readonly values = new Map<string, { value: T; expiresAt: number; bytes: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private bytes = 0;
  constructor(
    private readonly maxEntries = 128,
    private readonly maxBytes = 4 * 1024 * 1024,
    private readonly now: () => number = Date.now,
    private readonly maxPending = 32,
    private readonly staleRetentionMs = 0,
  ) {}
  private prune(): void {
    for (const [key, row] of this.values)
      if (row.expiresAt + this.staleRetentionMs <= this.now()) this.remove(key);
  }
  private remove(key: string): void {
    const old = this.values.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.values.delete(key);
    }
  }
  isFresh(key: string, now = this.now()): boolean {
    return (this.values.get(key)?.expiresAt ?? 0) > now;
  }
  peek(key: string): T | undefined {
    this.prune();
    return this.values.get(key)?.value;
  }
  async get(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    this.prune();
    const old = this.values.get(key);
    if (old && old.expiresAt > this.now()) {
      this.values.delete(key);
      this.values.set(key, old);
      return old.value;
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;
    if (this.inFlight.size >= this.maxPending) throw Error('Provider cache is busy; retry later');
    // Cache only completed
    // payloads that fit the budget; an oversized response is still returned.
    const request = Promise.resolve()
      .then(load)
      .then((value) => {
        this.prune();
        const bytes = Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
        if (bytes <= this.maxBytes && this.maxEntries > 0 && ttlMs > 0) {
          this.remove(key);
          while (this.values.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
            const first = this.values.keys().next().value;
            if (first === undefined) break;
            this.remove(first);
          }
          this.values.set(key, { value, bytes, expiresAt: this.now() + ttlMs });
          this.bytes += bytes;
        }
        return value;
      })
      .finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }
}

/** Bound active I/O and waiting callers together, including callers for different endpoints. */
export class BoundedRequests {
  private active = 0;
  private readonly waiting: Array<{ start: () => void; fail: () => void }> = [];
  constructor(
    private readonly maximum = 4,
    private readonly maximumQueued = 32,
    private readonly waitMs = 12_000,
  ) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const item = {
        start: () => {
          clearTimeout(timer);
          this.active++;
          void Promise.resolve()
            .then(work)
            .then(resolve, reject)
            .finally(() => {
              this.active--;
              this.waiting.shift()?.start();
            });
        },
        fail: () => {
          const index = this.waiting.indexOf(item);
          if (index >= 0) this.waiting.splice(index, 1);
          reject(Error('Provider request queue timed out; retry later'));
        },
      };
      if (this.active < this.maximum) return item.start();
      if (this.waiting.length >= this.maximumQueued)
        return reject(Error('Provider requests are busy; retry later'));
      this.waiting.push(item);
      timer = setTimeout(item.fail, this.waitMs);
      timer.unref();
    });
  }
}

/** Limit decompressed bytes before JSON parsing, including chunked or misleading Content-Length. */
export async function boundedJson(response: Response, maximumBytes: number): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > maximumBytes) {
    await response.body?.cancel();
    throw Error('Provider response exceeds its byte limit');
  }
  if (!response.body) throw Error('Provider response has no JSON body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maximumBytes) throw Error('Provider response exceeds its byte limit');
      chunks.push(next.value);
    }
    return JSON.parse(Buffer.concat(chunks, bytes).toString('utf8'));
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      /* Preserve the original read/parse failure. */
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

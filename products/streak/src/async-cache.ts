/** Small, bounded cache for optional remote data. Refreshes never queue twice. */
export class AsyncSnapshotCache<K, V> {
  private entries = new Map<K, { value?: V; at: number; retryAt: number; pending?: Promise<V> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly retryMs = 5_000,
  ) {}

  peek(key: K): V | undefined {
    return this.entries.get(key)?.value;
  }

  isFresh(key: K): boolean {
    const entry = this.entries.get(key);
    return entry?.value !== undefined && Date.now() - entry.at < this.ttlMs;
  }

  /** Return the last successful value immediately while refreshing if needed. */
  read(key: K, loader: () => Promise<V>): { value: V | undefined; refreshing: boolean } {
    const entry = this.entries.get(key);
    if (!this.isFresh(key) && (!entry || Date.now() >= entry.retryAt)) {
      void this.refresh(key, loader).catch(() => {});
    }
    return { value: this.peek(key), refreshing: !!this.entries.get(key)?.pending };
  }

  refresh(key: K, loader: () => Promise<V>): Promise<V> {
    let entry = this.entries.get(key);
    if (entry?.pending) return entry.pending;
    if (!entry) {
      // In-flight entries are retained so eviction cannot duplicate their work.
      for (const [candidate, old] of this.entries) {
        if (this.entries.size < this.maxEntries) break;
        if (!old.pending) this.entries.delete(candidate);
      }
      entry = { at: 0, retryAt: 0 };
      this.entries.set(key, entry);
    }
    const target = entry;
    target.pending = Promise.resolve().then(loader).then((value) => {
      target.value = value;
      target.at = Date.now();
      target.retryAt = 0;
      return value;
    }, (error) => {
      target.retryAt = Date.now() + this.retryMs;
      throw error;
    }).finally(() => { target.pending = undefined; });
    return target.pending;
  }
}

/** Bound optional RPC waits without abandoning the shared refresh operation. */
export function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Remote service timed out.")), milliseconds);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

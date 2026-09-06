/** Small, dependency-free primitives shared by the browser's data and refresh paths. */
export function createApiClient({
  fetcher = (...args) => fetch(...args),
  now = Date.now,
  ttl = 8_000,
  maxEntries = 80,
} = {}) {
  const cache = new Map();
  const pending = new Map();
  let revision = 0;

  function invalidate() {
    revision += 1;
    cache.clear();
    pending.clear();
  }

  async function request(path, { method = "GET", body, force = false } = {}) {
    const read = method === "GET";
    if (!read) invalidate();
    const cached = cache.get(path);
    if (read && !force && cached && cached.expires > now()) return cached.data;
    if (read && pending.has(path)) return pending.get(path);
    const started = revision;
    const controller = new AbortController();
    // Writes may await a chain transaction. Never abort or retry them automatically.
    const timeout = read ? setTimeout(() => controller.abort(), 15_000) : null;
    const promise = (async () => {
      try {
        const res = await fetcher(`/api${path}`, {
          method,
          headers:
            body === undefined
              ? undefined
              : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          credentials: "same-origin",
          signal: controller.signal,
        });
        let data = {};
        try {
          data = await res.json();
        } catch {
          /* empty response */
        }
        // A successful mutation invalidates responses already in flight, including
        // reads from a previous wallet session. Re-read using the current session.
        if (read && started !== revision) return request(path, { force: true });
        if (!res.ok) {
          const error = new Error(
            data.error || `Request failed (${res.status})`,
          );
          error.code = data.code;
          error.status = res.status;
          throw error;
        }
        if (read) {
          cache.delete(path);
          const lifetime = path === "/status" ? 30_000 : ttl;
          cache.set(path, { data, expires: now() + lifetime });
          while (cache.size > maxEntries)
            cache.delete(cache.keys().next().value);
        } else {
          invalidate();
        }
        return data;
      } catch (error) {
        if (error.name === "AbortError")
          throw new Error("This request took too long. Please try again.");
        throw error;
      } finally {
        if (timeout !== null) clearTimeout(timeout);
      }
    })();
    if (read) pending.set(path, promise);
    try {
      return await promise;
    } finally {
      if (pending.get(path) === promise) pending.delete(path);
    }
  }

  request.invalidate = invalidate;
  return request;
}

/** Completion-based polling: slow requests never overlap and hidden tabs do no work. */
export function createPoller({
  task,
  delay = 12_000,
  isActive = () => true,
  isVisible = () => true,
  schedule = setTimeout,
  cancel = clearTimeout,
}) {
  let timer = null;
  let running = false;
  let stopped = false;
  const arm = () => {
    if (!stopped && isActive() && timer === null) timer = schedule(tick, delay);
  };
  async function tick() {
    timer = null;
    if (stopped || !isActive() || running) return;
    if (!isVisible()) {
      arm();
      return;
    }
    running = true;
    try {
      await task();
    } finally {
      running = false;
      arm();
    }
  }
  arm();
  return {
    stop() {
      stopped = true;
      if (timer !== null) cancel(timer);
      timer = null;
    },
    wake() {
      if (stopped || running || !isActive() || !isVisible()) return;
      if (timer !== null) cancel(timer);
      timer = null;
      return tick();
    },
  };
}

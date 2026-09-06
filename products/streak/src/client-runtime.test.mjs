import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

// Browser .js modules intentionally keep their MIME/extension; the server is CommonJS.
const source = await readFile(new URL("../public/runtime.js", import.meta.url), "utf8");
const { createApiClient, createPoller } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test("concurrent reads share one request; revisits reuse a bounded fresh cache", async () => {
  let requests = 0, clock = 0;
  const api = createApiClient({ now: () => clock, ttl: 100, maxEntries: 2, fetcher: async () => response({ value: ++requests }) });
  assert.deepEqual(await Promise.all([api("/dashboard"), api("/dashboard")]), [{ value: 1 }, { value: 1 }]);
  await api("/dashboard");
  assert.equal(requests, 1);
  clock = 101;
  await api("/dashboard");
  assert.equal(requests, 2);
  await api("/markets");
  await api("/portfolio");
  await api("/dashboard");
  assert.equal(requests, 5, "oldest cached route is evicted");
});

test("writes invalidate cached and in-flight reads without retrying a transaction", async () => {
  const old = deferred();
  let reads = 0, writes = 0;
  const api = createApiClient({ fetcher: async (_, { method }) => {
    if (method === "POST") { writes++; return response({ ok: true }); }
    if (++reads === 1) return old.promise;
    return response({ escrow: 75 });
  } });
  const stale = api("/wallet");
  await api("/markets/one/bet", { method: "POST", body: { amountCkb: 25 } });
  old.resolve(response({ escrow: 100 }));
  assert.deepEqual(await stale, { escrow: 75 });
  assert.equal(writes, 1);
  assert.equal(reads, 2);
});

test("failed reads are not cached and preserve server error details", async () => {
  let requests = 0;
  const api = createApiClient({ fetcher: async () => ++requests === 1
    ? response({ error: "Sign in again", code: "session_expired" }, 401)
    : response({ user: "current" }) });
  await assert.rejects(api("/me"), { message: "Sign in again", status: 401, code: "session_expired" });
  assert.deepEqual(await api("/me"), { user: "current" });
});

test("polling waits for completion, skips hidden tabs, and cannot revive after navigation", async () => {
  const timers = new Map();
  let next = 0, calls = 0, visible = true;
  const work = deferred();
  const poller = createPoller({
    task: async () => { calls++; await work.promise; },
    isVisible: () => visible,
    schedule: (fn) => { timers.set(++next, fn); return next; },
    cancel: (id) => timers.delete(id),
  });
  const runTimer = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); return fn(); };
  visible = false;
  await runTimer();
  assert.equal(calls, 0);
  visible = true;
  const running = runTimer();
  assert.equal(calls, 1);
  assert.equal(timers.size, 0, "no second poll is scheduled during a slow request");
  await poller.wake();
  assert.equal(calls, 1);
  poller.stop();
  work.resolve();
  await running;
  assert.equal(timers.size, 0, "leaving the route prevents a completed poll from rearming");
});

const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
function clientFunction(name, nextFunction, context) {
  const start = app.indexOf(`async function ${name}(`);
  const end = app.indexOf(`function ${nextFunction}(`, start);
  assert.ok(start >= 0 && end > start);
  return runInNewContext(`${app.slice(start, end)}\n${name}`, context);
}

test("a slow previous market filter cannot overwrite the most recent selection", async () => {
  const first = deferred(), second = deferred();
  let writes = 0, html = "";
  const body = {
    setAttribute() {}, removeAttribute() {}, querySelectorAll: () => [],
    get innerHTML() { return html; },
    set innerHTML(value) { writes++; html = value; },
  };
  const view = { querySelector: () => body };
  const stringify = (value) => String(value ?? "");
  const loadMarkets = clientFunction("loadMarkets", "marketStatusChip", {
    api: (path) => path.includes("closed") ? first.promise : second.promise,
    isActiveView: (node) => node === view, URLSearchParams,
    esc: stringify, fmtPct: stringify, fmtOdds: stringify, fmtCkb: stringify,
    teamMark: () => "", competitionName: () => "Football", marketStatusChip: () => "",
    timeUntil: () => "", fmtDateTime: () => "", sparkSvg: () => "",
    prepareRouteActions: () => {},
  });
  const oldRequest = loadMarkets("closed", undefined, view);
  const latestRequest = loadMarkets("open", undefined, view);
  second.resolve({ markets: [{ id: "latest", match: { home: { code: "LATEST" }, away: { code: "AWAY" } }, prices: {} }] });
  await latestRequest;
  assert.match(html, /LATEST/);
  first.resolve({ markets: [] });
  await oldRequest;
  assert.match(html, /LATEST/, "late closed-filter result must not replace the open markets");
  await loadMarkets("open", undefined, view);
  assert.equal(writes, 1, "identical refreshed data keeps the current rows and handlers");
});

test("live market updates retain the stake field, selected side, and bound market object", async () => {
  const market = { id: "one", status: "open", match: { status: "scheduled" }, prices: { home: 0.5 }, feed: [] };
  const input = { value: "150", selectionStart: 3 };
  const selectedSide = { className: "outcome selected", dataset: { pick: "home" } };
  let recomputes = 0;
  const view = {
    market, marketSignature: JSON.stringify(market),
    querySelector: (selector) => selector === "#bet-amt" ? input : selector === ".selected" ? selectedSide : null,
    refreshBetSummary: () => { recomputes++; },
  };
  const route = { view };
  const stringify = (value) => String(value ?? "");
  const refresh = clientFunction("refreshMarketDetail", "poolBreakdownHtml", {
    api: async () => ({ market: { ...market, prices: { home: 0.6 } } }),
    isActiveView: (node) => node === view, state: { route },
    fmtCkb: stringify, fmtPct: stringify, fmtOdds: stringify,
    timeUntil: () => "", fmtDateTime: () => "", marketStatusChip: () => "",
    chartSvg: () => "", poolBreakdownHtml: () => "",
    renderMarketDetail: () => assert.fail("an open market update must not replace the betting form"),
  });
  await refresh(route);
  assert.equal(view.market, market, "existing handlers keep their market reference");
  assert.equal(market.prices.home, 0.6);
  assert.equal(view.querySelector("#bet-amt"), input);
  assert.equal(input.value, "150");
  assert.equal(input.selectionStart, 3);
  assert.equal(selectedSide.className, "outcome selected");
  assert.equal(recomputes, 1, "the existing bet estimate reflects the latest pool");
});

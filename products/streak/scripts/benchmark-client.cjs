/*
 * Reproducible isolated client comparison. Never starts the application server,
 * loads .env, uses a database, or connects to a wallet/provider.
 *
 * Run from products/streak:
 *   node scripts/benchmark-client.cjs
 * Optional: --samples 30 --baseline 00d4b8f --validate (smoke check, no result file)
 * Chromium: STREAK_BROWSER_PATH or the installed Windows Chrome shown below.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { gzipSync } = require("node:zlib");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const argument = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const sampleCount = Number(argument("--samples", "30"));
const baseline = argument("--baseline", "00d4b8f");
const validateOnly = args.includes("--validate");
const repository = path.resolve(__dirname, "../../..");
const publicPath = path.resolve(__dirname, "../public");
const outputDirectory = path.join(repository, "reports/assets/week-16");
const apiDelayMs = 75;
const injectedSdkDelayMs = 750;
const warmupTrials = 2;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const round = (n) => Math.round(n * 100) / 100;

function loadAssets(variant) {
  const assets = {};
  for (const filename of ["index.html", "app.js", "styles.css", ...(variant === "after" ? ["runtime.js", "mark.svg"] : [])]) {
    assets[filename] = variant === "before"
      ? execFileSync("git", ["show", `${baseline}:products/streak/public/${filename}`], { cwd: repository, maxBuffer: 16 * 1024 * 1024 })
      : fs.readFileSync(path.join(publicPath, filename));
  }
  return assets;
}

function fixtures() {
  const competition = { id: "39", name: "Premier League", country: "England" };
  const teams = [["Arsenal", "Chelsea", "ARS", "CHE"], ["Liverpool", "Everton", "LIV", "EVE"], ["Manchester City", "Tottenham", "MCI", "TOT"], ["Brighton", "Newcastle", "BHA", "NEW"]];
  const user = {
    id: "synthetic-user", username: "alex", hasUsername: true,
    walletAddress: "ckt1-benchmark-synthetic-address", escrowCkb: "2500", rank: 2, winRate: 64,
    streak: { current: 3, best: 9, status: "active", lastPickDate: "2020-01-01" },
    stats: { totalBets: 14, wonBets: 9, lostBets: 5, renews: 0, netPnlShannons: "42000000000", turnoverShannons: "200000000000" },
  };
  const markets = Array.from({ length: 24 }, (_, index) => {
    const [home, away, homeCode, awayCode] = teams[index % teams.length];
    const kickoff = new Date(Date.UTC(2030, 8, 6, 12 + index)).toISOString();
    const match = {
      id: `fixture-${index}`, label: `${home} vs ${away}`, date: kickoff.slice(0, 10), stage: `Matchweek ${8 + Math.floor(index / 4)}`,
      competition, kickoff, status: "scheduled",
      home: { name: home, code: homeCode, flag: homeCode }, away: { name: away, code: awayCode, flag: awayCode },
    };
    const history = Array.from({ length: 60 }, (_, tick) => ({ t: Date.UTC(2030, 8, 5, 0, tick), p: { home: 0.4 + tick / 1000, draw: 0.3 - tick / 2000, away: 0.3 - tick / 2000 } }));
    return {
      id: `m-fixture-${index}`, match, status: "open", closesAt: kickoff, createdAt: "2030-09-05T00:00:00.000Z",
      prices: { home: 0.46, draw: 0.27, away: 0.27 }, pools: { home: "46000000000", draw: "27000000000", away: "27000000000" },
      totalPoolCkb: "1000", totalBets: 20 + index, uniqueBettors: 12,
      feeBps: { protocol: 200, creator: 100 }, creator: null, history, spark: history.slice(-16), myPositions: [],
      feed: [{ placedAt: "2030-09-05T00:45:00.000Z", outcome: "home", user: "mara", amountCkb: "40", priceAtBet: 0.45 }],
    };
  });
  const leaderboard = ["touchline", "alex", "mara", "thegaffer", "sundayclub"].map((username, index) => ({
    rank: index + 1, username, isMe: username === "alex", current: 7 - index, best: 12 - index,
    netPnlCkb: String(510 - index * 90), turnoverCkb: "2000", winRate: 64,
  }));
  const live = { enabled: true, simulated: true, base: "synthetic-provider", league: "Premier League", matchCount: 24, liveMatches: 0, finishedMatches: 0, competitions: [competition] };
  return {
    user, markets, live,
    dashboard: {
      user, live, headline: markets[0], walletBalanceCkb: "750", balanceRefreshing: false,
      counts: { openMarkets: 24, closedMarkets: 0, resolvedMarkets: 0, totalPoolCkb: "24000" },
      leaderboardTop: leaderboard, constants: { renewFeeCkb: 63 },
      recentBets: markets.slice(0, 4).map((market, i) => ({ matchLabel: market.match.label, outcome: ["home", "draw", "away"][i % 3], amountCkb: String(40 + i * 20), user: leaderboard[i].username })),
    },
    insights: { frozen: false, fetchedAt: "2030-09-05T00:00:00.000Z", crowd: { totalBets: 20, probabilities: { home: 0.46, draw: 0.27, away: 0.27 } }, machine: null, bookmakers: null, headToHead: [], warnings: [] },
  };
}

async function createFixtureServer(assets, data) {
  const reads = new Map();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      assert.equal(request.method, "GET", "benchmark must never submit an action");
      const authenticated = /(?:^|;\s*)bench_auth=1(?:;|$)/.test(request.headers.cookie || "");
      const client = /bench_id=([^;]+)/.exec(request.headers.cookie || "")?.[1] || "guest";
      const key = `${client}:${url.pathname}`;
      const count = (reads.get(key) || 0) + 1;
      reads.set(key, count);
      let body, status = 200;
      if (!authenticated && url.pathname === "/api/me") { status = 401; body = { error: "Synthetic guest session" }; }
      else if (url.pathname === "/api/me") body = { user: data.user };
      else if (url.pathname === "/api/dashboard") body = data.dashboard;
      else if (url.pathname === "/api/status") body = { live: data.live };
      else if (url.pathname === "/api/markets") body = { markets: data.markets };
      else if (url.pathname.endsWith("/insights")) body = { insights: data.insights, refreshing: false };
      else if (url.pathname.startsWith("/api/markets/")) {
        const market = data.markets.find((entry) => entry.id === url.pathname.split("/").at(-1));
        if (!market) { status = 404; body = { error: "Unknown fixture" }; }
        else body = { market: { ...market, totalBets: market.totalBets + count - 1, prices: { ...market.prices, home: count > 1 ? 0.47 : market.prices.home } } };
      } else { status = 404; body = { error: `Unmocked API ${url.pathname}` }; }
      await pause(apiDelayMs);
      response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify(body));
      return;
    }
    const filename = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const content = assets[filename];
    if (!content) { response.writeHead(404); response.end(); return; }
    const type = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[path.extname(filename)] || "application/octet-stream";
    response.writeHead(200, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store" });
    response.end(content);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

let nextClientId = 0;
async function openPage(browser, base, { authenticated, sdkDelayMs, initialSelector }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  await context.addCookies([
    { name: "bench_auth", value: authenticated ? "1" : "0", url: base },
    { name: "bench_id", value: String(++nextClientId), url: base },
  ]);
  const requests = [], errors = [], external = [];
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(base + "/")) return route.continue();
    external.push(url);
    if (url.startsWith("https://esm.sh/@ckb-ccc/connector@1")) {
      await pause(sdkDelayMs);
      // This deliberately empty SDK stand-in supports browsing only. No wallet
      // actions run. The 750ms scenario is injected latency, not a CDN claim.
      return route.fulfill({ contentType: "application/javascript", headers: { "Access-Control-Allow-Origin": "*" }, body: "export const ccc = {};" });
    }
    if (url.startsWith("https://fonts.googleapis.com/")) return route.fulfill({ contentType: "text/css", body: "/* External font requests disabled in isolated benchmark. */" });
    return route.abort();
  });
  await context.addInitScript(({ selector }) => {
    localStorage.setItem("streak_onboarded", "1");
    window.__benchMeasurements = {};
    window.__benchWatch = (name, target, start) => new Promise((resolve, reject) => {
      let complete = false;
      const observer = new MutationObserver(check);
      const timeout = setTimeout(() => { observer.disconnect(); reject(new Error(`Readiness timeout: ${name}`)); }, 8000);
      function check() {
        if (complete || !document.querySelector(target)) return;
        complete = true;
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          clearTimeout(timeout);
          const elapsed = performance.now() - start;
          window.__benchMeasurements[name] = elapsed;
          resolve(elapsed);
        }));
      }
      observer.observe(document, { childList: true, subtree: true, attributes: true });
      check();
    });
    window.__benchNavigate = (route, target) => {
      const result = window.__benchWatch("route", target, performance.now());
      const link = document.querySelector(`#rail a[data-route="${route}"]`);
      if (!link) throw new Error(`Missing navigation link: ${route}`);
      // Programmatic click intentionally excludes hover prefetch and automation
      // mouse delays, measuring the application's own click-to-painted-route.
      link.click();
      return result;
    };
    window.__benchWatch("startup", selector, 0).catch((error) => { window.__benchFailure = error.message; });
  }, { selector: initialSelector });
  const page = await context.newPage();
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  return { context, page, requests, external, errors };
}

const countApi = (requests, base) => requests.filter((url) => url.startsWith(base + "/api/")).length;
async function runTrial(browser, fixture, { authenticated, sdkDelayMs, captureScreenshot }) {
  const opened = await openPage(browser, fixture.base, {
    authenticated, sdkDelayMs, initialSelector: authenticated ? "#view .kpis" : "#connect-main",
  });
  const { context, page, requests, external, errors } = opened;
  try {
    await page.goto(fixture.base + (authenticated ? "/#/dashboard" : "/"), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.__benchMeasurements?.startup !== undefined || window.__benchFailure, null, { timeout: 10000 });
    const startup = await page.evaluate(() => ({
      ms: window.__benchMeasurements.startup,
      failure: window.__benchFailure,
      fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
    }));
    assert.equal(startup.failure, undefined);
    const result = { startupMs: round(startup.ms), firstContentfulPaintMs: startup.fcpMs === null ? null : round(startup.fcpMs), startupApiRequests: countApi(requests, fixture.base), startupExternalRequests: external.length };
    if (authenticated) {
      for (const [metric, route, selector] of [
        ["firstMarkets", "markets", "#mkt-body tr.mkt-row"],
        ["dashboardRevisit", "dashboard", "#view .kpis"],
        ["marketsRevisit", "markets", "#mkt-body tr.mkt-row"],
      ]) {
        const before = countApi(requests, fixture.base);
        result[metric] = {
          ms: round(await page.evaluate(({ route, selector }) => window.__benchNavigate(route, selector), { route, selector })),
          apiRequests: countApi(requests, fixture.base) - before,
        };
      }
      if (captureScreenshot) {
        await page.evaluate(() => window.__benchNavigate("dashboard", "#view .kpis"));
        await page.screenshot({ path: captureScreenshot, fullPage: true });
      }
    }
    assert.deepEqual(errors, [], "No uncaught application errors during trial");
    return result;
  } finally { await context.close(); }
}

async function observeRealPoll(browser, fixture, route) {
  const opened = await openPage(browser, fixture.base, { authenticated: true, sdkDelayMs: 0, initialSelector: route === "market" ? "#bet-amt" : "#view .kpis" });
  const { context, page, requests, errors } = opened;
  try {
    await page.goto(fixture.base + (route === "market" ? "/#/market/m-fixture-0" : "/#/dashboard"));
    await page.waitForFunction(() => window.__benchMeasurements?.startup !== undefined);
    if (route === "market") {
      await page.locator("#bet-amt").fill("150");
      await page.locator('.bet-panel [data-pick="home"]').click();
      await page.locator("#bet-amt").focus();
    }
    // Let the initial, non-blocking insights request finish before counting a poll.
    await pause(200);
    await page.evaluate(() => {
      window.__originalBetInput = document.querySelector("#bet-amt");
      window.__statusMutations = 0;
      const bar = document.querySelector("#status-bar");
      if (bar) new MutationObserver((records) => { window.__statusMutations += records.filter((record) => record.type === "childList" && record.target === bar).length; }).observe(bar, { childList: true });
    });
    const start = requests.length;
    const wallStart = Date.now();
    // Real browser time: no overrides to Date, performance, setTimeout, or setInterval.
    await pause(13_000);
    const observed = await page.evaluate(() => ({
      stake: document.querySelector("#bet-amt")?.value ?? null,
      sameInputNode: !!window.__originalBetInput && window.__originalBetInput === document.querySelector("#bet-amt"),
      selectedSide: document.querySelector(".bet-panel .outcome.selected")?.dataset.pick ?? null,
      statusBarChildReplacements: window.__statusMutations,
    }));
    const apiPaths = requests.slice(start).filter((url) => url.startsWith(fixture.base + "/api/")).map((url) => new URL(url).pathname);
    assert.ok(apiPaths.length > 0, "A real live poll must run");
    assert.deepEqual(errors, []);
    return { observationMs: Date.now() - wallStart, apiRequests: apiPaths.length, apiPaths, ...observed };
  } finally { await context.close(); }
}

function statistics(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return { n: samples.length, median: round(sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2), p95: round(sorted[Math.ceil(sorted.length * 0.95) - 1]), min: round(sorted[0]), max: round(sorted.at(-1)) };
}
function comparison(before, after, unit) {
  const b = statistics(before), a = statistics(after);
  return { unit, before: b, after: a, medianReductionPercent: b.median ? round((b.median - a.median) / b.median * 100) : null, p95ReductionPercent: b.p95 ? round((b.p95 - a.p95) / b.p95 * 100) : null };
}
function assetReport(assets) {
  const files = Object.fromEntries(Object.entries(assets).map(([filename, buffer]) => [filename, { bytes: buffer.length, gzipBytesLevel9: gzipSync(buffer, { level: 9 }).length, sha256: hash(buffer) }]));
  return { files, totalBytes: Object.values(files).reduce((total, file) => total + file.bytes, 0), totalGzipBytesLevel9: Object.values(files).reduce((total, file) => total + file.gzipBytesLevel9, 0) };
}

async function main() {
  assert.ok(Number.isInteger(sampleCount) && sampleCount >= 1 && sampleCount <= 200);
  const data = fixtures();
  const assets = { before: loadAssets("before"), after: loadAssets("after") };
  const servers = { before: await createFixtureServer(assets.before, data), after: await createFixtureServer(assets.after, data) };
  const installedChrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const executablePath = process.env.STREAK_BROWSER_PATH || (fs.existsSync(installedChrome) ? installedChrome : undefined);
  let browser;
  try {
    browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true, args: ["--disable-background-networking", "--disable-component-update", "--disable-domain-reliability", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1"] });
  } catch (error) {
    await Promise.all(Object.values(servers).map(({ server }) => new Promise((resolve) => server.close(resolve))));
    throw error;
  }
  const startedAt = new Date().toISOString();
  try {
    if (validateOnly) {
      for (const variant of ["before", "after"]) for (const authenticated of [true, false]) {
        await runTrial(browser, servers[variant], { authenticated, sdkDelayMs: 0 });
      }
      console.log("Fixture harness validated against both versions; no benchmark result written.");
      return;
    }
    fs.mkdirSync(outputDirectory, { recursive: true });
    const raw = { normal: [], delayedSdk: [] };
    for (const phase of ["normal", "delayedSdk"]) {
      for (let trial = -warmupTrials; trial < sampleCount; trial++) {
        const row = { trial: trial + 1, order: trial % 2 === 0 ? ["before", "after"] : ["after", "before"] };
        for (const variant of row.order) {
          row[variant] = {};
          if (phase === "normal") row[variant].authenticated = await runTrial(browser, servers[variant], {
            authenticated: true, sdkDelayMs: 0,
            captureScreenshot: trial === 0 ? path.join(outputDirectory, variant === "before" ? "before-overview-desktop.png" : "after-overview-benchmark-desktop.png") : undefined,
          });
          row[variant].guest = await runTrial(browser, servers[variant], { authenticated: false, sdkDelayMs: phase === "delayedSdk" ? injectedSdkDelayMs : 0 });
        }
        if (trial >= 0) raw[phase].push(row);
        if (trial >= 0 && (trial + 1) % 5 === 0) console.log(`${phase}: ${trial + 1}/${sampleCount} paired trials`);
      }
    }
    const summary = {};
    const add = (key, rows, getter, unit = "ms") => { summary[key] = comparison(rows.map((row) => getter(row.before)), rows.map((row) => getter(row.after)), unit); };
    add("authenticatedColdStart", raw.normal, (row) => row.authenticated.startupMs);
    add("guestColdStart", raw.normal, (row) => row.guest.startupMs);
    add("guestColdStartWithInjected750msSdkDelay", raw.delayedSdk, (row) => row.guest.startupMs);
    for (const key of ["firstMarkets", "dashboardRevisit", "marketsRevisit"]) {
      add(key, raw.normal, (row) => row.authenticated[key].ms);
      add(`${key}ApiRequests`, raw.normal, (row) => row.authenticated[key].apiRequests, "requests");
    }
    add("initialGuestExternalRequests", raw.normal, (row) => row.guest.startupExternalRequests, "requests");
    add("initialAuthenticatedApiRequests", raw.normal, (row) => row.authenticated.startupApiRequests, "requests");
    const polls = {};
    for (const variant of ["before", "after"]) {
      polls[variant] = {};
      for (const route of ["dashboard", "market"]) {
        console.log(`Observing one real 12-second ${variant} ${route} poll...`);
        polls[variant][route] = await observeRealPoll(browser, servers[variant], route);
      }
    }
    const report = {
      title: "Streak client before/after benchmark", startedAt, completedAt: new Date().toISOString(),
      baselineCommit: execFileSync("git", ["rev-parse", baseline], { cwd: repository, encoding: "utf8" }).trim(),
      currentSnapshot: "working tree; exact asset SHA-256 values below",
      environment: { platform: process.platform, os: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, node: process.version, browser: browser.version(), executablePath: executablePath || chromium.executablePath(), viewport: "1440x1100", headless: true },
      methodology: {
        samplesPerVersionPerLatencyScenario: sampleCount, discardedWarmupTrialsPerPhase: warmupTrials, variantOrder: "alternating within every paired trial",
        apiDelayMs, injectedSdkDelayMs, fixtureMarkets: data.markets.length, fixturePriceHistoryPointsPerMarket: 60,
        startupDefinition: "Navigation time origin to two animation frames after the usable landing button or populated dashboard KPIs exist. Includes local HTML/CSS/JS loading and fixed-delay synthetic API reads.",
        navigationDefinition: "Programmatic navigation-link click to two animation frames after populated destination content exists. No pointer hover prefetch; revisits happen within the 8-second API cache TTL.",
        p95Definition: "Nearest-rank percentile: sorted sample at ceil(0.95*n), one based.",
        caching: "New isolated browser context for every startup. Local HTTP no-store; Playwright interception disables browser HTTP cache. In-app GET cache remains enabled during route revisits.",
        externalIsolation: "Original CCC import is fulfilled by an empty browsing-only module with 0ms or 750ms injected delay; Google Fonts CSS is fulfilled empty. Other external requests are aborted; external DNS is disabled. No live server, database, account, wallet, RPC or football provider is used.",
        pollDefinition: "One separate 13-second real-time observation for each version/route after initial reads complete; Date and all timers remain unmodified. Market API changes price and bet count on its second read.",
        assetDefinition: "Exact checked-out HTML, CSS, JS and favicon source bytes; per-file gzip level-9 estimates summed. Remote SDK/font graphs are intentionally excluded, so these are not total production transfer sizes.",
        screenshotDefinition: "Before/after overview pair uses the same synthetic fixtures and viewport. Baseline external fonts use system fallbacks because remote font downloads are disabled.",
      },
      summary, polls, assets: { before: assetReport(assets.before), after: assetReport(assets.after) }, rawTrials: raw,
      caveats: [
        "Controlled local results are not production percentiles or measurements of real chain/football latency.",
        "The 750ms SDK scenario proves removal of a blocking dependency; it does not estimate real CDN loading time or remote bundle size.",
        "Fresh API response delay is fixed at 75ms in both versions; cached revisits deliberately test the new short-lived client cache.",
        "First-contentful-paint values are raw diagnostics only: the new boot placeholder and old page content differ.",
        "Polling request counts and form-retention results have one observed cycle per route/version, not 30 statistical samples.",
        "The current interface performs additional accessibility and design work; local asset size or some cold-route timings may increase.",
      ],
    };
    const output = path.join(outputDirectory, "benchmark-client.json");
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ output, summary, polls, assetTotals: { before: report.assets.before.totalGzipBytesLevel9, after: report.assets.after.totalGzipBytesLevel9 } }, null, 2));
  } finally {
    await browser.close();
    await Promise.all(Object.values(servers).map(({ server }) => new Promise((resolve) => server.close(resolve))));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

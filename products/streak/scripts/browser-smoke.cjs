/* Isolated real-server browser checks. Never reads or writes the live database. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "streak-browser-"));
  process.env.STREAK_DB_FILE = path.join(temp, "db.json");
  process.env.MATCH_PROVIDER = "worldcup";
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "SUPABASE_DB_URL",
    "TELEGRAM_BOT_TOKEN",
    "API_SPORTS_KEY",
    "NOTIFY_PROVIDER",
  ])
    process.env[key] = "";
  global.fetch = () => {
    throw Error("External server requests are forbidden in this test");
  };
  const { read, update } = require("../dist/store");
  const chain = require("../dist/chain");
  const { provider } = require("../dist/providers");
  const markets = require("../dist/markets");
  const settlement = require("../dist/settlement");
  const competition = { id: "39", name: "Premier League", country: "England" };
  const fixtures = [
    ["Arsenal", "Chelsea", "ARS", "CHE"],
    ["Liverpool", "Everton", "LIV", "EVE"],
    ["Manchester City", "Tottenham", "MCI", "TOT"],
    ["Brighton", "Newcastle", "BHA", "NEW"],
  ].map(([home, away, hc, ac], i) => ({
    id: `qa-fixture-${i}`,
    date: new Date().toISOString().slice(0, 10),
    stage: "Matchweek 8",
    competition,
    kickoff: new Date(Date.now() + (i + 1) * 3_600_000).toISOString(),
    status: "scheduled",
    home: { code: hc, name: home, flag: hc },
    away: { code: ac, name: away, flag: ac },
  }));
  const users = ["alex", "touchline", "mara", "thegaffer", "sundayclub"].map(
    (username, i) => ({
      id: `qa-user-${i}`,
      username,
      walletIdentity: `qa-${i}`,
      walletType: "test",
      createdAt: new Date().toISOString(),
      wallet: { address: `ckt1-qa-address-${i}` },
      escrowShannons: "250000000000",
      creatorFeesShannons: "0",
      streak: { current: 3 + i, best: 9 + i, status: "active" },
      stats: {
        totalBets: 14,
        wonBets: 9,
        lostBets: 5,
        renews: 0,
        netPnlShannons: String((420 + i * 90) * 1e8),
        turnoverShannons: "200000000000",
      },
    }),
  );
  provider.ownsMatch = () => true;
  provider.status = async () => ({
    enabled: true,
    simulated: true,
    base: "test",
    league: "Premier League",
    matchCount: 4,
    liveMatches: 0,
    finishedMatches: 0,
    competitions: [competition],
  });
  provider.fetchInsights = async () => null;
  chain.cachedBalance = () => ({ value: 75000000000n, refreshing: false });
  chain.getBalanceShannons = async () => 75000000000n;
  await update((db) => {
    db.treasury = { address: "test-treasury", privateKey: "test-only" };
    db.users = users;
    db.matches = fixtures;
    markets.ensureMarketsForMatches(db);
  });
  for (let i = 0; i < users.length; i++)
    await markets.placeBet({
      userId: users[i].id,
      matchId: fixtures[i % 4].id,
      outcome: ["home", "draw", "away"][i % 3],
      amountCkb: 40 + i * 20,
      asStreakPick: false,
    });
  const marketId = await read((db) => db.markets[0].id);
  const receiptId = await update((db) => {
    const match = db.matches[3];
    match.status = "final";
    match.result = "home";
    match.score = { home: 2, away: 1 };
    markets.settleMarkets(db);
    const market = db.markets[3];
    const built = settlement.buildReceiptPayload(db, market, db.treasury);
    db.receipts.push(built.payload);
    market.receipt = {
      txHash: "0x" + "1".repeat(64),
      index: 0,
      payloadHash: built.payloadHash,
      merkleRoot: built.payload.bets.merkleRoot,
      publishedAt: new Date().toISOString(),
    };
    return market.id;
  });
  settlement.verifyReceiptOnChain = async () => ({
    ok: true,
    expectedTreasuryLockArgs: "test-only",
  });
  const { server } = require("../dist/server");
  const { createSession } = require("../dist/auth");
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.STREAK_BROWSER_PATH;
  const cleanup = () => {
    assert.equal(path.dirname(temp), os.tmpdir());
    assert.ok(path.basename(temp).startsWith("streak-browser-"));
    fs.rmSync(temp, { recursive: true, force: true });
  };
  const browser = await chromium
    .launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
    .catch(async (error) => {
      await new Promise((done) => server.close(done));
      cleanup();
      throw error;
    });
  const artifacts = path.resolve(process.env.STREAK_SCREENSHOTS || "data/qa");
  fs.mkdirSync(artifacts, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors = [],
    requests = [];
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Browser error:", e.message);
  });
  page.on("console", (message) => {
    if (message.type() === "error")
      console.error("Browser console:", message.text());
  });
  page.on("request", (r) => requests.push(r.url()));
  await context.route("**/*", (route) =>
    route.request().url().startsWith(base) ? route.continue() : route.abort(),
  );
  await context.addInitScript(() =>
    localStorage.setItem("streak_onboarded", "1"),
  );
  const screenshot = (name) =>
    page.screenshot({
      path: path.join(artifacts, `${name}.png`),
      fullPage: true,
    });
  const noOverflow = async (name) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    if (overflow) {
      await screenshot(name.replaceAll(" ", "-") + "-overflow");
      console.error(
        await page.evaluate(() =>
          [...document.querySelectorAll("#view *")]
            .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
            .slice(0, 15)
            .map((el) => ({
              tag: el.tagName,
              class: el.className,
              width: el.getBoundingClientRect().width,
              text: el.textContent.slice(0, 60),
            })),
        ),
      );
    }
    assert.equal(overflow, false, `${name} overflows horizontally`);
  };
  try {
    await page.goto(base);
    await page.locator(".landing-copy h1").waitFor();
    await screenshot("landing-desktop");
    await noOverflow("landing desktop");
    assert.ok(
      requests.every((url) => url.startsWith(base)),
      "Initial screen must not download external wallet or font code",
    );
    await context.addCookies([
      { name: "streak_sid", value: createSession(users[0].id), url: base },
    ]);
    await page.goto(base + "/#/dashboard");
    await page.reload();
    await page
      .locator(".feature-teams")
      .waitFor({ timeout: 10_000 })
      .catch(async (e) => {
        console.error(await page.locator("body").innerText());
        throw e;
      });
    await screenshot("overview-desktop");
    await noOverflow("overview desktop");
    for (const [route, heading] of [
      ["markets", "Markets"],
      ["fixtures", "Schedule"],
      ["portfolio", "Portfolio"],
      ["wallet", "Account"],
      ["crews", "Crews"],
      ["leaderboard", "Leaderboard"],
      ["receipts", "Settlement Receipts"],
      ["streak", "Streak"],
    ]) {
      await page.locator(`#rail a[data-route="${route}"]`).click();
      await page.waitForFunction(
        (heading) => document.querySelector("#view h1")?.textContent === heading,
        heading,
      );
      assert.ok(
        !(await page.locator("#view").innerText()).includes("COULD NOT LOAD"),
        route,
      );
      await noOverflow(route);
      await screenshot(route + "-desktop");
    }
    await page.goto(base + "/#/market/" + marketId);
    await page.locator("#bet-amt").waitFor();
    await page.locator("#bet-amt").fill("125");
    const side = page.locator(".bet-panel .outcome.home");
    await side.click();
    await page.locator("#bet-amt").focus();
    const inputHandle = await page.locator("#bet-amt").elementHandle();
    const before = requests.length;
    await page.waitForTimeout(13_000);
    assert.equal(
      await page.locator("#bet-amt").inputValue(),
      "125",
      "Polling must preserve the stake",
    );
    assert.equal(
      await inputHandle.evaluate(
        (el) => el === document.querySelector("#bet-amt"),
      ),
      true,
      "Polling must preserve the input node",
    );
    assert.ok(requests.length > before, "A live poll actually ran");
    await screenshot("market-desktop");
    await page.locator("#bet-go").click();
    await page.locator("#bet-confirm").waitFor();
    await screenshot("bet-confirmation");
    await page.locator("[data-close]").last().click();
    assert.equal(
      await read((db) => db.bets.length),
      5,
      "Reviewing a bet must not place it",
    );
    await page.locator("#bet-go").click();
    await page.locator("#bet-confirm").click();
    await page.waitForFunction(
      () => !document.querySelector("#overlay").classList.contains("on"),
    );
    assert.equal(
      await read((db) => db.bets.length),
      6,
      "A confirmed bet is recorded once",
    );
    assert.equal(
      await read((db) => db.users[0].escrowShannons),
      "233500000000",
      "Confirmed stake debits the isolated test balance",
    );
    // A slow abandoned route must never replace the route selected afterwards.
    await page.route("**/api/portfolio", async (route) => {
      await new Promise((r) => setTimeout(r, 350));
      await route.continue();
    });
    await page.evaluate(() => {
      location.hash = "#/portfolio";
    });
    await page.waitForTimeout(30);
    await page.evaluate(() => {
      location.hash = "#/markets";
    });
    await page.locator("#flt").waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.locator("#view h1").innerText(), "Markets");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(base + "/#/dashboard");
    await page.locator(".feature-teams").waitFor();
    await noOverflow("overview mobile");
    await screenshot("overview-mobile");
    await page.locator("#mobile-nav-toggle").click();
    await page.locator('#mobile-nav-drawer a[data-route="markets"]').click();
    await page.locator("#flt").waitFor();
    await noOverflow("markets mobile");
    await screenshot("markets-mobile");
    await page.goto(base + "/#/market/" + marketId);
    await page.locator("#bet-amt").waitFor();
    await noOverflow("market mobile");
    await screenshot("market-mobile");
    for (const route of [
      "fixtures",
      "portfolio",
      "wallet",
      "crews",
      "leaderboard",
      "receipts",
      "streak",
    ]) {
      await page.evaluate((route) => {
        location.hash = "#/" + route;
      }, route);
      const heading = { fixtures: "Schedule", wallet: "Account", receipts: "Settlement Receipts" }[route] || route[0].toUpperCase() + route.slice(1);
      await page.waitForFunction(
        (heading) => document.querySelector("#view h1")?.textContent === heading,
        heading,
      );
      await noOverflow(route + " mobile");
      await screenshot(route + "-mobile");
    }
    await context.clearCookies();
    await page.goto(base + "/#/receipt/" + receiptId);
    await page.reload();
    await page.locator(".public-card").waitFor();
    await noOverflow("public receipt mobile");
    await screenshot("public-receipt-mobile");
    await page.goto(base);
    await page.reload();
    await page.locator(".landing-copy h1").waitFor();
    await noOverflow("landing mobile");
    await screenshot("landing-mobile");
    assert.deepEqual(errors, [], "No uncaught browser errors");
    console.log(
      JSON.stringify({
        passed: true,
        checks:
          "All routes at desktop and mobile sizes, zero initial external requests, live-form preservation, confirmed test bet, stale navigation, public receipt",
        screenshots: artifacts,
      }),
    );
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
    cleanup();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

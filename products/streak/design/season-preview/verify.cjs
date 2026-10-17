/* Design-preview checks only. These do not verify contracts, wallets or live data. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("../../node_modules/playwright");

const base = process.env.STREAK_PREVIEW_URL || "http://127.0.0.1:4175";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Preview checks require a loopback fixture.",
);
const evidenceDir = process.env.STREAK_PREVIEW_EVIDENCE_DIR || path.join(__dirname, "evidence");
const key = "streak-design-proposal-v1";
const results = [];
const pageErrors = [];
const externalRequests = [];
const routes = [
  "home",
  "five",
  "markets",
  "market/ars-che",
  "matchday",
  "activity",
  "club",
  "wallet",
  "account",
  "welcome",
  "review",
];
let browser;

async function visit(page, route) {
  await page.goto(`${base}/#/${route}`);
  await page.locator("#main h1").waitFor();
}
async function click(page, action, suffix = "") {
  await page.locator(`[data-action="${action}"]${suffix}`).first().click();
}
async function textIncludes(locator, expected) {
  await locator.filter({ hasText: expected }).waitFor({ state: "attached" });
  assert.ok(
    (await locator.textContent()).includes(expected),
    `Expected text to include: ${expected}`,
  );
}
async function stored(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), key);
}
async function noOverflow(page, label) {
  const size = await page.evaluate(() => ({
    width: visualViewport?.width || innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(
    size.content <= size.width + 1,
    `${label}: viewport ${size.width}, document ${size.content}`,
  );
}
async function dialogTitle(page, title) {
  await page.waitForFunction(
    (expected) => document.querySelector("#dialog[open] #dialog-title")?.textContent === expected,
    title,
  );
  assert.equal(
    await page.locator("#dialog").evaluate((el) => el.contains(document.activeElement)),
    true,
    `${title}: keyboard focus belongs to the active dialog`,
  );
}
async function check(name, run, options = {}) {
  const start = Date.now();
  const beforeErrors = pageErrors.length;
  const beforeRequests = externalRequests.length;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    ...options,
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin || ["data:", "blob:"].includes(url.protocol))
      return route.continue();
    externalRequests.push({ check: name, origin: url.origin });
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => {
    externalRequests.push({ check: name, origin: "WebSocket blocked" });
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) => pageErrors.push({ check: name, message: error.message }));
  page.on("request", (request) => {
    // Decorative motion snapshots are locally generated data URLs, not traffic.
    if (!request.url().startsWith(new URL(base).origin + "/") && !request.url().startsWith("data:"))
      externalRequests.push({ check: name, origin: new URL(request.url()).origin });
  });
  try {
    await run(page, context);
    assert.equal(pageErrors.length, beforeErrors, "Uncaught page errors occurred");
    assert.equal(externalRequests.length, beforeRequests, "Unexpected external network request");
    results.push({ name, status: "passed", durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      status: "failed",
      durationMs: Date.now() - start,
      error: error.message,
    });
    console.error(`FAIL ${name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const response = await fetch(base);
  assert.equal(
    response.status,
    200,
    `Start the preview with node ${path.join(__dirname, "serve.cjs")}`,
  );
  const csp = response.headers.get("content-security-policy") || "";
  assert.ok(
    csp.includes("connect-src 'none'"),
    "Preview should prohibit wallet, API and analytics connections",
  );
  browser = await chromium.launch({ headless: true });

  for (const width of [320, 390, 1440]) {
    await check(
      `All 11 routes render without horizontal overflow at ${width}px`,
      async (page) => {
        for (const route of routes) {
          await visit(page, route);
          await noOverflow(page, route);
          await textIncludes(page.locator(".preview-strip"), "All activity is simulated");
        }
      },
      { viewport: { width, height: width === 1440 ? 1000 : 844 } },
    );
  }

  await check(
    "Fantasy squad validates five slots, duplicate players, budget and captain",
    async (page) => {
      await visit(page, "five");
      await click(page, "submit-five");
      await textIncludes(page.locator("#squad-error"), "Choose all five players");
      const picks = ["raya", "gabriel", "saka", "mbeumo", "haaland"];
      for (let index = 0; index < picks.length; index++) {
        await page.locator(`.slot-${index}`).click();
        await dialogTitle(page, "Find your player");
        if (index === 0) {
          await page.getByRole("textbox", { name: "Search players" }).fill("no such player");
          await textIncludes(page.locator("#player-options"), "No players found");
          await page.getByRole("textbox", { name: "Search players" }).fill("");
          assert.equal(
            await page.locator('[data-action="choose-player"][data-id="saka"]').count(),
            0,
            "Goalkeeper slot only lists goalkeepers",
          );
        }
        if (index === 3) {
          assert.ok(
            await page.locator('[data-action="choose-player"][data-id="saka"]').isDisabled(),
          );
          await textIncludes(
            page.locator('[data-action="choose-player"][data-id="saka"]'),
            "Already selected",
          );
        }
        await click(page, "choose-player", `[data-id="${picks[index]}"]`);
      }
      await textIncludes(page.locator(".budget"), "1.0");
      await page.locator(".slot-3").click();
      assert.ok(await page.locator('[data-action="choose-player"][data-id="salah"]').isDisabled());
      await textIncludes(
        page.locator('[data-action="choose-player"][data-id="salah"]'),
        "Over budget",
      );
      await page.keyboard.press("Escape");
      await click(page, "submit-five");
      await textIncludes(page.locator("#squad-error"), "Choose a captain");
      await click(page, "captain", '[data-id="saka"]');
      await click(page, "submit-five");
      await dialogTitle(page, "Your five, ready to go.");
      await textIncludes(page.locator("#dialog"), "Saka");
      await click(page, "confirm-team");
      await dialogTitle(page, "That’s your five.");
      await click(page, "view-team");
      await page.reload();
      await page.locator(".selected-banner").waitFor();
      assert.deepEqual((await stored(page)).draft, picks);
      assert.equal((await stored(page)).captain, "saka");
      assert.equal((await stored(page)).submitted, true);
      await page.getByLabel("Fantasy preview scenario").selectOption("locked");
      for (const selector of [
        ".slot-0",
        ".slot-1",
        ".slot-2",
        ".slot-3",
        ".slot-4",
        '[data-action="autofill"]',
        '[data-action="submit-five"]',
        '[data-action="captain"][data-id="saka"]',
      ]) {
        assert.ok(
          await page.locator(selector).isDisabled(),
          `${selector} must lock with the round`,
        );
      }
      await noOverflow(page, "Locked fantasy squad");
    },
  );

  await check(
    "Changing the captain player clears the armband and requires review again",
    async (page) => {
      await visit(page, "five");
      await click(page, "autofill");
      await click(page, "submit-five");
      await click(page, "confirm-team");
      await click(page, "view-team");
      await page.locator(".slot-4").click();
      await click(page, "choose-player", '[data-id="watkins"]');
      assert.equal((await stored(page)).captain, null);
      assert.equal((await stored(page)).submitted, false);
      await click(page, "submit-five");
      await textIncludes(page.locator("#squad-error"), "Choose a captain");
    },
  );

  await check(
    "Prediction validation, minimized draft recovery, rejected signature, conflict and submission",
    async (page) => {
      await visit(page, "markets");
      await click(page, "pick", '[data-fixture="ars-che"][data-side="0"]');
      await dialogTitle(page, "Make your calls.");
      for (const [amount, error] of [
        ["99", "at least 100"],
        ["100.5", "whole-number"],
        ["4679", "Not enough sample balance"],
      ]) {
        await page.locator("#stake").fill(amount);
        await click(page, "review-prediction");
        await textIncludes(page.locator("#stake-error"), error);
      }
      await page.locator("#stake").fill("200");
      await textIncludes(page.locator("#stake-breakdown"), "521.005");
      await click(page, "minimize");
      assert.equal(await page.locator("#dialog").evaluate((el) => el.open), false);
      await page.locator('[aria-label="Mobile navigation"] a[href="#/five"]').click();
      await page.locator(".dock").waitFor();
      await page.reload();
      await click(page, "restore-slip");
      assert.equal(await page.locator("#stake").inputValue(), "200");
      await click(page, "review-prediction");
      assert.equal(
        (await stored(page)).connected,
        true,
        "First review connects the demo wallet only",
      );
      await click(page, "review-prediction");
      for (const [scenario, title] of [
        ["reject", "Signature declined."],
        ["conflict", "That shard just changed."],
      ]) {
        await dialogTitle(page, "Before you sign.");
        await page.locator("#sign-scenario").selectOption(scenario);
        await click(page, "sign-prediction");
        await dialogTitle(page, title);
        assert.equal(
          (await stored(page)).positions.length,
          0,
          `${scenario} does not create a position`,
        );
        await click(page, "restore-slip");
        assert.equal(await page.locator("#stake").inputValue(), "200");
        await click(page, "review-prediction");
      }
      await page.locator("#sign-scenario").selectOption("success");
      await click(page, "sign-prediction");
      await dialogTitle(page, "Sending your predictions.");
      await dialogTitle(page, "Your calls are on their way.");
      await textIncludes(page.locator("#dialog"), "No real transaction hash");
      await click(page, "view-activity");
      await page.waitForURL("**/#/activity");
      await textIncludes(page.locator("#main"), "Pending acceptance");
      const data = await stored(page);
      assert.equal(data.positions.length, 1);
      assert.equal(Number(data.positions[0].amount), 200);
      assert.equal(data.slip, null);
      assert.equal(await page.locator(".dock").count(), 0);
    },
  );

  await check(
    "Closing pending submission preserves one result without reopening a dismissed dialog",
    async (page) => {
      await visit(page, "markets");
      await click(page, "pick", '[data-fixture="ars-che"][data-side="1"]');
      await click(page, "review-prediction");
      await click(page, "review-prediction");
      await click(page, "sign-prediction");
      await dialogTitle(page, "Sending your predictions.");
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        (k) => JSON.parse(localStorage.getItem(k)).positions.length === 1,
        key,
      );
      assert.equal(await page.locator("#dialog").evaluate((el) => el.open), false);
      await textIncludes(page.locator("#toast"), "Sample submission recorded");
      await page.reload();
      assert.equal((await stored(page)).positions.length, 1);
    },
  );

  await check(
    "A pending submission cannot discard a different prediction draft opened afterward",
    async (page) => {
      await visit(page, "markets");
      await click(page, "pick", '[data-fixture="ars-che"][data-side="0"]');
      await click(page, "review-prediction");
      await click(page, "review-prediction");
      await click(page, "sign-prediction");
      await dialogTitle(page, "Sending your predictions.");
      await page.keyboard.press("Escape");
      await click(page, "pick", '[data-fixture="mci-liv"][data-side="2"]');
      await page.locator("#stake").fill("300");
      assert.equal(
        (await stored(page)).positions.length,
        0,
        "New draft is opened while the first submission is still pending",
      );
      await page.waitForFunction(
        (k) => JSON.parse(localStorage.getItem(k)).positions.length === 1,
        key,
      );
      const data = await stored(page);
      assert.equal(data.positions[0].fixture, "ars-che");
      assert.equal(data.slip.picks[0].fixture, "mci-liv");
      assert.equal(data.slip.picks[0].side, 2);
      assert.equal(Number(data.slip.picks[0].amount), 300);
      await dialogTitle(page, "Make your calls.");
      assert.equal(await page.locator("#stake").inputValue(), "300");
    },
    { reducedMotion: "reduce" },
  );

  await check(
    "Reset cancels pending preview completion so old activity cannot reappear",
    async (page) => {
      await visit(page, "markets");
      await click(page, "pick", '[data-fixture="ars-che"][data-side="0"]');
      await click(page, "review-prediction");
      await click(page, "review-prediction");
      await click(page, "sign-prediction");
      await dialogTitle(page, "Sending your predictions.");
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        location.hash = "#/account";
      });
      await click(page, "reset");
      assert.equal(
        (await stored(page)).positions.length,
        0,
        "Reset happens before the pending callback finishes",
      );
      await click(page, "confirm-reset");
      // The preview submission settles after 850ms. Wait past that boundary to
      // prove its stale callback cannot repopulate freshly reset local state.
      await page.waitForTimeout(1100);
      const data = await stored(page);
      assert.deepEqual(data.positions, []);
      assert.equal(data.slip, null);
      assert.equal(data.connected, false);
      assert.equal(await page.locator("#dialog").evaluate((el) => el.open), false);
      await page.reload();
      assert.deepEqual((await stored(page)).positions, []);
    },
    { reducedMotion: "reduce" },
  );

  await check(
    "Claim and void refund disclose capacity, persist and prevent repeat actions",
    async (page) => {
      await visit(page, "activity");
      await click(page, "claim");
      await dialogTitle(page, "Bring your wallet.");
      await click(page, "connect-demo");
      assert.equal((await stored(page)).connected, true);
      await dialogTitle(page, "A good call, settled.");
      await textIncludes(page.locator("#dialog"), "469.5 tCKB");
      await textIncludes(page.locator("#dialog"), "321 tCKB");
      await click(page, "confirm-claim");
      assert.ok(await page.locator('[data-action="claim"]').isDisabled());
      await click(page, "refund");
      await dialogTitle(page, "Your stake comes home.");
      await textIncludes(page.locator("#dialog"), "421 tCKB");
      await textIncludes(page.locator("#dialog"), "No market fees");
      await click(page, "confirm-refund");
      await page.reload();
      assert.ok(await page.locator('[data-action="claim"]').isDisabled());
      assert.ok(await page.locator('[data-action="refund"]').isDisabled());
      assert.equal((await stored(page)).claimed, true);
      assert.equal((await stored(page)).refunded, true);
      await click(page, "receipt");
      await textIncludes(page.locator("#dialog"), "No transaction hash");
    },
  );

  await check(
    "Native dialog Escape restores focus and keeps background controls out of the Tab sequence",
    async (page) => {
      await visit(page, "five");
      await page.locator(".slot-0").focus();
      await page.keyboard.press("Enter");
      await dialogTitle(page, "Find your player");
      assert.equal(await page.evaluate(() => document.activeElement.id), "player-search");
      assert.equal(
        await page
          .locator("#dialog")
          .evaluate((el) => el instanceof HTMLDialogElement && el.matches(":modal")),
        true,
      );
      for (let i = 0; i < 9; i++) {
        await page.keyboard.press("Tab");
        // Native dialogs permit visiting browser chrome. Within the document,
        // focus must never move onto an inert background application control.
        assert.equal(
          await page.evaluate(
            () =>
              !document.hasFocus() ||
              document.querySelector("#dialog").contains(document.activeElement),
          ),
          true,
          `Tab ${i + 1} does not focus the background`,
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".slot-0").evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press("/");
      await dialogTitle(page, "Find your next fixture.");
      await page.getByRole("textbox", { name: "Search fixtures" }).fill("not a club");
      await textIncludes(page.locator("#fixture-results"), "No sample fixtures");
      await page.keyboard.press("Escape");
      assert.equal(
        await page.locator(".slot-0").evaluate((el) => el === document.activeElement),
        true,
      );
    },
  );

  await check(
    "Skip to content focuses the current page without changing its route",
    async (page) => {
      await visit(page, "five");
      const heading = await page.locator("#main h1").textContent();
      await page.locator(".skip").focus();
      await page.keyboard.press("Enter");
      assert.equal(new URL(page.url()).hash, "#/five");
      assert.equal(await page.locator("#main h1").textContent(), heading);
      assert.equal(
        await page.evaluate(
          () =>
            document.activeElement === document.querySelector("#main") ||
            document.querySelector("#main").contains(document.activeElement),
        ),
        true,
      );
    },
  );

  await check(
    "System reduced motion prevents genie rendering while minimizing and restoring",
    async (page) => {
      await visit(page, "markets");
      await click(page, "pick");
      await click(page, "minimize");
      assert.equal(await page.locator(".genie-layer").count(), 0);
      await click(page, "restore-slip");
      assert.equal(await page.locator(".genie-layer").count(), 0);
      await dialogTitle(page, "Make your calls.");
    },
    { reducedMotion: "reduce" },
  );

  await check(
    "Opening and immediately minimizing animates one inert surface without prewarming",
    async (page) => {
      await visit(page, "markets");
      await page.evaluate(() => {
        document.querySelector('[data-action="pick"]').click();
        document.querySelector('[data-action="minimize"]').click();
      });
      await page.locator(".genie-layer").waitFor();
      assert.equal(await page.locator(".genie-canvas").count(), 1);
      assert.equal(
        await page
          .locator(".genie-layer")
          .evaluate((el) => el.inert && el.getAttribute("aria-hidden") === "true"),
        true,
      );
      assert.equal(
        await page.locator(".genie-layer input, .genie-layer [id]").count(),
        0,
        "Animation does not duplicate inputs or element IDs",
      );
      await page.locator(".genie-layer").waitFor({ state: "detached", timeout: 2000 });
      await click(page, "restore-slip");
      await dialogTitle(page, "Make your calls.");
      await page.locator(".genie-layer").waitFor();
      await page.locator(".genie-layer").waitFor({ state: "detached", timeout: 2000 });
    },
    { reducedMotion: "no-preference" },
  );

  await check(
    "Changing the stake and immediately minimizing preserves the amount and animates",
    async (page) => {
      await visit(page, "markets");
      await click(page, "pick");
      await page.evaluate(() => {
        const input = document.querySelector("#stake");
        input.value = "500";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        document.querySelector('[data-action="minimize"]').click();
      });
      await page.locator(".genie-layer").waitFor();
      await page.locator(".genie-layer").waitFor({ state: "detached", timeout: 2500 });
      assert.equal(Number((await stored(page)).slip.picks[0].amount), 500);
      await click(page, "restore-slip");
      await page.locator(".genie-layer").waitFor();
      await page.locator(".genie-layer").waitFor({ state: "detached", timeout: 2500 });
      assert.equal(await page.locator("#stake").inputValue(), "500");
      await dialogTitle(page, "Make your calls.");
    },
    { reducedMotion: "no-preference" },
  );

  await check(
    "User reduced-motion preference persists and preserves keyboard focus",
    async (page) => {
      await visit(page, "account");
      await click(page, "toggle-motion");
      assert.equal(await page.locator("html").getAttribute("data-reduced"), "true");
      assert.equal(
        await page
          .locator('[data-action="toggle-motion"]')
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.reload();
      assert.equal(await page.locator("html").getAttribute("data-reduced"), "true");
      assert.equal((await stored(page)).reduced, true);
    },
  );

  await check(
    "Delayed and empty Matchday scenarios explain freshness and preserve navigation",
    async (page) => {
      await visit(page, "matchday");
      await page.getByLabel("Match feed scenario").selectOption("delayed");
      await textIncludes(page.locator("#main"), "Feed delayed");
      await textIncludes(page.locator("#main"), "4 minutes ago");
      await textIncludes(page.locator("#main"), "provisional");
      await click(page, "match-tab", '[data-value="stats"]');
      await textIncludes(page.locator("#main"), "Possession");
      await page.getByLabel("Match feed scenario").selectOption("empty");
      await textIncludes(page.locator("#main"), "A breather before kickoff.");
      assert.equal(await page.locator(".match-hero").count(), 0);
      await page.locator('#main a[href="#/markets"]').click();
      await page.waitForURL("**/#/markets");
      await page.locator(".market-card").first().waitFor();
    },
  );

  await check(
    "Narrow mobile modal and secondary tabs remain within the viewport",
    async (page) => {
      await visit(page, "five");
      await click(page, "autofill");
      await click(page, "five-tab", '[data-value="points"]');
      await noOverflow(page, "Fantasy results");
      await click(page, "five-tab", '[data-value="rules"]');
      await noOverflow(page, "Fantasy scoring");
      await visit(page, "club");
      for (const tab of ["crews", "streak", "badges"]) {
        await click(page, "club-tab", `[data-value="${tab}"]`);
        await noOverflow(page, `Club ${tab}`);
      }
      await visit(page, "markets");
      await click(page, "pick");
      const rect = await page.locator("#dialog").evaluate((el) => ({
        left: el.getBoundingClientRect().left,
        right: el.getBoundingClientRect().right,
        width: el.clientWidth,
        content: el.scrollWidth,
      }));
      assert.ok(rect.left >= 0 && rect.right <= 321, "Dialog fits the 320px viewport");
      assert.ok(rect.content <= rect.width + 1, "Dialog content has no horizontal overflow");
    },
    { viewport: { width: 320, height: 740 } },
  );

  await browser.close();
  browser = null;
  const report = {
    scope:
      "Local interactive design proposal with synthetic fixtures, local browser state and simulated wallet actions. Not production, live data or on-chain validation.",
    checkedAt: new Date().toISOString(),
    baseUrl: base,
    browser: "Playwright Chromium",
    widths: [320, 390, 1440],
    routeCount: routes.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    cspBlocksConnections: csp.includes("connect-src 'none'"),
    pageErrors,
    externalRequests,
    checks: results,
  };
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(
    path.join(evidenceDir, "preview-checks.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    `\n${report.passed} passed; ${report.failed} failed. Evidence: evidence/preview-checks.json`,
  );
  if (report.failed) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  if (browser) await browser.close();
  process.exitCode = 1;
});

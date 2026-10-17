/* Simulated basket journeys only. No wallet or chain settlement is exercised. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium, webkit } = require("../../node_modules/playwright");

const base = process.env.STREAK_PREVIEW_URL || "http://127.0.0.1:4175";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Preview checks require a loopback fixture.",
);
const evidenceDir = process.env.STREAK_PREVIEW_EVIDENCE_DIR || path.join(__dirname, "evidence");
const storageKey = "streak-design-proposal-v1";
const results = [];
const errors = [];
const externalRequests = [];
const action = (page, name, extra = "") =>
  page.locator(`[data-action="${name}"]${extra}`).first().click();
const stake = (page, fixture) =>
  page.locator(`input[data-input="stake"][data-fixture="${fixture}"]`);
const saved = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const pick = (page, fixture, side) =>
  action(page, "pick", `[data-fixture="${fixture}"][data-side="${side}"]`);

async function title(page, expected) {
  await page.waitForFunction(
    (value) => document.querySelector("#dialog[open] #dialog-title")?.textContent === value,
    expected,
  );
}
async function total(page, name, expected) {
  const text = await page.locator(`[data-total="${name}"]`).textContent();
  assert.equal(Number.parseFloat(text.replaceAll(",", "")), expected, `${name}: ${text}`);
}
async function build(page, count = 3) {
  await page.goto(`${base}/#/markets`);
  await pick(page, "ars-che", 0);
  await stake(page, "ars-che").fill("200");
  if (count > 1) {
    await action(page, "add-more-picks");
    await pick(page, "mci-liv", 2);
    assert.equal(
      await page.locator("dialog[open]").count(),
      0,
      "Additional picks let the user keep browsing",
    );
    if (count > 2) await pick(page, "avl-tot", 1);
    await action(page, "restore-slip");
    await stake(page, "mci-liv").fill("300");
    if (count > 2) await stake(page, "avl-tot").fill("500");
  }
  await title(page, "Make your calls.");
}
async function review(page) {
  await action(page, "review-prediction");
  if (await page.locator('[data-action="review-prediction"]').count())
    await action(page, "review-prediction");
  await title(page, "Before you sign.");
}
async function check(browser, engine, width, name, run) {
  const label = `${engine} ${width}: ${name}`;
  const start = Date.now();
  const context = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 1000 },
    isMobile: width < 600,
    hasTouch: width < 600,
    deviceScaleFactor: width < 600 ? 2 : 1,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(base).origin || ["data:", "blob:"].includes(url.protocol))
      return route.continue();
    externalRequests.push({ label, origin: url.origin });
    return route.abort("blockedbyclient");
  });
  await context.routeWebSocket("**/*", (socket) => {
    externalRequests.push({ label, origin: "WebSocket blocked" });
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const beforeErrors = errors.length,
    beforeRequests = externalRequests.length;
  page.on("pageerror", (error) => errors.push({ label, message: error.message }));
  page.on("request", (request) => {
    if (!request.url().startsWith(new URL(base).origin + "/") && !request.url().startsWith("data:"))
      externalRequests.push({ label, origin: new URL(request.url()).origin });
  });
  try {
    await run(page);
    assert.equal(errors.length, beforeErrors, "No uncaught browser errors");
    assert.equal(externalRequests.length, beforeRequests, "No external requests");
    results.push({
      name: label,
      status: "passed",
      durationMs: Date.now() - start,
    });
    console.log(`PASS ${label}`);
  } catch (error) {
    results.push({
      name: label,
      status: "failed",
      error: error.message,
      durationMs: Date.now() - start,
    });
    console.error(`FAIL ${label}: ${error.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      for (const width of [390, 1440]) {
        const test = (name, run) => check(browser, engine, width, name, run);
        await test("three independent stakes, one total, selected outcomes and replacement", async (page) => {
          await build(page);
          const dimensions = await page.evaluate(() => ({
            visibleWidth: visualViewport.width,
            contentWidth: document.documentElement.scrollWidth,
            dialogRight: document.querySelector("#dialog").getBoundingClientRect().right,
          }));
          assert.ok(
            dimensions.contentWidth <= dimensions.visibleWidth + 1,
            "Selected outcomes cannot enlarge the mobile layout viewport",
          );
          assert.ok(
            dimensions.dialogRight <= dimensions.visibleWidth + 1,
            "The slip stays inside the visible viewport",
          );
          assert.equal(
            await page.locator(".pick-check:visible").count(),
            3,
            "Only selected outcomes display check badges",
          );
          assert.equal(await page.locator(".slip-pick").count(), 3);
          await total(page, "principal", 1000);
          await total(page, "storage", 963);
          await total(page, "fee", 0.005);
          await total(page, "pay", 1963.005);
          assert.match(
            await page.locator("#dialog").textContent(),
            /Every prediction settles independently/,
          );
          await action(page, "add-more-picks");
          assert.equal(await page.locator('[data-action="pick"][aria-pressed="true"]').count(), 3);
          await pick(page, "ars-che", 2);
          assert.equal(await page.locator("dialog[open]").count(), 0);
          let data = await saved(page);
          assert.equal(data.slip.picks.length, 3);
          assert.deepEqual(data.slip.picks[0], {
            fixture: "ars-che",
            side: 2,
            amount: "200",
          });
          assert.equal(
            await page
              .locator('[data-action="pick"][data-fixture="ars-che"][data-side="0"]')
              .getAttribute("aria-pressed"),
            "false",
          );
          assert.equal(
            await page
              .locator('[data-action="pick"][data-fixture="ars-che"][data-side="2"]')
              .getAttribute("aria-pressed"),
            "true",
          );
          await pick(page, "ars-che", 2);
          await title(page, "Make your calls.");
          assert.equal(
            (await saved(page)).slip.picks.length,
            3,
            "Reopening an already selected outcome does not duplicate it",
          );
          await total(page, "pay", 1963.005);
        });
        await test("all picks persist, removing a pick updates capacity, removing the last clears the dock", async (page) => {
          await build(page);
          await action(page, "minimize");
          await page.reload();
          await action(page, "restore-slip");
          for (const [fixture, amount] of [
            ["ars-che", "200"],
            ["mci-liv", "300"],
            ["avl-tot", "500"],
          ])
            assert.equal(await stake(page, fixture).inputValue(), amount);
          await action(page, "remove-pick", '[data-fixture="avl-tot"]');
          let data = await saved(page);
          assert.ok(data.slip.picks.some((pick) => pick.fixture === data.slip.active));
          await total(page, "principal", 500);
          await total(page, "storage", 642);
          await total(page, "pay", 1142.005);
          await action(page, "remove-pick", '[data-fixture="ars-che"]');
          data = await saved(page);
          assert.equal(
            data.slip.active,
            "mci-liv",
            "Removing the active pick selects a remaining fixture",
          );
          assert.equal(await page.locator("#stake").getAttribute("data-fixture"), "mci-liv");
          await total(page, "pay", 621.005);
          await action(page, "remove-pick", '[data-fixture="mci-liv"]');
          assert.equal((await saved(page)).slip, null);
          assert.equal(await page.locator("dialog[open], .dock").count(), 0);
          assert.equal(await page.locator('[data-action="pick"][aria-pressed="true"]').count(), 0);
          await pick(page, "avl-tot", 0);
          assert.equal((await saved(page)).slip.picks.length, 1);
          assert.equal(await page.locator("#stake").inputValue(), "100");
        });
        await test("per-pick validation targets the invalid field and combined balance includes every receipt", async (page) => {
          await build(page);
          for (const invalid of ["", "99", "100.5"]) {
            await stake(page, "mci-liv").fill(invalid);
            await action(page, "review-prediction");
            assert.match(await page.locator("#stake-error").textContent(), /Man City vs Liverpool/);
            assert.equal(await stake(page, "mci-liv").getAttribute("aria-invalid"), "true");
            assert.equal(
              await stake(page, "mci-liv").evaluate((input) => document.activeElement === input),
              true,
            );
          }
          await stake(page, "ars-che").fill("2000");
          await stake(page, "mci-liv").fill("2000");
          await action(page, "review-prediction");
          await total(page, "pay", 5463.005);
          assert.match(
            await page.locator("#stake-error").textContent(),
            /Not enough sample balance/,
          );
          assert.equal(
            (await saved(page)).connected,
            false,
            "Validation runs before connection or review",
          );
          await stake(page, "ars-che").fill("200");
          await stake(page, "mci-liv").fill("300");
          await review(page);
          assert.equal(await page.locator(".slip-review-row").count(), 3);
          await total(page, "pay", 1963.005);
        });
        await test("rejection and conflict preserve every pick; success creates one independent position per pick", async (page) => {
          await build(page);
          const expected = (await saved(page)).slip.picks;
          await review(page);
          for (const scenario of ["reject", "conflict"]) {
            await page.locator("#sign-scenario").selectOption(scenario);
            await action(page, "sign-prediction");
            await title(
              page,
              scenario === "reject" ? "Signature declined." : "That shard just changed.",
            );
            const data = await saved(page);
            assert.deepEqual(data.slip.picks, expected);
            assert.deepEqual(data.positions, []);
            await action(page, "restore-slip");
            await review(page);
          }
          await action(page, "sign-prediction");
          await title(page, "Sending your predictions.");
          await title(page, "Your calls are on their way.");
          const data = await saved(page);
          assert.equal(data.slip, null);
          assert.equal(data.positions.length, 3);
          assert.equal(new Set(data.positions.map((position) => position.id)).size, 3);
          assert.equal(new Set(data.positions.map((position) => position.batchId)).size, 1);
          assert.ok(
            data.positions.every(
              (position) =>
                position.batchId && position.batchCount === 3 && position.batchTotal === 1963.005,
            ),
          );
          assert.deepEqual(
            data.positions.map(({ fixture, side, amount }) => ({
              fixture,
              side,
              amount,
            })),
            expected,
          );
          assert.match(await page.locator("#dialog").textContent(), /Each settles independently/);
        });
        await test("a pending combined payment preserves a new basket and never reopens a dismissed success dialog", async (page) => {
          await build(page, 2);
          await review(page);
          await action(page, "sign-prediction");
          await title(page, "Sending your predictions.");
          await page.keyboard.press("Escape");
          // One browser task guarantees this new draft precedes the 850ms completion.
          await page.evaluate(() => {
            document
              .querySelector('[data-action="pick"][data-fixture="avl-tot"][data-side="2"]')
              .click();
            const input = document.querySelector("#stake");
            input.value = "400";
            input.dispatchEvent(new Event("input", { bubbles: true }));
          });
          assert.equal((await saved(page)).positions.length, 0);
          await page.waitForFunction(
            (key) => JSON.parse(localStorage.getItem(key)).positions.length === 2,
            storageKey,
          );
          const data = await saved(page);
          assert.deepEqual(data.slip.picks, [{ fixture: "avl-tot", side: 2, amount: "400" }]);
          assert.equal(new Set(data.positions.map((position) => position.batchId)).size, 1);
          assert.ok(
            data.positions.every(
              (position) => position.batchCount === 2 && position.batchTotal === 1142.005,
            ),
          );
          await title(page, "Make your calls.");
          assert.equal(await stake(page, "avl-tot").inputValue(), "400");
        });
        await test("reset during a pending batch cannot recreate any submitted picks", async (page) => {
          await build(page, 2);
          await review(page);
          // Trigger the actual actions in one browser task. The pending response
          // cannot race ahead of reset just because a CI host is slow.
          await page.evaluate(() => {
            document.querySelector('[data-action="sign-prediction"]').click();
            if (document.querySelector("#dialog-title").textContent !== "Sending your predictions.")
              throw new Error("Submission must be pending before reset");
            document.querySelector('#dialog [data-action="close-modal"]').click();
            location.hash = "#/account";
            window.dispatchEvent(new HashChangeEvent("hashchange"));
            document.querySelector('[data-action="reset"]').click();
            document.querySelector('[data-action="confirm-reset"]').click();
          });
          await page.waitForTimeout(1100);
          const data = await saved(page);
          assert.deepEqual(data.positions, []);
          assert.equal(data.slip, null);
          assert.equal(data.connected, false);
        });
        await test("reset after a completed batch clears activity and restores clean defaults", async (page) => {
          await build(page, 2);
          await review(page);
          await action(page, "sign-prediction");
          await title(page, "Your calls are on their way.");
          assert.equal((await saved(page)).positions.length, 2);
          await page.keyboard.press("Escape");
          await page.evaluate(() => {
            location.hash = "#/account";
          });
          await action(page, "reset");
          await action(page, "confirm-reset");
          let data = await saved(page);
          assert.deepEqual(data.positions, []);
          assert.deepEqual(data.draft, [null, null, null, null, null]);
          assert.equal(data.slip, null);
          assert.equal(data.connected, false);
          await page.reload();
          data = await saved(page);
          assert.deepEqual(data.positions, []);
          assert.deepEqual(data.draft, [null, null, null, null, null]);
        });
        await test("a legacy single-pick draft restores and becomes a canonical basket without losing its stake", async (page) => {
          await page.goto(`${base}/#/markets`);
          await page.evaluate(
            (key) =>
              localStorage.setItem(
                key,
                JSON.stringify({
                  slip: { fixture: "mci-liv", side: 2, amount: 375 },
                }),
              ),
            storageKey,
          );
          await page.reload();
          await action(page, "restore-slip");
          assert.equal(await stake(page, "mci-liv").inputValue(), "375");
          await total(page, "pay", 696.005);
          await stake(page, "mci-liv").fill("376");
          assert.deepEqual((await saved(page)).slip.picks, [
            { fixture: "mci-liv", side: 2, amount: "376" },
          ]);
          await action(page, "add-more-picks");
          await pick(page, "ars-che", 1);
          assert.equal((await saved(page)).slip.picks.length, 2);
        });
      }
    } finally {
      await browser.close();
    }
  }
  const output = {
    capturedAt: new Date().toISOString(),
    scope: "Local simulated multi-pick preview",
    results,
    errors,
    externalRequests,
  };
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(
    path.join(evidenceDir, "batch-checks.json"),
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(
    `${results.filter((result) => result.status === "passed").length} passed; ${results.filter((result) => result.status !== "passed").length} failed`,
  );
  if (results.some((result) => result.status !== "passed")) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

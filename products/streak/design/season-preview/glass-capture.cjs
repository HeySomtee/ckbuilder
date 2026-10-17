/* Read-only visual and interaction checks for the glass design proposal. */
const { chromium, webkit } = require("../../node_modules/playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.STREAK_PREVIEW_URL || "http://127.0.0.1:4175";
const dir = path.join(__dirname, "evidence");
const results = [];
const key = "streak-design-proposal-v1";
async function settle(page) {
  await page.waitForFunction(
    () =>
      !document.querySelector(
        "[data-window-transition], .genie-layer, .genie-preparing, .genie-restoring",
      ),
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished),
    );
    document.activeElement?.blur();
  });
  await page.mouse.move(0, 0);
}
async function capture(page, name, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: path.join(dir, name + ".png"), fullPage });
}
async function noOverflow(page) {
  const sizes = await page.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    return {
      doc: document.documentElement.scrollWidth,
      width: innerWidth,
      dialog: d && [d.scrollWidth, d.clientWidth],
    };
  });
  assert.ok(sizes.doc <= sizes.width + 1, JSON.stringify(sizes));
  if (sizes.dialog)
    assert.ok(sizes.dialog[0] <= sizes.dialog[1] + 1, JSON.stringify(sizes));
}
async function choose(page, fixture, side) {
  await page
    .locator(
      `[data-action="pick"][data-fixture="${fixture}"][data-side="${side}"]`,
    )
    .first()
    .click();
}
async function collect(page) {
  await choose(page, "ars-che", 0);
  await page.locator('[data-action="add-more-picks"]').click();
  await choose(page, "mci-liv", 2);
  await choose(page, "avl-tot", 1);
  await page.locator('[data-action="restore-slip"]').click();
  await settle(page);
  for (const [fixture, amount] of [
    ["ars-che", "200"],
    ["mci-liv", "300"],
    ["avl-tot", "500"],
  ]) {
    await page.locator(`input[data-fixture="${fixture}"]`).fill(amount);
  }
}
async function main() {
  await fs.mkdir(dir, { recursive: true });
  for (const [engine, browserType] of [
    ["chromium", chromium],
    ["webkit", webkit],
  ]) {
    if (process.env.GLASS_ENGINE && process.env.GLASS_ENGINE !== engine)
      continue;
    const browser = await browserType.launch({ headless: true });
    try {
      for (const width of [1440, 390, 320]) {
        if (
          process.env.GLASS_WIDTHS &&
          !process.env.GLASS_WIDTHS.split(",").includes(String(width))
        )
          continue;
        const context = await browser.newContext({
          viewport: { width, height: width === 1440 ? 1000 : 844 },
          isMobile: width < 500,
          hasTouch: width < 500,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        const suffix = `${engine}-${width}`;
        try {
          await page.goto(base + "/#/home");
          await noOverflow(page);
          await capture(page, `glass-home-${suffix}`, true);
          await page.goto(base + "/#/markets");
          await noOverflow(page);
          await capture(page, `glass-markets-${suffix}`, true);
          await collect(page);
          const controls = await page
            .locator(".window-control")
            .evaluateAll((els) =>
              els.map((el) => ({
                label: el.textContent.trim(),
                height: el.getBoundingClientRect().height,
                width: el.getBoundingClientRect().width,
              })),
            );
          assert.deepEqual(
            controls.map((c) => c.label),
            ["Minimize", "Close"],
          );
          assert.ok(
            controls.every((c) => c.height >= 44 && c.width >= 44),
            JSON.stringify(controls),
          );
          await noOverflow(page);
          const totals = await page.locator('[data-total="pay"]').textContent();
          assert.ok(totals.includes("1,963.005"), totals);
          await page.locator("dialog").evaluate((el) => (el.scrollTop = 0));
          await capture(page, `glass-slip-${suffix}`);
          const dialog = page.locator("dialog");
          const bounds = await dialog.boundingBox();
          const wheelSupported = !(engine === "webkit" && width < 500);
          if (wheelSupported) {
            await page.mouse.move(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            );
            await page.mouse.wheel(0, 900);
          } else {
            await dialog.evaluate((el) => (el.scrollTop = el.scrollHeight));
          }
          await page.waitForTimeout(300);
          const wheel = wheelSupported
            ? await dialog.evaluate((el) => el.scrollTop)
            : null;
          if (wheelSupported)
            assert.ok(wheel > 0, "Mouse wheel did not scroll the slip");
          await capture(page, `glass-slip-bottom-${suffix}`);
          await dialog.evaluate((el) => (el.scrollTop = 0));
          await page.locator("#dialog-title").focus();
          await page.keyboard.press("End");
          await page.waitForTimeout(300);
          const keyboard = await dialog.evaluate((el) => el.scrollTop);
          assert.ok(keyboard > 0, "Keyboard End did not scroll the slip");
          let thumb = null;
          let scrollbar;
          if (width === 1440) {
            await dialog.evaluate((el) => (el.scrollTop = 0));
            scrollbar = await dialog.evaluate((el) => {
              const thumbStyle = getComputedStyle(
                el,
                "::-webkit-scrollbar-thumb",
              );
              const scrollStyle = getComputedStyle(el, "::-webkit-scrollbar");
              return {
                width: scrollStyle.width,
                image: thumbStyle.backgroundImage,
                radius: thumbStyle.borderRadius,
                gutter: getComputedStyle(el).scrollbarGutter,
              };
            });
            const metrics = await dialog.evaluate((el) => ({
              height: el.clientHeight,
              total: el.scrollHeight,
              width: el.offsetWidth - el.clientWidth,
            }));
            const x = bounds.x + bounds.width - 7;
            const y =
              bounds.y +
              18 +
              ((metrics.height - 28) * metrics.height) / metrics.total / 2;
            await page.mouse.move(x, y);
            await page.mouse.down();
            await page.mouse.move(x, bounds.y + bounds.height - 30, {
              steps: 10,
            });
            await page.mouse.up();
            await page.waitForTimeout(200);
            thumb = await dialog.evaluate((el) => el.scrollTop);
          }
          await page.locator('[data-action="close-modal"]').click();
          assert.equal(await page.locator("dialog[open]").count(), 0);
          assert.equal(
            await page.evaluate(
              (k) => JSON.parse(localStorage.getItem(k)).slip.picks.length,
              key,
            ),
            3,
          );
          await noOverflow(page);
          await capture(page, `glass-selected-markets-${suffix}`, true);
          await page.locator('[data-action="restore-slip"]').click();
          await settle(page);
          await page.locator('[data-action="minimize"]').click();
          await settle(page);
          assert.equal(
            await page.locator('[data-action="restore-slip"]').count(),
            1,
          );
          assert.deepEqual(errors, []);
          results.push({
            engine,
            width,
            status: "passed",
            controls,
            wheelScroll: wheel,
            keyboardScroll: keyboard,
            thumbScroll: thumb,
            scrollbar,
          });
          console.log(
            `PASS ${suffix}: controls, totals, overflow, ${wheelSupported ? "wheel" : "native scroll reachability (mobile WebKit wheel injection unavailable)"}, keyboard, close retention, minimize/restore; thumb=${thumb}`,
          );
        } catch (error) {
          results.push({
            engine,
            width,
            status: "failed",
            error: error.message,
          });
          console.error(`FAIL ${suffix}: ${error.stack}`);
        } finally {
          await context.close();
        }
      }
      if (engine === "chromium") {
        const page = await browser.newPage({
          viewport: { width: 390, height: 844 },
          forcedColors: "active",
        });
        await page.goto(base + "/#/markets");
        await choose(page, "ars-che", 0);
        await capture(page, "glass-forced-colors-chromium-390");
        const colors = await page
          .locator(".window-control")
          .evaluateAll((els) =>
            els.map((el) => ({
              label: el.textContent.trim(),
              color: getComputedStyle(el).color,
              background: getComputedStyle(el).backgroundColor,
              border: getComputedStyle(el).borderColor,
            })),
          );
        results.push({ engine, forcedColors: true, colors });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  const resultPath = path.join(dir, "glass-checks.json");
  let savedResults = results;
  if (process.env.GLASS_ENGINE || process.env.GLASS_WIDTHS) {
    const oldResults = JSON.parse(
      await fs.readFile(resultPath, "utf8").catch(() => "[]"),
    );
    savedResults = oldResults
      .filter(
        (old) =>
          !results.some(
            (fresh) =>
              fresh.engine === old.engine &&
              fresh.width === old.width &&
              fresh.forcedColors === old.forcedColors,
          ),
      )
      .concat(results);
  }
  await fs.writeFile(resultPath, JSON.stringify(savedResults, null, 2) + "\n");
  if (results.some((r) => r.status === "failed")) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

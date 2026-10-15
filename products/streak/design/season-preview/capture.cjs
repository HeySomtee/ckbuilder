const { chromium } = require("../../node_modules/playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = process.env.STREAK_PREVIEW_URL || "http://127.0.0.1:4175";
const dir = path.join(__dirname, "evidence");
let captureBrowser;
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
  const dismiss = page.locator('[data-action="dismiss-toast"]');
  if (!(await page.locator("dialog[open]").count()) && (await dismiss.count()))
    await dismiss.click();
  await page.evaluate(() => {
    document.activeElement?.blur();
    if (!document.querySelector("dialog[open]")) window.scrollTo(0, 0);
  });
  await page.mouse.move(0, 0);
}
const choose = (page, fixture, side) =>
  page
    .locator(
      `[data-action="pick"][data-fixture="${fixture}"][data-side="${side}"]`,
    )
    .first()
    .click();
const amount = (page, fixture) =>
  page.locator(`input[data-input="stake"][data-fixture="${fixture}"]`);
async function collectPredictions(page, pace = 0) {
  const pause = async () => {
    if (pace) await page.waitForTimeout(pace);
  };
  await page.goto(base + "/#/markets");
  await pause();
  await choose(page, "ars-che", 0);
  await pause();
  await page
    .locator(
      '[data-action="stake-preset"][data-fixture="ars-che"][data-amount="200"]',
    )
    .click();
  await pause();
  await page.locator('[data-action="add-more-picks"]').click();
  await pause();
  await choose(page, "mci-liv", 2);
  await pause();
  await choose(page, "avl-tot", 1);
  await pause();
  await page.locator('[data-action="restore-slip"]').click();
  await settle(page);
  await amount(page, "mci-liv").fill("300");
  await pause();
  await page
    .locator(
      '[data-action="stake-preset"][data-fixture="avl-tot"][data-amount="500"]',
    )
    .click();
  await pause();
}
async function reviewCombinedPayment(page, pace = 0) {
  await page.locator('[data-action="review-prediction"]').click();
  // First-time connection stays on the slip so the combined total can be reviewed.
  if (await page.locator('[data-action="review-prediction"]').count()) {
    if (pace) await page.waitForTimeout(pace);
    await page.locator('[data-action="review-prediction"]').click();
  }
  await page.locator(".slip-review-row").nth(2).waitFor({ state: "visible" });
}
async function submitCombinedPayment(page) {
  await page.locator("#sign-scenario").selectOption("success");
  await page.locator('[data-action="sign-prediction"]').click();
  await page
    .locator('[data-action="view-activity"]')
    .waitFor({ state: "visible" });
}
async function saveVideo(context, page, name) {
  const video = page.video();
  await context.close();
  const target = path.join(dir, name);
  await video.saveAs(target);
  const original = await video.path();
  if (original !== target) await fs.unlink(original);
}
async function main() {
  await fs.mkdir(dir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  captureBrowser = browser;
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const images = [];
  async function capture(name, target = page) {
    await settle(target);
    const modal = await target.locator("dialog[open]").count();
    await target.screenshot({
      path: path.join(dir, name + ".png"),
      fullPage: !modal,
    });
    images.push(name + ".png");
  }
  await page.goto(base + "/#/home");
  await capture("overview-desktop");
  await page.goto(base + "/#/five");
  await page.locator('[data-action="autofill"]').click();
  await capture("five-desktop");
  await page.goto(base + "/#/markets");
  await capture("markets-desktop");
  await page.locator('[data-action="pick"]').first().click();
  await capture("prediction-review-desktop");
  await page.locator('[data-action="minimize"]').click();
  await capture("prediction-dock-desktop");
  await page.goto(base + "/#/matchday");
  await capture("matchday-desktop");
  await page.goto(base + "/#/club");
  await capture("clubhouse-desktop");
  await page.goto(base + "/#/welcome");
  await capture("welcome-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "/#/home");
  await page.evaluate(() => {
    localStorage.removeItem("streak-design-proposal-v1");
  });
  await page.reload();
  await capture("overview-mobile");
  await page.goto(base + "/#/five");
  await page.locator('[data-action="autofill"]').click();
  await capture("five-mobile");
  await page.locator(".slot-2").click();
  await capture("player-picker-mobile");
  await page.keyboard.press("Escape");
  await page.goto(base + "/#/markets");
  await page.locator('[data-action="pick"]').first().click();
  await capture("prediction-mobile");
  await page.locator('[data-action="minimize"]').click();
  await capture("prediction-dock-mobile");
  await page.goto(base + "/#/activity");
  await capture("activity-mobile");
  await page.close();
  for (const [device, viewport] of [
    ["desktop", { width: 1440, height: 1000 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: device === "mobile",
      hasTouch: device === "mobile",
    });
    const basket = await context.newPage();
    await collectPredictions(basket);
    await basket.locator("dialog").evaluate((el) => (el.scrollTop = 0));
    await capture(`combined-slip-${device}`, basket);
    await basket
      .locator("dialog")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await capture(`combined-slip-bottom-${device}`, basket);
    await basket.locator('[data-action="minimize"]').click();
    await capture(`combined-selected-markets-${device}`, basket);
    await basket.locator('[data-action="restore-slip"]').click();
    await settle(basket);
    await reviewCombinedPayment(basket);
    await capture(`combined-payment-review-${device}`, basket);
    await basket
      .locator("dialog")
      .evaluate((el) => (el.scrollTop = el.scrollHeight));
    await capture(`combined-payment-review-bottom-${device}`, basket);
    await submitCombinedPayment(basket);
    await capture(`combined-payment-success-${device}`, basket);
    await basket.locator('[data-action="view-activity"]').click();
    await capture(`combined-independent-positions-${device}`, basket);
    await context.close();
  }
  const videoContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir, size: { width: 1280, height: 900 } },
  });
  const demo = await videoContext.newPage();
  await demo.goto(base + "/#/home");
  await demo.waitForTimeout(800);
  await demo.locator('.hero-copy a[href="#/five"]').click();
  await demo.locator('[data-action="autofill"]').click();
  await demo.waitForTimeout(700);
  await demo.locator('[data-action="submit-five"]').click();
  await demo.waitForTimeout(600);
  await demo.locator('[data-action="confirm-team"]').click();
  await demo.waitForTimeout(700);
  await demo.locator('[data-action="view-team"]').click();
  await demo.goto(base + "/#/markets");
  await demo.locator('[data-action="pick"]').first().click();
  await demo.locator('[data-amount="200"]').click();
  await demo.waitForTimeout(900);
  await demo.locator('[data-action="minimize"]').click();
  await demo.waitForTimeout(900);
  await demo.goto(base + "/#/matchday");
  await demo.waitForTimeout(700);
  await demo.locator('[data-action="restore-slip"]').click();
  await demo.waitForTimeout(1000);
  await demo.keyboard.press("Escape");
  await demo.waitForTimeout(400);
  const video = demo.video();
  await videoContext.close();
  await video.saveAs(path.join(dir, "interaction-walkthrough.webm"));
  const original = await video.path();
  if (original !== path.join(dir, "interaction-walkthrough.webm"))
    await fs.unlink(original);
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir, size: { width: 390, height: 844 } },
  });
  const phone = await mobileContext.newPage();
  await phone.goto(base + "/#/markets");
  await phone.locator('[data-action="pick"]').first().click();
  await phone.waitForTimeout(700);
  await phone.locator('[data-amount="200"]').click();
  // Exercise a fresh amount without waiting for snapshot preparation.
  await phone.locator('[data-action="minimize"]').click();
  await phone.waitForTimeout(1200);
  await phone.locator('[data-action="restore-slip"]').click();
  await phone.waitForTimeout(1200);
  const phoneVideo = phone.video();
  await mobileContext.close();
  const phoneTarget = path.join(dir, "genie-mobile.webm");
  await phoneVideo.saveAs(phoneTarget);
  const phoneOriginal = await phoneVideo.path();
  if (phoneOriginal !== phoneTarget) await fs.unlink(phoneOriginal);
  const combinedContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir, size: { width: 390, height: 844 } },
  });
  const combined = await combinedContext.newPage();
  await collectPredictions(combined, 550);
  await combined
    .locator("dialog")
    .evaluate((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  await combined.waitForTimeout(800);
  await reviewCombinedPayment(combined, 700);
  await combined.waitForTimeout(1100);
  await combined
    .locator('[data-action="sign-prediction"]')
    .scrollIntoViewIfNeeded();
  await combined.waitForTimeout(800);
  await submitCombinedPayment(combined);
  await combined.waitForTimeout(1400);
  await combined.locator('[data-action="view-activity"]').click();
  await combined
    .locator(".activity-card")
    .filter({ hasText: "Preview submission" })
    .first()
    .scrollIntoViewIfNeeded();
  await combined.waitForTimeout(1700);
  await saveVideo(combinedContext, combined, "multi-pick-mobile.webm");
  await browser.close();
  const summary = {
    kind: "local design preview screenshots",
    images,
    video: "interaction-walkthrough.webm",
    motionVideo: "genie-mobile.webm",
    combinedPaymentVideo: "multi-pick-mobile.webm",
    combinedPayment: {
      picks: [
        {
          fixture: "Arsenal vs Chelsea",
          outcome: "Arsenal to win",
          stake: 200,
        },
        {
          fixture: "Man City vs Liverpool",
          outcome: "Liverpool to win",
          stake: 300,
        },
        { fixture: "Aston Villa vs Tottenham", outcome: "Draw", stake: 500 },
      ],
      totalStakes: 1000,
      recoverableStorage: 963,
      estimatedNetworkFee: 0.005,
      totalToPay: 1963.005,
      settlement: "Three independent simulated positions, one sample payment",
    },
    sizes: ["1440x1000", "390x844"],
    network: "loopback preview only",
    limitations: [
      "Synthetic data",
      "No actual wallet approval",
      "No real-device motion profile",
    ],
  };
  await fs.writeFile(
    path.join(dir, "captures.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
  console.log(
    `Captured ${images.length} screenshots, interaction walkthrough, mobile motion clip and combined-payment demo in ${dir}`,
  );
}
main().catch(async (e) => {
  await captureBrowser?.close();
  console.error(e);
  process.exitCode = 1;
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('../../node_modules/playwright');
const origin = 'http://127.0.0.1:4187';
const evidence = path.resolve(__dirname, '../../../../.quality-artifacts/slip-workspace-review');
fs.mkdirSync(evidence, { recursive: true });
(async () => {
  const results = [];
  for (const [name, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await engine.launch();
    try {
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [1440, 900],
      ]) {
        const context = await browser.newContext({
          viewport: { width, height },
          reducedMotion: 'reduce',
        });
        const page = await context.newPage(),
          errors = [],
          external = [],
          writes = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await context.route('**/*', (route) => {
          const req = route.request();
          if (new URL(req.url()).origin !== origin) {
            external.push(req.url());
            return route.abort();
          }
          if (req.method() !== 'GET') writes.push(req.url());
          return route.continue();
        });
        await page.goto(origin);
        await page.locator('.pick').nth(5).waitFor();
        await page.locator('[data-count="4"]').click();
        const input = page.locator('[data-amount]').first();
        await input.fill('1000');
        const focus = await input.evaluate((el) => ({
          outline: getComputedStyle(el).outlineStyle,
          parent: getComputedStyle(el.closest('.amount-field')).borderColor,
        }));
        assert.equal(focus.outline, 'none');
        assert.equal(focus.parent, 'rgb(255, 155, 119)');
        const layout = await page.evaluate(() => ({
          footer: document.querySelector('.slip-footer').getBoundingClientRect().height,
          list: document.querySelector('#picks-panel').getBoundingClientRect().height,
          overflow: document.documentElement.scrollWidth > innerWidth,
        }));
        assert.ok(layout.footer < 185);
        assert.ok(layout.list > 200);
        assert.equal(layout.overflow, false);
        assert.equal(await page.locator('#picks-panel .receipt').count(), 0);
        await page.screenshot({ path: path.join(evidence, `picks-focus-${name}-${width}.png`) });
        await page.locator('#breakdown-button').click();
        await page.locator('#cost-panel').waitFor();
        await page.locator('#cost-panel').getByText('Refundable', { exact: true }).waitFor();
        await page.screenshot({ path: path.join(evidence, `costs-${name}-${width}.png`) });
        await page.keyboard.press('Escape');
        assert.equal(
          await page.locator('#breakdown-button').evaluate((el) => el === document.activeElement),
          true,
        );
        await page.locator('#activity-tab').click();
        await page.locator('#activity-list .receipt').first().waitFor();
        assert.equal(await page.locator('#slip-footer').isVisible(), false);
        await page.locator('#activity-list summary').first().click();
        await page.locator('#picks-tab').click();
        assert.equal(await input.inputValue(), '1000');
        await page.locator('[data-count="8"]').click();
        await page.locator('.pick').nth(7).scrollIntoViewIfNeeded();
        const add = await page.locator('#add-matches').boundingBox();
        assert.ok(add.y > 0 && add.y + add.height < height);
        assert.equal(await page.locator('#add-matches').isDisabled(), true);
        await page.locator('#close-slip').click();
        await page.locator('#show-plan').click();
        await page.locator('#simulate-delay').check();
        await page.locator('#plan-done').click();
        await page.locator('#slip-dock').click();
        await page.locator('#review-button').click();
        await page.locator('#review-button').getByText(/^Pay /).waitFor();
        assert.equal(await page.locator('#wallet-total').innerText(), '3,368.00006 tCKB');
        await page.locator('#review-button').click();
        await page.locator('#slip').waitFor({ state: 'hidden' });
        await page
          .locator('#tracker-title')
          .getByText('Still checking your payment', { exact: true })
          .waitFor();
        await page.locator('#tracker-toggle').click();
        await page.locator('#continue-demo').click();
        await page
          .locator('#tracker-title')
          .getByText('Payment confirmed', { exact: true })
          .waitFor();
        await page.locator('#view-receipt').click();
        assert.equal(await page.locator('#activity-list .receipt').count(), 2);
        await page.screenshot({ path: path.join(evidence, `activity-${name}-${width}.png`) });
        await page.locator('#picks-tab').click();
        assert.equal(await page.locator('.pick').count(), 0);
        await page.locator('[data-open-picker]').click();
        await page.locator('#picker-list [data-add]').first().click();
        await page.locator('#close-picker').click();
        assert.equal(await page.locator('.pick').count(), 1);
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.deepEqual(writes, []);
        results.push({ name, width, height, ...layout });
        console.log(
          `PASS slip workspace ${name} ${width}x${height}: single focus, 8 picks, compact footer, separate receipts, delayed confirmation, zero writes`,
        );
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

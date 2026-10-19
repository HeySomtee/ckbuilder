const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('../../node_modules/playwright');
const origin = 'http://127.0.0.1:4193';
const evidence = path.resolve(__dirname, '../../../../.quality-artifacts/activity-review');
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
        const page = await context.newPage();
        const errors = [],
          external = [],
          writes = [],
          badResponses = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('response', (r) => {
          if (r.status() >= 400) badResponses.push(r.url());
        });
        await context.route('**/*', (route) => {
          const r = route.request();
          if (new URL(r.url()).origin !== origin) {
            external.push(r.url());
            return route.abort();
          }
          if (!['GET', 'HEAD'].includes(r.method())) {
            writes.push(r.url());
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(origin);
        await page.locator('[data-bet="live"]').waitFor();
        assert.equal(await page.locator('.bet').count(), 4);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.ok((await page.locator('.summary').innerText()).includes('2,313'));
        assert.equal(
          await page
            .locator('img')
            .evaluateAll((imgs) => imgs.every((i) => i.complete && i.naturalWidth > 0)),
          true,
        );
        if (width === 1440)
          assert.equal(
            await page.locator('.sidebar').evaluate((el) => el.scrollHeight > el.clientHeight),
            false,
          );
        await page.screenshot({
          path: path.join(evidence, `open-${name}-${width}.png`),
          fullPage: true,
        });
        await page.locator('#guide').click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.id === 'guide');
        await page.locator('#history-tab').click();
        assert.equal(await page.locator('.bet').count(), 6);
        await page.locator('[data-filter="lost"]').click();
        assert.equal(await page.locator('.bet').count(), 2);
        assert.ok(
          (await page.locator('[data-bet="past-loss"] .return').innerText()).includes('321'),
        );
        await page.locator('[data-filter="all"]').click();
        await page.screenshot({
          path: path.join(evidence, `history-${name}-${width}.png`),
          fullPage: true,
        });
        await page.locator('#search').fill('nothing matches');
        await page.getByText('No matching predictions.').waitFor();
        await page.locator('[data-action="clear"]').click();
        assert.equal(await page.locator('.bet').count(), 6);
        await page.locator('#open-tab').click();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#history-tab').getAttribute('aria-selected'), 'true');
        await page.keyboard.press('ArrowLeft');
        await page.locator('[data-action="claims"]').click();
        assert.equal(await page.locator('.bet').count(), 3);
        await page.locator('#open-winner').click();
        await page.locator('#detail[open]').waitFor();
        assert.ok((await page.locator('.breakdown').innerText()).includes('1,571'));
        assert.equal(
          await page.locator('#detail').evaluate((el) => el.scrollWidth > el.clientWidth),
          false,
        );
        assert.equal(
          await page
            .locator('#detail')
            .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
          0,
        );
        await page.screenshot({
          path: path.join(evidence, `detail-${name}-${width}.png`),
          fullPage: false,
        });
        await page.locator('#claim').click();
        assert.ok((await page.locator('#detail-content').innerText()).includes('1,570.999'));
        await page.locator('[data-action="confirm-claim"]').click();
        await page.locator('#detail').getByText('Confirming transfer', { exact: true }).waitFor();
        await page.locator('[data-action="close"]').click();
        await page.locator('#history-tab').click();
        await page.waitForFunction(
          () =>
            document.querySelector('[data-bet="winner"] .state small')?.textContent ===
            'Collected \u00b7 Just now',
        );
        assert.equal(await page.locator('.bet').count(), 6);
        assert.ok((await page.locator('.summary').innerText()).includes('742'));
        await page.locator('#scenario').selectOption('claim-error');
        await page.locator('#history-tab').click();
        await page.locator('#open-void').click();
        await page.locator('#claim').click();
        await page.locator('[data-action="confirm-claim"]').click();
        await page.locator('[data-action="check-claim"]').waitFor();
        assert.equal(await page.locator('[data-action="confirm-claim"]').count(), 0);
        await page.locator('[data-action="check-claim"]').click();
        assert.ok(
          (await page.locator('#detail-content').innerText()).includes('Returned to your wallet'),
        );
        await page.keyboard.press('Escape');
        await page.locator('#scenario').selectOption('unavailable');
        await page.locator('#history-tab').click();
        await page.locator('#open-winner').click();
        assert.equal(await page.locator('#claim').isDisabled(), true);
        await page.keyboard.press('Escape');
        await page.locator('#scenario').selectOption('uncertain');
        await page.locator('#payment-open').click();
        assert.ok((await page.locator('#detail-content').innerText()).includes('1,263'));
        await page.locator('[data-action="check-payment"]').click();
        assert.equal(await page.locator('[data-action="confirm-claim"]').count(), 0);
        await page.keyboard.press('Escape');
        await page.locator('#scenario').selectOption('empty');
        await page.getByText('Your first call starts here.').waitFor();
        assert.equal(await page.locator('.bet').count(), 0);
        await page.locator('#scenario').selectOption('disconnected');
        await page.locator('[data-action="connect"]').click();
        assert.equal(await page.locator('.bet').count(), 4);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (width === 1440) {
          await page.setViewportSize({ width: 1280, height: 650 });
          assert.equal(
            await page.locator('.sidebar').evaluate((el) => el.scrollHeight > el.clientHeight),
            false,
          );
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.deepEqual(writes, []);
        assert.deepEqual(badResponses, []);
        results.push({
          browser: name,
          width,
          height,
          passed: true,
          errors,
          externalRequests: external.length,
          writes: writes.length,
        });
        console.log(
          `PASS ${name} ${width}: open/history, search, statuses, refunds, interrupted claims, mobile layout and isolation`,
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
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

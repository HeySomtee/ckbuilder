const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('../../node_modules/playwright');
const origin = 'http://127.0.0.1:4192';
const evidence = path.resolve(__dirname, '../../../../.quality-artifacts/survivor-review');
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
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('response', (response) => {
          if (response.status() >= 400) badResponses.push(response.url());
        });
        await context.route('**/*', (route) => {
          const request = route.request();
          if (new URL(request.url()).origin !== origin) {
            external.push(request.url());
            return route.abort();
          }
          if (!['GET', 'HEAD'].includes(request.method())) {
            writes.push(request.url());
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(origin);
        await page.locator('[data-team="city"]').waitFor();
        assert.equal(await page.locator('#manage').count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (width === 1440)
          assert.equal(
            await page.locator('.sidebar').evaluate((el) => el.scrollHeight > el.clientHeight),
            false,
          );
        assert.equal(
          await page
            .locator('img')
            .evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0)),
          true,
        );
        await page.screenshot({
          path: path.join(evidence, `overview-${name}-${width}.png`),
          fullPage: true,
        });
        await page.locator('#how').click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.activeElement?.id === 'how');

        // Free entry, editable pick and locked admin terms.
        await page.locator('#join').click();
        assert.ok((await page.locator('.invoice').innerText()).includes('Free entry'));
        assert.equal(await page.locator('#confirm-entry').isDisabled(), true);
        await page.locator('#accept').check();
        await page.locator('#confirm-entry').click();
        await page.locator('#modal').waitFor({ state: 'hidden' });
        await page.locator('[data-team="city"]').click();
        await page.locator('#save-pick').click();
        await page.locator('[data-team="chelsea"]').click();
        await page.locator('#save-pick').click();
        await page.locator('[data-tab="history"]').click();
        assert.ok((await page.locator('#game-panel').innerText()).includes('Chelsea'));
        await page.locator('[data-tab="board"]').click();
        assert.equal(await page.getByText('Hidden until lock', { exact: true }).count(), 3);
        await page.locator('#role').selectOption('admin');
        await page.locator('#manage').click();
        assert.equal(await page.locator('[name="title"]').isDisabled(), true);
        assert.equal(await page.getByRole('button', { name: 'Publish preview' }).count(), 0);
        await page.keyboard.press('Escape');
        assert.equal(
          await page.locator('#manage').evaluate((el) => el === document.activeElement),
          true,
        );

        // Admin creates a fee-gated competition; verify validation and exact displayed terms.
        await page.locator('#reset').click();
        await page.locator('#manage').click();
        await page.locator('[name="title"]').fill('The weekend survivors');
        await page.locator('[name="mode"][value="paid"]').check();
        await page.locator('[name="fee"]').fill('0');
        await page.getByRole('button', { name: 'Publish preview' }).click();
        assert.equal(await page.locator('[name="fee"]').evaluate((el) => el.validity.valid), false);
        assert.equal(await page.locator('#modal').isVisible(), true);
        await page.locator('[name="fee"]').fill('250');
        await page.locator('[name="prize"]').fill('25000');
        await page.locator('[name="limit"]').fill('32');
        await page.screenshot({ path: path.join(evidence, `admin-${name}-${width}.png`) });
        await page.getByRole('button', { name: 'Publish preview' }).click();
        await page.locator('#modal').waitFor({ state: 'hidden' });
        assert.ok((await page.locator('.competition-bar').innerText()).includes('25,000 tCKB'));
        assert.ok((await page.locator('.competition-bar').innerText()).includes('250 tCKB'));
        await page.locator('#role').selectOption('player');
        await page.locator('#join').click();
        await page.locator('#accept').check();
        await page.locator('#fail-entry').check();
        await page.locator('#confirm-entry').click();
        await page.getByText('Sample attempt failed.', { exact: false }).waitFor();
        assert.equal(await page.locator('#join').count(), 1);
        await page.locator('#fail-entry').uncheck();
        await page.screenshot({ path: path.join(evidence, `entry-${name}-${width}.png`) });
        await page.locator('#confirm-entry').click();
        await page.locator('#modal').waitFor({ state: 'hidden' });

        // Used teams, privacy/reveal, outcomes and reset.
        await page.locator('#scenario').selectOption('mid');
        assert.equal(await page.locator('[data-team="liverpool"]').isDisabled(), true);
        assert.equal(await page.locator('[data-team="city"]').isDisabled(), false);
        await page.locator('#game-panel').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(evidence, `team-reserve-${name}-${width}.png`) });
        await page.locator('#scenario').selectOption('locked');
        assert.equal(await page.locator('[data-team="city"]').isDisabled(), true);
        await page.locator('[data-tab="board"]').click();
        assert.equal(await page.getByText('Hidden until lock', { exact: true }).count(), 0);
        for (const [scenario, text] of [
          ['survived', 'Still standing.'],
          ['out', 'A good run. A tough result.'],
          ['winner', 'Last one standing.'],
        ]) {
          await page.locator('#scenario').selectOption(scenario);
          await page.getByRole('heading', { name: text, exact: true }).waitFor();
        }
        await page.locator('#reset').click();
        assert.equal(await page.locator('#join').count(), 1);
        assert.equal(await page.locator('#save-pick').isDisabled(), true);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.deepEqual(writes, []);
        assert.deepEqual(badResponses, []);
        results.push({ browser: name, width, height, passed: true, errors, external, writes });
        console.log(`PASS ${name} ${width}x${height}`);
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify(
      { checkedAt: new Date().toISOString(), scope: 'Isolated preview only', results },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

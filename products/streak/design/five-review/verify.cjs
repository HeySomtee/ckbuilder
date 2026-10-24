const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('../../node_modules/playwright');
const origin = 'http://127.0.0.1:4195';
const evidence = path.resolve(__dirname, '../../../../.quality-artifacts/five-review');
fs.mkdirSync(evidence, { recursive: true });
const players = [
  { id: 1, name: 'Keeper', position: 'GK', teamId: 1, cost: 50 },
  { id: 2, name: 'Defender', position: 'DEF', teamId: 1, cost: 50 },
  { id: 3, name: 'Creator', position: 'MID', teamId: 2, cost: 90 },
  { id: 4, name: 'Runner', position: 'MID', teamId: 3, cost: 90 },
  { id: 5, name: 'Striker', position: 'FWD', teamId: 4, cost: 120 },
  { id: 6, name: 'Premium', position: 'FWD', teamId: 4, cost: 130 },
  { id: 7, name: 'Clubmate', position: 'MID', teamId: 1, cost: 80 },
].map((p) => ({
  ...p,
  fullName: `Preview ${p.name}`,
  team: `Preview Club ${p.teamId}`,
  teamCode: `T${p.teamId}`,
  form: 5,
  points: 30,
  status: 'a',
}));
const snapshot = { fetchedAt: '2026-10-20T12:00:00Z', players };
(async () => {
  const results = [];
  for (const [engineName, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const errors = [],
          external = [],
          writes = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await context.route('**/*', (route) => {
          const req = route.request();
          if (new URL(req.url()).origin !== origin) {
            external.push(req.url());
            return route.abort();
          }
          if (req.method() !== 'GET') {
            writes.push(req.url());
            return route.abort();
          }
          if (req.url().endsWith('/players.json')) return route.fulfill({ json: snapshot });
          return route.continue();
        });
        await page.goto(origin);
        await page.locator('[data-add="1"]').waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.equal(await page.locator('[data-action="review"]').isDisabled(), true);
        for (const id of [1, 2]) await page.locator(`[data-add="${id}"]`).click();
        await page.locator('[data-add="7"]').click();
        assert.match(await page.locator('#toast').textContent(), /two players/);
        for (const id of [3, 4]) await page.locator(`[data-add="${id}"]`).click();
        await page.locator('[data-add="6"]').click();
        assert.match(await page.locator('#toast').textContent(), /40 credits/);
        await page.locator('[data-add="5"]').click();
        assert.equal(await page.locator('[data-action="review"]').isDisabled(), true);
        await page.locator('[data-captain="3"]').click();
        await page.locator('[data-action="review"]').click();
        await page.locator('[data-action="save"]').click();
        assert.match(await page.locator('#entry-panel').textContent(), /Preview entry saved/);
        await page.reload();
        await page.locator('.slot-name').first().waitFor();
        assert.equal(await page.locator('.slot-name').count(), 5);
        assert.equal(await page.locator('[data-captain="3"]').getAttribute('aria-pressed'), 'true');
        await page.locator('#state').selectOption('locked');
        assert.equal(await page.locator('[data-remove="1"].add-player').isDisabled(), true);
        await page.locator('#state').selectOption('live');
        assert.match(await page.locator('#round-tracker').textContent(), /SIMULATED ROUND/);
        await page.locator('[data-score="3"]').click();
        assert.match(await page.locator('#modal').textContent(), /Captain ×2/);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#modal').evaluate((el) => el.open), false);
        await page.locator('#state').selectOption('delayed');
        assert.match(await page.locator('[data-score="5"]').textContent(), /Pending/);
        await page.locator('#state').selectOption('building');
        await page.locator('#search').fill('Not a player');
        assert.match(await page.locator('#players').textContent(), /No players match/);
        await page.locator('#search').fill('');
        await page.locator('[data-position="GK"]').click();
        assert.equal(await page.locator('.player-row').count(), 1);
        await page.locator('[data-position="ALL"]').click();
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: path.join(evidence, `${engineName}-${width}.png`),
          fullPage: true,
        });
        await page.locator('[data-action="clear"]').click();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.slot-name').count(), 5);
        await page.locator('[data-action="clear"]').click();
        await page.locator('[data-action="confirm-clear"]').click();
        assert.equal(await page.locator('.slot-name').count(), 0);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.deepEqual(writes, []);
        results.push({ engine: engineName, width, passed: true });
        await context.close();
      }
      const context = await browser.newContext();
      await context.route('**/players.json', (route) =>
        route.fulfill({ status: 503, body: 'Unavailable' }),
      );
      const page = await context.newPage();
      await page.goto(origin);
      await page.locator('[data-action="retry"]').waitFor();
      assert.match(await page.locator('#error').textContent(), /has not been removed/);
      await context.unroute('**/players.json');
      await context.route('**/players.json', (route) => route.fulfill({ json: snapshot }));
      await page.locator('[data-action="retry"]').click();
      await page.locator('[data-add="1"]').waitFor();
      await context.close();
      const storageContext = await browser.newContext();
      await storageContext.addInitScript(() => {
        Storage.prototype.setItem = () => {
          throw new Error('Storage unavailable');
        };
      });
      await storageContext.route('**/players.json', (route) => route.fulfill({ json: snapshot }));
      const storagePage = await storageContext.newPage();
      await storagePage.goto(origin);
      await storagePage.locator('[data-add="1"]').waitFor();
      for (const id of [1, 2, 3, 4, 5]) await storagePage.locator(`[data-add="${id}"]`).click();
      await storagePage.locator('[data-captain="3"]').click();
      await storagePage.locator('[data-action="review"]').click();
      await storagePage.locator('[data-action="save"]').click();
      assert.equal(await storagePage.locator('#modal').evaluate((el) => el.open), true);
      assert.match(await storagePage.locator('#toast').textContent(), /could not save/);
      assert.match(await storagePage.locator('#save-error').textContent(), /could not save/);
      assert.doesNotMatch(await storagePage.locator('#entry-panel').textContent(), /entry saved/);
      await storageContext.close();
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    path.join(evidence, 'results.json'),
    JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
  );
  console.log(
    `PASS: ${results.length} desktop/mobile journeys, snapshot retry and storage failure in both engines. Synthetic data only.`,
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

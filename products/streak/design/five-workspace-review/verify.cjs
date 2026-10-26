const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('../../node_modules/playwright');
const origin = 'http://127.0.0.1:4196';
const directory = path.resolve(__dirname, '../../../../.quality-artifacts/five-workspace-review');
fs.mkdirSync(directory, { recursive: true });
(async () => {
  const results = [];
  for (const [name, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: width === 320 ? 568 : 900 },
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const errors = [],
          requests = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await context.route('**/*', (route) => {
          const request = route.request();
          if (!request.url().startsWith(origin + '/') || request.method() !== 'GET') {
            requests.push(`${request.method()} ${request.url()}`);
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(origin);
        assert.equal(await page.locator('#tab-team').getAttribute('aria-selected'), 'true');
        const pitch = await page.locator('#pitch').boundingBox();
        assert(pitch.y < 400, 'Squad is visible immediately');
        for (const player of await page.locator('.player').all()) {
          const bounds = await player.boundingBox();
          assert(
            bounds.y >= pitch.y && bounds.y + bounds.height <= pitch.y + pitch.height,
            'Every player and label fits on the pitch',
          );
        }
        const keeper = await page.locator('[data-role="GK"]').boundingBox();
        const defender = await page.locator('[data-role="DEF"]').boundingBox();
        const forward = await page.locator('[data-role="FWD"]').boundingBox();
        const mids = await page.locator('[data-role="MID"]').all();
        for (const mid of mids) {
          const box = await mid.boundingBox();
          assert(
            box.y > forward.y + forward.height && box.y + box.height < defender.y,
            'Midfield line sits between the forward and defender',
          );
        }
        assert(defender.y + defender.height < keeper.y, 'Keeper has a separate line');
        assert.equal(await page.locator('#save-team').getAttribute('aria-disabled'), 'true');
        assert.match(await page.locator('#save-hint').innerText(), /Choose a captain/);
        if (width < 651) {
          const picker = page.locator('[data-workspace="players"]');
          assert(
            (await picker.boundingBox()).y < 400,
            'Player selection reachable without scrolling',
          );
          await picker.click();
          assert(await page.locator('#search').isVisible());
          await page.locator('.player-row').last().scrollIntoViewIfNeeded();
          const back = await page.locator('.players [data-back-squad]').boundingBox();
          assert(
            back.y >= 0 && back.y + back.height < page.viewportSize().height,
            'Back to squad stays reachable while browsing players',
          );
          await page.locator('.players [data-back-squad]').click();
          assert(await page.locator('#pitch').isVisible());
        }
        await page.screenshot({
          path: path.join(directory, `${name}-${width}-squad.png`),
          fullPage: true,
        });
        await page.locator('#choose-captain').click();
        await page.locator('[data-choose="3"]').click();
        assert.equal(await page.locator('#save-team').getAttribute('aria-disabled'), 'false');
        await page.locator('#save-team').click();
        await page.locator('#confirm-save').click();
        assert.match(await page.locator('#save-team').innerText(), /Changes saved/);
        await page.locator('[data-captain="4"]').click();
        assert.match(await page.locator('#save-team').innerText(), /Save changes/);
        await page.locator('#tab-sponsors').click();
        await page.evaluate(() => scrollTo(0, 0));
        const bid = await page.locator('#place-bid').boundingBox();
        assert(bid.y < page.viewportSize().height, 'Sponsor bid is visible immediately');
        await page.screenshot({
          path: path.join(directory, `${name}-${width}-auction.png`),
          fullPage: true,
        });
        await page.locator('#place-bid').click();
        await page.locator('#bid-amount').fill('50');
        await page.locator('#review-bid').click();
        assert.match(await page.locator('#bid-feedback').innerText(), /minimum contribution/);
        await page.locator('#bid-amount').fill('2100');
        await page.locator('#review-bid').click();
        assert.match(await page.locator('#dialog-content').innerText(), /No funds moved/);
        await page.locator('#dialog-back-squad').click();
        assert(await page.locator('#pitch').isVisible());
        assert.match(await page.locator('#save-team').innerText(), /Save changes/);
        await page.locator('#tab-sponsors').click();
        assert(await page.locator('#showcase-description').isVisible());
        await page.locator('#brand-name').fill('Touchline Labs');
        await page.locator('#brand-description').fill('A community toolkit for football fans.');
        await page.locator('#update-brand').click();
        assert.equal(await page.locator('#showcase-name').innerText(), 'Touchline Labs');
        assert.equal(
          await page.locator('#showcase-description').innerText(),
          'A community toolkit for football fans.',
        );
        await page.screenshot({
          path: path.join(directory, `${name}-${width}-sponsor.png`),
          fullPage: true,
        });
        await page.locator('#visit-sponsor').click();
        await page.keyboard.press('Escape');
        await page.waitForFunction(
          () =>
            !document.querySelector('#dialog').open &&
            document.activeElement.id === 'visit-sponsor',
        );
        assert.equal(await page.evaluate(() => document.activeElement.id), 'visit-sponsor');
        await page.locator('#anonymous').check();
        await page.locator('#update-brand').click();
        assert.equal(await page.locator('#showcase-name').innerText(), 'Community supporter');
        assert.equal(await page.locator('#visit-sponsor').isVisible(), false);
        assert.equal(await page.locator('#showcase-logo').isVisible(), false);
        await page.locator('#show-auction').click();
        assert.match(await page.locator('#showcase-kicker').innerText(), /NOT YET CHOSEN/);
        await page.locator('#tab-team').click();
        assert.match(
          await page.locator('#save-team').innerText(),
          /Save changes/,
          'Draft survives tabs',
        );
        await page.locator('#save-team').click();
        await page.locator('#confirm-save').click();
        assert.match(await page.locator('#save-team').innerText(), /Changes saved/);
        await page.locator('#tab-more').click();
        await page.locator('#sponsor-scenario').selectOption('none');
        assert.match(await page.locator('#showcase-kicker').innerText(), /UNSPONSORED/);
        await page.locator('#tab-team').click();
        if (width < 651) await page.locator('[data-workspace="players"]').click();
        await page.locator('#search').fill('Lewis');
        await page.locator('[data-pick="6"]').click();
        await page.locator('[data-swap="4"]').click();
        if (width < 651) await page.locator('[data-workspace="squad"]').click();
        assert.match(
          await page.locator('#save-hint').innerText(),
          /Choose a captain before saving/,
        );
        assert.equal(await page.locator('[data-captain="6"]').count(), 1);
        await page.locator('#tab-team').focus();
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#tab-standings').getAttribute('aria-selected'), 'true');
        for (const tab of ['team', 'sponsors', 'more']) {
          await page.locator(`#tab-${tab}`).click();
          assert(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `No horizontal overflow on ${tab}`,
          );
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(requests, []);
        results.push({
          engine: name,
          width,
          passed: true,
          errors,
          externalOrWriteRequests: requests,
        });
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    path.join(directory, 'results.json'),
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2),
  );
  console.log(`${results.length} preview journeys passed. No external requests or writes.`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

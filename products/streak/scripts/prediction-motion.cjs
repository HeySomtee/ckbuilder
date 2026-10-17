/* The owner removed Genie motion. Verify immediate, accessible draft dismissal. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { observeReads, accountReadFinished } = require('./browser-readiness.cjs');
module.exports = async function slipDismissal({ browser, base, name, evidence }) {
  let groups = 0;
  for (const width of [390, 1440])
    for (const count of [2, 8]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        reducedMotion: 'no-preference',
        serviceWorkers: 'block',
      });
      const errors = [],
        external = [],
        writes = [];
      await context.route('**/*', (route) => {
        const request = route.request();
        if (new URL(request.url()).origin !== base) {
          external.push(request.url());
          return route.abort();
        }
        if (!['GET', 'HEAD'].includes(request.method())) {
          writes.push(request.url());
          return route.abort();
        }
        return route.continue();
      });
      await context.routeWebSocket('**/*', (socket) => socket.close());
      const page = await context.newPage(),
        reads = observeReads(page, base);
      page.on('pageerror', (error) => errors.push(error.message));
      const draft = {
        v: 1,
        revision: 'close-test',
        picks: Array.from({ length: count }, (_, index) => {
          const id = index === 0 ? 'slip-one' : index === 1 ? 'slip-two' : 'slip-' + (index + 1);
          return {
            lineId: id,
            marketId: 'm-' + id,
            matchId: id,
            outcome: 'home',
            amountCkb: '100',
          };
        }),
      };
      await page.addInitScript(
        (value) => localStorage.setItem('streak.predictionDraft.v1', JSON.stringify(value)),
        draft,
      );
      try {
        await reads.goto(base + '/season/?market=m-slip-one');
        await accountReadFinished(page);
        await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
        const dock = page.locator('.prediction-dock'),
          dialog = page.getByRole('dialog', { name: 'Prediction slip' });
        await dock.click();
        await dialog.getByRole('button', { name: 'Close prediction slip', exact: true }).waitFor();
        assert.equal(await dialog.locator('.slip-pick').count(), count);
        assert.equal(
          await dialog.getByRole('button', { name: 'Minimize slip', exact: true }).count(),
          0,
        );
        const stake = dialog.getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' });
        await stake.fill('125.00000001');
        const saved = await page.evaluate(() => localStorage.getItem('streak.predictionDraft.v1'));
        for (const action of ['click', 'escape', 'keyboard']) {
          const close = dialog.getByRole('button', { name: 'Close prediction slip', exact: true });
          const bounds = await close.boundingBox();
          assert.ok(bounds.width >= 44 && bounds.height >= 44);
          if (action === 'click') await close.click();
          else if (action === 'escape') await page.keyboard.press('Escape');
          else {
            await close.focus();
            await page.keyboard.press('Enter');
          }
          await dialog.waitFor({ state: 'hidden', timeout: 1000 });
          await page.waitForFunction(() =>
            document.activeElement?.classList.contains('prediction-dock'),
          );
          assert.equal(await page.locator('.genie-layer, .genie-copy, .genie-canvas').count(), 0);
          assert.equal(
            await page.evaluate(() => localStorage.getItem('streak.predictionDraft.v1')),
            saved,
          );
          await dock.click();
          await stake.waitFor({ timeout: 1000 });
          assert.equal(await stake.inputValue(), '125.00000001');
          assert.ok(await dialog.evaluate((node) => node.contains(document.activeElement)));
        }
        await page.setViewportSize({ width, height: 568 });
        await dialog.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
        await dock.click();
        assert.equal(await dialog.locator('.slip-pick').count(), count);
        assert.ok(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        );
        await page.screenshot({
          path: path.join(evidence, 'slip-close-' + name + '-' + width + '-' + count + '.png'),
        });
        await page.keyboard.press('Escape');
        await accountReadFinished(page);
        await reads.settled();
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.deepEqual(writes, []);
        groups++;
      } finally {
        await context.close();
      }
    }
  return groups;
};

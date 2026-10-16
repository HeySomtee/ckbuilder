/* Real loopback API and built UI. Synthetic fixtures, no wallet or external requests. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { observeReads, accountReadFinished } = require('./browser-readiness.cjs');

async function restoredMarketReady(page) {
  await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
  await accountReadFinished(page);
}

module.exports = async function predictionJourney({
  browser,
  base,
  name,
  update,
  ensureMarketsForMatches,
  friday,
  evidence,
  loopbackFetch,
}) {
  const ids = [
    'slip-one',
    'slip-two',
    ...Array.from({ length: 6 }, (_, index) => `slip-${index + 3}`),
  ];
  await update((db) => {
    db.matches = db.matches.filter((row) => !ids.includes(row.id));
    db.markets = db.markets.filter((row) => !ids.includes(row.matchId));
    ids.forEach((id, index) =>
      db.matches.push({
        id,
        kickoff: new Date(friday.getTime() + (168 + index) * 3600000).toISOString(),
        date: '2030-01-01',
        status: 'scheduled',
        stage: 'Synthetic test',
        competition: { id: 'test', name: 'Test Premier League' },
        home: {
          name: index > 1 ? `Home ${index + 1}` : index ? 'Liverpool' : 'Arsenal',
          code: index > 1 ? `H${index + 1}` : index ? 'LIV' : 'ARS',
        },
        away: {
          name: index > 1 ? `Away ${index + 1}` : index ? 'Tottenham' : 'Chelsea',
          code: index > 1 ? `A${index + 1}` : index ? 'TOT' : 'CHE',
        },
        oracle: { provider: 'worldcup', fixtureId: id },
      }),
    );
    ensureMarketsForMatches(db);
  });
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: width === 320 ? 568 : 900 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const errors = [],
      writes = [],
      external = [];
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base) {
        external.push(url.href);
        return route.abort();
      }
      if (
        request.method() !== 'GET' &&
        request.method() !== 'HEAD' &&
        url.pathname !== '/api/slips/review'
      ) {
        writes.push(url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    const page = await context.newPage();
    const reads = observeReads(page, base);
    let phase = 'load weekend';
    const requestTrace = reads.trace;
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    try {
      await reads.goto(base + '/season/');
      await page.getByRole('button', { name: 'Next weekend', exact: true }).click();
      await page
        .getByRole('button', { name: 'Add Home for Arsenal vs Chelsea', exact: true })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Minimize slip', exact: true })
        .click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page
        .getByRole('button', { name: 'Add Draw for Liverpool vs Tottenham', exact: true })
        .click();
      assert.equal(
        await page.getByRole('dialog').count(),
        0,
        'A later pick keeps match browsing available.',
      );
      await page.locator('.prediction-dock').click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Minimize slip', exact: true })
        .click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const card = page
        .locator('.market-card')
        .filter({ has: page.getByRole('heading', { name: 'Arsenal', exact: true }) });
      await card.getByRole('link', { name: 'View market' }).click();
      await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('market'), 'm-slip-one');
      await page.locator('.detail-outcomes').getByRole('button').nth(2).click();
      assert.equal(
        await page.getByRole('dialog').count(),
        0,
        'Replacing a pick retains the current match context.',
      );
      await page.locator('.detail-outcomes').getByRole('button').nth(2).click();
      await page.getByRole('dialog').getByText('Chelsea to win', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('dialog').locator('.slip-pick').count(),
        2,
        'Selecting the same outcome reopens the existing pick without duplicating it.',
      );
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Minimize slip', exact: true })
        .click();
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.screenshot({
        path: path.join(evidence, `market-detail-${name}-${width}.png`),
        fullPage: true,
      });
      await page.locator('.prediction-dock').click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      assert.equal(
        await dialog.getByRole('button', { name: 'Close slip', exact: true }).count(),
        0,
      );
      assert.equal(
        await dialog.getByRole('button', { name: 'Minimize slip', exact: true }).count(),
        1,
      );
      assert.equal(await dialog.locator('.slip-pick').count(), 2);
      await dialog.getByText('Chelsea to win', { exact: true }).waitFor();
      const stake = dialog.getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' });
      await stake.fill('10.00000001');
      assert.equal(await dialog.locator('.slip-total strong').textContent(), '110.00000001 tCKB');
      await dialog.getByRole('button', { name: 'Review predictions', exact: true }).click();
      await dialog
        .getByText('Draft checked. No bets placed and no funds moved.', { exact: true })
        .waitFor();
      await page.screenshot({ path: path.join(evidence, `prediction-slip-${name}-${width}.png`) });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1);
      // Keyboard focus remains inside the modal; labelled controls retain input.
      await dialog.getByRole('button', { name: 'Minimize slip', exact: true }).focus();
      await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(
        await page.locator('.genie-layer').count(),
        0,
        'Reduced motion bypasses Genie rendering.',
      );
      await page.waitForFunction(() => document.activeElement.className === 'prediction-dock');
      assert.equal(await page.evaluate(() => document.activeElement.className), 'prediction-dock');
      phase = 'restore saved draft';
      await reads.reload();
      await restoredMarketReady(page);
      await page.locator('.prediction-dock').click();
      await dialog.getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' }).waitFor();
      assert.equal(await stake.inputValue(), '10.00000001');
      assert.equal(await dialog.locator('.review-ok').count(), 0, 'Reviews are never persisted.');
      await stake.fill('10.');
      assert.equal(await dialog.locator('.slip-total strong').textContent(), 'Check amounts');
      assert.equal(
        await dialog.getByRole('button', { name: 'Review predictions', exact: true }).isDisabled(),
        true,
      );
      await stake.fill('10');
      // A response for an earlier edit cannot approve the new draft.
      let release, started;
      const begun = new Promise((done) => {
        started = done;
      });
      await page.route('**/api/slips/review', async (route) => {
        const response = await loopbackFetch(base + '/api/slips/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: route.request().postData(),
        });
        const body = await response.text();
        started();
        await new Promise((done) => {
          release = done;
        });
        try {
          await route.fulfill({ status: 200, contentType: 'application/json', body });
        } catch {
          /* The edit aborts the obsolete browser request. */
        }
      });
      await dialog.getByRole('button', { name: 'Review predictions', exact: true }).click();
      await begun;
      await stake.fill('20');
      release();
      await page.unroute('**/api/slips/review');
      await page.waitForTimeout(100);
      assert.equal(await dialog.locator('.review-ok').count(), 0);
      assert.equal(await dialog.locator('.slip-total strong').textContent(), '120 tCKB');
      if (width === 1440) {
        await page.clock.install();
        await page.clock.fastForward(16_000);
        let releaseTerms, termsStarted;
        const termsPending = new Promise((done) => {
          termsStarted = done;
        });
        await page.route('**/api/slips/review', async (route) => {
          const response = await loopbackFetch(base + '/api/slips/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: route.request().postData(),
          });
          const body = await response.text();
          termsStarted();
          await new Promise((done) => {
            releaseTerms = done;
          });
          await route.fulfill({ status: 200, contentType: 'application/json', body });
        });
        await dialog.getByRole('button', { name: 'Review predictions', exact: true }).click();
        await termsPending;
        await update((db) => {
          db.markets.find((row) => row.id === 'm-slip-one').feeBps.protocol += 1;
        });
        const refreshed = page.waitForResponse(
          (response) => new URL(response.url()).pathname === '/api/markets/m-slip-one/public',
        );
        await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
        await refreshed;
        releaseTerms();
        await dialog.getByText('Market rules changed. Review again.', { exact: true }).waitFor();
        assert.equal(
          await dialog.locator('.review-ok').count(),
          0,
          'Older review cannot replace newer rules.',
        );
        await page.unroute('**/api/slips/review');
        // A slow device clock cannot extend the server's thirty-second window.
        await page.clock.setSystemTime(new Date(Date.now() - 300_000));
        await dialog.getByRole('button', { name: 'Review predictions', exact: true }).click();
        await dialog.locator('.review-ok').waitFor();
        await page.clock.fastForward(31_000);
        await dialog
          .getByText('This review expired. Review again for current rules.', { exact: true })
          .waitFor();
        await page.clock.setSystemTime(new Date());
        await page.clock.resume();
      }
      // A closed line stays in the whole-slip result, alongside the valid line.
      await update((db) => {
        db.markets.find((row) => row.id === 'm-slip-two').status = 'closed';
      });
      await dialog.getByRole('button', { name: 'Review predictions', exact: true }).click();
      await dialog
        .getByText('Some predictions need attention. All picks are retained.', { exact: true })
        .waitFor();
      assert.equal(await dialog.locator('.slip-pick').count(), 2);
      await update((db) => {
        db.markets.find((row) => row.id === 'm-slip-two').status = 'open';
      });
      // A second tab cannot silently overwrite an open draft.
      const other = await context.newPage();
      const otherReads = observeReads(other, base);
      await otherReads.goto(base + '/season/?market=m-slip-one');
      await other.locator('.detail-outcomes').getByRole('button').first().click();
      await dialog
        .getByText('Another tab changed this slip. Choose which version to keep.', { exact: true })
        .waitFor();
      assert.equal(await stake.isDisabled(), true);
      await dialog.getByRole('button', { name: 'Keep this slip', exact: true }).click();
      assert.equal(await stake.inputValue(), '20');
      await accountReadFinished(other);
      await otherReads.settled();
      await other.close();
      await dialog.getByRole('button', { name: 'Clear slip', exact: true }).click();
      await dialog.getByRole('button', { name: 'Keep predictions', exact: true }).click();
      assert.equal(await dialog.locator('.slip-pick').count(), 2);
      await dialog.getByRole('button', { name: 'Clear slip', exact: true }).click();
      await dialog.getByRole('button', { name: 'Clear all predictions', exact: true }).click();
      assert.equal(await dialog.locator('.slip-pick').count(), 0);
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      phase = 'restore cleared draft';
      await reads.reload();
      // Absence of the dock is meaningful only after React and both route
      // reads have settled. Otherwise another reload aborts the initial reads
      // before this test has observed the cleared draft at all.
      await restoredMarketReady(page);
      assert.equal(await page.locator('.prediction-dock').count(), 0);
      await page.evaluate(() => localStorage.setItem('streak.predictionDraft.v1', '{broken'));
      phase = 'restore malformed draft';
      await reads.reload();
      await restoredMarketReady(page);
      await page.locator('.prediction-dock').click();
      await dialog.getByText(/The saved slip could not be restored/).waitFor();
      assert.equal(
        await page.evaluate(() => localStorage.getItem('streak.predictionDraft.v1')),
        '{broken',
      );
      await dialog.getByRole('button', { name: 'Start a new slip', exact: true }).click();
      await dialog.getByRole('button', { name: 'Clear all predictions', exact: true }).click();
      await dialog.getByRole('button', { name: 'Minimize slip', exact: true }).click();
      phase = 'missing market recovery';
      await reads.goto(base + '/season/?market=does-not-exist');
      await page.getByRole('heading', { name: 'This market could not be loaded' }).waitFor();
      await accountReadFinished(page);
      await page.getByRole('button', { name: 'Back to markets', exact: true }).click();
      await page.getByRole('heading', { name: 'You know the game.' }).waitFor();
      await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
      await reads.settled();
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, [], 'The draft journey never invokes a financial write.');
      assert.deepEqual(external, []);
    } catch (error) {
      await fs.writeFile(
        path.join(evidence, `prediction-recovery-failure-${name}-${width}.json`),
        JSON.stringify({ phase, errors, requestTrace }, null, 2),
      );
      await page.screenshot({
        path: path.join(evidence, `prediction-recovery-failure-${name}-${width}.png`),
      });
      throw error;
    } finally {
      await context.close();
    }
  }
  const motionGroups = await require('./prediction-motion.cjs')({ browser, base, name, evidence });
  await update((db) => {
    db.matches = db.matches.filter((row) => !ids.includes(row.id));
    db.markets = db.markets.filter((row) => !ids.includes(row.matchId));
  });
  return 3 + motionGroups;
};

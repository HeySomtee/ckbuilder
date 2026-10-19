/* Actual built Season UI, IndexedDB and CCC. Only an isolated synthetic transport is injected through the connector DOM. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');
const { observeReads, accountReadFinished } = require('./browser-readiness.cjs');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-direct-browser-'));
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.STREAK_DB_FILE = path.join(temp, 'db.json');
  process.env.MATCH_PROVIDER = 'worldcup';
  for (const key of [
    'DATABASE_URL',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'API_SPORTS_KEY',
    'TELEGRAM_BOT_TOKEN',
  ])
    delete process.env[key];
  const savedFetch = global.fetch;
  global.fetch = () => {
    throw Error('External services are forbidden in direct browser tests.');
  };
  const { build } = await import('vite');
  await build({
    configFile: false,
    root: path.resolve(__dirname, '..'),
    logLevel: 'error',
    build: {
      outDir: path.join(temp, 'bundle'),
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: path.resolve(__dirname, 'direct-browser-fixture.mjs'),
        formats: ['es'],
        fileName: () => 'fixture.js',
      },
    },
  });
  const fixtureCode = fs.readFileSync(path.join(temp, 'bundle/fixture.js'));
  const { syntheticChain } = await import(
    pathToFileURL(path.resolve(__dirname, 'direct-browser-fixture.mjs'))
  );
  const { update } = require('../dist/store'),
    { ensureMarketsForMatches } = require('../dist/markets'),
    { provider } = require('../dist/providers');
  provider.ownsMatch = () => true;
  provider.status = async () => ({
    enabled: false,
    simulated: true,
    source: 'test',
    provider: 'worldcup',
  });
  const cutoff = Date.now() + 7_200_000;
  await update((db) => {
    db.matches = [
      {
        id: 'api-football-900001',
        kickoff: new Date(cutoff).toISOString(),
        date: new Date(cutoff).toISOString().slice(0, 10),
        status: 'scheduled',
        stage: 'Synthetic contract test',
        competition: { id: 'test', name: 'Test Premier League' },
        home: { name: 'Arsenal', code: 'ARS' },
        away: { name: 'Chelsea', code: 'CHE' },
        oracle: { provider: 'worldcup', fixtureId: 'api-football-900001' },
      },
    ];
    db.matches.push({
      ...structuredClone(db.matches[0]),
      id: 'direct-two',
      home: { name: 'Liverpool', code: 'LIV' },
      away: { name: 'Tottenham', code: 'TOT' },
      oracle: { provider: 'worldcup', fixtureId: 'direct-two' },
    });
    ensureMarketsForMatches(db);
  });
  const { server } = require('../dist/server');
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`,
    evidence = path.resolve(__dirname, '../../../.quality-artifacts/browser');
  fs.mkdirSync(evidence, { recursive: true });
  let browser,
    groups = 0,
    activePage,
    phase = 'starting';
  const calls = [];
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      browser = await engine.launch({ headless: true });
      for (const width of [390, 1440]) {
        const chain = await syntheticChain(cutoff),
          external = [],
          writes = [],
          errors = [];
        let brokenAvailability = false;
        let failedDiscovery = false;
        let preparationState = null;
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          serviceWorkers: 'block',
          reducedMotion: 'reduce',
        });
        await context.route('**/*', (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (url.origin !== base) {
            external.push(url.href);
            return route.abort();
          }
          if (!['GET', 'HEAD'].includes(request.method())) {
            writes.push(url.pathname);
            return route.abort();
          }
          if (url.pathname === '/qa-direct-fixture.js')
            return route.fulfill({ contentType: 'text/javascript', body: fixtureCode });
          if (url.pathname === '/api/direct/markets')
            return route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({
                markets: brokenAvailability ? null : preparationState ? [] : [chain.descriptor],
              }),
            });
          if (url.pathname === '/api/direct/provisioning')
            return route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({
                progress: preparationState
                  ? {
                      format: 'streak-direct-provisioning-v1',
                      updatedAtMs: Date.now(),
                      fixtures: [
                        { fixtureId: chain.descriptor.fixtureId, status: preparationState },
                      ],
                    }
                  : null,
              }),
            });
          return route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        const page = await context.newPage(),
          reads = observeReads(page, base);
        activePage = page;
        phase = `${name} ${width}: load`;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.exposeFunction('syntheticRpc', async (method, args) => {
          calls.push(method);
          if (calls.length > 25) calls.shift();
          if (failedDiscovery && method === 'cells' && args[0] === 'type')
            throw Error('Synthetic index unavailable');
          return chain.rpc(method, args);
        });
        async function connect(rejectFirst) {
          await page.getByRole('button', { name: 'Connect testnet wallet', exact: true }).click();
          await page.locator('ccc-connector').waitFor();
          await page.evaluate(async (reject) => {
            const fixture = await import('/qa-direct-fixture.js');
            await fixture.connectSynthetic(document.querySelector('ccc-connector'), reject);
          }, rejectFirst);
          await page.getByRole('button', { name: 'Disconnect wallet', exact: true }).waitFor();
          assert.equal(await page.locator('ccc-connector').count(), 0);
        }
        await page.addInitScript(() => {
          if (!localStorage.getItem('streak.predictionDraft.v1'))
            localStorage.setItem(
              'streak.predictionDraft.v1',
              JSON.stringify({
                v: 1,
                revision: 'legacy-recovery-draft',
                picks: [
                  {
                    lineId: 'a',
                    marketId: 'm-api-football-900001',
                    matchId: 'api-football-900001',
                    outcome: 'away',
                    amountCkb: '150.00000001',
                  },
                  {
                    lineId: 'b',
                    marketId: 'm-direct-two',
                    matchId: 'direct-two',
                    outcome: 'home',
                    amountCkb: '100',
                  },
                ],
              }),
            );
        });
        // Historical single-market recovery remains accessible after the main slip moves to atomic v4.
        await reads.goto(base + '/season/?direct=m-api-football-900001');
        await page.getByRole('region', { name: 'Direct testnet predictions' }).waitFor();
        await accountReadFinished(page);
        const slip = page.getByRole('dialog', { name: 'Prediction slip' });
        await connect(true);
        await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).fill('100');
        await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
        phase = `${name} ${width}: review and reject`;
        await page
          .locator('.direct-wallet-card')
          .getByText('10,000 tCKB', { exact: true })
          .waitFor();
        await page.getByRole('button', { name: 'Review testnet prediction', exact: true }).click();
        const review = page.getByRole('region', { name: 'Review wallet transaction' });
        await review.waitFor();
        assert.match(await review.innerText(), /321 tCKB/);
        assert.match(await review.innerText(), /100 tCKB/);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          true,
        );
        await review.screenshot({
          path: path.join(evidence, `direct-review-${name}-${width}.png`),
        });
        const edit = page.getByRole('button', { name: 'Back to editing', exact: true });
        await edit.evaluate((button) =>
          button.scrollIntoView({ block: 'center', behavior: 'instant' }),
        );
        assert.equal(
          await edit.evaluate((button) => {
            const r = button.getBoundingClientRect(),
              hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            const dock = document.querySelector('.mobile-dock')?.getBoundingClientRect();
            return (
              r.top >= 0 &&
              r.bottom <= innerHeight &&
              (!dock?.height || r.bottom <= dock.top) &&
              (hit === button || button.contains(hit))
            );
          }),
          true,
          'Back to editing can scroll clear of the fixed mobile navigation.',
        );
        await page.getByRole('button', { name: 'Sign prediction in wallet', exact: true }).click();
        await page
          .getByText('User rejected the synthetic wallet request.', { exact: true })
          .waitFor();
        assert.equal(chain.submissions.length, 0, 'Wallet rejection never broadcasts.');
        assert.equal(
          await page.evaluate(
            () => JSON.parse(localStorage.getItem('streak.predictionDraft.v1')).picks.length,
          ),
          2,
          'Rejection retains both independent picks.',
        );
        await page.getByRole('button', { name: 'Review testnet prediction', exact: true }).click();
        await review.waitFor();
        await page.getByRole('button', { name: 'Sign prediction in wallet', exact: true }).click();
        await page
          .locator('.direct-transaction .direct-state')
          .filter({ hasText: /^unknown$/ })
          .waitFor();
        assert.equal(chain.submissions.length, 1);
        const saved = await page.evaluate(async (ownerHash) => {
          const { IndexedJournal } = await import('/qa-direct-fixture.js');
          return new IndexedJournal().list(`testnet-v1:${ownerHash}:wallet`);
        }, chain.ownerHash);
        assert.equal(saved.length, 1);
        assert.equal(saved[0].hash, chain.submissions[0].hash);
        assert.equal(saved[0].signedBytes, chain.submissions[0].bytes);
        phase = `${name} ${width}: reload and retry`;
        await reads.reload();
        await page
          .getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true, level: 1 })
          .waitFor();
        await accountReadFinished(page);
        await connect(false);
        assert.equal(
          await page.evaluate(
            () => JSON.parse(localStorage.getItem('streak.predictionDraft.v1')).picks.length,
          ),
          2,
          'Reload retains every draft alongside separate signed transaction recovery.',
        );
        await page.getByRole('button', { name: 'Retry saved transaction', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Retry saved transaction', exact: true }).click();
        await page
          .locator('.direct-transaction .direct-state')
          .filter({ hasText: /^confirmed$/ })
          .waitFor();
        assert.equal(chain.submissions.length, 2);
        assert.deepEqual(
          chain.submissions[0],
          chain.submissions[1],
          'Reload retries the original bytes, without another signature.',
        );
        phase = `${name} ${width}: settlement and claim`;
        failedDiscovery = true;
        await page.evaluate(() => {
          history.pushState(null, '', '/season/?view=activity');
          dispatchEvent(new PopStateEvent('popstate'));
        });
        await page.getByRole('heading', { name: 'My activity.', exact: true }).waitFor();
        await page
          .getByText(
            'Some information could not be refreshed. Claims are paused until checks recover.',
            { exact: true },
          )
          .waitFor();
        assert.equal(
          await page.locator('.activity-summary strong').first().innerText(),
          'Checking',
        );
        failedDiscovery = false;
        await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
        await page.locator('.activity-bet').waitFor();
        assert.match(await page.locator('.activity-bet').innerText(), /Verifying entry/);
        failedDiscovery = true;
        await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
        await page
          .getByText(
            'Some information could not be refreshed. Claims are paused until checks recover.',
            { exact: true },
          )
          .waitFor();
        assert.equal(
          await page.locator('.activity-bet').count(),
          1,
          'Failed refresh retains the last verified row.',
        );
        failedDiscovery = false;
        await page.screenshot({
          path: path.join(evidence, `activity-open-${name}-${width}.png`),
          fullPage: true,
        });
        chain.settle();
        await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
        await page.getByRole('tab', { name: /History/ }).click();
        const collect = page.locator('.activity-bet').getByRole('button', { name: /Collect/ });
        await collect.waitFor();
        await collect.click();
        const activityDialog = page.getByRole('dialog', { name: /Arsenal vs Chelsea/ });
        await activityDialog.getByRole('button', { name: /Collect/ }).click();
        const claimReview = activityDialog.getByRole('region', { name: 'Review claim' });
        await claimReview.waitFor();
        assert.match(await claimReview.innerText(), /421 tCKB/);
        assert.match(await claimReview.innerText(), /separate wallet input/i);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        await page.screenshot({ path: path.join(evidence, `activity-claim-${name}-${width}.png`) });
        await page.getByRole('button', { name: 'Sign claim in wallet', exact: true }).click();
        await activityDialog.getByRole('button', { name: 'Close prediction details' }).click();
        await page.getByRole('button', { name: /Payments & recovery/ }).click();
        await page
          .locator('.direct-transaction .direct-state')
          .filter({ hasText: /^conflict$/ })
          .waitFor();
        await page
          .getByText('Recover after a conflicting wallet transaction', { exact: true })
          .click();
        await page
          .getByLabel('Conflicting transaction hash', { exact: true })
          .fill(chain.conflictingHash);
        await page
          .getByRole('button', { name: 'Verify conflicting transaction', exact: true })
          .click();
        await page
          .locator('.direct-transaction .direct-state')
          .filter({ hasText: /^resolved$/ })
          .waitFor();
        await collect.click();
        await activityDialog.getByRole('button', { name: /Collect/ }).click();
        await claimReview.waitFor();
        await page.getByRole('button', { name: 'Sign claim in wallet', exact: true }).click();
        await activityDialog.getByRole('button', { name: 'Close prediction details' }).click();
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('.direct-transaction .direct-state')].filter(
              (node) => node.textContent === 'confirmed',
            ).length === 2,
        );
        await page.locator('.activity-bet').getByText('Collected', { exact: true }).waitFor();
        await page.getByRole('button', { name: /Payments & recovery/ }).click();
        await page.getByRole('searchbox', { name: 'Search predictions' }).fill('no matching team');
        await page.getByRole('heading', { name: 'No matching predictions' }).waitFor();
        await page.getByRole('searchbox', { name: 'Search predictions' }).fill('');
        await page
          .locator('.activity-bet')
          .getByRole('button', { name: /Details/ })
          .click();
        await page.keyboard.press('Escape');
        assert.equal(await activityDialog.isVisible(), false);
        await page.screenshot({
          path: path.join(evidence, `activity-history-${name}-${width}.png`),
          fullPage: true,
        });
        const persisted = await page.evaluate(async (ownerHash) => {
          const { IndexedJournal } = await import('/qa-direct-fixture.js');
          return new IndexedJournal().list(`testnet-v1:${ownerHash}:wallet`);
        }, chain.ownerHash);
        assert.equal(persisted.length, 3);
        assert.equal(persisted.filter((record) => record.kind === 'claim').length, 2);
        assert.equal(persisted.filter((record) => record.status === 'resolved').length, 1);
        assert.equal(chain.submissions.length, 4);
        const reservations = await page.evaluate(async (record) => {
          const fixture = await import('/qa-direct-fixture.js');
          return fixture.verifyAtomicReservations(record);
        }, persisted[0]);
        assert.equal(reservations.filter((result) => result === 'saved').length, 1);
        assert.ok(reservations.some((result) => /reserves an input/.test(result)));
        await page.evaluate(() => {
          history.pushState(null, '', '/season/?direct=m-api-football-900001');
          dispatchEvent(new PopStateEvent('popstate'));
        });
        await page
          .getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true, level: 1 })
          .waitFor();
        await page.evaluate(
          (ownerHash) =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open('streak-direct-transactions-v1', 3);
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result,
                  tx = db.transaction('transactions', 'readwrite');
                tx.objectStore('transactions').put({
                  key: 'synthetic-corrupt-record',
                  scope: `testnet-v1:${ownerHash}:wallet`,
                  signedBytes: 'corrupt',
                });
                tx.oncomplete = () => {
                  db.close();
                  resolve();
                };
                tx.onerror = () => {
                  db.close();
                  reject(tx.error);
                };
              };
            }),
          chain.ownerHash,
        );
        await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
        await page.getByText(/Saved transaction is invalid.*New signing is paused/).waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: 'Review testnet prediction', exact: true })
            .isDisabled(),
          true,
        );
        await page.getByRole('link', { name: 'Back to match', exact: true }).click();
        await page
          .getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true, level: 1 })
          .waitFor();
        const returned = new URL(page.url());
        assert.equal(returned.searchParams.get('market'), 'm-api-football-900001');
        assert.equal(returned.searchParams.has('direct'), false);
        assert.equal(returned.searchParams.has('view'), false);
        await reads.settled();
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.deepEqual(writes, []);
        await context.close();
        groups++;
        console.log(`Direct browser ${name} ${width}: complete journey passed.`);
      }
      await browser.close();
      browser = undefined;
    }
    console.log(
      `Direct browser passed: ${groups} complete journeys across Chromium/WebKit at 390/1440px; actual IndexedDB, synthetic CCC wallet signatures, rejection, exact capacity review, saved-before-broadcast assertion, original-byte retry after reload, independent claim and responsive recovery.`,
    );
  } catch (error) {
    console.error('Direct browser phase:', phase, 'Recent synthetic RPC:', calls.join(', '));
    if (activePage && !activePage.isClosed())
      console.error((await activePage.locator('body').innerText()).slice(-7000));
    throw error;
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    global.fetch = savedFetch;
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('streak-direct-browser-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

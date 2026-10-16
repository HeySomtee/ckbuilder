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
        // Start where users start, not on a privileged/deep-linked checkout route.
        await reads.goto(base + '/season/');
        await page
          .getByRole('region', { name: 'Available testnet markets' })
          .getByRole('link', { name: 'Arsenal vs Chelsea', exact: true })
          .click();
        await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
        await accountReadFinished(page);
        await page.locator('.detail-outcomes').getByRole('button').nth(2).click();
        const slip = page.getByRole('dialog', { name: 'Prediction slip' });
        await slip
          .getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' })
          .fill('125.00000001');
        await slip.getByRole('button', { name: 'Continue to payment', exact: true }).click();
        await slip.waitFor({ state: 'hidden' });
        await page.getByRole('region', { name: 'Direct testnet predictions' }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('direct'), 'm-api-football-900001');
        assert.equal(
          await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).inputValue(),
          '125.00000001',
        );
        assert.equal(
          await page
            .getByRole('button', { name: 'Chelsea', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        await page.locator('.prediction-dock').click();
        await slip
          .getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' })
          .fill('150.00000001');
        await slip.getByRole('button', { name: 'Continue to payment', exact: true }).click();
        await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).waitFor();
        assert.equal(
          await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).inputValue(),
          '150.00000001',
          'An explicit same-market handoff replaces the old checkout intent.',
        );
        // A multi-pick draft must never silently become a combined transaction.
        await reads.goto(base + '/season/?market=m-direct-two');
        await page.getByRole('heading', { name: 'Liverpool vs Tottenham', exact: true }).waitFor();
        await accountReadFinished(page);
        await page.locator('.detail-outcomes').getByRole('button').first().click();
        await page.locator('.prediction-dock').click();
        await slip.getByText(/Combined payment is not available yet/).waitFor();
        assert.equal(await slip.locator('.slip-pick').count(), 2);
        assert.equal(
          await slip.getByRole('region', { name: 'Available testnet markets' }).count(),
          0,
          'The slip explains availability per pick without an unrelated market promotion.',
        );
        assert.equal(
          await slip.getByRole('button', { name: 'Pay this prediction', exact: true }).count(),
          1,
        );
        await slip.getByRole('button', { name: 'Pay this prediction', exact: true }).click();
        await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('direct'), 'm-api-football-900001');
        assert.equal(
          await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).inputValue(),
          '150.00000001',
        );
        await connect(true);
        await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).fill('100');
        await page.getByRole('button', { name: 'Arsenal', exact: true }).click();
        phase = `${name} ${width}: review and reject`;
        await page.getByText('10,000 tCKB', { exact: true }).waitFor();
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
        await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
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
        chain.settle();
        await page.getByRole('button', { name: 'Check result', exact: true }).click();
        await page.getByRole('button', { name: 'Review claim', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Review claim', exact: true }).click();
        await review.waitFor();
        assert.match(await review.innerText(), /421 tCKB/);
        assert.match(await review.innerText(), /separate wallet input/i);
        await review.screenshot({ path: path.join(evidence, `direct-claim-${name}-${width}.png`) });
        await page.getByRole('button', { name: 'Sign claim in wallet', exact: true }).click();
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
        await page.getByRole('button', { name: 'Review claim', exact: true }).click();
        await review.waitFor();
        await page.getByRole('button', { name: 'Sign claim in wallet', exact: true }).click();
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('.direct-transaction .direct-state')].filter(
              (node) => node.textContent === 'confirmed',
            ).length === 2,
        );
        await page.getByText('claimed', { exact: true }).waitFor();
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
        await page.evaluate(
          (ownerHash) =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open('streak-direct-transactions-v1', 1);
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
        await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
        const returned = new URL(page.url());
        assert.equal(returned.searchParams.get('market'), 'm-api-football-900001');
        assert.equal(returned.searchParams.has('direct'), false);
        assert.equal(returned.searchParams.has('view'), false);
        brokenAvailability = true;
        await reads.reload();
        await accountReadFinished(page);
        await page.locator('.prediction-dock').click();
        await slip
          .getByText('Payment availability could not be checked.', { exact: true })
          .first()
          .waitFor();
        assert.equal(
          await slip.getByRole('button', { name: 'Pay this prediction', exact: true }).count(),
          0,
          'A failed catalogue never exposes payable draft actions.',
        );
        assert.equal(await slip.locator('.slip-pick').count(), 2);
        brokenAvailability = false;
        await slip.getByRole('button', { name: 'Retry availability', exact: true }).click();
        await slip.getByRole('button', { name: 'Pay this prediction', exact: true }).waitFor();
        for (const [state, expected] of [
          ['queued', 'This market is queued for automatic setup. Your pick stays saved.'],
          ['confirming', 'Market setup is confirming on CKB. Payment will open once confirmed.'],
          [
            'blocked-capacity',
            'Market setup is waiting for operator testnet funds. Your pick stays saved.',
          ],
        ]) {
          preparationState = state;
          await reads.reload();
          await accountReadFinished(page);
          await page.locator('.prediction-dock').click();
          await slip.getByText(expected, { exact: true }).waitFor();
          assert.equal(
            await slip.getByRole('button', { name: 'Pay this prediction', exact: true }).count(),
            0,
          );
          assert.equal(await slip.locator('.slip-pick').count(), 2);
          assert.equal(
            await slip.getByRole('region', { name: 'Available testnet markets' }).count(),
            0,
          );
        }
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

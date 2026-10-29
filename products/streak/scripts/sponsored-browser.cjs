/* Historical v3 single-market recovery in the built UI, real IndexedDB and CCC signing.
   Current inline atomic checkout is covered separately by batch-browser.cjs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium, webkit } = require('playwright');
const { observeReads, accountReadFinished } = require('./browser-readiness.cjs');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-sponsored-browser-'));
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.STREAK_DB_FILE = path.join(temp, 'db.json');
  process.env.MATCH_PROVIDER = 'worldcup';
  for (const key of Object.keys(process.env))
    if (/(DATABASE_URL|SUPABASE|API_SPORTS|TELEGRAM|PRIVATE_KEY)/.test(key))
      delete process.env[key];
  const fetchBefore = global.fetch;
  global.fetch = () => {
    throw Error('External services are forbidden in sponsored browser tests.');
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
        entry: path.join(__dirname, 'sponsored-browser-fixture.mjs'),
        formats: ['es'],
        fileName: () => 'fixture.js',
      },
    },
  });
  const bundle = fs.readFileSync(path.join(temp, 'bundle/fixture.js'));
  const { sponsoredChain } = await import(
    pathToFileURL(path.join(__dirname, 'sponsored-browser-fixture.mjs'))
  );
  const { syntheticChain } = await import(
    pathToFileURL(path.join(__dirname, 'direct-browser-fixture.mjs'))
  );
  const ccc = require('@ckb-ccc/core');
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
        id: 'api-football-900003',
        kickoff: new Date(cutoff).toISOString(),
        date: new Date(cutoff).toISOString().slice(0, 10),
        status: 'scheduled',
        sport: 'football',
        stage: 'Synthetic sponsored test',
        competition: { id: 'test', name: 'Test Premier League' },
        home: { name: 'Arsenal', code: 'ARS' },
        away: { name: 'Chelsea', code: 'CHE' },
        oracle: { provider: 'worldcup', fixtureId: 'api-football-900003' },
      },
    ];
    ensureMarketsForMatches(db);
  });
  const { server } = require('../dist/server');
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`,
    artifacts = path.resolve(__dirname, '../../../.quality-artifacts/browser');
  fs.mkdirSync(artifacts, { recursive: true });
  let browser,
    activePage,
    phase = 'start',
    groups = 0;
  try {
    for (const [engineName, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      browser = await engine.launch({ headless: true });
      for (const width of [390, 1440]) {
        const chain = await sponsoredChain(cutoff),
          external = [],
          errors = [],
          writes = [],
          requests = [];
        let signatureCount = 0,
          submittedBeforePersist = false,
          statusUnavailable = false;
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
        });
        let page;
        await context.route('**/*', async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          requests.push(url.pathname);
          if (url.origin !== base) {
            external.push(url.href);
            return route.abort();
          }
          const json = (body, status = 200) =>
            route.fulfill({ contentType: 'application/json', status, body: JSON.stringify(body) });
          if (url.pathname === '/qa-sponsored-fixture.js')
            return route.fulfill({ contentType: 'text/javascript', body: bundle });
          if (url.pathname === '/api/me')
            return json({
              user: {
                id: 'synthetic-owner',
                username: 'Synthetic user',
                walletAddress: chain.address,
              },
            });
          // This historical lane deliberately exercises explicit chain recovery
          // when the saved Activity index is unavailable. Indexed read/claim
          // journeys are exercised by direct-browser.cjs.
          if (url.pathname === '/api/activity' && request.method() === 'GET')
            return json({
              version: 1,
              network: 'testnet',
              available: false,
              ownerHash: chain.ownerHash,
              address: chain.address,
              groups: [],
              nextCursor: null,
              coverage: 'unavailable',
              updating: false,
              updatedAt: null,
              summary: { open: 0, completed: 0, collectibleShannons: '0', claimable: 0 },
            });
          if (url.pathname === '/api/activity/hint' && request.method() === 'POST') {
            const hint = request.postDataJSON();
            assert.match(hint.transactionHash, /^0x[0-9a-f]{64}$/);
            assert.deepEqual(Object.keys(hint).sort(), ['marketId', 'transactionHash']);
            return json({ queued: true }, 202);
          }
          // This lane retains v3 signing/recovery. Current v4 entry is exercised
          // by checkout-browser.cjs through the actual application and shared slip.
          if (url.pathname === '/api/direct/entry-mode') return json({ mode: 'legacy' });
          if (url.pathname === '/api/direct/markets')
            return json({ markets: chain.descriptor ? [chain.descriptor] : [] });
          if (url.pathname === '/api/direct/demand') return json({ fixtures: [chain.fixture] });
          if (url.pathname === '/api/direct/sponsor/offer' && request.method() === 'POST') {
            writes.push(url.pathname);
            try {
              return json(await chain.prepare(request.postDataJSON()));
            } catch (error) {
              return json({ error: error.message }, 400);
            }
          }
          if (url.pathname === '/api/direct/sponsor/submit' && request.method() === 'POST') {
            writes.push(url.pathname);
            const body = request.postDataJSON();
            const records = await page.evaluate(async (owner) => {
              const { IndexedSponsoredJournal } = await import('/qa-sponsored-fixture.js');
              return new IndexedSponsoredJournal().list(`testnet-v1:${owner}:wallet`);
            }, chain.ownerHash);
            if (
              !records.some(
                (record) =>
                  record.hash === body.rawHash &&
                  record.ownerSignedBytes === body.userSignedBytes &&
                  record.status === 'submitting',
              )
            )
              submittedBeforePersist = true;
            try {
              return json(await chain.submit(body));
            } catch (error) {
              statusUnavailable = true;
              return route.abort('failed');
            }
          }
          if (url.pathname === '/api/direct/sponsor/status')
            return statusUnavailable
              ? json({ error: 'Synthetic operator unavailable' }, 503)
              : json(chain.status());
          if (!['GET', 'HEAD'].includes(request.method())) {
            writes.push('UNEXPECTED:' + url.pathname);
            return route.abort();
          }
          return route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        page = await context.newPage();
        activePage = page;
        const reads = observeReads(page, base);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.exposeFunction('syntheticRpc', (method, params) => chain.rpc(method, params));
        await page.exposeFunction('syntheticSigning', () => {
          signatureCount++;
        });
        phase = `${engineName} ${width}: discovery and draft`;
        await reads.goto(base + '/season/?market=m-api-football-900003');
        await accountReadFinished(page, 'Sign out');
        await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();
        await page.getByRole('heading', { name: 'Who takes it?', exact: true }).waitFor();
        assert.equal(requests.includes('/qa-sponsored-fixture.js'), false);
        const assets = path.join(__dirname, '../public/season/assets');
        const sdk = fs
          .readdirSync(assets)
          .filter(
            (name) =>
              name.endsWith('.js') &&
              fs.readFileSync(path.join(assets, name), 'utf8').includes('ccc-connector'),
          );
        assert.equal(
          requests.some((request) => sdk.some((name) => request.endsWith('/' + name))),
          false,
          'Browsing does not download the wallet SDK.',
        );
        await page.locator('.detail-outcomes').getByRole('button').nth(2).click();
        const slip = page.getByRole('dialog', { name: 'Prediction slip' });
        await slip
          .getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' })
          .fill('125.00000001');
        await slip.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
        await slip.waitFor({ state: 'hidden' });
        // The current slip pays atomically through v4. Older v3 entry/recovery retains its own route.
        await reads.goto(base + '/season/?direct=m-api-football-900003');
        await accountReadFinished(page, 'Sign out');
        await page.getByRole('region', { name: 'Open a market with your prediction' }).waitFor();
        await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).fill('125.00000001');
        await page
          .getByRole('group', { name: 'Contract outcome' })
          .getByRole('button', { name: 'Away', exact: true })
          .click();
        assert.equal(
          await page.getByRole('textbox', { name: 'Contract stake in tCKB' }).inputValue(),
          '125.00000001',
        );
        assert.equal(
          await page
            .getByRole('group', { name: 'Contract outcome' })
            .getByRole('button', { name: 'Away', exact: true })
            .getAttribute('aria-pressed'),
          'true',
        );
        // Preserve a byte-identical legacy record while migrating the database schema.
        const legacy = await syntheticChain(cutoff),
          legacyTx = ccc.Transaction.from({
            inputs: [{ previousOutput: { txHash: '0x' + 'ee'.repeat(32), index: 0 } }],
            outputs: [
              {
                capacity: 42100000000n,
                lock: {
                  codeHash: '0x' + 'dd'.repeat(32),
                  hashType: 'type',
                  args: '0x' + '01'.repeat(20),
                },
              },
            ],
            outputsData: ['0x'],
            witnesses: ['0x01'],
          });
        const oldRecord = {
          version: 'testnet-v1',
          scope: 'migration-archive',
          ownerHash: legacy.ownerHash,
          kind: 'claim',
          descriptor: legacy.descriptor,
          hash: legacyTx.hash(),
          signedBytes: legacyTx.toHex(),
          inputs: [{ txHash: '0x' + 'ee'.repeat(32), index: 0 }],
          createdAt: Date.now(),
          status: 'signed',
          principalShannons: '10000000000',
          storageShannons: '32100000000',
          feeShannons: '1000',
          payoutShannons: '42100000000',
          shard: null,
          outcome: 0,
        };
        await page.evaluate(
          (record) =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open('streak-direct-transactions-v1', 1);
              request.onupgradeneeded = () =>
                request.result.createObjectStore('transactions', { keyPath: 'key' });
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result,
                  tx = db.transaction('transactions', 'readwrite');
                tx.objectStore('transactions').put({
                  ...record,
                  key: `${record.scope}:${record.hash}`,
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
          oldRecord,
        );
        async function connect(rejectFirst = false) {
          await page
            .getByRole('button', { name: /^(Connect testnet wallet|Connect wallet)$/ })
            .click();
          await page.locator('ccc-connector').waitFor();
          await page.evaluate(async (reject) => {
            const fixture = await import('/qa-sponsored-fixture.js');
            await fixture.connectSponsored(document.querySelector('ccc-connector'), reject);
          }, rejectFirst);
          await page
            .getByLabel('Wallet summary')
            .getByText('6,000 tCKB', { exact: true })
            .waitFor();
        }
        await connect(true);
        const migrated = await page.evaluate(async () => {
          const { IndexedJournal } = await import('/qa-sponsored-fixture.js');
          return new IndexedJournal().list('migration-archive');
        });
        assert.deepEqual(
          migrated,
          [oldRecord],
          'The v1 database migration preserves exact complete recovery records.',
        );
        phase = `${engineName} ${width}: strict review and wallet rejection`;
        chain.corrupt = true;
        await page.getByRole('button', { name: 'Review testnet prediction', exact: true }).click();
        await page
          .getByText(/changes the exact stake, sponsor contribution or network fee/)
          .waitFor();
        assert.equal(signatureCount, 0);
        assert.equal(chain.submissions.length, 0);
        chain.corrupt = false;
        await page.getByRole('button', { name: 'Review testnet prediction', exact: true }).click();
        const review = page.getByRole('region', { name: 'Review wallet transaction' });
        await review.waitFor();
        assert.match(await review.innerText(), /125\.00000001 tCKB/);
        assert.match(await review.innerText(), /321 tCKB/);
        assert.match(await review.innerText(), /3,050 tCKB/);
        const total =
          BigInt(chain.offer.principalShannons) + 32100000000n + BigInt(chain.offer.feeShannons);
        const totalText = await review.locator('.direct-total dd').innerText();
        assert.equal(totalText, `${ccc.fixedPointToString(total, 8)} tCKB`);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        await review
          .locator('.direct-actions')
          .evaluate((element) => element.scrollIntoView({ block: 'end', behavior: 'instant' }));
        const controls = await review.locator('.direct-actions > button').evaluateAll((buttons) =>
          buttons.map((button) => {
            const box = button.getBoundingClientRect();
            const unobscured = [0.08, 0.5, 0.92].every((x) =>
              [0.15, 0.5, 0.85].every((y) =>
                button.contains(
                  document.elementFromPoint(box.left + box.width * x, box.top + box.height * y),
                ),
              ),
            );
            return {
              label: button.textContent,
              visible:
                box.top >= 0 &&
                box.bottom <= innerHeight &&
                box.left >= 0 &&
                box.right <= innerWidth,
              unobscured,
            };
          }),
        );
        assert.equal(controls.length, 2);
        assert.ok(
          controls.every((control) => control.visible && control.unobscured),
          `Every review action must be fully visible and unobscured: ${JSON.stringify(controls)}`,
        );
        await page.screenshot({
          path: path.join(artifacts, `sponsored-review-${engineName}-${width}.png`),
        });
        await page.getByRole('button', { name: 'Sign prediction in wallet', exact: true }).click();
        await page
          .getByText('User rejected the synthetic wallet request.', { exact: true })
          .waitFor();
        assert.equal(chain.submissions.length, 0);
        assert.equal(signatureCount, 1);
        await page.getByRole('button', { name: 'Sign prediction in wallet', exact: true }).click();
        await page.getByRole('article', { name: 'Sponsored prediction transaction' }).waitFor();
        await page
          .getByText(/Sponsorship status is unavailable/)
          .first()
          .waitFor();
        assert.equal(submittedBeforePersist, false);
        assert.equal(chain.submissions.length, 1);
        assert.equal(signatureCount, 2);
        phase = `${engineName} ${width}: Activity route, reload and exact recovery`;
        await page
          .getByRole('link', { name: width === 390 ? 'Activity' : 'My activity', exact: true })
          .click();
        assert.equal(new URL(page.url()).searchParams.get('view'), 'activity');
        await page.locator('.activity-recovery-options > summary').click();
        await page.getByRole('button', { name: 'Recover from chain', exact: true }).click();
        await page.getByRole('button', { name: /Payments & recovery/ }).click();
        await page.getByRole('article', { name: 'Sponsored prediction transaction' }).waitFor();
        await reads.reload();
        await accountReadFinished(page, 'Sign out');
        await page.locator('.activity-recovery-options > summary').click();
        await page.getByRole('button', { name: 'Recover from chain', exact: true }).click();
        await connect(false);
        await page.getByRole('button', { name: /Payments & recovery/ }).click();
        await page.getByRole('article', { name: 'Sponsored prediction transaction' }).waitFor();
        statusUnavailable = false;
        await page
          .getByRole('button', { name: 'Resume original transaction', exact: true })
          .click();
        await page
          .locator('.direct-transaction .direct-state')
          .filter({ hasText: /^confirmed$/ })
          .waitFor();
        assert.equal(signatureCount, 2, 'Recovery never asks for another signature.');
        assert.equal(chain.submissions.length, 2);
        assert.deepEqual(
          chain.submissions[0],
          chain.submissions[1],
          'Original partially signed bytes are resubmitted unchanged.',
        );
        const records = await page.evaluate(async (owner) => {
          const { IndexedSponsoredJournal } = await import('/qa-sponsored-fixture.js');
          return new IndexedSponsoredJournal().list(`testnet-v1:${owner}:wallet`);
        }, chain.ownerHash);
        assert.equal(records.length, 1);
        assert.ok(records[0].finalSignedBytes);
        assert.equal(
          ccc.Transaction.fromBytes(records[0].finalSignedBytes).hash(),
          records[0].hash,
        );
        assert.equal(
          ccc.Transaction.fromBytes(records[0].finalSignedBytes).witnesses[1],
          ccc.Transaction.fromBytes(records[0].ownerSignedBytes).witnesses[1],
        );
        const reservations = await page.evaluate(async (record) => {
          const fixture = await import('/qa-sponsored-fixture.js');
          return fixture.verifyCrossStoreReservations(record);
        }, records[0]);
        assert.equal(
          reservations.filter((result) => result === 'saved').length,
          1,
          'Only one transaction can reserve a shared input across both stores.',
        );
        assert.ok(reservations.some((result) => /reserves an input/.test(result)));
        phase = `${engineName} ${width}: independent refund claim`;
        chain.settle();
        await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
        await page.getByRole('tab', { name: /History/ }).click();
        await page
          .locator('.activity-bet')
          .getByRole('button', { name: 'Collect refund', exact: false })
          .click();
        const claimDialog = page.getByRole('dialog', { name: /Arsenal vs Chelsea/ });
        await claimDialog.getByRole('button', { name: 'Collect refund', exact: true }).click();
        const claimReview = claimDialog.getByRole('region', { name: 'Review claim' });
        await claimReview.waitFor();
        assert.match(await claimReview.innerText(), /446\.00000001 tCKB/);
        await page.getByRole('button', { name: 'Sign claim in wallet', exact: true }).click();
        await claimDialog.getByRole('button', { name: 'Close prediction details' }).click();
        await page.locator('.activity-bet').getByText('Collected', { exact: true }).waitFor();
        assert.equal(signatureCount, 3);
        await page.screenshot({
          path: path.join(artifacts, `sponsored-recovery-${engineName}-${width}.png`),
          fullPage: true,
        });
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.equal(
          writes.some((write) => write.startsWith('UNEXPECTED:')),
          false,
        );
        await context.close();
        groups++;
        console.log(`Sponsored browser ${engineName} ${width}: passed.`);
      }
      await browser.close();
      browser = undefined;
    }
    console.log(
      `Sponsored browser passed: ${groups} journeys, strict sponsored accounting, native signatures, database migration, storage before submit, interrupted response, reload, same-byte recovery and independent claims.`,
    );
  } catch (error) {
    console.error('Sponsored browser phase:', phase);
    if (activePage && !activePage.isClosed())
      console.error((await activePage.locator('body').innerText()).slice(-9000));
    throw error;
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    global.fetch = fetchBefore;
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('streak-sponsored-browser-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

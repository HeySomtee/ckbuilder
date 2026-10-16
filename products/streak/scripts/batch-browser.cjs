/* Production slip, wallet chooser and adapter, synthetic transport only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

async function main() {
  process.env.NODE_ENV = 'production';
  const { build } = await import('vite');
  const { ccc } = await import('@ckb-ccc/core');
  const { batchChain } = await import('./batch-browser-fixture.mjs');
  const { BATCH_MANIFEST } = await import('../web/src/features/direct/protocol.ts');
  const { sponsoredChain } = await import('./sponsored-browser-fixture.mjs');
  const { SponsoredClient } = await import('../web/src/features/direct/sponsored-client.ts');
  const { attachBatchRpc, batchOwnerKey } = await import('./batch-browser-fixture.mjs');
  const oldChain = await sponsoredChain(Date.now() + 7200000),
    oldRpc = attachBatchRpc(
      new ccc.ClientPublicTestnet({ url: 'https://testnet.ckb.dev/', fallbacks: [] }),
      oldChain.rpc,
    );
  const oldClient = new SponsoredClient(
    new ccc.SignerCkbPrivateKey(oldRpc, batchOwnerKey),
    { offer: oldChain.prepare, submit: oldChain.submit, status: oldChain.status },
    { list: async () => [], put: async () => {} },
    { exclusive: async (_name, action) => action() },
  );
  const oldRecord = {
    ...(await oldClient.signAndPersist(
      await oldClient.prepare(oldChain.fixture, 0, 10000000000n),
      oldChain.fixture,
    )),
    scope: 'migration-check',
  };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-batch-browser-'));
  await build({
    configFile: false,
    root: path.resolve(__dirname, '..'),
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
    build: {
      outDir: temp,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: path.join(__dirname, 'batch-browser-entry.tsx'),
        formats: ['es'],
        fileName: () => 'batch.js',
      },
    },
  });
  const css = fs.readdirSync(temp).filter((file) => file.endsWith('.css'));
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' || url.pathname === '/seed') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Combined payment check</title>${css.map((file) => `<link rel="stylesheet" href="/${file}">`).join('')}<div id="root"></div>${url.pathname === '/' ? '<script type="module" src="/batch.js"></script>' : ''}`,
      );
      return;
    }
    const file = path.resolve(temp, '.' + url.pathname);
    if (
      path.dirname(file) !== path.resolve(temp) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(fs.readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`,
    evidence = path.resolve('.quality-artifacts/batch-browser');
  fs.mkdirSync(evidence, { recursive: true });
  let browser, page, phase;
  const results = [];
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      browser = await engine.launch({ headless: true });
      for (const width of [390, 1440]) {
        phase = `${name} ${width} setup`;
        const chain = await batchChain(Date.now() + 7200000),
          context = await browser.newContext({
            viewport: { width, height: 900 },
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
        const external = [],
          errors = [];
        await context.addInitScript(() => {
          const timeouts = new WeakMap(),
            originalTimeout = AbortSignal.timeout.bind(AbortSignal),
            originalFetch = window.fetch.bind(window);
          window.syntheticTimeouts = [];
          AbortSignal.timeout = (ms) => {
            const signal = originalTimeout(ms);
            timeouts.set(signal, ms);
            return signal;
          };
          window.fetch = (input, init) => {
            window.syntheticTimeouts.push({
              path: String(input),
              ms: timeouts.get(init?.signal) ?? null,
            });
            return originalFetch(input, init);
          };
        });
        let signCalls = 0,
          rejectNext = true,
          posts = 0,
          offers = 0,
          holdDemand;
        const account = {
          id: 'batch-browser-user',
          username: 'Batch tester',
          walletAddress: chain.address,
          telegramConnected: false,
          telegramAvailable: false,
          telegramUsername: null,
        };
        await context.exposeBinding('syntheticRpc', (_source, method, args) =>
          chain.rpc(method, args),
        );
        await context.exposeBinding('syntheticSigning', () => {
          signCalls++;
          const reject = rejectNext;
          rejectNext = false;
          return reject;
        });
        await context.route('**/*', async (route) => {
          const req = route.request(),
            url = new URL(req.url()),
            json = (body, status = 200) =>
              route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(body),
                headers: { 'access-control-allow-origin': '*' },
              });
          if (url.origin !== base) {
            external.push(url.href);
            return route.abort();
          }
          if (url.pathname === '/api/me') return json({ user: account });
          if (url.pathname === '/api/direct/batch/config') return json(BATCH_MANIFEST);
          if (url.pathname === '/api/direct/batch/demand') {
            if (holdDemand) {
              const hold = holdDemand;
              holdDemand = undefined;
              hold.started();
              await hold.release;
            }
            return json({ fixtures: chain.fixtures(), serverTime: Date.now(), enabled: true });
          }
          if (url.pathname === '/api/direct/batch/offer') {
            offers++;
            return json(await chain.prepare(req.postDataJSON()));
          }
          if (url.pathname === '/api/direct/batch/status')
            return json(
              chain.status({
                offerId: url.searchParams.get('offerId'),
                rawHash: url.searchParams.get('rawHash'),
              }),
            );
          if (url.pathname === '/api/direct/batch/submit') {
            posts++;
            const request = req.postDataJSON(),
              saved = await page.evaluate(
                async (scope) => (await import('/batch.js')).saved(scope),
                `testnet-v1:${chain.ownerHash}:wallet`,
              );
            assert.equal(saved.length, 1);
            assert.ok(saved[0].submissionAttemptedAt);
            assert.equal(saved[0].ownerSignedBytes, request.userSignedBytes);
            try {
              return json(await chain.submit(request));
            } catch (error) {
              return json({ error: error.message }, 503);
            }
          }
          if (/^\/api\/markets\/.+\/public$/.test(url.pathname)) {
            const id = url.pathname.split('/')[3],
              fixture = chain.fixtures().find((row) => row.fixtureId === id),
              [home, away] = fixture.label.split(' vs '),
              kickoff = new Date(fixture.cutoffMs).toISOString();
            return json({
              evaluatedAt: new Date().toISOString(),
              accepting: true,
              paymentAvailable: false,
              termsId: 'a'.repeat(64),
              terms: {
                kind: 'custodial-ledger',
                minimumShannons: '10000000000',
                maximumShannons: '100000000000000',
                protocolFeeBps: 200,
                creatorFeeBps: 100,
                kickoff,
                closesAt: kickoff,
              },
              market: {
                id,
                status: 'open',
                available: true,
                totalPoolCkb: '0',
                totalBets: 0,
                prices: { home: 1, draw: 1, away: 1 },
                match: {
                  id,
                  kickoff,
                  status: 'scheduled',
                  stage: 'Synthetic',
                  home: { name: home, code: 'HOM' },
                  away: { name: away, code: 'AWY' },
                },
              },
            });
          }
          if (req.method() !== 'GET') throw Error(`Unexpected browser mutation ${url.pathname}`);
          return route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        page = await context.newPage();
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(base + '/seed');
        const seed = {
          v: 1,
          revision: 'batch-browser-draft',
          picks: chain
            .fixtures()
            .slice(0, 2)
            .map((fixture, index) => ({
              lineId: `line-${index}`,
              marketId: fixture.fixtureId,
              matchId: fixture.fixtureId,
              outcome: index ? 'draw' : 'home',
              amountCkb: String(100 + index),
            })),
        };
        await page.evaluate(
          async ({ seed, oldRecord }) => {
            localStorage.setItem('streak.predictionDraft.v1', JSON.stringify(seed));
            await new Promise((resolve, reject) => {
              const request = indexedDB.open('streak-direct-transactions-v1', 2);
              request.onupgradeneeded = () => {
                request.result.createObjectStore('transactions', { keyPath: 'key' });
                request.result.createObjectStore('sponsored', { keyPath: 'key' });
              };
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result,
                  tx = db.transaction('sponsored', 'readwrite');
                tx.objectStore('sponsored').put({
                  ...oldRecord,
                  key: `${oldRecord.scope}:${oldRecord.hash}`,
                });
                tx.oncomplete = () => {
                  db.close();
                  resolve();
                };
                tx.onerror = () => reject(tx.error);
              };
            });
          },
          { seed, oldRecord },
        );
        await page.goto(base);
        await page.getByRole('button', { name: 'Open prediction slip', exact: true }).click();
        await page.getByRole('button', { name: 'Reconnect wallet to pay', exact: true }).click();
        await page.locator('dialog.wallet-chooser-host[open] ccc-connector').waitFor();
        assert.equal(
          await page
            .locator('dialog.wallet-chooser-host')
            .evaluate((element) => element.matches(':modal')),
          true,
        );
        await page.keyboard.press('Escape');
        await page.locator('dialog.wallet-chooser-host').waitFor({ state: 'detached' });
        assert.equal(
          await page.locator('dialog.prediction-slip').evaluate((element) => element.open),
          true,
        );
        assert.equal(signCalls, 0);
        async function connect() {
          await page.getByRole('button', { name: 'Reconnect wallet to pay', exact: true }).click();
          await page.locator('ccc-connector').waitFor();
          await page.evaluate(async () =>
            (await import('/batch.js')).connectSynthetic(document.querySelector('ccc-connector')),
          );
          await page.getByRole('button', { name: 'Review all predictions', exact: true }).waitFor();
          await page.waitForFunction(() =>
            [...document.querySelectorAll('button')].some(
              (button) => button.textContent === 'Review all predictions' && !button.disabled,
            ),
          );
        }
        await connect();
        const migration = await page.evaluate(
          async () =>
            new Promise((resolve, reject) => {
              const request = indexedDB.open('streak-direct-transactions-v1', 3);
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result,
                  tx = db.transaction('sponsored'),
                  get = tx.objectStore('sponsored').getAll();
                tx.oncomplete = () => {
                  resolve({
                    version: db.version,
                    stores: [...db.objectStoreNames],
                    rows: get.result,
                  });
                  db.close();
                };
              };
            }),
        );
        assert.equal(migration.version, 3);
        assert.ok(migration.stores.includes('batch'));
        assert.equal(migration.rows[0].ownerSignedBytes, oldRecord.ownerSignedBytes);
        phase = `${name} ${width} review`;
        await page.getByRole('button', { name: 'Review all predictions', exact: true }).click();
        await page.getByRole('heading', { name: 'One payment. 2 predictions.' }).waitFor();
        const requestTimeouts = await page.evaluate(() => window.syntheticTimeouts);
        assert.ok(
          requestTimeouts.some((row) => row.path === '/api/direct/batch/offer' && row.ms === 60000),
        );
        assert.ok(
          requestTimeouts.some(
            (row) => row.path === '/api/direct/batch/config' && row.ms === 15000,
          ),
        );
        const review = page.getByRole('region', { name: 'Slip payment' });
        await review.getByText('201 tCKB', { exact: true }).waitFor();
        await review.getByText('642 tCKB', { exact: true }).waitFor();
        async function visibleControl(control) {
          await control.scrollIntoViewIfNeeded();
          assert.equal(
            await control.evaluate((element) => {
              const r = element.getBoundingClientRect();
              return (
                r.top >= 0 &&
                r.bottom <= innerHeight &&
                r.left >= 0 &&
                r.right <= innerWidth &&
                [
                  [r.left + 12, r.top + r.height / 2],
                  [r.right - 12, r.top + r.height / 2],
                  [r.left + r.width / 2, r.top + 6],
                  [r.left + r.width / 2, r.bottom - 6],
                ].every(([x, y]) => element.contains(document.elementFromPoint(x, y)))
              );
            }),
            true,
          );
        }
        await visibleControl(page.getByRole('button', { name: /^Pay / }));
        await visibleControl(page.getByRole('button', { name: 'Back to picks', exact: true }));
        await page.screenshot({ path: path.join(evidence, `${name}-${width}-review.png`) });
        await page.getByRole('button', { name: /^Pay / }).click();
        await page.getByText(/Synthetic wallet rejected this request/).waitFor();
        assert.equal(posts, 0);
        assert.equal(signCalls, 1);
        let startRead, releaseRead;
        const waitingRead = new Promise((resolve) => {
          startRead = resolve;
        });
        holdDemand = {
          started: startRead,
          release: new Promise((resolve) => {
            releaseRead = resolve;
          }),
        };
        const offersBefore = offers;
        await page.getByRole('button', { name: 'Review all predictions', exact: true }).click();
        await waitingRead;
        await page.evaluate(
          async (account) =>
            (await import('/batch.js')).replaceAccount({ ...account, id: 'changed-account' }),
          account,
        );
        releaseRead();
        await page.waitForFunction(
          () =>
            !document
              .querySelector('.batch-checkout')
              ?.textContent.includes('Reviewing every prediction'),
        );
        assert.equal(offers, offersBefore);
        assert.equal(signCalls, 1);
        await page.evaluate(
          async (account) => (await import('/batch.js')).replaceAccount(account),
          account,
        );
        await page.getByRole('button', { name: 'Review all predictions', exact: true }).click();
        await page.getByRole('heading', { name: 'One payment. 2 predictions.' }).waitFor();
        await page.evaluate(async () => (await import('/batch.js')).changeStake(1, '150'));
        await page
          .getByRole('heading', { name: 'One payment. 2 predictions.' })
          .waitFor({ state: 'detached' });
        assert.equal(signCalls, 1);
        await page.getByRole('button', { name: 'Review all predictions', exact: true }).click();
        await page.getByRole('heading', { name: 'One payment. 2 predictions.' }).waitFor();
        chain.loseResponse = true;
        await page.getByRole('button', { name: /^Pay / }).click();
        await page.getByRole('article', { name: 'Combined prediction payment' }).waitFor();
        assert.equal(posts, 1);
        assert.equal(signCalls, 2);
        const saved = await page.evaluate(
          async (scope) => (await import('/batch.js')).saved(scope),
          `testnet-v1:${chain.ownerHash}:wallet`,
        );
        assert.equal(saved.length, 1);
        assert.ok(saved[0].submissionAttemptedAt);
        const reservations = await page.evaluate(
          async (record) => (await import('/batch.js')).crossStore(record),
          saved[0],
        );
        assert.match(reservations[0], /already reserves an input/);
        assert.match(reservations[2], /identity cannot change/);
        assert.equal(saved[0].sourcePicks[1].amountCkb, '150');
        assert.deepEqual(
          reservations[1][0].fixtureIds,
          seed.picks.map((pick) => pick.matchId),
        );
        assert.equal(
          (await page.evaluate(async () => (await import('/batch.js')).draft())).picks.length,
          2,
        );
        phase = `${name} ${width} recovery`;
        await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
        await page.reload();
        await page.getByRole('button', { name: 'Open prediction slip', exact: true }).click();
        await connect();
        assert.equal(signCalls, 2);
        await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
        await page
          .getByRole('button', { name: 'Show saved payment recovery', exact: true })
          .click();
        await page.getByRole('button', { name: 'Resume payment', exact: true }).waitFor();
        await page.evaluate(async () => (await import('/batch.js')).changeStake(1, '175'));
        await page.getByRole('button', { name: 'Resume payment', exact: true }).click();
        await page.getByText('Confirmed', { exact: true }).waitFor();
        assert.equal(signCalls, 2);
        assert.equal(posts, 2);
        assert.equal(chain.submissions[0].userSignedBytes, chain.submissions[1].userSignedBytes);
        const final = await page.evaluate(
          async (scope) => (await import('/batch.js')).saved(scope),
          saved[0].scope,
        );
        assert.equal(final[0].ownerSignedBytes, saved[0].ownerSignedBytes);
        assert.ok(final[0].finalSignedBytes);
        const recoveryTimeouts = await page.evaluate(() => window.syntheticTimeouts);
        assert.ok(
          recoveryTimeouts.some(
            (row) => row.path === '/api/direct/batch/submit' && row.ms === 60000,
          ),
        );
        assert.ok(
          recoveryTimeouts.some(
            (row) => row.path.startsWith('/api/direct/batch/status?') && row.ms === 60000,
          ),
        );
        await page.waitForFunction(
          async () => (await import('/batch.js')).draft().picks.length === 1,
        );
        const remaining = await page.evaluate(
          async () => (await import('/batch.js')).draft().picks,
        );
        assert.equal(remaining[0].lineId, seed.picks[1].lineId);
        assert.equal(remaining[0].amountCkb, '175');
        assert.deepEqual(external, []);
        assert.deepEqual(errors, []);
        results.push({
          engine: name,
          width,
          pass: true,
          walletPrompts: signCalls,
          submissions: posts,
          migration: '2-to-3',
          recoveryHash: final[0].hash,
        });
        await page.screenshot({ path: path.join(evidence, `${name}-${width}-recovered.png`) });
        await context.close();
        console.log(`${name} ${width}: combined slip and exact recovery passed`);
      }
      await browser.close();
      browser = undefined;
    }
    fs.writeFileSync(
      path.join(evidence, 'results.json'),
      JSON.stringify({ synthetic: true, results }, null, 2),
    );
  } catch (error) {
    console.error('Batch browser phase:', phase);
    if (page) {
      console.error((await page.locator('body').innerText()).slice(-12000));
      await page.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

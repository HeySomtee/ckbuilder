/* Real built UI, real CCC EIP-6963 signer and loopback authentication only. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { observeReads, accountReadFinished } = require('./browser-readiness.cjs');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-wallet-browser-'));
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.STREAK_DB_FILE = path.join(temp, 'db.json');
  process.env.MATCH_PROVIDER = 'worldcup';
  const savedFetch = global.fetch;
  global.fetch = () => {
    throw Error('External services are forbidden in wallet tests.');
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
        entry: path.join(__dirname, 'wallet-browser-fixture.mjs'),
        formats: ['es'],
        fileName: () => 'fixture.js',
      },
    },
  });
  const fixture = fs.readFileSync(path.join(temp, 'bundle/fixture.js'));
  const assets = path.join(__dirname, '../public/season/assets');
  const sdkAssets = fs
    .readdirSync(assets)
    .filter(
      (name) =>
        name.endsWith('.js') &&
        fs.readFileSync(path.join(assets, name), 'utf8').includes('ccc-connector'),
    );
  assert.ok(sdkAssets.length, 'Identify the real connector build chunk.');
  const { update } = require('../dist/store');
  const { ensureMarketsForMatches } = require('../dist/markets');
  const { provider } = require('../dist/providers');
  provider.ownsMatch = () => true;
  provider.status = async () => ({
    enabled: false,
    simulated: true,
    source: 'test',
    provider: 'worldcup',
  });
  const { server } = require('../dist/server');
  await update((db) => {
    db.matches = [
      {
        id: 'wallet-fixture',
        kickoff: new Date(Date.now() + 3600_000).toISOString(),
        date: '2030-01-01',
        status: 'scheduled',
        stage: 'Synthetic test',
        competition: { id: 'test', name: 'Test League' },
        home: { name: 'Arsenal', code: 'ARS' },
        away: { name: 'Chelsea', code: 'CHE' },
      },
    ];
    ensureMarketsForMatches(db);
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  let groups = 0;
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      browser = await engine.launch({ headless: true });
      for (const width of [390, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
        });
        const external = [],
          unexpectedWrites = [],
          errors = [],
          requests = [];
        const allowedWrites = new Set(['/api/auth/nonce', '/api/auth/verify', '/api/logout']);
        await context.route('**/*', (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (url.origin !== base) {
            external.push(url.href);
            return route.abort();
          }
          if (!['GET', 'HEAD'].includes(request.method()) && !allowedWrites.has(url.pathname)) {
            unexpectedWrites.push(url.pathname);
            return route.abort();
          }
          if (url.pathname === '/qa-wallet-fixture.js')
            return route.fulfill({ contentType: 'text/javascript', body: fixture });
          if (url.pathname === '/api/direct/markets')
            return route.fulfill({ contentType: 'application/json', body: '{"markets":[]}' });
          return route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
              writeText: async (value) => {
                window.syntheticCopiedAddress = value;
              },
            },
          });
        });
        const page = await context.newPage(),
          reads = observeReads(page, base);
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('request', (request) => requests.push(new URL(request.url()).pathname));
        const signIn = page.getByRole('button', { name: 'Sign in with wallet', exact: true });
        const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
        const connect = page.getByRole('button', { name: 'Connect testnet wallet', exact: true });
        const disconnect = page.getByRole('button', { name: 'Disconnect wallet', exact: true });
        const walletNav = () =>
          page.getByRole('link', { name: 'My Account', exact: true }).filter({ visible: true }).first();
        async function choose(options = {}) {
          await page.locator('ccc-connector').waitFor();
          await page.evaluate(
            async (options) => {
              const fixture = await import('/qa-wallet-fixture.js');
              await fixture.connectEvm(document.querySelector('ccc-connector'), options);
            },
            { keyByte: (0x11 + groups).toString(16), ...options },
          );
        }
        try {
          await reads.goto(base + '/season/');
          await accountReadFinished(page);
          await reads.settled();
          assert.equal(await page.evaluate(() => !!customElements.get('ccc-connector')), false);
          assert.ok(
            !requests.some((url) => sdkAssets.some((asset) => url.endsWith('/' + asset))),
            'Browsing does not download the connector SDK.',
          );
          await signIn.click();
          await choose();
          await signOut.waitFor();
          const address = await page.evaluate(() => window.syntheticEvm.address);
          assert.equal(await page.locator('ccc-connector').count(), 0);
          assert.equal(
            await page.evaluate(
              () => window.syntheticEvm.calls.filter((method) => method === 'personal_sign').length,
            ),
            1,
          );
          assert.equal(
            await page.evaluate(() => window.syntheticEvm.listenerCount()),
            2,
            'Only the retained signer owns account/disconnect listeners.',
          );
          await page.evaluate(() => window.syntheticEvm.repeatAccount());
          await page.waitForFunction(() => window.syntheticEvm.listenerCount() === 2);
          assert.equal(await page.getByRole('button', { name: 'Reconnect wallet', exact: true }).count(), 0, 'An unchanged provider account notification retains the signer.');
          await walletNav().click();
          await disconnect.waitFor();
          const overview = page.getByRole('region', { name: 'My Account overview', exact: true });
          await overview.getByRole('heading', { name: 'My Account', exact: true }).waitFor();
          await overview.getByText('1,234 tCKB', { exact: true }).waitFor();
          const summary = page.locator('.wallet-nav-summary');
          await summary.getByText('1,234 tCKB', { exact: true }).waitFor();
          assert.equal(
            await summary
              .getByRole('button', { name: 'Copy wallet address' })
              .getAttribute('title'),
            address,
          );
          await summary.getByRole('button', { name: 'Copy wallet address' }).click();
          assert.equal(await page.evaluate(() => window.syntheticCopiedAddress), address);
          await overview.getByRole('button', { name: 'Copy wallet address' }).click();
          assert.equal(await page.evaluate(() => window.syntheticCopiedAddress), address);
          assert.equal(await connect.count(), 0, 'Sign-in connection carries into Wallet.');
          assert.equal(await page.locator('ccc-connector').count(), 0);
          await page
            .locator('a[href="/season/?view=activity"]')
            .filter({ visible: true })
            .first()
            .click();
          await page.waitForURL('**/?view=activity');
          assert.equal(await overview.count(), 0, 'Activity is a distinct page from Wallet.');
          await page
            .getByRole('heading', { name: 'Recent transactions', exact: true })
            .waitFor();
          await walletNav().click();
          await disconnect.waitFor();
          await page
            .getByRole('link', { name: 'Markets', exact: true })
            .filter({ visible: true })
            .first()
            .click();
          await page.getByRole('heading', { name: 'You know the game.', exact: true }).waitFor();
          await walletNav().click();
          await disconnect.waitFor();
          assert.equal(
            await page.evaluate(
              () => window.syntheticEvm.calls.filter((method) => method === 'personal_sign').length,
            ),
            1,
            'Navigation never signs again.',
          );

          await page.route('**/api/logout', (route) =>
            route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Unavailable"}',
            }),
          );
          await signOut.click();
          await page
            .getByText('Sign-out failed. Your session may still be active. Please retry.', {
              exact: true,
            })
            .waitFor();
          await disconnect.waitFor();
          await page.unroute('**/api/logout');
          await signOut.click();
          await signIn.waitFor();
          await connect.waitFor();
          assert.equal(
            await page.evaluate(() => window.syntheticEvm.listenerCount()),
            0,
            'Successful logout releases wallet listeners.',
          );
          await connect.click();
          await page.locator('ccc-connector').waitFor();
          await page.evaluate(() => document.querySelector('ccc-connector').onClose());
          await page.getByText('Wallet connection cancelled.', { exact: true }).waitFor();
          await connect.click();
          await choose();
          await disconnect.waitFor();
          await page.evaluate(() => {
            window.syntheticEvm.repeatAccount();
            window.syntheticEvm.replace();
          });
          await connect.waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Copy wallet address', exact: true }).count(),
            0,
            'Provider account changes discard the old connection.',
          );
          assert.equal(await page.evaluate(() => window.syntheticEvm.listenerCount()), 0);
          await connect.click();
          await choose();
          await disconnect.waitFor();
          await page.evaluate(() => window.syntheticEvm.disconnect());
          await connect.waitFor();

          await signIn.click();
          await choose({ mode: 'reject' });
          await page
            .getByText('User rejected the synthetic sign-in request.', { exact: true })
            .waitFor();
          await disconnect.waitFor();
          const verifies = requests.filter((url) => url === '/api/auth/verify').length;
          await page.evaluate(() => window.syntheticEvm.accept());
          await signIn.click();
          await signOut.waitFor();
          assert.equal(
            await page.locator('ccc-connector').count(),
            0,
            'Rejected sign-in preserves the selected wallet for an explicit retry.',
          );
          assert.equal(requests.filter((url) => url === '/api/auth/verify').length, verifies + 1);
          await reads.reload();
          await signOut.waitFor();
          await connect.waitFor();
          assert.equal(
            await page.locator('ccc-connector').count(),
            0,
            'Reload retains the server session but requires explicit wallet connection.',
          );
          await connect.click();
          await choose({ other: true });
          await page
            .getByText(
              'This wallet differs from your signed-in account. Connect that wallet or sign out first.',
              { exact: true },
            )
            .first()
            .waitFor();
          await connect.waitFor();
          assert.equal(
            await overview.getByText('1,234 tCKB', { exact: true }).count(),
            0,
            'A different wallet cannot inherit the signed-in account or its review.',
          );
          assert.equal(
            await overview
              .getByRole('button', { name: 'Copy wallet address' })
              .getAttribute('title'),
            address,
            'The signed-in address stays explicit after a mismatched connection is rejected.',
          );
          await signOut.click();
          await signIn.waitFor();
          await signIn.click();
          await choose({ mode: 'hold' });
          await page.waitForFunction(() => window.syntheticEvm.calls.includes('personal_sign'));
          const beforeReplacement = requests.filter((url) => url === '/api/auth/verify').length;
          await page.evaluate(() => {
            window.syntheticEvm.replace();
            window.syntheticEvm.accept();
          });
          await signIn.waitFor();
          await page
            .locator('.notice.error').getByText(/^(The connected wallet changed|Your wallet account or network changed)\. Connect again and review your action\.$/)
            .waitFor();
          assert.equal(
            requests.filter((url) => url === '/api/auth/verify').length,
            beforeReplacement,
            'Changing account during a signature never verifies the obsolete proof.',
          );
          await reads.settled();
          assert.deepEqual(external, []);
          assert.deepEqual(unexpectedWrites, []);
          assert.deepEqual(errors, []);
          groups++;
          console.log(`Wallet session ${name} ${width}: passed.`);
        } catch (error) {
          console.error(
            `Wallet session ${name} ${width}:`,
            (await page.locator('body').innerText()).slice(-5000),
          );
          throw error;
        } finally {
          await context.close();
        }
      }
      await browser.close();
      browser = undefined;
    }
    console.log(
      `Wallet browser passed: ${groups} real EIP-6963 journeys, shared connection, account/disconnect invalidation, rejected signatures, logout failure and explicit reload reconnect.`,
    );
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    global.fetch = savedFetch;
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('streak-wallet-browser-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

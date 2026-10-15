/* Built React app + real local API + synthetic ledger. No provider, wallet or chain network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require('playwright');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-season-'));
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
  const guardedFetch = global.fetch;
  global.fetch = () => {
    throw Error('External services are forbidden.');
  };
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
  const friday = new Date();
  const weekday = friday.getDay();
  friday.setDate(friday.getDate() + (weekday === 0 ? -2 : weekday === 1 ? -3 : 5 - weekday));
  friday.setHours(12, 0, 0, 0);
  provider.scheduleCoverage = () => ({
    from: new Date(friday.getTime() - 8 * 86400000).toISOString(),
    to: new Date(friday.getTime() + 22 * 86400000).toISOString(),
    complete: true,
  });
  await update((db) => {
    db.users = [
      {
        id: 'season-user',
        username: 'alex',
        walletIdentity: 'test',
        walletType: 'test',
        wallet: { address: 'synthetic' },
        createdAt: new Date().toISOString(),
        escrowShannons: '0',
        creatorFeesShannons: '0',
        streak: { current: 0, best: 0, status: 'active' },
        stats: {
          totalBets: 0,
          wonBets: 0,
          lostBets: 0,
          renews: 0,
          netPnlShannons: '0',
          turnoverShannons: '0',
        },
      },
    ];
    db.matches = Array.from({ length: 26 }, (_, i) => ({
      id: `season-${i}`,
      kickoff: new Date(friday.getTime() + (i === 25 ? 72 : i) * 3600000).toISOString(),
      date: '2030-01-01',
      status: 'scheduled',
      stage: 'Matchweek 8',
      competition: { id: 'test', name: 'Test Premier League' },
      home: {
        logo: '/qa-team.svg',
        name: i === 0 ? 'Arsenal' : `Home ${i}`,
        code: i === 0 ? 'ARS' : `H${i}`,
      },
      away: { name: i === 0 ? 'Chelsea' : `Away ${i}`, code: i === 0 ? 'CHE' : `A${i}` },
    }));
    ensureMarketsForMatches(db);
  });
  provider.scheduleFixtures = () => [
    {
      id: 'schedule-only',
      kickoff: new Date(friday.getTime() + 30 * 3600000).toISOString(),
      date: '2030-01-01',
      status: 'postponed',
      stage: 'Matchweek 8',
      competition: { id: 'test', name: 'Test Premier League' },
      home: { name: 'Postponed home', code: 'PST' },
      away: { name: 'Postponed away', code: 'AWY' },
    },
  ];
  const { server } = require('../dist/server');
  const { createSession } = require('../dist/auth');
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const evidence =
    process.env.STREAK_SCREENSHOTS ||
    path.resolve(__dirname, '../../../.quality-artifacts/browser');
  fs.mkdirSync(evidence, { recursive: true });
  let browser;
  let groups = 0;
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      browser = await engine.launch({ headless: true });
      for (const width of [320, 390, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          serviceWorkers: 'block',
          reducedMotion: 'reduce',
        });
        const external = [];
        await context.route('**/*', (route) => {
          if (new URL(route.request().url()).origin !== base) {
            external.push(route.request().url());
            return route.abort();
          }
          if (new URL(route.request().url()).pathname === '/qa-team.svg')
            return route.fulfill({
              contentType: 'image/svg+xml',
              body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 50"><path fill="#f46e67" d="M1 1h38v30L20 49 1 31Z"/></svg>',
            });
          return route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(base + '/season/');
        await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
        await page.getByRole('link', { name: 'Skip to markets' }).focus();
        assert.equal(
          await page.evaluate(() => document.activeElement.textContent),
          'Skip to markets',
        );
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
        assert.equal(await page.locator('.market-card').count(), 24);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
        );
        assert.equal(
          await page.getByRole('link', { name: 'View market' }).first().getAttribute('href'),
          '/#market/m-season-0',
        );
        assert.ok(
          ![...(await page.locator('script').evaluateAll((nodes) => nodes.map((n) => n.src)))].some(
            (url) => url.includes('wallet-'),
          ),
        );
        await page.getByRole('button', { name: 'Show more fixtures' }).click();
        await page.waitForFunction(() => document.querySelectorAll('.market-card').length === 27);
        await page
          .getByText('No prediction market is available for this match.', { exact: true })
          .waitFor();
        await page.getByRole('button', { name: /^Mon / }).click();
        await page.getByRole('heading', { name: 'Home 25', exact: true }).waitFor();
        assert.equal(await page.locator('.market-card').count(), 1);
        await page.getByRole('button', { name: 'All days', exact: true }).click();
        await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
        await page.getByRole('textbox', { name: 'Search teams or competitions' }).fill('Arsenal');
        await page.waitForFunction(() => document.querySelectorAll('.market-card').length === 1);
        await page.evaluate(() => {
          document.activeElement.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({
          path: path.join(evidence, `season-${name}-${width}.png`),
          fullPage: true,
        });
        await page
          .getByRole('textbox', { name: 'Search teams or competitions' })
          .fill('not-a-fixture');
        await page.getByRole('heading', { name: 'No matching fixtures' }).waitFor();
        await page.getByRole('button', { name: 'Browse all fixtures' }).click();
        await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
        await page.keyboard.press('Control+Home');
        await page.getByRole('link', { name: 'Skip to markets' }).focus();
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        await context.close();
        groups++;
      }
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'block',
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      await context.routeWebSocket('**/*', (socket) => socket.close());
      const page = await context.newPage();
      let fail = true;
      await page.route('**/api/markets?*', (route) =>
        fail
          ? route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Fixture feed unavailable."}',
            })
          : route.continue(),
      );
      await page.goto(base + '/season/');
      await page.getByRole('heading', { name: 'You know the game.' }).waitFor();
      await page.getByText('We could not load the markets', { exact: true }).waitFor();
      assert.equal(await page.locator('.market-card').count(), 0);
      fail = false;
      await page.getByRole('button', { name: 'Retry markets' }).click();
      await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
      await context.addCookies([
        { name: 'streak_sid', value: await createSession('season-user'), url: base },
      ]);
      await page.reload();
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      await page.route('**/api/logout', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"error":"Unavailable"}',
        }),
      );
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page
        .getByText('Sign-out failed. Your session may still be active. Please retry.')
        .waitFor();
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      await page.unroute('**/api/logout');
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('button', { name: 'Sign in with wallet' }).waitFor();
      // A delayed former filter may not replace the user's newer filter.
      let release;
      await page.route('**/api/markets?*status=closed*', async (route) => {
        await new Promise((done) => {
          release = done;
        });
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{"markets":[],"total":0,"nextOffset":null}',
          });
        } catch {}
      });
      await page.getByRole('button', { name: 'Locked', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[aria-label="Loading markets"]'));
      await page.getByRole('button', { name: 'All fixtures', exact: true }).click();
      await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
      release?.();
      assert.equal(
        await page
          .getByRole('button', { name: 'All fixtures', exact: true })
          .getAttribute('aria-pressed'),
        'true',
      );
      assert.equal(await page.locator('.market-card').count(), 24);
      // Exercise the real CCC element's close-before-selection callback order.
      const { ccc } = require('@ckb-ccc/core');
      const signer = new ccc.SignerCkbPrivateKey(
        new ccc.ClientPublicTestnet(),
        ccc.hexFrom(require('node:crypto').randomBytes(32)),
      );
      const walletAddress = await signer.getRecommendedAddress();
      await page.exposeFunction('signSyntheticLogin', (message) => signer.signMessage(message));
      await page.getByRole('button', { name: 'Sign in with wallet' }).click();
      await page.locator('ccc-connector').waitFor();
      await page.evaluate((address) => {
        const element = document.querySelector('ccc-connector');
        element.onClose(
          () =>
            void element.updateSigner(
              { name: 'Synthetic wallet' },
              {
                name: 'Synthetic signer',
                signer: {
                  isConnected: async () => true,
                  onReplaced: () => () => {},
                  getRecommendedAddress: async () => address,
                  signMessage: (message) => window.signSyntheticLogin(message),
                },
              },
            ),
        );
      }, walletAddress);
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      assert.equal(await page.locator('ccc-connector').count(), 0);
      let releaseAccount;
      let accountStarted;
      const accountPending = new Promise((done) => {
        accountStarted = done;
      });
      await page.route('**/api/me', async (route) => {
        const response = await guardedFetch(route.request().url(), {
          headers: { cookie: route.request().headers().cookie || '' },
        });
        const body = await response.text();
        accountStarted();
        await new Promise((done) => {
          releaseAccount = done;
        });
        try {
          await route.fulfill({ status: 200, contentType: 'application/json', body });
        } catch {
          /* Query cancellation can close the request. */
        }
      });
      await page.clock.install();
      await page.clock.fastForward(31_000);
      await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
      await Promise.race([
        accountPending,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Account refresh did not start')), 5000),
        ),
      ]);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await page.getByRole('button', { name: 'Sign in with wallet' }).waitFor();
      releaseAccount();
      await page.unroute('**/api/me');
      await page.clock.resume();
      await page.waitForTimeout(100);
      assert.equal(
        await page.getByRole('button', { name: 'Sign out', exact: true }).count(),
        0,
        'A late account response cannot revive a signed-out account.',
      );
      await page.getByRole('button', { name: 'Sign in with wallet' }).click();
      await page.locator('ccc-connector').waitFor();
      await page.evaluate(() => document.querySelector('ccc-connector').onClose());
      await page.getByText('Wallet connection cancelled.', { exact: true }).waitFor();
      assert.equal(await page.locator('ccc-connector').count(), 0);
      // Malformed successful responses must surface an error, never invented market values.
      await page.unroute('**/api/markets?*');
      await page.route('**/api/markets?*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"markets":[{}],"total":1,"nextOffset":null}',
        }),
      );
      await page.reload();
      await page.getByText('We could not load the markets', { exact: true }).waitFor();
      assert.equal(await page.locator('.market-card').count(), 0);
      await context.close();
      groups++;
      await browser.close();
      browser = null;
    }
    const invalid = await guardedFetch(base + '/api/markets?limit=999');
    assert.equal(invalid.status, 400);
    console.log(
      `Season browser passed: ${groups} groups across Chromium/WebKit, 320/390/1440px, real API paging/search, error/retry, malformed data, account/logout recovery and stale navigation.`,
    );
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    global.fetch = guardedFetch;
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('streak-season-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/* Built React app + real local API + synthetic ledger. No provider, wallet or chain network. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require('playwright');
const { observeReads, accountReadFinished } = require('./browser-readiness.cjs');

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
        const reads = observeReads(page, base);
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await reads.goto(base + '/');
        await page.getByRole('heading', { name: 'You know the game. Make it yours.' }).waitFor();
        await page.locator('.welcome-featured').getByText('Arsenal', { exact: true }).waitFor();
        if (width === 1440) {
          for (const [heroWidth, heroHeight] of [
            [1213, 629],
            [1366, 650],
            [1440, 700],
            [1024, 600],
            [768, 600],
            [390, 667],
            [320, 568],
          ]) {
            await page.setViewportSize({ width: heroWidth, height: heroHeight });
            await page.evaluate(() => {
              window.scrollTo(0, 0);
              return new Promise((done) =>
                requestAnimationFrame(() => requestAnimationFrame(done)),
              );
            });
            const actions = await page.locator('.welcome-actions a').evaluateAll((links) =>
              links.map((link) => {
                const box = link.getBoundingClientRect();
                const hit = document.elementFromPoint(
                  box.x + box.width / 2,
                  box.y + box.height / 2,
                );
                return {
                  text: link.textContent,
                  top: box.top,
                  bottom: box.bottom,
                  height: box.height,
                  visible:
                    box.left >= 0 &&
                    box.right <= innerWidth &&
                    box.top >= 0 &&
                    box.bottom <= innerHeight - 12,
                  reachable: link.contains(hit),
                };
              }),
            );
            assert.equal(actions.length, 2);
            for (const action of actions) {
              assert.ok(
                action.visible && action.reachable && action.height >= 44,
                `${name} ${heroWidth}x${heroHeight}: hero CTA must be fully visible and clickable without scrolling: ${JSON.stringify(action)}`,
              );
            }
            assert.equal(await page.evaluate(() => scrollY), 0);
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
              false,
            );
            if (heroWidth === 1213 || heroWidth === 320) {
              await page.screenshot({
                path: path.join(evidence, `landing-hero-${name}-${heroWidth}.png`),
              });
            }
          }
          await page.setViewportSize({ width, height: 900 });
        }
        await page.getByRole('link', { name: 'Skip to content' }).focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'welcome-main');
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
          false,
        );
        assert.equal(
          await page
            .locator('.welcome-copy')
            .evaluate((node) => getComputedStyle(node).animationName),
          'none',
        );
        assert.ok(
          await page
            .locator('.welcome-club img')
            .first()
            .evaluate((node) => node.complete && node.naturalWidth > 0),
        );
        await page.getByRole('button', { name: 'Mon', exact: true }).click();
        await page.locator('.welcome-featured').getByText('Home 25', { exact: true }).waitFor();
        assert.equal(await page.locator('.welcome-fixture').count(), 0);
        await page.getByRole('button', { name: 'Sun', exact: true }).click();
        await page.getByText('No fixtures on this day.', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'All', exact: true }).click();
        await page.locator('.welcome-featured').getByText('Arsenal', { exact: true }).waitFor();
        const question = page
          .locator('summary')
          .filter({ hasText: 'Where are my testnet funds held?' });
        await question.focus();
        await page.keyboard.press('Enter');
        assert.equal(await question.evaluate((node) => node.parentElement.open), true);
        await reads.settled();
        reads.phase('landing wallet link');
        await page.getByRole('link', { name: 'Open Wallet', exact: true }).click();
        await page.waitForURL('**/index.html#wallet');
        await page.locator('#connect-top').waitFor();
        await reads.goto(base + '/welcome/');
        await page.locator('.welcome-featured').getByText('Arsenal', { exact: true }).waitFor();
        if (width === 1440) {
          await page.setViewportSize({ width: 768, height: 600 });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
            false,
          );
          await page.emulateMedia({ forcedColors: 'active' });
          assert.notEqual(
            await page
              .locator('.welcome-button-primary')
              .first()
              .evaluate((node) => getComputedStyle(node).borderStyle),
            'none',
          );
          await page.emulateMedia({ forcedColors: 'none' });
          await page.setViewportSize({ width, height: 900 });
        }
        await page.screenshot({
          path: path.join(evidence, `landing-${name}-${width}.png`),
          fullPage: true,
        });
        await reads.settled();
        reads.phase('landing market link');
        await page.getByRole('link', { name: 'Explore the markets', exact: true }).click();
        await page.waitForURL('**/season/');
        // Continue in the document reached by the CTA. Navigating to the same
        // URL again here would abort its just-started market and account reads.
        await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
        await accountReadFinished(page);
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
          '/season/?market=m-season-0',
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
        await reads.settled();
        if (errors.length || external.length)
          fs.writeFileSync(
            path.join(evidence, `season-read-failure-${name}-${width}.json`),
            JSON.stringify({ errors, external, trace: reads.trace }, null, 2),
          );
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        await context.close();
        groups++;
      }
      // Real API data changes without reloading; Monday remains in the same
      // matchweek until Tuesday, when an already-open page advances its window.
      const liveContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        timezoneId: 'UTC',
        serviceWorkers: 'block',
      });
      await liveContext.route('**/*', (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      await liveContext.routeWebSocket('**/*', (socket) => socket.close());
      const livePage = await liveContext.newPage();
      const liveReads = observeReads(livePage, base);
      const mondayNight = new Date(
        Date.UTC(friday.getFullYear(), friday.getMonth(), friday.getDate() + 3, 23, 58, 30),
      );
      await livePage.clock.install({ time: mondayNight });
      const originals = await update((db) => {
        const rows = db.matches.filter((match) =>
          ['season-22', 'season-23', 'season-24'].includes(match.id),
        );
        const saved = structuredClone(rows);
        for (const row of rows) {
          row.competition = { id: 'test-epl', name: 'Premier League', country: 'England' };
          if (row.id === 'season-23') {
            row.home.name = 'Manchester United';
            row.away.name = 'Tottenham';
          }
          if (row.id === 'season-24') {
            row.home.name = 'Barcelona';
            row.away.name = 'Real Madrid';
            row.competition = { id: 'test-la-liga', name: 'La Liga', country: 'Spain' };
          }
        }
        return saved;
      });
      try {
        await liveReads.goto(base + '/');
        await livePage
          .locator('.welcome-featured')
          .getByText('Barcelona', { exact: true })
          .waitFor();
        assert.match(
          await livePage.locator('.welcome-fixture').first().textContent(),
          /Manchester United/,
        );
        await liveReads.goto(base + '/season/');
        await livePage
          .locator('.market-card')
          .first()
          .getByRole('heading', { name: 'Barcelona', exact: true })
          .waitFor();
        await accountReadFinished(livePage);
        await livePage.getByRole('combobox', { name: 'Sort by' }).selectOption('kickoff');
        await livePage
          .locator('.market-card')
          .first()
          .getByRole('heading', { name: 'Arsenal', exact: true })
          .waitFor();
        await livePage.getByRole('combobox', { name: 'Sort by' }).selectOption('featured');
        await livePage
          .locator('.market-card')
          .first()
          .getByRole('heading', { name: 'Barcelona', exact: true })
          .waitFor();
        const rankedFirst = await guardedFetch(base + '/api/markets?limit=1&sort=featured');
        assert.equal((await rankedFirst.json()).markets[0].match.home.name, 'Barcelona');
        const rankedSecond = await guardedFetch(
          base + '/api/markets?limit=1&offset=1&sort=featured',
        );
        assert.equal((await rankedSecond.json()).markets[0].match.home.name, 'Manchester United');
        const filtered = await guardedFetch(
          base + '/api/markets?limit=1&sort=featured&competition=test-epl',
        );
        assert.equal((await filtered.json()).markets[0].match.home.name, 'Manchester United');
        assert.equal((await guardedFetch(base + '/api/markets?limit=1&sort=invalid')).status, 400);
      } finally {
        await update((db) => {
          const saved = new Map(originals.map((match) => [match.id, match]));
          db.matches = db.matches.map((match) => saved.get(match.id) ?? match);
        });
      }
      groups++;
      await liveReads.goto(base + '/');
      await livePage.locator('.welcome-featured').getByText('Arsenal', { exact: true }).waitFor();
      await update((db) => {
        db.matches.find((match) => match.id === 'season-0').home.name = 'Updated Arsenal';
      });
      try {
        await livePage.clock.fastForward(60_000);
        await livePage
          .locator('.welcome-featured')
          .getByText('Updated Arsenal', { exact: true })
          .waitFor();
        const nextFriday = new Date(
          Date.UTC(friday.getFullYear(), friday.getMonth(), friday.getDate() + 7),
        );
        const nextWindow = livePage.waitForResponse((response) => {
          const url = new URL(response.url());
          return (
            url.pathname === '/api/markets' &&
            url.searchParams.get('from') === nextFriday.toISOString()
          );
        });
        await livePage.clock.fastForward(60_000);
        await nextWindow;
        await livePage.getByText('No fixtures on this day.', { exact: true }).waitFor();
        assert.equal(await livePage.locator('.welcome-featured').count(), 0);
        assert.ok(
          (await livePage.locator('.welcome-dates').textContent()).includes(
            nextFriday.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            }),
          ),
        );
      } finally {
        await update((db) => {
          db.matches.find((match) => match.id === 'season-0').home.name = 'Arsenal';
        });
        await liveReads.settled();
        await liveContext.close();
      }
      groups++;
      let context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'block',
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      await context.routeWebSocket('**/*', (socket) => socket.close());
      let page = await context.newPage();
      let recoveryReads = observeReads(page, base);
      // Recovery must work without loading the new application's JavaScript.
      await page.route('**/season/assets/*.js', (route) => route.abort());
      await recoveryReads.goto(base + '/');
      await page.getByRole('heading', { name: 'Streak is loading.' }).waitFor();
      await page.getByRole('link', { name: 'Open current Wallet', exact: true }).click();
      await page.waitForURL('**/index.html#wallet');
      await page.locator('#connect-top').waitFor();
      await recoveryReads.goto(base + '/?source=shared#wallet');
      await page.waitForURL('**/index.html?source=shared#wallet');
      await page.locator('#connect-top').waitFor();
      await recoveryReads.goto(base + '/#/receipt/unavailable-receipt');
      await page.waitForURL('**/index.html#/receipt/unavailable-receipt');
      await page.getByRole('heading', { name: 'Receipt not available', exact: true }).waitFor();
      assert.equal(
        await page.locator('#connect-top').count(),
        0,
        'Public receipts do not become login gated.',
      );
      // WebKit retains the deliberately failed module load across this sequence
      // of legacy redirects. Removing the route does not make the application
      // execute: the failure artifact stayed on the static shell with no market
      // request. Keep missing-bundle recovery separate from API error recovery.
      await recoveryReads.settled();
      await context.close();
      context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        serviceWorkers: 'block',
      });
      await context.route('**/*', (route) =>
        new URL(route.request().url()).origin === base ? route.continue() : route.abort(),
      );
      await context.routeWebSocket('**/*', (socket) => socket.close());
      page = await context.newPage();
      recoveryReads = observeReads(page, base);
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
      await recoveryReads.goto(base + '/');
      try {
        await page.getByText('The fixture feed is taking a break.', { exact: true }).waitFor();
      } catch (error) {
        fs.writeFileSync(
          path.join(evidence, `season-recovery-failure-${name}.json`),
          JSON.stringify(
            {
              url: page.url(),
              body: await page.locator('body').innerText(),
              reads: recoveryReads.trace,
            },
            null,
            2,
          ),
        );
        throw error;
      }
      assert.equal(await page.locator('.welcome-featured').count(), 0);
      assert.equal(
        await page
          .getByRole('link', { name: 'Explore the markets', exact: true })
          .getAttribute('href'),
        '/season/',
      );
      fail = false;
      await page.getByRole('button', { name: 'Retry fixtures', exact: true }).click();
      await page.locator('.welcome-featured').getByText('Arsenal', { exact: true }).waitFor();
      await page.route('**/api/markets?*', (route) =>
        route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({ markets: [], total: 0, nextOffset: null, coverage: null }),
        }),
      );
      await recoveryReads.reload();
      await page.getByText('The schedule is not available yet.', { exact: true }).waitFor();
      assert.equal(await page.getByText('No fixtures on this day.', { exact: true }).count(), 0);
      await page.unroute('**/api/markets?*');
      fail = true;
      await page.route('**/api/markets?*', (route) =>
        fail
          ? route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Fixture feed unavailable."}',
            })
          : route.continue(),
      );
      await recoveryReads.goto(base + '/season/');
      await page.getByRole('heading', { name: 'You know the game.' }).waitFor();
      await page.getByText('We could not load the markets', { exact: true }).waitFor();
      assert.equal(await page.locator('.market-card').count(), 0);
      fail = false;
      await page.getByRole('button', { name: 'Retry markets' }).click();
      await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
      await accountReadFinished(page);
      await context.addCookies([
        { name: 'streak_sid', value: await createSession('season-user'), url: base },
      ]);
      await recoveryReads.reload();
      await page.getByRole('button', { name: 'Sign out', exact: true }).waitFor();
      await page.getByRole('heading', { name: 'Arsenal', exact: true }).waitFor();
      await accountReadFinished(page, 'Sign out');
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
      await recoveryReads.reload();
      await page.getByText('We could not load the markets', { exact: true }).waitFor();
      await accountReadFinished(page);
      assert.equal(await page.locator('.market-card').count(), 0);
      await recoveryReads.settled();
      await context.close();
      groups++;
      groups += await require('./prediction-journey.cjs')({
        browser,
        base,
        name,
        update,
        ensureMarketsForMatches,
        friday,
        evidence,
        loopbackFetch: guardedFetch,
      });
      await browser.close();
      browser = null;
    }
    const fsPromises = require('node:fs/promises');
    const originalStat = fsPromises.stat;
    const shell = path.resolve(__dirname, '../public/season/index.html');
    fsPromises.stat = async (file, ...args) => {
      if (path.resolve(String(file)) === shell)
        throw Object.assign(new Error('Synthetic missing build'), { code: 'ENOENT' });
      return originalStat(file, ...args);
    };
    try {
      for (const entry of ['/', '/welcome/', '/season/']) {
        const missing = await guardedFetch(base + entry);
        assert.equal(missing.status, 503);
        assert.match(await missing.text(), /href="\/index.html#wallet"/);
      }
      assert.equal((await guardedFetch(base + '/index.html')).status, 200);
      assert.equal((await guardedFetch(base + '/season/assets/unavailable.js')).status, 404);
    } finally {
      fsPromises.stat = originalStat;
    }
    const invalid = await guardedFetch(base + '/api/markets?limit=999');
    assert.equal(invalid.status, 400);
    console.log(
      `Season browser passed: ${groups} groups across Chromium/WebKit, 320/390/768/1440px, hero CTA visibility on seven short viewports, landing/market API states, Monday fixtures, keyboard FAQ, reduced motion, forced colors, missing bundle/build recovery, shared links, paging/search, account/logout recovery, stale navigation, Minimize-only slips, painted Genie taper, eight-pick restoration and interrupted/canvas-failure recovery.`,
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

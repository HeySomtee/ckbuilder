/* Built app, isolated local API, synthetic fixtures. No wallet, provider or bot calls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium, webkit } = require('playwright');

async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-account-navigation-'));
  process.env.STREAK_SKIP_ENV_FILE = '1';
  process.env.STREAK_DB_FILE = path.join(temp, 'db.json');
  process.env.MATCH_PROVIDER = 'worldcup';
  const savedFetch = global.fetch;
  global.fetch = () => {
    throw Error('External services forbidden');
  };
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
  const clock = Date.UTC(2030, 0, 5, 12); // Saturday, fixed in the browser; no public chain.
  provider.scheduleCoverage = () => ({
    from: '2030-01-01T00:00:00Z',
    to: '2030-02-01T00:00:00Z',
    complete: true,
  });
  await update((db) => {
    db.matches = Array.from({ length: 8 }, (_, i) => ({
      id: `account-ui-${i}`,
      kickoff: new Date(clock + (i + 1) * 3600000).toISOString(),
      date: '2030-01-05',
      status: 'scheduled',
      stage: 'Synthetic matchweek',
      competition: { id: 'test', name: 'Test League' },
      home: { name: `Home ${i}`, code: `H${i}` },
      away: { name: `Away ${i}`, code: `A${i}` },
    }));
    ensureMarketsForMatches(db);
  });
  const { server } = require('../dist/server');
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  function localRoute(route) {
    if (new URL(route.request().url()).pathname === '/api/five')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          now: new Date(clock).toISOString(),
          admin: false,
          viewerId: null,
          feedAvailable: false,
          fundingAvailable: false,
          rewardsAccount: null,
          rounds: [],
          detail: null,
        }),
      });
    return route.continue();
  }
  const out = path.resolve(__dirname, '../../../.quality-artifacts/account-navigation');
  fs.mkdirSync(out, { recursive: true });
  const results = [];
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        // Density is a viewport requirement, not browser zoom or clipped navigation.
        for (const [width, height] of [
          [1279, 663],
          [1024, 600],
          [1024, 461],
          [900, 460],
          [640, 450],
        ]) {
          const context = await browser.newContext({
            viewport: { width, height },
            reducedMotion: 'reduce',
            timezoneId: 'UTC',
            serviceWorkers: 'block',
          });
          const page = await context.newPage();
          await page.clock.install({ time: clock });
          await context.route('**/*', (route) =>
            new URL(route.request().url()).origin === base ? localRoute(route) : route.abort(),
          );
          await page.goto(base + '/season/?view=overview');
          await page.locator('.overview-fixture').first().waitFor();
          assert.equal(await page.getByText('Your next chapter.', { exact: true }).count(), 0);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
          );
          if (width > 700 && height > 460) {
            const rail = await page.locator('.rail').evaluate((el) => ({
              client: el.clientHeight,
              scroll: el.scrollHeight,
              links: [...el.querySelectorAll('nav a')].map((a) => {
                const r = a.getBoundingClientRect();
                return { top: r.top, bottom: r.bottom, height: r.height };
              }),
            }));
            assert.equal(rail.scroll, rail.client, 'Sidebar must have no internal overflow');
            assert.equal(rail.links.length, 8);
            assert.ok(rail.links.every((r) => r.top >= 0 && r.bottom <= height && r.height >= 44));
            await page.evaluate(() => window.scrollTo(0, 500));
            const account = await page
              .getByRole('navigation', { name: 'Main navigation', exact: true })
              .getByRole('link', { name: 'My Account' })
              .boundingBox();
            assert.ok(
              account.y + account.height <= height,
              'Account stays available after page scroll',
            );
            await page.evaluate(() => window.scrollTo(0, 0));
          } else {
            assert.equal(await page.locator('.rail').isVisible(), false);
            const nav = page.getByRole('navigation', { name: 'Mobile navigation', exact: true });
            await nav.getByRole('button', { name: 'More pages' }).click();
            const menu = page.getByRole('dialog', { name: 'More pages' });
            await menu.getByRole('link', { name: 'Clubhouse' }).click();
            await page.getByRole('heading', { name: 'Clubhouse', exact: true }).waitFor();
            await nav.getByRole('link', { name: 'Overview', exact: true }).click();
            await page.locator('.overview-fixture').first().waitFor();
          }
          await page.screenshot({ path: path.join(out, `${name}-${width}x${height}-density.png`) });
          if (width === 1279) {
            const first = await page.locator('.overview-fixture').first().boundingBox();
            const match = await page.locator('.overview-match').first().boundingBox();
            const outcomes = await page.locator('.overview-outcomes').first().boundingBox();
            assert.ok(outcomes.x >= match.x + match.width, 'Desktop choices sit beside the teams');
            assert.ok(
              first.y + first.height <= height,
              'A complete match row fits below the hero at 100%',
            );
            assert.ok(first.height <= 140, 'Overview rows remain compact');
          }
          for (const view of ['account', 'activity', 'five', 'matchday', 'clubhouse']) {
            await page.goto(base + '/season/?view=' + view);
            await page.locator('main h1:visible').waitFor();
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
              true,
              `${view} must reflow without horizontal page scrolling`,
            );
          }
          results.push(`${name} ${width}x${height}: compact layout and reachable navigation`);
          await context.close();
        }
        for (const [width, height] of [
          [320, 568],
          [390, 844],
          [1440, 900],
        ]) {
          const context = await browser.newContext({
              viewport: { width, height },
              reducedMotion: 'reduce',
              timezoneId: 'UTC',
              serviceWorkers: 'block',
            }),
            page = await context.newPage();
          await page.clock.install({ time: clock });
          const errors = [],
            external = [];
          page.on('pageerror', (e) => errors.push(e.message));
          await context.route('**/*', (route) => {
            if (new URL(route.request().url()).origin !== base) {
              external.push(route.request().url());
              return route.abort();
            }
            return localRoute(route);
          });
          await page.goto(base + '/season/?view=overview');
          await page.getByRole('heading', { name: 'Good to have you here.' }).waitFor();
          await page.waitForFunction(
            () => document.querySelector('.network-strip img')?.naturalWidth > 0,
          );
          assert.equal(await page.locator('.shirt-ckb-mark').count(), 3);
          await page.locator('.overview-fixture').first().waitFor();
          assert.equal(await page.locator('.overview-fixture').count(), 6);
          assert.equal(
            await page
              .locator('.overview-match')
              .first()
              .innerText()
              .then((t) => t.includes('Home')),
            true,
          );
          const nav = page.getByRole('navigation', {
            name: width < 700 ? 'Mobile navigation' : 'Main navigation',
            exact: true,
          });
          assert.equal(
            await nav
              .getByRole('link', { name: 'Overview', exact: true })
              .getAttribute('aria-current'),
            'page',
          );
          async function section(label) {
            if (width < 700 && ['Streak Five', 'Matchday', 'Clubhouse'].includes(label)) {
              await nav.getByRole('button', { name: 'More pages' }).click();
              await page
                .getByRole('dialog', { name: 'More pages' })
                .getByRole('link', { name: new RegExp('^' + label) })
                .click();
            } else
              await nav
                .getByRole('link', { name: new RegExp('^' + label + '(?: Beta)?$') })
                .click();
          }
          await page.screenshot({
            path: path.join(out, `${name}-${width}-overview.png`),
            fullPage: true,
          });
          await section('Streak Five');
          await page
            .getByRole('heading', { name: 'Streak Five.', exact: true })
            .waitFor();
          await page
            .getByRole('heading', { name: 'The next five starts here.', exact: true })
            .waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'How it works', exact: true }).count(),
            1,
          );
          await page.reload();
          await page
            .getByRole('heading', { name: 'Streak Five.', exact: true })
            .waitFor();
          await section('Matchday');
          assert.equal(
            await page.getByRole('link', { name: 'Open match centre' }).getAttribute('href'),
            '/index.html#/matchday',
          );
          await section('Clubhouse');
          assert.equal(
            await page.getByRole('link', { name: 'Open crews' }).getAttribute('href'),
            '/index.html#/crews',
          );
          await section('My Account');
          await page.getByRole('heading', { name: 'My Account', exact: true }).waitFor();
          await page.waitForURL('**/?view=account');
          assert.equal(await page.getByRole('region', { name: 'My Account overview' }).count(), 1);
          await page.screenshot({
            path: path.join(out, `${name}-${width}-account.png`),
            fullPage: true,
          });
          await page.goto(base + '/season/?view=wallet');
          await page.getByRole('heading', { name: 'My Account', exact: true }).waitFor();
          await section(width < 700 ? 'Activity' : 'My activity');
          await page.waitForURL('**/?view=activity');
          assert.equal(await page.locator('.wallet-overview').count(), 0);
          await section('Overview');
          await page
            .getByRole('button', { name: /Add Home for/ })
            .first()
            .click();
          const slip = page.getByRole('dialog', { name: 'Prediction slip' });
          await slip.waitFor();
          assert.equal(
            await slip
              .getByRole('button', { name: 'Close prediction slip' })
              .evaluate((el) => el === document.activeElement),
            true,
          );
          await slip.getByRole('button', { name: 'Close prediction slip' }).click();
          const firstRow = page.locator('.overview-fixture').first();
          const home = firstRow.locator('[data-outcome="home"]');
          const draw = firstRow.locator('[data-outcome="draw"]');
          assert.equal(await home.getAttribute('aria-pressed'), 'true');
          await draw.click();
          assert.equal(await draw.getAttribute('aria-pressed'), 'true');
          assert.equal(await home.getAttribute('aria-pressed'), 'false');
          assert.match(await page.locator('.prediction-dock').innerText(), /1 prediction/);
          const faces = await firstRow.locator('.outcome-glass').evaluateAll((buttons) =>
            buttons.map((b) => {
              const style = getComputedStyle(b);
              return {
                background: style.backgroundImage,
                border: style.borderColor,
                height: b.getBoundingClientRect().height,
              };
            }),
          );
          assert.equal(
            new Set(faces.map((face) => face.background)).size,
            3,
            'Each outcome has its own glass tint',
          );
          assert.ok(faces.every((face) => face.height >= 44));
          await home.click();
          await page.locator('.prediction-dock').click();
          await slip.waitFor();
          await slip.getByRole('button', { name: 'Add matches', exact: true }).click();
          assert.equal(await slip.isVisible(), false);
          await page.getByRole('heading', { name: 'You know the game.' }).waitFor();
          for (let i = 1; i < 8; i++)
            await page
              .getByRole('button', { name: `Add Home for Home ${i} vs Away ${i}`, exact: true })
              .click();
          await page.locator('.prediction-dock').click();
          await slip.getByRole('button', { name: 'Slip full', exact: true }).waitFor();
          assert.equal(await page.locator('.slip-pick').count(), 8);
          const density = await slip.evaluate((el) => ({
            list: el.querySelector('#slip-picks-panel').getBoundingClientRect().height,
            footer: el.querySelector('.slip-footer').getBoundingClientRect().height,
          }));
          assert.ok(density.list >= 200 && density.footer < 220, JSON.stringify(density));
          const stake = slip.getByRole('textbox', { name: /Stake for/ }).first();
          await stake.focus();
          assert.equal(
            await stake.evaluate((el) => getComputedStyle(el).outlineStyle),
            'none',
            'One focus ring belongs to the amount container.',
          );
          assert.equal(
            await stake.evaluate((el) => getComputedStyle(el.parentElement).borderColor),
            'rgb(255, 152, 111)',
          );
          await slip.getByRole('tab', { name: 'Activity', exact: true }).click();
          assert.equal(await slip.locator('.slip-footer').isVisible(), false);
          await slip.getByRole('tab', { name: /Picks/ }).click();
          assert.equal(await slip.getByRole('button', { name: 'Slip full' }).isDisabled(), true);
          await slip
            .getByRole('button', { name: /Remove/ })
            .first()
            .click();
          const add = slip.getByRole('button', { name: 'Add matches', exact: true });
          await add.waitFor();
          const before = await add.boundingBox();
          await page
            .locator('#slip-picks-panel')
            .evaluate((el) => (el.scrollTop = el.scrollHeight));
          const after = await add.boundingBox();
          assert.equal(before.y, after.y);
          assert.equal(
            await add.evaluate((el) => {
              const r = el.getBoundingClientRect();
              return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
            }),
            true,
          );
          await page.screenshot({ path: path.join(out, `${name}-${width}-slip.png`) });
          await page.keyboard.press('Escape');
          const dock = page.locator('.prediction-dock');
          await dock.hover();
          assert.equal(
            await dock.evaluate((el) => getComputedStyle(el).backgroundColor),
            'rgb(39, 57, 46)',
          );
          assert.match(await dock.innerText(), /7 predictions/);
          await page.screenshot({ path: path.join(out, `${name}-${width}-dock.png`) });
          await section('My Account');
          await dock.click();
          assert.equal(await page.locator('.slip-pick').count(), 7);
          await slip.getByRole('button', { name: 'Add matches', exact: true }).click();
          await page.getByRole('heading', { name: 'You know the game.' }).waitFor();
          // Internal links must preserve the supported in-memory draft when storage fails.
          await page.evaluate(() => {
            Storage.prototype.setItem = () => {
              throw Error('Synthetic storage unavailable');
            };
            window.accountNavigationSentinel = 'still-mounted';
          });
          await page
            .getByRole('button', { name: 'Add Home for Home 0 vs Away 0', exact: true })
            .click();
          await section('Overview');
          await page.getByRole('link', { name: 'All markets', exact: true }).click();
          assert.equal(
            await page.evaluate(() => window.accountNavigationSentinel),
            'still-mounted',
          );
          assert.match(await dock.innerText(), /8 predictions/);
          await section('Streak Five');
          await section('Markets');
          assert.equal(
            await page.evaluate(() => window.accountNavigationSentinel),
            'still-mounted',
          );
          assert.match(await dock.innerText(), /8 predictions/);
          await section('Overview');
          await page.clock.setSystemTime(new Date('2030-01-07T23:59:50Z'));
          const rolled = page.waitForRequest((request) => {
            const url = new URL(request.url());
            return (
              url.pathname === '/api/markets' &&
              url.searchParams.get('from') === '2030-01-11T00:00:00.000Z'
            );
          });
          await page.clock.fastForward(31_000);
          await rolled;
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          results.push({ engine: name, width, height, passed: true });
          console.log(`PASS account/navigation ${name} ${width}x${height}`);
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((done) => server.close(done));
    global.fetch = savedFetch;
    fs.rmSync(temp, { recursive: true, force: true });
  }
  fs.writeFileSync(
    path.join(out, 'results.json'),
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

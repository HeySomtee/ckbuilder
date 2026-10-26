require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { FiveService } = require('../dist/modules/five/service');
const { newRound, parseTerms } = require('../dist/modules/five/domain');
const { closeAuction } = require('../dist/modules/five/auction');
class Store {
  async clock() {
    return Date.now();
  }
  rows = new Map();
  async list() {
    return [...this.rows.values()].map((r) => ({
      id: r.id,
      state: r.state,
      name: r.terms.name,
      lockAt: r.terms.lockAt,
      createdAt: r.createdAt,
    }));
  }
  async load(id) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id, creator, build) {
    const r = build(Date.now());
    this.rows.set(id, structuredClone(r));
    return r;
  }
  async change(id, mutate) {
    const r = await this.load(id);
    assert.ok(r);
    mutate(r, Date.now());
    r.revision++;
    this.rows.set(id, structuredClone(r));
    return r;
  }
}
async function main() {
  const root = path.resolve(__dirname, '../public'),
    out = path.resolve(__dirname, '../../../.quality-artifacts/five-implementation');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(
      root,
      `.${pathname === '/season/' ? '/season/index.html' : pathname}`,
    );
    if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
    fs.readFile(file, (error, body) => {
      if (error) return res.writeHead(404).end();
      res.setHeader(
        'Content-Type',
        file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : file.endsWith('.svg')
              ? 'image/svg+xml'
              : file.endsWith('.png')
                ? 'image/png'
                : 'text/html',
      );
      res.end(body);
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        for (const width of [320, 390, 1440]) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
          const actor = { id: 'admin', name: 'Test Admin', wallet: 'test-admin' },
            store = new Store(),
            service = new FiveService(store, ['test-admin']);
          const errors = [],
            external = [];
          let failCreate = true;
          let auctionFixture = false;
          await context.route('**/*', async (route) => {
            const req = route.request(),
              url = new URL(req.url());
            const json = (body, status = 200) =>
              route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(body),
              });
            if (url.origin !== origin) {
              external.push(url.href);
              return route.abort();
            }
            if (url.pathname === '/api/me')
              return json({
                user: { id: actor.id, username: actor.name, walletAddress: actor.wallet },
              });
            if (url.pathname === '/api/five') {
              try {
                if (
                  req.method() === 'POST' &&
                  req.postDataJSON().action === 'create' &&
                  failCreate
                ) {
                  failCreate = false;
                  return json(
                    { error: 'Temporary test interruption. Retry your saved draft.' },
                    503,
                  );
                }
                const data =
                  req.method() === 'POST'
                    ? await service.action(actor, req.postDataJSON())
                    : await service.read(actor, url.searchParams.get('round') || undefined);
                if (auctionFixture) data.fundingAvailable = true;
                return json(data);
              } catch (error) {
                return json({ error: error.message }, error.status || 500);
              }
            }
            if (url.pathname.startsWith('/api/'))
              return json({ enabled: false, markets: [], fixtures: [] });
            return route.continue();
          });
          await context.routeWebSocket('**/*', (socket) => socket.close());
          const page = await context.newPage();
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto(origin + '/season/?view=five');
          await page.getByRole('heading', { name: 'The next five starts here.' }).waitFor();
          await page.getByRole('tab', { name: 'More', exact: true }).click();
          await page.getByRole('button', { name: '+ Create gameweek', exact: true }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByText('Import your own licensed catalogue', { exact: true }).click();
          const now = Date.now(),
            players = ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
              id: `p${i}`,
              name: ['Keeper', 'Defender', 'Creator', 'Runner', 'Striker'][i],
              teamId: `t${i}`,
              team: `Test Club ${i}`,
              position,
              cost: 80,
              fixtureId: `f${i}`,
            }));
          const terms = {
            name: 'Weekend Five',
            lockAt: new Date(now + 86400000).toISOString(),
            finalizeAfter: new Date(now + 172800000).toISOString(),
            limit: 100,
            qualifyingBps: 500,
            sponsorship: false,
            minimumShannons: '10000000000',
            source: 'Synthetic browser test',
            players,
          };
          await dialog.getByLabel('Gameweek manifest (JSON)').fill(JSON.stringify(terms));
          await dialog.getByRole('button', { name: 'Create draft', exact: true }).click();
          await dialog.getByRole('alert').waitFor();
          assert.equal(
            await dialog.getByLabel('Gameweek manifest (JSON)').inputValue(),
            JSON.stringify(terms),
          );
          await dialog.getByRole('button', { name: 'Create draft', exact: true }).click();
          await page.getByRole('button', { name: 'Publish gameweek', exact: true }).waitFor();
          await page.getByRole('button', { name: 'Manage draft', exact: true }).click();
          await dialog.getByLabel('Winning percentage').fill('5');
          await dialog.getByLabel('Allow community sponsorship').check();
          await dialog.getByLabel('Minimum contribution (tCKB)').fill('500');
          await dialog.getByRole('button', { name: 'Save settings' }).click();
          await page.getByRole('button', { name: 'Publish gameweek', exact: true }).click();
          await page.getByRole('tab', { name: 'My five', exact: true }).click();
          if (width <= 760)
            await page.getByRole('button', { name: 'Players', exact: true }).click();
          await page.getByRole('button', { name: 'Add Keeper', exact: true }).waitFor();
          for (const p of players)
            await page.getByRole('button', { name: `Add ${p.name}`, exact: true }).click();
          if (width <= 760) await page.getByRole('button', { name: /My five/ }).click();
          assert.equal(
            await page.getByRole('button', { name: 'Review your five', exact: true }).isDisabled(),
            true,
          );
          await page.getByRole('button', { name: 'Captain Creator', exact: true }).click();
          await page.getByRole('button', { name: 'Review your five', exact: true }).click();
          await dialog.getByRole('button', { name: 'Save my five', exact: true }).click();
          await page.getByText('All changes saved.', { exact: true }).waitFor();
          await page.reload();
          await page.getByText('All changes saved.', { exact: true }).waitFor();
          assert.equal(await page.locator('.five-pitch-player>strong').count(), 5);
          assert.equal(
            await page
              .getByRole('button', { name: 'Captain Creator', exact: true })
              .getAttribute('aria-pressed'),
            'true',
          );
          await page.getByRole('button', { name: 'Captain Runner', exact: true }).click();
          assert.match(await page.locator('#five-save-hint').innerText(), /previous team/);
          if (width <= 760)
            await page.getByRole('button', { name: 'Players', exact: true }).click();
          await page.getByRole('tab', { name: 'Sponsors', exact: true }).click();
          await page
            .locator('#five-panel-sponsors')
            .getByRole('button', { name: 'Back to squad', exact: true })
            .click();
          assert.equal(
            await page
              .getByRole('button', { name: 'Captain Runner', exact: true })
              .getAttribute('aria-pressed'),
            'true',
          );
          assert(
            await page.getByRole('button', { name: 'Captain Runner', exact: true }).isVisible(),
            'Back to squad returns to the pitch, not the retained player list',
          );
          await page.getByRole('button', { name: 'Save changes', exact: true }).click();
          await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
          await page.getByText('All changes saved.', { exact: true }).waitFor();
          await page.getByRole('tab', { name: 'Sponsors', exact: true }).click();
          assert.equal(
            await page
              .getByRole('button', { name: 'Sponsor this gameweek', exact: true })
              .isDisabled(),
            true,
          );
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          await page.getByRole('tab', { name: 'More', exact: true }).click();
          await page.getByRole('button', { name: 'How it works', exact: true }).click();
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('dialog').count(), 0);
          assert.equal(
            await page
              .getByRole('button', { name: 'How it works', exact: true })
              .evaluate((el) => document.activeElement === el),
            true,
          );
          await page.evaluate(() => scrollTo(0, 0));
          await page.getByRole('tab', { name: 'My five', exact: true }).click();
          await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
          const auctionTerms = parseTerms({
            ...terms,
            sponsorship: true,
            sponsorshipMode: 'auction',
            lockAt: new Date(Date.now() + 300000).toISOString(),
          });
          await store.create('auction-ui', 'admin', (time) =>
            newRound('auction-ui', 'admin', auctionTerms, time),
          );
          const bid = (id, wallet, amount, sequence) => ({
            id,
            accountId: wallet === actor.wallet ? actor.id : 'other',
            wallet,
            amountShannons: amount,
            display: 'anonymous',
            name: '',
            logo: '',
            link: '',
            moderation: 'pending',
            createdAt: new Date().toISOString(),
            funding: 'confirmed',
            confirmedAt: new Date().toISOString(),
            submittedSequence: sequence,
          });
          await store.change('auction-ui', (r) => {
            r.state = 'open';
            r.sponsors = [
              bid('mine', actor.wallet, '100000000000', 1),
              bid('other', 'other-wallet', '150000000000', 2),
            ];
          });
          auctionFixture = true;
          await page.reload();
          await page.getByRole('tab', { name: 'Sponsors', exact: true }).click();
          await page.getByText('Another sponsor leads', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Increase your bid', exact: true }).click();
          await dialog.getByRole('heading', { name: 'Bid for the sponsor spot' }).waitFor();
          await dialog.getByLabel('Add to your bid (tCKB)').fill('1000');
          await dialog.getByLabel('Show a sponsor name', { exact: true }).check();
          await dialog.getByLabel('Public name', { exact: true }).fill('Builder');
          await dialog
            .getByLabel('One-line introduction (optional)', { exact: true })
            .fill('For the community');
          await dialog
            .getByLabel('About your product (optional)', { exact: false })
            .fill('Independent tools for players.');
          assert.equal(
            await dialog.getByRole('button', { name: 'Review bid', exact: true }).isDisabled(),
            true,
          );
          await dialog.getByLabel('I understand and agree').check();
          assert.equal(
            await dialog.getByRole('button', { name: 'Review bid', exact: true }).isEnabled(),
            true,
          );
          await page.keyboard.press('Escape');
          await store.change('auction-ui', (r) => {
            r.sponsors.push({
              ...bid('topup', actor.wallet, '100000000000', 3),
              display: 'named',
              name: 'Touchline Tools',
              introduction: 'A home for football builders',
              description: 'Independent tools for the community.',
              moderation: 'approved',
            });
          });
          await page.reload();
          await page.getByRole('tab', { name: 'Sponsors', exact: true }).click();
          await page.getByText("You're leading", { exact: true }).waitFor();
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          await page.screenshot({
            path: path.join(out, `auction-${name}-${width}.png`),
            fullPage: true,
          });
          await store.change('auction-ui', (r, time) => {
            r.terms.lockAt = new Date(time - 1000).toISOString();
            assert.equal(closeAuction(r, time), true);
          });
          // Explicit selection keeps the closed auction visible instead of the other open round.
          await page.getByLabel('Gameweek', { exact: true }).selectOption('auction-ui');
          await page.reload();
          await page.getByRole('tab', { name: 'Sponsors', exact: true }).click();
          // Reload resets selection; choose it again through the public gameweek selector.
          await page.getByLabel('Gameweek', { exact: true }).selectOption('auction-ui');
          await page.getByText('You won the sponsor spot', { exact: true }).waitFor();
          await page
            .locator('.five-sponsor-showcase')
            .getByText('Independent tools for the community.', { exact: true })
            .waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Increase your bid', exact: true }).count(),
            0,
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
    console.log(
      'Five: six integrated admin/create/publish/squad/save/reload/browser journeys passed.',
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

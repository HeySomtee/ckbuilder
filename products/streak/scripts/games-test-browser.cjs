require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { ccc } = require('@ckb-ccc/core');
const { TestGameControls } = require('../dist/modules/games-test/runtime');
const { DummyFiveFeed, sampleFixtures, samplePlayers } = require('../dist/modules/games-test/data');
const { FiveService } = require('../dist/modules/five/service');
const { FiveFunding } = require('../dist/modules/five/funding');
const { SurvivorService } = require('../dist/modules/survivor/service');
class Store {
  rows = new Map();
  async clock() {
    return Date.now();
  }
  async list() {
    return [...this.rows.values()].map((r) => ({
      id: r.id,
      name: r.terms.name,
      terms: r.terms,
      lockAt: r.terms.lockAt,
      state: r.state,
      createdAt: r.createdAt,
    }));
  }
  async load(id) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id, _creator, build) {
    const r = build(Date.now());
    this.rows.set(id, structuredClone(r));
    return r;
  }
  async change(id, mutate) {
    const r = await this.load(id);
    assert.ok(r);
    mutate(r, Date.now());
    if ('revision' in r) r.revision++;
    this.rows.set(id, structuredClone(r));
    return r;
  }
  async remove(id) {
    this.rows.delete(id);
  }
}
async function main() {
  let servedMode = 'test';
  const root = path.resolve(__dirname, '../public'),
    out = path.resolve(__dirname, '../../../.quality-artifacts/games-test-browser');
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
      res.end(
        file.endsWith('/season/index.html') || file.endsWith('\\season\\index.html')
          ? body
              .toString()
              .replace('<head>', `<head><meta name="streak-games-data" content="${servedMode}">`)
          : body,
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`,
    evidence = [];
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        for (const width of [390, 1440]) {
          servedMode = 'test';
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
          const actor = { id: 'admin', name: 'Test Admin', wallet: 'test-admin' },
            errors = [],
            modes = [];
          const fiveStore = new Store(),
            survivorStore = new Store(),
            feed = new DummyFiveFeed();
          const client = new ccc.ClientPublicTestnet({ url: 'http://127.0.0.1:1', fallbacks: [] });
          const address = await new ccc.SignerCkbPrivateKey(
            client,
            '0x' + '17'.repeat(32),
          ).getRecommendedAddress();
          const funding = new FiveFunding(fiveStore, client, address);
          const five = new FiveService(fiveStore, [actor.wallet], feed, funding);
          const anchor = Date.now();
          const survivor = new SurvivorService(
            survivorStore,
            [actor.wallet],
            () => sampleFixtures(anchor),
            () => ({}),
            true,
          );
          const controls = new TestGameControls(
            fiveStore,
            survivorStore,
            feed,
            five,
            survivor,
            funding,
          );
          const ordinary = new FiveService(new Store(), [actor.wallet]);
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
              errors.push('External request');
              return route.abort();
            }
            if (url.pathname === '/api/me')
              return json({
                user: { id: actor.id, username: actor.name, walletAddress: actor.wallet },
              });
            if (['/api/five', '/api/survivor'].includes(url.pathname)) {
              if (url.searchParams.get('data') !== servedMode)
                return json(
                  { error: 'Game data settings changed. Reload this page before continuing.' },
                  409,
                );
              const testing = servedMode === 'test',
                game = url.pathname.slice(5);
              modes.push({ game, testing, method: req.method() });
              try {
                const service = game === 'five' ? (testing ? five : ordinary) : survivor;
                if (url.searchParams.has('scout')) return json(await service.scouting());
                if (url.searchParams.has('schedule')) return json(await service.schedule());
                if (url.searchParams.has('player'))
                  return json(await service.player(Number(url.searchParams.get('player'))));
                const body = req.method() === 'POST' ? req.postDataJSON() : null;
                const data = body
                  ? body.action === 'testControl' && testing
                    ? await controls.action(actor, { ...body, action: body.control, game })
                    : await service.action(actor, body)
                  : await service.read(
                      actor,
                      url.searchParams.get(game === 'five' ? 'round' : 'competition') || undefined,
                    );
                return json({ ...data, testMode: testing });
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
          assert.equal(
            await page
              .getByRole('button', { name: /Use regular API data|Open test playground/ })
              .count(),
            0,
          );
          await page.getByRole('tab', { name: 'More', exact: true }).click();
          await page.getByRole('button', { name: 'Start new test gameweek' }).click();
          await page.getByRole('tab', { name: 'My five', exact: true }).click();
          const selected = ['1', '7', '13', '19', '25'].map((id) =>
            samplePlayers.find((p) => p.id === id),
          );
          if (width < 760) await page.getByRole('button', { name: 'Players', exact: true }).click();
          await page
            .getByRole('button', { name: `View ${selected[2].name} profile`, exact: true })
            .click();
          await page
            .getByText('Synthetic scouting statistics for testing.', { exact: false })
            .waitFor();
          await page.keyboard.press('Escape');
          for (const p of selected)
            await page.getByRole('button', { name: `Add ${p.name}`, exact: true }).click();
          if (width < 760) await page.getByRole('button', { name: /My five/ }).click();
          await page
            .getByRole('button', { name: `Captain ${selected[2].name}`, exact: true })
            .click();
          await page.getByRole('button', { name: 'Review your five', exact: true }).click();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Save my five', exact: true })
            .click();
          await page.getByText('All changes saved.', { exact: true }).waitFor();
          await page.getByRole('tab', { name: 'More', exact: true }).click();
          const closeResponse = page.waitForResponse(
            (r) => r.url().includes('/api/five') && r.request().method() === 'POST',
          );
          await page.getByRole('button', { name: 'Close picks & bids now' }).click();
          assert.equal((await closeResponse).status(), 200);
          await page.waitForFunction(() =>
            [...document.querySelectorAll('button')].some(
              (b) => b.textContent === 'Close picks & bids now' && b.disabled,
            ),
          );
          await page.getByRole('button', { name: 'Apply dummy results' }).click();
          await page.getByRole('button', { name: 'Finalize prizes', exact: true }).click();
          await page
            .getByRole('button', { name: 'Finalize prizes', exact: true })
            .waitFor({ state: 'detached' });
          assert.equal([...fiveStore.rows.values()][0].state, 'final');
          servedMode = 'api';
          await page.goto(origin + '/season/?view=five&games=test');
          await page.getByRole('heading', { name: 'The next five starts here.' }).waitFor();
          await page.getByRole('tab', { name: 'More', exact: true }).click();
          assert.equal(
            await page.getByRole('complementary', { name: 'Game testing controls' }).count(),
            0,
          );
          assert.equal(
            await page
              .getByRole('button', { name: /Use regular API data|Open test playground/ })
              .count(),
            0,
          );
          servedMode = 'test';
          await page.goto(origin + '/season/?view=five');
          await page.getByRole('tab', { name: 'More', exact: true }).click();
          await page.getByRole('button', { name: 'Start new test gameweek' }).click();
          await page.getByRole('button', { name: 'Close picks & bids now' }).waitFor();
          assert.equal(fiveStore.rows.size, 2);
          await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          await page.goto(origin + '/season/?view=survivor');
          await page.getByRole('button', { name: 'Create competition' }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByLabel('Competition name').fill('Playground Survivor');
          for (const box of await dialog.getByRole('checkbox').all()) await box.check();
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await page.getByRole('button', { name: 'Publish free competition' }).click();
          await page.getByRole('button', { name: 'Review free entry' }).click();
          await dialog.getByRole('button', { name: 'Accept rules and join free' }).click();
          await page
            .locator('.survivor-team')
            .filter({ has: page.locator('strong', { hasText: /^Arsenal$/ }) })
            .click();
          await page.getByRole('button', { name: 'Save my pick' }).click();
          await page.getByRole('button', { name: 'Pick saved', exact: true }).waitFor();
          const c = [...survivorStore.rows.values()][0];
          const second = { id: 'second', name: 'Second tester', wallet: 'second-test-wallet' };
          await survivor.action(second, { action: 'join', id: c.id, termsHash: c.termsHash });
          await survivor.action(second, { action: 'pick', id: c.id, round: 0, teamId: '1' });
          await page.getByRole('button', { name: 'Close picks now', exact: true }).click();
          await page.getByLabel('Result scenario').selectOption('home');
          const nextRoundResponse = page.waitForResponse(
            (r) => r.url().includes('/api/survivor') && r.request().method() === 'POST',
          );
          await page.getByRole('button', { name: 'Resolve & open next round' }).click();
          await nextRoundResponse;
          assert.equal((await survivorStore.load(c.id)).currentRound, 1);
          const usedTeam = page
            .locator('.survivor-team')
            .filter({ has: page.locator('strong', { hasText: /^Arsenal$/ }) });
          await usedTeam.locator('.survivor-team-status', { hasText: 'ALREADY USED' }).waitFor();
          assert.equal(await usedTeam.isDisabled(), true);
          assert.equal(await usedTeam.getAttribute('data-used'), 'true');
          assert.equal(
            await usedTeam.evaluate((el) => getComputedStyle(el).filter),
            'grayscale(1)',
          );
          assert.equal(await usedTeam.locator('.fixture-chip').count(), 3);
          await page.screenshot({
            path: path.join(out, `${name}-${width}-survivor.png`),
            fullPage: true,
          });
          assert.ok(modes.some((m) => !m.testing));
          assert.ok(modes.filter((m) => m.method === 'POST').every((m) => m.testing));
          actor.wallet = 'non-admin-test-wallet';
          await page.reload();
          await page.getByRole('heading', { name: 'Streak Survivor.' }).waitFor();
          assert.equal(
            await page.getByRole('complementary', { name: 'Game testing controls' }).count(),
            0,
          );
          assert.equal(
            await page
              .getByRole('button', { name: /Use regular API data|Open test playground/ })
              .count(),
            0,
          );
          assert.deepEqual(errors, []);
          evidence.push({ engine: name, width, modes: modes.length, passed: true });
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(
    'Actual Five/Survivor, environment-selected data, no public switches, admin-only controls and used-team fixture outlooks passed in Chromium/WebKit',
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

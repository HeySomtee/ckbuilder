require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const { SurvivorService } = require('../dist/modules/survivor/service');
const { join, savePick, advance } = require('../dist/modules/survivor/domain');
class MemoryStore {
  rows = new Map();
  async list() {
    return [...this.rows.values()].map((c) => ({
      id: c.id,
      terms: c.terms,
      state: c.state,
      createdAt: c.createdAt,
    }));
  }
  async load(id) {
    return structuredClone(this.rows.get(id) ?? null);
  }
  async create(id, actor, build) {
    if (this.rows.has(id)) return this.load(id);
    const c = build(Date.now());
    this.rows.set(id, c);
    return structuredClone(c);
  }
  async change(id, mutate) {
    const c = await this.load(id);
    mutate(c, Date.now());
    this.rows.set(id, c);
    return structuredClone(c);
  }
  async remove(id) {
    if (this.rows.get(id)?.entries.length) throw Error('Competition has entrants');
    this.rows.delete(id);
  }
}
async function main() {
  const root = path.resolve(__dirname, '../public');
  const out = path.resolve(__dirname, '../../../.quality-artifacts/survivor-implementation');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
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
              : 'text/html',
      );
      res.end(body);
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        for (const [width, height] of [
          [320, 568],
          [390, 844],
          [1440, 900],
        ]) {
          const context = await browser.newContext({
            viewport: { width, height },
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
          const store = new MemoryStore(),
            now = Date.now();
          const fixtures = Array.from({ length: 10 }, (_, i) => ({
            id: `fixture-${i}`,
            kickoff: new Date(now + 86400000 + i * 3600000).toISOString(),
            status: 'scheduled',
            competition: { id: '39' },
            oracle: { provider: 'api-football' },
            matchday: 'Regular Season - 10',
            home: {
              id: `team-${i * 2}`,
              name: i === 0 ? 'Manchester City' : `Home Club ${i}`,
              code: `H${i}`,
            },
            away: {
              id: `team-${i * 2 + 1}`,
              name: i === 0 ? 'Arsenal' : `Away Club ${i}`,
              code: `A${i}`,
            },
          }));
          const actor = { id: 'admin', name: 'Somtee', wallet: 'synthetic-admin' };
          const service = new SurvivorService(store, ['synthetic-admin'], () => fixtures);
          let failRead = false;
          let holdPick = false,
            releasePick,
            sawPick;
          const pendingPick = new Promise((resolve) => {
            sawPick = resolve;
          });
          let holdCreate = false,
            releaseCreate,
            sawCreate;
          const pendingCreate = new Promise((resolve) => {
            sawCreate = resolve;
          });
          const errors = [],
            external = [];
          await context.route('**/*', async (route) => {
            const req = route.request(),
              url = new URL(req.url());
            if (url.origin !== base) {
              external.push(url.href);
              return route.abort();
            }
            const json = (body, status = 200) =>
              route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(body),
              });
            if (url.pathname === '/api/me')
              return json({
                user: { id: actor.id, username: actor.name, walletAddress: actor.wallet },
              });
            if (url.pathname === '/api/survivor') {
              if (failRead && req.method() === 'GET')
                return json({ error: 'Synthetic service interruption. Please retry.' }, 503);
              try {
                const payload =
                  req.method() === 'POST'
                    ? await service.action(actor, req.postDataJSON())
                    : await service.read(actor, url.searchParams.get('competition') || undefined);
                if (
                  holdCreate &&
                  req.method() === 'POST' &&
                  req.postDataJSON().action === 'create'
                ) {
                  holdCreate = false;
                  sawCreate();
                  await new Promise((resolve) => {
                    releaseCreate = resolve;
                  });
                }
                if (holdPick && req.method() === 'POST' && req.postDataJSON().action === 'pick') {
                  holdPick = false;
                  sawPick();
                  await new Promise((resolve) => {
                    releasePick = resolve;
                  });
                }
                return json(payload);
              } catch (error) {
                return json({ error: error.message }, error.status || 500);
              }
            }
            if (url.pathname.startsWith('/api/'))
              return json({ markets: [], fixtures: [], enabled: false });
            return route.continue();
          });
          await context.routeWebSocket('**/*', (socket) => socket.close());
          const page = await context.newPage();
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(base + '/season/?view=survivor');
          await page.getByRole('heading', { name: 'The next long game starts here.' }).waitFor();
          await page.getByRole('button', { name: 'Create competition' }).click();
          let dialog = page.getByRole('dialog');
          await dialog.getByLabel('Competition name').fill('Disposable draft');
          await dialog.getByRole('checkbox').first().check();
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await page.getByRole('region', { name: 'Set up Disposable draft' }).waitFor();
          assert.equal(
            await page.locator('.survivor-team').count(),
            0,
            'Draft has no inactive game board',
          );
          const draft = [...store.rows.values()][0];
          const originalLock = draft.rounds[0].lockAt;
          draft.rounds[0].lockAt = new Date(Date.now() - 1000).toISOString();
          await page.reload();
          await page.getByRole('heading', { name: 'Choose a future opening round' }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Publish free competition' }).isEnabled(),
            false,
          );
          draft.rounds[0].lockAt = originalLock;
          await page.reload();
          await page.getByRole('heading', { name: 'Ready to open entries?' }).waitFor();
          await page.getByRole('button', { name: 'Delete competition', exact: true }).click();
          await dialog.getByRole('button', { name: 'Keep competition' }).click();
          assert.equal(store.rows.size, 1, 'Cancel preserves the game');
          await page.getByRole('button', { name: 'Delete competition', exact: true }).click();
          await dialog.getByRole('button', { name: 'Confirm deletion' }).click();
          await page.getByRole('heading', { name: 'The next long game starts here.' }).waitFor();
          assert.equal(store.rows.size, 0);
          await page.getByRole('button', { name: 'Create competition' }).click();
          await dialog.getByLabel('Competition name').fill('The long game');
          await dialog.getByLabel('Entry mode', { exact: true }).selectOption('paid');
          await dialog.getByRole('checkbox').first().check();
          await page.screenshot({ path: path.join(out, `${name}-${width}-admin.png`) });
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await page.getByRole('button', { name: 'Publish free competition' }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Publish free competition' }).isEnabled(),
            false,
          );
          await page.getByRole('heading', { name: 'Paid entry is not available yet' }).waitFor();
          assert.equal(await page.locator('.survivor-team').count(), 0);
          await page.getByRole('button', { name: /The long game.*Review setup/ }).click();
          assert.equal(
            await page.locator('.survivor-setup').evaluate((el) => document.activeElement === el),
            true,
          );
          await page.screenshot({
            path: path.join(out, `${name}-${width}-paid-setup.png`),
            fullPage: true,
          });
          await page.getByRole('button', { name: 'Edit draft' }).click();
          await dialog.getByLabel('Entry mode', { exact: true }).selectOption('free');
          assert.equal(
            await dialog.getByLabel('Entry fee (tCKB)', { exact: true }).isEnabled(),
            false,
          );
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await page.getByRole('heading', { name: 'Ready to open entries?' }).waitFor();
          await page.screenshot({
            path: path.join(out, `${name}-${width}-free-setup.png`),
            fullPage: true,
          });
          await page.getByRole('button', { name: 'Publish free competition' }).click();
          await page.getByRole('button', { name: 'Review free entry' }).click();
          assert.equal(await page.locator('.survivor-setup').count(), 0);
          await dialog.getByRole('button', { name: 'Accept rules and join free' }).click();
          await page.getByRole('button', { name: 'Create competition' }).click();
          await dialog.getByLabel('Competition name').fill('New draft stays selected');
          await dialog.getByRole('checkbox').first().check();
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await page.getByRole('region', { name: 'Set up New draft stays selected' }).waitFor();
          assert.ok(new URL(page.url()).searchParams.get('competition'));
          await page.reload();
          await page.getByRole('region', { name: 'Set up New draft stays selected' }).waitFor();
          await page.getByRole('button', { name: 'Delete competition', exact: true }).click();
          await dialog.getByRole('button', { name: 'Confirm deletion' }).click();
          await page.getByText('THE LONG GAME · BY STREAK', { exact: true }).waitFor();
          assert.equal(
            await page.locator('.survivor-team').first().locator('.fixture-chip').count(),
            3,
          );
          await page.getByRole('button', { name: 'Delete competition', exact: true }).click();
          await dialog.getByText(/Their entries and results must be kept/).waitFor();
          assert.equal(await dialog.getByRole('button', { name: 'Confirm deletion' }).count(), 0);
          await dialog.getByRole('button', { name: 'Keep competition' }).click();
          // Button's accessible name starts with the availability badge.
          await page
            .locator('.survivor-team')
            .filter({ hasText: 'Manchester City' })
            .first()
            .click();
          await page.getByRole('button', { name: 'Save my pick' }).click();
          await page.getByRole('button', { name: 'Pick saved', exact: true }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Pick saved', exact: true }).isEnabled(),
            false,
          );
          await page.reload();
          await page.getByRole('button', { name: 'Pick saved', exact: true }).waitFor();
          const c = [...store.rows.values()][0];
          await service.action(actor, {
            action: 'create',
            id: 'second-game',
            terms: { ...c.terms, name: 'Second competition' },
            roundKeys: [c.rounds[0].key],
          });
          await service.action(actor, { action: 'publish', id: 'second-game' });
          await page.reload();
          await page.getByRole('button', { name: 'Pick saved', exact: true }).waitFor();
          holdCreate = true;
          await page.getByRole('button', { name: 'Create competition' }).click();
          await dialog.getByLabel('Competition name').fill('Delayed creation');
          await dialog.getByRole('checkbox').first().check();
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await pendingCreate;
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: /Second competition.*View & join/ }).click();
          await page.getByText('SECOND COMPETITION · BY STREAK', { exact: true }).waitFor();
          const createdResponse = page.waitForResponse(
            (r) => new URL(r.url()).pathname === '/api/survivor' && r.request().method() === 'POST',
          );
          releaseCreate();
          await createdResponse;
          await page.getByRole('button', { name: /Delayed creation.*Review setup/ }).waitFor();
          failRead = true;
          await page.getByRole('button', { name: /The long game.*View & join/ }).click();
          await page.getByText('THE LONG GAME · BY STREAK', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Refresh competition', exact: true }).waitFor();
          failRead = false;
          await page.getByRole('button', { name: 'Refresh competition', exact: true }).click();
          await page
            .getByRole('button', { name: 'Refresh competition', exact: true })
            .waitFor({ state: 'detached' });
          holdPick = true;
          await page
            .locator('.survivor-team')
            .filter({ has: page.locator('strong', { hasText: /^Arsenal$/ }) })
            .click();
          await page.getByRole('button', { name: 'Save my pick' }).click();
          await pendingPick;
          await page.getByRole('button', { name: /Second competition.*View & join/ }).click();
          await page.getByText('SECOND COMPETITION · BY STREAK', { exact: true }).waitFor();
          const response = page.waitForResponse(
            (r) => new URL(r.url()).pathname === '/api/survivor' && r.request().method() === 'POST',
          );
          releasePick();
          await response;
          await page.getByRole('button', { name: 'How it works', exact: true }).click();
          await dialog.waitFor();
          await page.keyboard.press('Escape');
          assert.equal(
            await page.getByText('SECOND COMPETITION · BY STREAK', { exact: true }).isVisible(),
            true,
            'Delayed save cannot populate another competition cache.',
          );
          await page.getByRole('button', { name: /The long game.*View & join/ }).click();
          await page
            .locator('.survivor-team')
            .filter({ has: page.locator('strong', { hasText: /^Manchester City$/ }) })
            .click();
          await page.getByRole('button', { name: 'Save my pick' }).click();
          await page.getByRole('button', { name: 'Pick saved', exact: true }).waitFor();
          Object.assign(c, await store.load(c.id));
          store.rows.set(c.id, c);
          join(c, 'second', 'Second player', c.termsHash, Date.now());
          savePick(c, 'second', 0, 'team-1', Date.now());
          await page.reload();
          await page.getByRole('button', { name: 'Survivor board', exact: true }).click();
          await page.getByText('Second player', { exact: true }).waitFor();
          assert.match(
            await page
              .locator('.survivor-standing')
              .filter({ hasText: 'Second player' })
              .innerText(),
            /Pick hidden/,
          );
          await page.getByRole('button', { name: 'Your team board' }).click();
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
          );
          if (width > 700)
            assert.equal(
              await page.locator('.rail').evaluate((el) => el.scrollHeight === el.clientHeight),
              true,
            );
          await page.screenshot({
            path: path.join(out, `${name}-${width}-board.png`),
            fullPage: true,
          });
          failRead = true;
          await page.reload();
          await page.getByRole('alert').waitFor();
          failRead = false;
          await page.getByRole('button', { name: 'Refresh competition' }).click();
          await page.getByRole('button', { name: 'Pick saved', exact: true }).waitFor();
          const time = Date.now();
          c.rounds[0].lockAt = new Date(time - 3000).toISOString();
          c.rounds[0].resolveAt = new Date(time - 100).toISOString();
          c.rounds[0].fixtures.forEach((f) => {
            f.kickoff = new Date(time - 2000).toISOString();
          });
          advance(
            c,
            {
              'fixture-0': {
                outcome: 'home',
                home: 2,
                away: 0,
                confirmedAt: new Date(time - 1000).toISOString(),
              },
            },
            time,
          );
          await page.reload();
          await page.getByText('You survived.', { exact: true }).waitFor();
          await page.getByRole('button', { name: 'Your run', exact: true }).click();
          await page.getByText('Survived', { exact: true }).waitFor();
          await page.screenshot({
            path: path.join(out, `${name}-${width}-history.png`),
            fullPage: true,
          });
          await page.getByRole('button', { name: 'How it works', exact: true }).click();
          await dialog.waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await dialog.isVisible(), false);
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          await context.close();
          console.log(
            `PASS Survivor ${name} ${width}: admin draft/edit/paid guard, publish, free entry, saved pick/reload, private standings, outage/retry, final history and dialog keyboard.`,
          );
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((done) => server.close(done));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

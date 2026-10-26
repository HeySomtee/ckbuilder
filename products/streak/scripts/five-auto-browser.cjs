require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { FiveService } = require('../dist/modules/five/service');
const { parseTerms } = require('../dist/modules/five/domain');
class Store {
  rows = new Map();
  async clock() {
    return Date.now();
  }
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
    out = path.resolve(__dirname, '../../../.quality-artifacts/five-auto');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(
      root,
      `.${pathname === '/season/' ? '/season/index.html' : pathname}`,
    );
    if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
    fs.readFile(file, (err, body) => {
      if (err) return res.writeHead(404).end();
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
            viewport: { width, height: 1000 },
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
          const now = Date.now(),
            store = new Store();
          const players = ['GK', 'DEF', 'MID', 'MID', 'FWD', 'GK'].map((position, i) => ({
            id: String(i + 1),
            name: ['Keeper', 'Defender', 'Creator', 'Runner', 'Striker', 'Reserve'][i],
            teamId: String(i + 1),
            team: `Test Club ${i + 1}`,
            position,
            cost: 70,
            fixtureId: String(i + 1),
          }));
          const terms = parseTerms({
            name: 'Gameweek 8',
            lockAt: new Date(now + 86400000).toISOString(),
            finalizeAfter: new Date(now + 3 * 86400000).toISOString(),
            limit: 100,
            qualifyingBps: 500,
            sponsorship: true,
            minimumShannons: '10000000000',
            source: 'FPL event 8',
            players,
          });
          const scouts = players.map((p, i) => ({
            ...p,
            fullName: `Test ${p.name}`,
            teamCode: `C${i + 1}`,
            price: p.cost,
            form: 7 - i,
            totalPoints: 40 - i,
            eventPoints: 8,
            pointsPerGame: 5,
            selectedPercent: 20,
            transfersIn: (i + 1) * 1000,
            transfersOut: (6 - i) * 100,
            minutes: 540,
            goals: 3,
            assists: 2,
            cleanSheets: 2,
            status: i === 0 ? 'd' : 'a',
            news: i === 0 ? 'Fitness check' : '',
            chance: i === 0 ? 75 : 100,
          }));
          const feed = {
            available: true,
            season: async () => ({
              season: '2030',
              events: [
                {
                  id: 8,
                  name: 'Gameweek 8',
                  deadline: terms.lockAt,
                  finished: false,
                  checked: false,
                },
              ],
            }),
            catalogue: async () => terms,
            results: async () => ({ stats: {}, source: 'Synthetic', complete: false }),
            scouting: async () => ({ observedAt: new Date().toISOString(), players: scouts }),
            schedule: async () => ({
              observedAt: new Date().toISOString(),
              teams: Object.fromEntries(
                players.map((p) => [
                  p.teamId,
                  [1, 2, 3].map((n) => ({
                    event: 8 + n,
                    opponent: ['ARS', 'CHE', 'LIV'][n - 1],
                    home: n % 2 === 0,
                    kickoff: new Date(now + n * 7 * 86400000).toISOString(),
                    difficulty: n + 1,
                  })),
                ]),
              ),
            }),
            profile: async (id) => ({
              observedAt: new Date().toISOString(),
              player: scouts.find((p) => p.id === String(id)),
              history: [1, 2, 3, 4, 5, 6].map((n) => ({
                fixtureId: String(n),
                event: n,
                opponent: 'RIV',
                home: n % 2 === 0,
                kickoff: new Date(now - n * 86400000).toISOString(),
                minutes: 90,
                goals: 0,
                assists: 0,
                fplPoints: n + 2,
                fivePoints: n,
              })),
              fixtures: [
                {
                  event: 9,
                  opponent: 'NXT',
                  home: true,
                  kickoff: new Date(now + 7 * 86400000).toISOString(),
                  difficulty: 3,
                },
              ],
            }),
          };
          const actor = { id: 'player', name: 'Test Player', wallet: 'synthetic-wallet' };
          const service = new FiveService(store, [], feed, undefined, undefined, true);
          await service.progress();
          assert.equal(store.rows.size, 1, 'scheduler published the synthetic week');
          let failProfile = true,
            failScout = true,
            failSchedule = true,
            scheduleCalls = 0,
            profileCalls = 0;
          const errors = [],
            external = [];
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
                if (url.searchParams.has('schedule')) {
                  scheduleCalls++;
                  return failSchedule
                    ? json({ error: 'Synthetic fixture interruption' }, 503)
                    : json(await service.schedule());
                }
                if (url.searchParams.has('scout')) {
                  if (failScout) return json({ error: 'Synthetic scouting interruption' }, 503);
                  return json(await service.scouting());
                }
                if (url.searchParams.has('player')) {
                  profileCalls++;
                  if (failProfile) return json({ error: 'Synthetic history interruption' }, 503);
                  return json(await service.player(Number(url.searchParams.get('player'))));
                }
                return json(
                  req.method() === 'POST'
                    ? await service.action(actor, req.postDataJSON())
                    : await service.read(actor, url.searchParams.get('round') || undefined),
                );
              } catch (e) {
                return json({ error: e.message }, e.status || 500);
              }
            }
            if (url.pathname.startsWith('/api/'))
              return json({ enabled: false, markets: [], fixtures: [] });
            return route.continue();
          });
          await context.routeWebSocket('**/*', (s) => s.close());
          const page = await context.newPage();
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto(origin + '/season/?view=five');
          await page.getByRole('heading', { name: 'Streak Five.', exact: true }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: '+ Create gameweek', exact: true }).count(),
            0,
          );
          try {
            assert.match(
              await page.getByLabel('Gameweek', { exact: true }).inputValue(),
              /fpl-2030-8/,
            );
          } catch (error) {
            console.error(await page.locator('.five-page').innerText());
            throw error;
          }
          if (width <= 760)
            await page.getByRole('button', { name: 'Players', exact: true }).click();
          await page.getByRole('button', { name: 'Retry stats', exact: true }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Add Keeper', exact: true }).isEnabled(),
            true,
          );
          failScout = false;
          await page.getByRole('button', { name: 'Retry stats', exact: true }).click();
          await page
            .locator('.five-player')
            .filter({ has: page.getByRole('button', { name: 'View Keeper profile', exact: true }) })
            .locator('.five-stat[data-label="Form"]')
            .filter({ hasText: /^7\.0$/ })
            .waitFor();
          await page.getByLabel('Sort players').selectOption('in');
          assert.match(
            await page.locator('.five-player-info').first().getAttribute('aria-label'),
            /Reserve/,
          );
          await page.getByLabel('Sort players').selectOption('form');
          const readableName = page.locator('.five-player-info strong').first();
          await page.getByRole('button', { name: 'Retry fixtures', exact: true }).waitFor();
          failSchedule = false;
          await page.getByRole('button', { name: 'Retry fixtures', exact: true }).click();
          await page
            .locator('.five-player-info')
            .first()
            .locator('.fixture-chip b', { hasText: 'ARS' })
            .waitFor();
          assert.equal(
            await page.locator('.five-player-info').first().locator('.fixture-chip').count(),
            3,
          );
          assert.equal(
            scheduleCalls,
            2,
            'One failed request and one shared retry serve every player',
          );
          assert.ok(
            await readableName.evaluate((el) => el.clientWidth >= 60),
            'player names have readable width',
          );
          const opener = page.getByRole('button', { name: 'View Keeper profile', exact: true });
          await opener.click();
          const dialog = page.getByRole('dialog');
          await dialog.getByRole('button', { name: 'Try again', exact: true }).waitFor();
          failProfile = false;
          await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
          await dialog
            .getByText('Fitness check · 75% chance of playing', { exact: true })
            .waitFor();
          assert.equal(await dialog.locator('tbody tr').count(), 6);
          await dialog.getByRole('button', { name: 'Upcoming fixtures', exact: true }).click();
          await dialog.getByText('NXT (H)', { exact: true }).waitFor();
          await dialog.getByRole('button', { name: 'Match history', exact: true }).click();
          await page.screenshot({
            path: path.join(out, `${name}-${width}-profile.png`),
            fullPage: true,
          });
          await page.keyboard.press('Escape');
          assert.equal(await opener.evaluate((el) => document.activeElement === el), true);
          const before = profileCalls;
          await opener.click();
          await dialog.getByRole('button', { name: 'Add to my five', exact: true }).click();
          assert.equal(profileCalls, before, 'cached profile opens without another request');
          await page.getByRole('button', { name: 'Add Reserve', exact: true }).click();
          await page
            .getByRole('alert')
            .getByText('Your GK slots are full. Remove a player to swap.', { exact: false })
            .waitFor();
          await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
          for (const p of players.slice(1, 5))
            await page.getByRole('button', { name: `Add ${p.name}`, exact: true }).click();
          await page.screenshot({
            path: path.join(out, `${name}-${width}-players.png`),
            fullPage: true,
          });
          if (width <= 760) await page.getByRole('button', { name: /My five/ }).click();
          await page.getByRole('button', { name: 'Captain Creator', exact: true }).click();
          await page.getByRole('button', { name: 'Review your five', exact: true }).click();
          await dialog.getByRole('button', { name: 'Save my five', exact: true }).click();
          await page.getByText('All changes saved.', { exact: true }).waitFor();
          await page.reload();
          await page.getByText('All changes saved.', { exact: true }).waitFor();
          assert.equal(await page.locator('.five-pitch-player>strong').count(), 5);
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({
            path: path.join(out, `${name}-${width}-squad.png`),
            fullPage: true,
          });
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          await context.close();
        }
      } finally {
        await browser.close();
      }
    }
    console.log(
      'Five automatic gameweek, scouting recovery, profiles, selection and reload: six Chromium/WebKit journeys passed.',
    );
  } finally {
    await new Promise((done) => server.close(done));
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

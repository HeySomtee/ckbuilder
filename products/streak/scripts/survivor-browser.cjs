require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const { chooseOption, openSelect } = require('./browser-select.cjs');
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
            hasTouch: width <= 390,
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
            matchday: 'Regular Season - 9',
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
          const firstWeek = [...fixtures];
          for (let week = 1; week < 30; week++)
            fixtures.push(
              ...firstWeek.map((f) => ({
                ...f,
                id: `week-${week}-${f.id}`,
                matchday: `Regular Season - ${week + 9}`,
                kickoff: new Date(Date.parse(f.kickoff) + week * 7 * 86400000).toISOString(),
              })),
            );
          const service = new SurvivorService(store, ['synthetic-admin'], () => fixtures);
          let failRead = false;
          let legacyRulePayload = false;
          let showFunding = false;
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
                if (legacyRulePayload && payload.detail) delete payload.detail.ruleVersion;
                if (showFunding) payload.fundingAvailable = true; // UI capability only; no signer/chain transport is mocked here.
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
          await dialog.getByLabel('Number of rounds', { exact: true }).fill('30');
          assert.equal(await dialog.locator('input[name="round"]:checked').count(), 30);
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await page.getByRole('region', { name: 'Set up Disposable draft' }).waitFor();
          assert.equal(
            await page.locator('.survivor-team').count(),
            0,
            'Draft has no inactive game board',
          );
          const draft = [...store.rows.values()][0];
          assert.equal(draft.rounds.length, 30);
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
          const entryMode = (await openSelect(page, 'Entry mode')).trigger;
          await page.screenshot({ path: path.join(out, `${name}-${width}-entry-mode-menu.png`) });
          await page.keyboard.press('End');
          await page.keyboard.press('Escape');
          assert.equal(
            await dialog.isVisible(),
            true,
            'Dropdown Escape keeps its parent dialog open.',
          );
          assert.equal(await entryMode.evaluate((el) => el === document.activeElement), true);
          assert.match(await entryMode.innerText(), /Free entry/);
          await chooseOption(page, 'Entry mode', 'Paid entry (draft only)');
          assert.equal(await dialog.isVisible(), true);
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
          await chooseOption(page, 'Entry mode', 'Free entry');
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
          join(c, 'second', 'Second player', c.termsHash, Date.now(), 'synthetic-second-wallet');
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
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) {
            await page.screenshot({
              path: path.join(out, `${name}-${width}-overflow.png`),
              fullPage: true,
            });
            console.error(
              'Overflow elements',
              await page.evaluate(() =>
                [...document.querySelectorAll('body *')]
                  .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
                  .map((el) => ({
                    tag: el.tagName,
                    className: el.className,
                    right: el.getBoundingClientRect().right,
                  }))
                  .slice(0, 20),
              ),
            );
          }
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
          c.rounds[0].resolveAt = new Date(time + 86400000).toISOString();
          c.rounds[0].fixtures.forEach((f) => {
            f.kickoff = new Date(time - 2000).toISOString();
          });
          const legacy = structuredClone(c);
          legacy.id = 'legacy-correction-window';
          legacy.terms.name = 'Legacy competition';
          legacy.ruleVersion = 'survivor-free-v1';
          const confirmedResults = {
            'fixture-0': {
              outcome: 'home',
              home: 2,
              away: 0,
              confirmedAt: new Date(time - 1000).toISOString(),
            },
          };
          advance(legacy, confirmedResults, time);
          assert.equal(legacy.state, 'running', 'Published v1 keeps its correction window');
          store.rows.set(legacy.id, legacy);
          advance(c, confirmedResults, time);
          assert.equal(c.state, 'complete', 'Sole survivor finishes before unrelated fixtures');
          assert.ok(time < Date.parse(c.rounds[0].resolveAt));
          assert.equal(Object.keys(c.rounds[0].results).length, 1);
          await page.reload();
          await page.getByText('You survived.', { exact: true }).waitFor();
          await page.getByRole('heading', { name: 'The run is complete.', exact: true }).waitFor();
          await page
            .locator('.survivor-stats')
            .getByText('Competition complete', { exact: true })
            .waitFor();
          assert.equal(await page.getByText(/^Final results by /).count(), 0);
          assert.equal(await page.locator('.survivor-deadline').count(), 0);
          assert.equal(
            await page.getByRole('button', { name: 'Pick saved', exact: true }).count(),
            0,
          );
          await page.getByText('This competition has no funded prize.', { exact: false }).waitFor();
          await page.getByRole('button', { name: 'Your run', exact: true }).click();
          await page.getByText('Survived', { exact: true }).waitFor();
          await page.screenshot({
            path: path.join(out, `${name}-${width}-history.png`),
            fullPage: true,
          });
          await page.getByRole('button', { name: 'How it works', exact: true }).click();
          await dialog.waitFor();
          await dialog
            .getByText(/every remaining pick is resolved and exactly one entrant advances/)
            .waitFor();
          await page.keyboard.press('Escape');
          assert.equal(await dialog.isVisible(), false);
          // A valid sole picker wins at lock without inventing a match result.
          const solePicker = await store.load('second-game');
          join(solePicker, actor.id, actor.name, solePicker.termsHash, time, actor.wallet);
          join(
            solePicker,
            'missed',
            'Missed deadline',
            solePicker.termsHash,
            time,
            'synthetic-missed-wallet',
          );
          savePick(solePicker, actor.id, 0, 'team-0', time);
          solePicker.rounds[0].lockAt = new Date(time - 1000).toISOString();
          advance(solePicker, {}, time);
          assert.equal(solePicker.state, 'complete');
          assert.equal(solePicker.entries[0].picks['0'].result, undefined);
          assert.ok(Date.parse(solePicker.rounds[0].fixtures[0].kickoff) > time);
          store.rows.set(solePicker.id, solePicker);
          await page.getByRole('button', { name: /Second competition/ }).click();
          await page.getByRole('heading', { name: 'The run is complete.', exact: true }).waitFor();
          await page.getByRole('button', { name: 'Survivor board', exact: true }).click();
          await page.getByRole('heading', { name: 'Final standings.', exact: true }).waitFor();
          await page
            .locator('.survivor-standing')
            .filter({ hasText: actor.name })
            .getByText('Winner', { exact: true })
            .waitFor();
          await page.getByRole('button', { name: 'Your run', exact: true }).click();
          await page.getByText('Winner · no result needed', { exact: true }).waitFor();
          assert.equal(await page.getByText('Awaiting result', { exact: true }).count(), 0);
          await page.reload();
          await page.getByRole('button', { name: 'Your run', exact: true }).click();
          await page.getByText('Winner · no result needed', { exact: true }).waitFor();
          await page.screenshot({
            path: path.join(out, `${name}-${width}-sole-picker.png`),
            fullPage: true,
          });
          // An older payload without a rule version must show v1, never the new promise.
          legacyRulePayload = true;
          await page.getByRole('button', { name: /Legacy competition/ }).click();
          await page.getByText(/^Final results by /).waitFor();
          await page.getByRole('button', { name: 'How it works', exact: true }).click();
          await dialog.getByText(/The last survivor wins once the round is final/).waitFor();
          assert.equal(await dialog.getByText(/wins immediately/).count(), 0);
          await page.keyboard.press('Escape');
          legacyRulePayload = false;
          showFunding = true;
          await page.getByRole('button', { name: 'Create competition', exact: true }).click();
          await dialog.getByLabel('Competition name').fill('Creator prize UI');
          await dialog.getByLabel('Creator-funded prize (tCKB)', { exact: true }).fill('200');
          await dialog.getByRole('button', { name: 'Save draft' }).click();
          await page.getByRole('region', { name: 'Set up Creator prize UI' }).waitFor();
          assert.equal(
            await page.getByRole('button', { name: 'Publish free competition' }).isDisabled(),
            true,
          );
          await page.getByRole('button', { name: 'Fund creator prize', exact: true }).click();
          await dialog.getByText(/This is custodial funding/).waitFor();
          assert.equal(
            await dialog.getByRole('button', { name: 'Review prize payment' }).isDisabled(),
            true,
          );
          await dialog
            .getByLabel('I accept testnet rewards-wallet custody and the payout rules')
            .check();
          assert.equal(
            await dialog.getByRole('button', { name: 'Review prize payment' }).isEnabled(),
            true,
          );
          await page.screenshot({
            path: path.join(out, `${name}-${width}-creator-prize.png`),
            fullPage: true,
          });
          await page.keyboard.press('Escape');
          const prizeDraft = [...store.rows.values()].find(
            (r) => r.terms.name === 'Creator prize UI',
          );
          prizeDraft.prizeFunding = {
            id: prizeDraft.fundingIntentId,
            accountId: actor.id,
            wallet: actor.wallet,
            amountShannons: prizeDraft.terms.prizeShannons,
            funding: 'submitted',
            destination: 'ckt1synthetic',
            tag: '0x' + '11'.repeat(32),
            transactionHash: '0x' + '22'.repeat(32),
          };
          prizeDraft.state = 'cancelled';
          await page.reload();
          await page
            .getByText('Payment stuck after another wallet transaction?', { exact: true })
            .click();
          assert.equal(
            await page.getByRole('button', { name: 'Verify conflicting transaction' }).isDisabled(),
            true,
          );
          await page
            .getByLabel('Conflicting transaction hash', { exact: true })
            .fill('0x' + '33'.repeat(32));
          assert.equal(
            await page.getByRole('button', { name: 'Verify conflicting transaction' }).isEnabled(),
            true,
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          await context.close();
          console.log(
            `PASS Survivor ${name} ${width}: 30-round creation, publish, free entry, saved pick/reload, privacy, outage/retry, early winner and missed-pick winner history, v1 rule fallback, prize recovery and dialog keyboard.`,
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

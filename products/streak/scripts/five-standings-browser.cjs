require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { parseFiveName } = require('../dist/modules/five/profile');

const players = ['GK', 'DEF', 'MID', 'MID', 'FWD'].map((position, i) => ({
  id: `p${i}`,
  name: ['Keeper', 'Defender', 'Creator', 'Runner', 'Striker'][i],
  teamId: `t${i}`,
  team: `Club ${i}`,
  position,
  cost: 70,
  fixtureId: `fixture${i}`,
}));
function dataFor(state, profile) {
  const now = Date.now(),
    closed = state !== 'open',
    id = 'synthetic-five-standings';
  const entries = [
    {
      id: 'leader',
      name: 'The Final Whistle',
      walletLabel: 'ckt1qlea…abc123',
      players: players.map((p) => p.id),
      captain: 'p2',
    },
    {
      id: 'own',
      name: profile?.displayName ?? 'Player',
      walletLabel: 'ckt1qown…def456',
      players: players.map((p) => p.id),
      captain: 'p4',
    },
  ];
  const scores = Object.fromEntries(
    players.flatMap((p, i) =>
      state === 'live' && i === 0
        ? []
        : [
            [
              p.id,
              {
                points: i + 2,
                lines: [
                  { label: 'Appearance', points: 2 },
                  { label: 'Goals', points: i },
                ],
              },
            ],
          ],
    ),
  );
  return {
    profile,
    now: new Date(now).toISOString(),
    admin: false,
    viewerId: 'manager',
    feedAvailable: false,
    fundingAvailable: false,
    rewardsAccount: null,
    currentRoundId: id,
    nextRoundId: null,
    rounds: [
      {
        id,
        name: 'Gameweek 10',
        state,
        lockAt: new Date(now + (closed ? -86400000 : 86400000)).toISOString(),
      },
    ],
    detail: {
      id,
      state,
      ownId: 'own',
      termsHash: 'synthetic-terms',
      revision: 1,
      terms: {
        name: 'Gameweek 10',
        lockAt: new Date(now + (closed ? -86400000 : 86400000)).toISOString(),
        finalizeAfter: new Date(now + 86400000).toISOString(),
        limit: 100,
        qualifyingBps: 500,
        sponsorship: false,
        minimumShannons: '10000000000',
        source: 'Synthetic browser fixture',
        players,
      },
      entries: entries.map((e) =>
        !closed && e.id !== 'own' ? { id: e.id, name: e.name, walletLabel: e.walletLabel } : e,
      ),
      standings: closed
        ? entries.map((e, i) => ({
            id: e.id,
            name: e.name,
            walletLabel: e.walletLabel,
            points: 24 - i,
            pending: state === 'live',
          }))
        : [],
      scores: closed ? scores : {},
      scoresAt: closed ? new Date(now).toISOString() : null,
      scoresComplete: state === 'final',
      scoreSource: 'Synthetic browser fixture',
      scoreRevision: closed ? 1 : 0,
      finalizedAt: state === 'final' ? new Date(now).toISOString() : null,
      rewards: state === 'final' ? { leader: '250000000000' } : {},
      poolShannons: state === 'final' ? '250000000000' : '0',
      auction: null,
      sponsors: [],
      ownSponsorships: [],
    },
  };
}
async function main() {
  const publicRoot = path.resolve(__dirname, '../public'),
    out = path.resolve(__dirname, '../../../.quality-artifacts/five-standings-runtime');
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = path.resolve(
      publicRoot,
      `.${pathname === '/season/' ? '/season/index.html' : pathname}`,
    );
    if (!file.startsWith(publicRoot + path.sep)) return res.writeHead(404).end();
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
    for (const [engineName, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        for (const width of [320, 390, 1440]) {
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            hasTouch: width < 500,
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
          let profile = { displayName: 'Weekend Wanderers', updatedAt: new Date(0).toISOString() },
            state = 'final',
            read = dataFor(state, profile),
            failProfile = false,
            wrongProfileViewer = false;
          const errors = [],
            external = [],
            actions = [];
          await context.route('**/*', async (route) => {
            const request = route.request(),
              url = new URL(request.url());
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
                user: {
                  id: 'manager',
                  username: 'Account Username',
                  walletAddress: 'ckt1qownsynthetic000000000000000000def456',
                },
              });
            if (url.pathname === '/api/five') {
              if (request.method() === 'POST') {
                const action = request.postDataJSON();
                actions.push(action.action);
                if (action.action === 'profile') {
                  assert.equal(action.expectedAccountId, 'manager');
                  if (wrongProfileViewer) {
                    wrongProfileViewer = false;
                    return json({
                      viewerId: 'another-manager',
                      profile: {
                        displayName: action.displayName,
                        updatedAt: new Date().toISOString(),
                      },
                    });
                  }
                  if (failProfile) {
                    failProfile = false;
                    return json({ error: 'Synthetic interruption. Your draft is retained.' }, 503);
                  }
                  try {
                    profile = {
                      displayName: parseFiveName(action.displayName),
                      updatedAt: new Date().toISOString(),
                    };
                    read.profile = profile;
                    for (const entry of [...read.detail.entries, ...read.detail.standings])
                      if (entry.id === 'own') entry.name = profile.displayName;
                    return json({ viewerId: 'manager', profile });
                  } catch (error) {
                    return json({ error: error.message }, 400);
                  }
                }
                if (action.action === 'enter') {
                  assert.ok(profile, 'name must precede entry');
                  read.detail.entries.push({
                    id: 'own',
                    name: profile.displayName,
                    walletLabel: 'ckt1qown…def456',
                    players: action.players,
                    captain: action.captain,
                  });
                  read.detail.ownId = 'own';
                  return json(read);
                }
              }
              return json(read);
            }
            if (url.pathname.startsWith('/api/'))
              return json({ enabled: false, markets: [], fixtures: [] });
            return route.continue();
          });
          await context.routeWebSocket('**/*', (socket) => socket.close());
          await require('./browser-campaign-fixture.cjs')(context, origin);
          const page = await context.newPage();
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(origin + '/season/?view=five');
          await page.getByRole('tab', { name: 'Standings', exact: true }).click();
          const leader = page.getByRole('button', {
            name: 'View The Final Whistle squad',
            exact: true,
          });
          await leader.waitFor();
          await leader.click();
          let dialog = page.getByRole('dialog');
          await dialog.getByRole('heading', { name: 'The Final Whistle', exact: true }).waitFor();
          assert.equal(await dialog.locator('.five-pitch .five-slot').count(), 5);
          const positions = await dialog
            .locator('.five-pitch .five-slot')
            .evaluateAll((nodes) => nodes.map((node) => node.dataset.position));
          assert.deepEqual(positions, ['FWD', 'MID', 'MID', 'DEF', 'GK']);
          const coords = await dialog.locator('.five-pitch .five-slot').evaluateAll((nodes) =>
            nodes.map((node) => ({
              position: node.dataset.position,
              y: node.getBoundingClientRect().y,
            })),
          );
          assert.ok(
            coords[0].y < coords[1].y &&
              coords[1].y === coords[2].y &&
              coords[2].y < coords[3].y &&
              coords[3].y < coords[4].y,
          );
          await dialog
            .getByRole('button', { name: 'View Creator gameweek points', exact: true })
            .click();
          await dialog.getByText('8 points · Captain ×2', { exact: true }).waitFor();
          await dialog.getByRole('button', { name: 'Back to squad', exact: true }).click();
          await page.waitForFunction(
            () =>
              document.activeElement?.getAttribute('aria-label') === 'View Creator gameweek points',
          );
          assert.equal(
            await dialog
              .getByRole('button', { name: 'View Creator gameweek points', exact: true })
              .evaluate((el) => document.activeElement === el),
            true,
          );
          await page.screenshot({ path: path.join(out, `${engineName}-${width}-squad.png`) });
          const bounds = await dialog.evaluate((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
            overflow: node.scrollWidth > node.clientWidth,
          }));
          assert.equal(bounds.overflow, false, 'squad dialog has no horizontal overflow');
          if (width < 761) {
            assert.equal(bounds.width, width);
            assert.equal(bounds.height, 900);
          }
          await dialog.getByRole('button', { name: 'Next', exact: true }).click();
          await dialog
            .getByRole('heading', { name: 'Weekend Wanderers You', level: 3, exact: true })
            .waitFor();
          await dialog.getByRole('button', { name: 'Close', exact: true }).click();
          assert.equal(
            await leader.evaluate((el) => document.activeElement === el),
            true,
            'explicit modal opener restored',
          );
          await page.getByRole('textbox', { name: 'Find a manager or wallet' }).fill('def456');
          assert.equal(await page.locator('.five-manager-row').count(), 1);
          await page.getByRole('button', { name: /My position/ }).click();
          await dialog
            .getByRole('heading', { name: 'Weekend Wanderers You', level: 3, exact: true })
            .waitFor();
          await page.keyboard.press('Escape');
          assert.equal(
            await page
              .getByRole('button', { name: /My position/ })
              .evaluate((el) => document.activeElement === el),
            true,
          );
          await page.screenshot({ path: path.join(out, `${engineName}-${width}-standings.png`) });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
            false,
          );
          state = 'live';
          read = dataFor(state, profile);
          await page.reload();
          await page.getByRole('tab', { name: 'Standings', exact: true }).click();
          await leader.click();
          await dialog.getByText('Awaiting points', { exact: true }).waitFor();
          await dialog
            .getByRole('button', { name: 'View Keeper gameweek points', exact: true })
            .click();
          await dialog
            .getByText('No player score has arrived yet. This is not a confirmed zero.', {
              exact: true,
            })
            .waitFor();
          await dialog.getByRole('button', { name: 'Close', exact: true }).click();
          state = 'open';
          read = dataFor(state, profile);
          await page.reload();
          await page.getByRole('tab', { name: 'Standings', exact: true }).click();
          await leader.click();
          await dialog
            .getByRole('heading', { name: 'Their game plan stays private.', exact: true })
            .waitFor();
          assert.equal(await dialog.locator('.five-pitch-player').count(), 0);
          await dialog.getByRole('button', { name: 'Next', exact: true }).click();
          assert.equal(await dialog.locator('.five-pitch-player').count(), 5);
          await dialog.getByRole('button', { name: 'Close', exact: true }).click();
          for (const refundState of ['returned', 'confirming', 'delayed']) {
            read = dataFor('final', profile);
            read.detail.auction = {
              state: 'closed',
              closesAt: read.detail.terms.lockAt,
              confirmationCutoff: read.detail.terms.lockAt,
              leadingShannons: '250000000000',
              bidderCount: 3,
              ownShannons: '50000000000',
              ownStatus: 'refunding',
            };
            read.detail.sponsorRefund = {
              state: refundState,
              totalShannons: '50000000000',
              returnedShannons: refundState === 'returned' ? '50000000000' : '10000000000',
              pendingShannons: refundState === 'returned' ? '0' : '40000000000',
              transactionHashes: ['0x' + 'a'.repeat(64)],
            };
            await page.reload();
            await page.getByRole('tab', { name: 'Sponsors', exact: true }).click();
            const refund = page.locator('.five-refund-status');
            await refund.waitFor();
            assert.equal(await refund.getAttribute('data-state'), refundState);
            assert.equal(
              await refund.locator('.cell-loader').count(),
              refundState === 'confirming' ? 1 : 0,
            );
            if (refundState !== 'returned')
              await refund
                .getByText('100 tCKB returned · 400 tCKB remaining', { exact: true })
                .waitFor();
            assert.equal(
              await refund.getByRole('link', { name: /Refund payment/ }).isVisible(),
              false,
            );
            await refund.getByText('View refund payments', { exact: true }).click();
            await refund.getByRole('link', { name: /Refund payment 1/ }).waitFor();
            if (refundState !== 'confirming')
              await page.screenshot({
                path: path.join(out, `${engineName}-${width}-refund-${refundState}.png`),
              });
          }
          profile = null;
          read = dataFor('open', profile);
          read.detail.entries = [];
          read.detail.ownId = null;
          await page.reload();
          for (const position of ['FWD', 'MID', 'MID', 'DEF', 'GK']) {
            await page
              .getByRole('button', { name: `+ ${position}`, exact: true })
              .first()
              .click();
            const button = page
              .locator('.five-scout')
              .getByRole('button', { name: /^Add / })
              .first();
            await button.click();
            if (width < 761)
              await page
                .getByRole('button', { name: 'Back to squad', exact: true })
                .first()
                .click();
          }
          await page.getByRole('button', { name: 'Captain Creator', exact: true }).click();
          await page.getByRole('button', { name: 'Add your FPL name', exact: true }).click();
          await dialog.getByRole('textbox', { name: 'FPL name' }).fill('AB');
          assert.equal(
            await dialog
              .getByRole('button', { name: 'Save name and continue', exact: true })
              .isDisabled(),
            true,
          );
          await dialog
            .getByText('Add at least 3 characters to continue.', { exact: true })
            .waitFor();
          await dialog.getByRole('textbox', { name: 'FPL name' }).fill('<script>');
          assert.equal(
            await dialog
              .getByRole('button', { name: 'Save name and continue', exact: true })
              .isDisabled(),
            true,
          );
          await dialog.getByRole('textbox', { name: 'FPL name' }).fill('Saturday Strategist');
          wrongProfileViewer = true;
          await dialog.getByRole('button', { name: 'Save name and continue', exact: true }).click();
          await dialog
            .getByRole('alert')
            .getByText('Your sign-in changed. Refresh before continuing.', { exact: true })
            .waitFor();
          assert.equal(
            actions.filter((action) => action === 'enter').length,
            0,
            'mismatched profile response cannot submit squad',
          );
          assert.equal(
            await dialog.getByRole('textbox', { name: 'FPL name' }).inputValue(),
            'Saturday Strategist',
          );
          failProfile = true;
          await dialog.getByRole('button', { name: 'Save name and continue', exact: true }).click();
          await dialog.getByRole('alert').waitFor();
          assert.equal(
            await dialog.getByRole('textbox', { name: 'FPL name' }).inputValue(),
            'Saturday Strategist',
          );
          await dialog.getByRole('button', { name: 'Save name and continue', exact: true }).click();
          await dialog.getByRole('button', { name: 'Save my five', exact: true }).click();
          await page.getByRole('button', { name: 'Changes saved', exact: true }).waitFor();
          assert.equal(read.detail.entries[0].players.length, 5);
          assert.equal(read.detail.entries[0].captain, 'p2');
          const saveCalls = actions.filter((a) => a === 'enter').length;
          await page.getByRole('tab', { name: 'More', exact: true }).click();
          await page.getByRole('button', { name: 'Your FPL name', exact: true }).click();
          await dialog.getByRole('textbox', { name: 'FPL name' }).fill('Sunday Strategist');
          await dialog.getByRole('button', { name: 'Save name', exact: true }).click();
          await dialog.waitFor({ state: 'hidden' });
          assert.equal(
            actions.filter((a) => a === 'enter').length,
            saveCalls,
            'name edit does not resave squad',
          );
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          console.log(
            `${engineName} ${width}: pitch, scores, private picks, names, drafts, focus passed`,
          );
          await context.close();
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

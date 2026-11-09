/* Actual built React app, isolated synthetic API. No live keys, wallets, databases or providers. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const { chooseOption } = require('./browser-select.cjs');
const { artworkJourney } = require('./campaigns-artwork-browser.cjs');
const { homeProductsJourney } = require('./home-products-browser.cjs');

const publicRoot = path.resolve(__dirname, '../public');
const output = path.resolve(__dirname, '../../../.quality-artifacts/campaigns-runtime');
fs.mkdirSync(output, { recursive: true });
const contentTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const target = path.resolve(
    publicRoot,
    '.' +
      (['/season', '/season/'].includes(url.pathname)
        ? '/season/index.html'
        : decodeURIComponent(url.pathname)),
  );
  const relative = path.relative(publicRoot, target);
  if (
    relative.startsWith('..') ||
    path.isAbsolute(relative) ||
    !fs.existsSync(target) ||
    !fs.statSync(target).isFile()
  )
    return res.writeHead(404).end();
  res.writeHead(200, {
    'Content-Type': contentTypes[path.extname(target)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(fs.readFileSync(target));
});
const clock = Date.UTC(2030, 0, 5, 12),
  iso = (hours = 0) => new Date(clock + hours * 3600000).toISOString();
const account = {
  id: 'campaign-browser-owner',
  username: 'Somtee',
  walletAddress: 'ckt1-synthetic-browser-address',
  telegramConnected: false,
  telegramUsername: null,
  telegramAvailable: false,
};
const fixtures = Array.from({ length: 8 }, (_, index) => ({
  fixtureId: `api-football-${9000 + index}`,
  marketId: `market-${index}`,
  marketKey: `market-key-${index}`,
  home: `Home ${index + 1}`,
  away: `Away ${index + 1}`,
  homeLogo: index === 0 ? '/brand/on-form-mark.svg' : null,
  awayLogo: index === 0 ? '/brand/on-form-mark.svg' : null,
  homeForm: index === 0 ? 'WLWLD' : null,
  awayForm: index === 0 ? 'DWWDL' : null,
  league: index % 2 ? 'Premier League' : 'Champions League',
  kickoffAt: iso(48 + index),
  cutoffAt: iso(47 + index),
  capacity: 32,
  occupied: index + 1,
  updatedAt: iso(),
}));
const gameweeks = [
  { id: 'fpl-gw10', name: 'Gameweek 10', lockAt: iso(24), state: 'open' },
  { id: 'fpl-gw11', name: 'Gameweek 11', lockAt: iso(200), state: 'available', event: 11 },
];
function createCampaign(id = 'calls', kind = 'predictions') {
  const draft = {
    name: kind === 'five' ? 'Five Challenge' : 'Fixture Challenge',
    description: 'Synthetic browser fixture.',
    kind,
    registrationClosesAt: iso(20),
    fiveRoundId: kind === 'five' ? gameweeks[0].id : null,
    fixtureIds: kind === 'five' ? [] : fixtures.slice(0, 2).map((f) => f.fixtureId),
    prizes: [
      { place: 1, amountShannons: '250000000000', usdReference: '25' },
      { place: 2, amountShannons: '150000000000', usdReference: '15' },
      { place: 3, amountShannons: '100000000000', usdReference: '10' },
    ],
    rehearsal: false,
  };
  return {
    id,
    ...draft,
    state: 'open',
    fixtureCount: draft.fixtureIds.length,
    registeredCount: 0,
    activeCount: 0,
    prizeTotalShannons: '500000000000',
    prizePlaces: draft.prizes.length,
    joined: false,
    revision: 1,
    termsHash: 'a'.repeat(64),
    draft,
    fixtures: kind === 'five' ? [] : fixtures.slice(0, 2),
    gameweek: kind === 'five' ? gameweeks[0] : null,
    leaderboard: [],
    leaderboardTotal: 0,
    leaderboardOffset: 0,
    own: null,
    predictionEntryPolicy: kind === 'predictions' ? 'first-admitted-v2' : null,
    awards: [],
    scoreStatus: 'waiting',
    verifiedAt: null,
    notice: null,
    deletedAt: null,
    adminEntries: [],
  };
}
function applyDraft(c, draft, weeks = gameweeks) {
  Object.assign(c, draft, {
    draft,
    fixtureCount: draft.fixtureIds.length,
    fixtures: fixtures.filter((f) => draft.fixtureIds.includes(f.fixtureId)),
    gameweek: weeks.find((g) => g.id === draft.fiveRoundId) ?? null,
    prizePlaces: draft.prizes.length,
    prizeTotalShannons: draft.prizes.reduce((n, p) => n + BigInt(p.amountShannons), 0n).toString(),
  });
}
function publicMarket(f) {
  return {
    evaluatedAt: iso(),
    accepting: true,
    termsId: 'a'.repeat(64),
    paymentAvailable: false,
    terms: {
      kind: 'custodial-ledger',
      minimumShannons: '10000000000',
      maximumShannons: '1000000000000',
      protocolFeeBps: 0,
      creatorFeeBps: 0,
      kickoff: f.kickoffAt,
      closesAt: f.cutoffAt,
    },
    market: {
      id: f.marketId,
      available: true,
      status: 'open',
      closesAt: f.cutoffAt,
      prices: { home: 0.4, draw: 0.3, away: 0.3 },
      totalPoolCkb: '0',
      totalBets: 0,
      match: {
        id: f.fixtureId,
        kickoff: f.kickoffAt,
        status: 'scheduled',
        stage: 'Synthetic matchweek',
        home: { name: f.home, code: 'HOM', logo: f.homeLogo },
        away: { name: f.away, code: 'AWY', logo: f.awayLogo },
        competition: { name: f.league },
      },
    },
  };
}
async function main() {
  assert.ok(fs.existsSync(path.join(publicRoot, 'season/index.html')), 'Build the frontend first.');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let completed = 0;
  try {
    for (const [engineName, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        for (const width of [320, 390, 1440]) {
          const context = await browser.newContext({
            viewport: { width, height: width <= 390 ? 844 : 1000 },
            reducedMotion: 'reduce',
            timezoneId: 'UTC',
            serviceWorkers: 'block',
          });
          const page = await context.newPage();
          page.setDefaultTimeout(15000);
          await page.clock.install({ time: clock });
          const errors = [],
            writes = [],
            requests = [];
          let admin = true;
          let viewerId = account.id;
          let fiveProfile = null;
          let profileWrites = 0;
          const artworkState = { uploads: [], images: new Map(), failNext: false, broken: false };
          const availableGameweeks = gameweeks.map((week) => ({ ...week }));
          let optionsReads = 0;
          const campaigns = [createCampaign(), createCampaign('five', 'five')];
          page.on('pageerror', (error) => {
            errors.push(error.message);
            console.error('Browser error at', page.url(), error.stack);
          });
          // Mutations publish their returned data before their invalidation reads
          // finish. Let those intercepted responses complete before a test-only
          // document reload destroys WebKit's request context. Errors remain fatal.
          const fixtureReads = new Map();
          page.on('request', (request) => {
            if (request.method() === 'GET' && request.url().startsWith(base + '/api/'))
              fixtureReads.set(request, Promise.withResolvers());
          });
          const finishRead = (request) => {
            fixtureReads.get(request)?.resolve();
            fixtureReads.delete(request);
          };
          page.on('requestfinished', finishRead);
          page.on('requestfailed', finishRead);
          async function settleFixtureReads() {
            let timeout;
            try {
              await Promise.race([
                (async () => {
                  while (fixtureReads.size)
                    await Promise.all([...fixtureReads.values()].map((read) => read.promise));
                })(),
                new Promise((_, reject) => {
                  timeout = setTimeout(() => reject(Error('Fixture reads did not finish')), 15000);
                }),
              ]);
            } finally {
              clearTimeout(timeout);
            }
          }
          async function navigate(url) {
            await settleFixtureReads();
            // React mutation completion can enqueue invalidations after the last
            // intercepted response finishes. Wait for the browser's network quiet
            // state before a test-only document teardown; all errors remain fatal.
            await page.waitForLoadState('networkidle');
            await page.goto(url);
          }
          async function reload() {
            await settleFixtureReads();
            await page.waitForLoadState('networkidle');
            await page.reload();
          }
          await context.route('**/*', async (route) => {
            const req = route.request(),
              url = new URL(req.url());
            if (url.origin !== base) return route.abort();
            if (url.pathname.startsWith('/media/competitions/')) {
              const bytes = artworkState.images.get(url.pathname);
              return route.fulfill({
                status: bytes && !artworkState.broken ? 200 : 404,
                contentType: 'image/png',
                body: bytes && !artworkState.broken ? bytes : '',
              });
            }
            if (!url.pathname.startsWith('/api/')) return route.continue();
            requests.push(url.pathname);
            const json = (value, status = 200) =>
              route.fulfill({
                status,
                contentType: 'application/json',
                body: JSON.stringify(value),
              });
            if (url.pathname === '/api/me') return json({ user: account });
            if (url.pathname === '/api/direct/entry-mode') return json({ mode: 'atomic' });
            if (url.pathname === '/api/campaigns') {
              const result = (id = null) => {
                for (const row of campaigns) {
                  if (row.kind === 'predictions' && row.joined) {
                    row.joinedFixtureIds = row.fixtures.map((fixture) => fixture.fixtureId);
                    row.qualifyingFixtureIds = row.own?.calls.map((call) => call.fixtureId) ?? [];
                  } else {
                    delete row.joinedFixtureIds;
                    delete row.qualifyingFixtureIds;
                  }
                }
                return {
                  admin,
                  viewerId,
                  now: iso(),
                  campaigns,
                  detail: campaigns.find((c) => c.id === id) ?? null,
                };
              };
              if (req.method() === 'GET') {
                if (url.searchParams.get('action') === 'options') optionsReads++;
                return json(
                  url.searchParams.get('action') === 'options'
                    ? { fixtures, gameweeks: availableGameweeks }
                    : result(url.searchParams.get('id')),
                );
              }
              if (url.searchParams.get('action') === 'upload-artwork') {
                const id = url.searchParams.get('id'),
                  slot = url.searchParams.get('slot');
                const target = campaigns.find((row) => row.id === id);
                assert.equal(req.headers()['x-streak-account-id'], account.id);
                assert.equal(url.searchParams.has('expectedAccountId'), false);
                assert.equal(Number(url.searchParams.get('revision')), target.revision);
                // WebKit's interception protocol omits File request bytes. The
                // real HTTP suite validates binary uploads; this mock supplies
                // a local raster so both engines exercise rendered responses.
                const capturedBytes = req.postDataBuffer();
                const bytes =
                  capturedBytes ??
                  fs.readFileSync(path.join(publicRoot, 'brand/on-form-icon-512.png'));
                assert.equal(req.headers()['content-type'], 'image/png');
                artworkState.uploads.push({ id, slot });
                if (artworkState.holdNext) {
                  artworkState.holdNext = false;
                  await new Promise((resolve) => {
                    artworkState.release = resolve;
                    artworkState.onHeld?.();
                  });
                  artworkState.released = true;
                }
                if (artworkState.failNext) {
                  artworkState.failNext = false;
                  return json(
                    { error: 'Synthetic upload unavailable. Retry the same image.' },
                    503,
                  );
                }
                const hash = require('node:crypto')
                  .createHash('sha256')
                  .update(bytes)
                  .update(slot)
                  .update(capturedBytes ? '' : String(artworkState.uploads.length))
                  .digest('hex');
                const file = `/media/competitions/${hash}.webp`;
                artworkState.images.set(file, bytes);
                target.artwork ??= { icon: null, banner: null };
                target.artwork[slot] = {
                  url: file,
                  width: slot === 'icon' ? 128 : 1440,
                  height: slot === 'icon' ? 128 : 480,
                };
                target.revision++;
                await json(result(id));
                artworkState.onCompleted?.();
                return;
              }
              const body = req.postDataJSON();
              writes.push(body);
              if (body.action === 'prepare-gameweek') {
                assert.equal(body.event, 11);
                availableGameweeks[1].state = 'open';
                delete availableGameweeks[1].event;
                return json({ fixtures, gameweeks: availableGameweeks });
              }
              let campaign = campaigns.find((c) => c.id === body.id);
              if (body.action === 'create') {
                campaign = createCampaign(`created-${campaigns.length}`);
                applyDraft(campaign, body.draft, availableGameweeks);
                campaign.state = 'draft';
                campaigns.push(campaign);
              } else if (!campaign) return json({ error: 'Missing campaign' }, 404);
              if (body.action === 'update') applyDraft(campaign, body.draft, availableGameweeks);
              if (body.action === 'remove-artwork') {
                assert.equal(body.expectedAccountId, account.id);
                assert.equal(body.revision, campaign.revision);
                campaign.artwork ??= { icon: null, banner: null };
                campaign.artwork[body.slot] = null;
              }
              if (body.action === 'publish') campaign.state = 'open';
              if (body.action === 'delete') {
                if (body.confirmName !== campaign.name)
                  return json({ error: 'Exact name required' }, 400);
                campaign.state = 'deleted';
                campaign.deletedAt = iso();
              }
              if (body.action === 'join') {
                if (campaign.kind === 'five')
                  assert.ok(fiveProfile, 'Five campaign registration requires a saved FPL name.');
                campaign.joined = true;
                campaign.registeredCount = 1;
                campaign.own = {
                  publicId: 'public-owner',
                  joinedAt: iso(),
                  rank: 1,
                  points: 0,
                  participated: false,
                  tieBreakAt: null,
                  calls: [],
                  fiveRoundId: campaign.fiveRoundId,
                };
                const standing = {
                  publicId: 'public-owner',
                  name: campaign.kind === 'five' ? fiveProfile.displayName : 'Somtee',
                  rank: 1,
                  points: 0,
                  participated: false,
                  qualifyingEntries: 0,
                  tieBreakAt: null,
                  own: true,
                  awardShannons: null,
                };
                campaign.leaderboard = [standing];
                campaign.leaderboardTotal = 1;
                campaign.adminEntries = [{ ...standing, accountId: account.id, joinedAt: iso() }];
              }
              if (body.action === 'payout-address') {
                campaign.awards[0].receivingAddress = body.address;
                campaign.awards[0].status = 'ready';
              }
              if (body.action === 'record-payout') {
                if (body.transactionHash === '0x' + 'b'.repeat(64))
                  return json(
                    { error: 'This synthetic transaction does not have 24 confirmations yet.' },
                    409,
                  );
                campaign.awards[0].status = 'paid';
                campaign.awards[0].transactionHash = body.transactionHash;
              }
              campaign.revision++;
              return json(result(campaign.id));
            }
            const market = fixtures.find(
              (f) => url.pathname === `/api/markets/${f.marketId}/public`,
            );
            if (market) return json(publicMarket(market));
            if (url.pathname === '/api/five' && url.searchParams.get('profile') === '1')
              return json({ viewerId, profile: fiveProfile });
            if (url.pathname === '/api/five' && req.method() === 'POST') {
              const body = req.postDataJSON();
              assert.equal(body.action, 'profile', 'Registration never submits a squad.');
              assert.equal(body.expectedAccountId, account.id);
              profileWrites++;
              fiveProfile = { displayName: body.displayName, updatedAt: iso() };
              return json({ viewerId, profile: fiveProfile });
            }
            if (url.pathname === '/api/five')
              return json({
                now: iso(),
                admin,
                viewerId: account.id,
                feedAvailable: false,
                fundingAvailable: false,
                rewardsAccount: null,
                rounds: [],
                detail: null,
              });
            return json(
              {
                error:
                  'This service is intentionally unavailable in the isolated campaign browser fixture.',
              },
              503,
            );
          });
          try {
            await homeProductsJourney({
              page,
              base,
              campaigns,
              artworkState,
              width,
              engineName,
              output,
            });
            await navigate(base + '/season/?view=competitions&campaign=calls');
            await page.getByRole('heading', { name: 'Fixture Challenge', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Join competition', exact: true }).click();
            await page.locator('.campaign-join-dialog').waitFor();
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-join-dialog.png`),
            });
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            await page
              .getByRole('button', { name: 'Agree & join competition', exact: true })
              .click();
            await page.getByText('You are registered · Rank #1', { exact: true }).waitFor();
            const joinedToast = page
              .locator('.campaign-toast')
              .filter({ hasText: 'You are registered. Your place is now on the table.' });
            await joinedToast.waitFor();
            assert.equal(
              await joinedToast.evaluate((node) => getComputedStyle(node).animationName),
              'campaign-toast-in',
            );
            const toastBounds = await page.locator('.campaign-toast-stack').boundingBox();
            const visibleWidth = await page.evaluate(() => window.innerWidth);
            assert.ok(
              Math.abs(toastBounds.x + toastBounds.width / 2 - visibleWidth / 2) < 2,
              `Toasts are centered in the visible viewport: ${JSON.stringify({ toastBounds, visibleWidth })}`,
            );
            if (width <= 390) {
              const navBounds = await page.locator('.mobile-dock').boundingBox();
              assert.ok(
                toastBounds.y + toastBounds.height <= navBounds.y,
                'Toasts clear mobile navigation.',
              );
            }
            await page.screenshot({ path: path.join(output, `${engineName}-${width}-toast.png`) });
            const beforeToastDismiss = await page
              .locator('.campaign-match-card')
              .first()
              .boundingBox();
            assert.equal(
              await page
                .locator('.campaign-toast-stack')
                .evaluate((node) => getComputedStyle(node).position),
              'fixed',
            );
            await joinedToast.getByRole('button', { name: /Dismiss/ }).click();
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await joinedToast.waitFor({ state: 'detached' });
            const afterToastDismiss = await page
              .locator('.campaign-match-card')
              .first()
              .boundingBox();
            assert.equal(
              afterToastDismiss.y,
              beforeToastDismiss.y,
              'Dismissing an alert does not shift the fixtures.',
            );
            assert.equal(campaigns[0].own.points, 0);
            assert.equal(campaigns[0].leaderboard[0].participated, false);
            const firstMatch = page.locator('.campaign-match-card').first();
            await firstMatch.locator('.team-logo').first().waitFor();
            assert.equal(await firstMatch.locator('.team-logo').count(), 2);
            await page.waitForFunction(() => {
              const images = [
                ...document.querySelectorAll('.campaign-match-card:first-child .team-logo'),
              ];
              return (
                images.length === 2 &&
                images.every((image) => image.complete && image.naturalWidth > 0)
              );
            });
            assert.equal(
              (await firstMatch.locator('.campaign-team-form').first().innerText()).replace(
                /\s/g,
                '',
              ),
              'WLWLD',
              'The card displays provider form in its received order.',
            );
            assert.equal(
              await page
                .locator('.campaign-match-card')
                .nth(1)
                .getByText('Form unavailable')
                .count(),
              2,
              'Missing form does not create synthetic results.',
            );
            await page.getByRole('button', { name: 'Home 1 to win', exact: true }).click();
            await page.locator('dialog[open] #slip-title').waitFor();
            assert.match(
              await page.locator('dialog[open]').innerText(),
              /Home 1 vs Away 1|Home 1.*Away 1/s,
            );
            assert.ok(
              requests.includes('/api/markets/market-0/public'),
              'Uses the existing market endpoint.',
            );
            const draft = await page.evaluate(() =>
              JSON.parse(localStorage.getItem('streak.predictionDraft.v1')),
            );
            assert.equal(
              draft.picks[0].marketId,
              'market-0',
              'Uses the existing persisted slip draft.',
            );
            await page
              .locator('.slip-campaign-context')
              .getByText('Fixture Challenge', { exact: true })
              .waitFor();
            await page.getByRole('button', { name: 'Add matches', exact: true }).click();
            await page.getByRole('heading', { name: 'Fixture Challenge', exact: true }).waitFor();
            assert.equal(new URL(page.url()).searchParams.get('view'), 'competitions');
            assert.equal(new URL(page.url()).searchParams.get('campaign'), 'calls');
            assert.equal(
              await page
                .getByRole('button', { name: 'Home 1 to win', exact: true })
                .getAttribute('aria-pressed'),
              'true',
              'The existing slip selection remains visibly active in the competition.',
            );
            assert.equal(
              await firstMatch.locator('.campaign-outcomes button:disabled').count(),
              3,
              'A saved competition draft prevents a second selection from the fixture card.',
            );
            await firstMatch.getByText('Your draft pick', { exact: true }).waitFor();
            await firstMatch
              .getByText('Not entered yet. Complete payment in your slip for verification.', {
                exact: true,
              })
              .waitFor();
            await firstMatch.getByRole('button', { name: 'Open slip', exact: true }).click();
            await page
              .getByRole('button', { name: 'Remove Home 1 vs Away 1', exact: true })
              .click();
            await page.getByRole('button', { name: 'Add matches', exact: true }).click();
            assert.equal(
              await firstMatch.locator('.campaign-outcomes button:disabled').count(),
              0,
              'Removing the unpaid draft makes the fixture selectable again.',
            );
            await firstMatch.getByRole('button', { name: 'Draw', exact: true }).click();
            await page.waitForFunction(
              () =>
                document
                  .querySelector('.campaign-match-card .campaign-outcomes button:nth-child(2)')
                  ?.getAttribute('aria-pressed') === 'true',
            );
            assert.equal(
              await page
                .getByRole('button', { name: 'Home 1 to win', exact: true })
                .getAttribute('aria-pressed'),
              'false',
              'Selecting after removing the draft clears the previous active outcome.',
            );
            if (await page.locator('dialog[open] #slip-title').count())
              await page
                .getByRole('button', { name: 'Close prediction slip', exact: true })
                .click();
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-selected-outcome.png`),
              fullPage: true,
            });
            await page.getByRole('button', { name: 'Rules & prizes', exact: true }).click();
            await page.locator('.prediction-dock').click();
            await page.getByRole('button', { name: 'Add matches', exact: true }).click();
            await page.getByRole('button', { name: 'Home 1 to win', exact: true }).waitFor();
            assert.equal(
              await page
                .locator('.campaign-tabs')
                .getByRole('button', { name: 'Play', exact: true })
                .getAttribute('aria-pressed'),
              'true',
              'Returning from the slip reopens playable fixtures rather than leaving the rules tab selected.',
            );
            await navigate(base + '/season/?market=market-2');
            await page.locator('.detail-outcomes button[data-outcome="home"]').click();
            await page.locator('.prediction-dock').click();
            await page.locator('dialog[open] #slip-title').waitFor();
            await page
              .locator('.slip-campaign-context')
              .getByText('Mixed slip', { exact: true })
              .waitFor();
            assert.equal(await page.locator('.slip-pick').count(), 2);
            await page
              .locator('.slip-pick')
              .filter({ hasText: 'Home 1 vs Away 1' })
              .getByText('Automatic entry: Fixture Challenge. Its published rules apply.', {
                exact: true,
              })
              .waitFor();
            await page
              .locator('.slip-pick')
              .filter({ hasText: 'Home 3 vs Away 3' })
              .getByText('Regular prediction', { exact: true })
              .waitFor();
            await page.getByRole('button', { name: 'Clear slip', exact: true }).click();
            await page.getByText(/Includes your picks for Fixture Challenge/).waitFor();
            await page.getByRole('button', { name: 'Keep predictions', exact: true }).click();
            await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
            await page
              .locator('.prediction-dock')
              .getByText('Fixture Challenge + 1 regular', { exact: true })
              .waitFor();
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-mixed-dock.png`),
            });
            await reload();
            await page
              .locator('.prediction-dock')
              .getByText('Fixture Challenge + 1 regular', { exact: true })
              .waitFor();
            await page.locator('.prediction-dock').click();
            await page
              .locator('.slip-campaign-context')
              .getByText('Mixed slip', { exact: true })
              .waitFor();
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-mixed-slip.png`),
            });
            await page.getByRole('button', { name: 'Add matches', exact: true }).click();
            assert.match(page.url(), /view=competitions&campaign=calls/);
            await page.getByRole('button', { name: 'Home 1 to win', exact: true }).waitFor();
            campaigns[0].activeCount = 1;
            campaigns[0].own.participated = true;
            campaigns[0].own.calls = [
              {
                fixtureId: fixtures[0].fixtureId,
                outcome: 1,
                points: 0,
                status: 'pending',
                transactionHash: '0x' + 'a'.repeat(64),
              },
            ];
            campaigns[0].leaderboard[0].participated = true;
            campaigns[0].leaderboard[0].qualifyingEntries = 1;
            await reload();
            await firstMatch.getByText('Your competition pick', { exact: true }).waitFor();
            await firstMatch.getByText('Entered', { exact: true }).waitFor();
            assert.equal(await firstMatch.locator('.campaign-outcomes button:disabled').count(), 3);
            assert.equal(
              await firstMatch
                .getByRole('button', { name: 'Draw', exact: true })
                .getAttribute('aria-pressed'),
              'true',
            );
            await firstMatch.getByText('Awaiting result', { exact: true }).waitFor();
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-entered-card.png`),
              fullPage: true,
            });
            await firstMatch.getByRole('button', { name: 'View market', exact: true }).click();
            await page.locator('.detail-outcomes button[data-outcome="away"]').click();
            await page.locator('.prediction-dock').click();
            assert.equal(new URL(page.url()).searchParams.get('market'), 'market-0');
            const existingCallSlip = page
              .locator('.slip-pick')
              .filter({ hasText: 'Home 1 vs Away 1' });
            await existingCallSlip
              .getByText('Competition entry already used', { exact: true })
              .waitFor();
            await existingCallSlip.getByText('Regular prediction', { exact: false }).waitFor();
            assert.equal(
              await existingCallSlip.locator('.slip-pick-campaign').count(),
              0,
              'A repeat bet has no competition badge.',
            );
            await page.getByRole('button', { name: 'Add matches', exact: true }).click();
            await page.getByRole('heading', { name: 'You know the game.', exact: true }).waitFor();
            await navigate(base + '/season/?view=competitions&campaign=calls');
            await firstMatch.getByText('Your competition pick', { exact: true }).waitFor();
            assert.equal(
              await firstMatch
                .getByRole('button', { name: 'Draw', exact: true })
                .getAttribute('aria-pressed'),
              'true',
              'A further normal bet does not change the qualifying competition prediction.',
            );
            await firstMatch
              .getByText('Further bets here do not add competition points.', { exact: true })
              .waitFor();
            await page.getByRole('button', { name: 'Back to competitions', exact: true }).click();
            await page.getByRole('button', { name: 'Create competition', exact: true }).click();
            await page
              .getByRole('button', { name: 'Streak Five Choose a gameweek', exact: true })
              .click();
            await page.getByRole('button', { name: 'Choose gameweek', exact: true }).click();
            await chooseOption(page, 'Premier League gameweek', /^Gameweek 11/);
            await page.getByText(/The official deadline cannot be overridden here/).waitFor();
            await page.getByText(/Player pool and prices are fixed when prepared/).waitFor();
            const initialOptionsReads = optionsReads;
            const preparedOptionsRefresh = page.waitForResponse(
              (response) =>
                new URL(response.url()).pathname === '/api/campaigns' &&
                new URL(response.url()).searchParams.get('action') === 'options',
            );
            await page.getByRole('button', { name: 'Prepare gameweek', exact: true }).click();
            await page
              .getByRole('button', { name: 'Prepare gameweek', exact: true })
              .waitFor({ state: 'detached' });
            assert.ok(
              writes.some((write) => write.action === 'prepare-gameweek' && write.event === 11),
            );
            await preparedOptionsRefresh;
            assert.ok(
              optionsReads > initialOptionsReads,
              'Prepared gameweek options were refreshed',
            );
            assert.match(
              await page
                .getByRole('combobox', { name: 'Premier League gameweek', exact: true })
                .innerText(),
              /Gameweek 11/,
            );
            await page.getByRole('button', { name: '1 The invitation', exact: true }).click();
            await page
              .getByRole('button', { name: 'Predictions Curate a fixture list', exact: true })
              .click();
            await page.getByLabel('Competition name', { exact: true }).fill('Campaign <Cup>');
            await page
              .getByLabel('Registration deadline', { exact: true })
              .fill('2030-01-06T12:00');
            await page.getByRole('button', { name: 'Choose fixtures', exact: true }).click();
            await page.getByRole('textbox', { name: 'Search fixtures', exact: true }).focus();
            const searchFocus = await page.locator('.campaign-search').evaluate((label) => ({
              outer: getComputedStyle(label).boxShadow,
              inner: getComputedStyle(label.querySelector('input')).outlineStyle,
              innerShadow: getComputedStyle(label.querySelector('input')).boxShadow,
            }));
            assert.notEqual(
              searchFocus.outer,
              'none',
              'Search focus belongs to the whole control.',
            );
            assert.equal(searchFocus.inner, 'none');
            assert.equal(searchFocus.innerShadow, 'none');
            await page.getByRole('button', { name: 'Select visible', exact: true }).click();
            assert.equal(
              await page.locator('.campaign-fixture-choice[aria-pressed="true"]').count(),
              8,
            );
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
              false,
            );
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-fixture-setup.png`),
              fullPage: true,
            });
            await page.getByRole('button', { name: 'Set the prizes', exact: true }).click();
            for (let i = 1; i <= 4; i++) {
              await page.getByRole('button', { name: 'Add a winning place', exact: true }).click();
              await page
                .getByLabel(`Place ${i} reward in CKB`, { exact: true })
                .fill(i === 1 ? '1000.12345678' : '500');
            }
            const prizeFocus = await page
              .getByLabel('Place 4 reward in CKB', { exact: true })
              .evaluate((input) => ({
                outer: getComputedStyle(input.parentElement).boxShadow,
                inner: getComputedStyle(input).outlineStyle,
                innerShadow: getComputedStyle(input).boxShadow,
              }));
            assert.notEqual(prizeFocus.outer, 'none');
            assert.equal(prizeFocus.inner, 'none');
            assert.equal(prizeFocus.innerShadow, 'none');
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
              false,
            );
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-prize-setup.png`),
              fullPage: true,
            });
            await page.getByLabel('Place 4 reward in CKB', { exact: true }).fill('60.99999999');
            await page.getByRole('button', { name: 'Review competition', exact: true }).click();
            await page.getByRole('button', { name: 'Publish competition', exact: true }).click();
            await page
              .getByText(
                'Set at least 61 CKB for each prize. Optional dollar references can have two decimal places.',
                { exact: true },
              )
              .waitFor();
            assert.equal(writes.filter((w) => w.action === 'create').length, 0);
            await page.getByLabel('Place 4 reward in CKB', { exact: true }).fill('500');
            await page.getByRole('button', { name: 'Review competition', exact: true }).click();
            await page.getByRole('button', { name: 'Publish competition', exact: true }).click();
            await page
              .getByRole('heading', { name: 'Campaign <Cup>', exact: true, level: 1 })
              .waitFor();
            if (width === 390) {
              const publishedToast = page
                .locator('.campaign-toast')
                .filter({ hasText: 'Your competition is published.' });
              await publishedToast.waitFor();
              assert.equal(
                await publishedToast.evaluate((node) => getComputedStyle(node).animationName),
                'none',
                'Reduced motion skips toast movement.',
              );
              await page.mouse.move(0, 0);
              await page.clock.runFor(10500);
              await publishedToast.waitFor({ state: 'detached' });
            }
            assert.ok(
              writes.some(
                (w) =>
                  w.action === 'create' &&
                  w.draft.fixtureIds.length === 8 &&
                  w.draft.prizes.length === 4 &&
                  w.draft.prizes[0].amountShannons === '100012345678',
              ),
            );
            assert.ok(writes.some((w) => w.action === 'publish'));
            assert.equal(await page.locator('.campaign-match-card').count(), 8);
            assert.equal(
              await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
              false,
            );
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-published.png`),
              fullPage: true,
            });
            await page.getByRole('button', { name: 'Manage competitions', exact: true }).click();
            await page.getByRole('button', { name: 'Delete competition', exact: true }).click();
            await page.getByRole('button', { name: 'Continue', exact: true }).click();
            await page.getByLabel('Competition name', { exact: true }).fill('Campaign <Cup> ');
            assert.equal(
              await page
                .locator('.campaign-dialog')
                .getByRole('button', { name: 'Delete competition', exact: true })
                .isDisabled(),
              true,
            );
            await page.getByLabel('Competition name', { exact: true }).fill('Campaign <Cup>');
            await page
              .locator('.campaign-dialog')
              .getByRole('button', { name: 'Delete competition', exact: true })
              .click();
            await page
              .getByRole('heading', { name: 'Your matchweek. Your moment.', exact: true })
              .waitFor();
            await page
              .locator('.campaign-toast')
              .filter({
                hasText: 'Competition archived. Existing entries and obligations are preserved.',
              })
              .waitFor();
            assert.equal(campaigns[2].state, 'deleted');
            assert.equal(
              campaigns[0].own.points,
              0,
              'Deleting a listing preserves unrelated entries.',
            );
            assert.equal(
              await page
                .locator('.campaign-list-card')
                .filter({ hasText: 'Campaign <Cup>' })
                .count(),
              0,
            );
            await navigate(base + '/season/?view=competitions&campaign=five');
            await page.getByRole('button', { name: 'Join competition', exact: true }).click();
            await page.getByLabel('Your FPL name', { exact: false }).waitFor();
            const joinFive = page.getByRole('button', {
              name: 'Agree & join competition',
              exact: true,
            });
            assert.equal(
              await joinFive.isDisabled(),
              true,
              'Missing name explains the disabled entry action.',
            );
            await page.getByLabel('Your FPL name', { exact: false }).fill('The Final Whistle');
            await joinFive.click();
            await page.getByText('You are registered · Rank #1', { exact: true }).waitFor();
            assert.equal(profileWrites, 1);
            assert.equal(campaigns[1].leaderboard[0].name, 'The Final Whistle');
            await page.getByRole('button', { name: 'Pick my five', exact: true }).click();
            assert.match(page.url(), /view=five&round=fpl-gw10/);
            admin = false;
            const finished = campaigns[0];
            finished.state = 'finished';
            finished.scoreStatus = 'final';
            finished.activeCount = 1;
            finished.own.participated = true;
            finished.own.points = 3;
            finished.own.calls = [
              {
                fixtureId: fixtures[0].fixtureId,
                outcome: 0,
                points: 3,
                status: 'correct',
                transactionHash: '0x' + 'a'.repeat(64),
              },
            ];
            finished.leaderboard[0].points = 3;
            finished.leaderboard[0].participated = true;
            finished.leaderboard[0].awardShannons = '250000000000';
            finished.awards = [
              {
                place: 1,
                publicId: 'public-owner',
                name: 'Somtee',
                amountShannons: '250000000000',
                usdReference: '25',
                status: 'address-needed',
                transactionHash: null,
              },
              ...finished.draft.prizes.slice(1).map((prize) => ({
                ...prize,
                publicId: null,
                name: null,
                status: 'unawarded',
                transactionHash: null,
              })),
            ];
            await navigate(base + '/season/?view=competitions&campaign=calls');
            await page
              .getByRole('heading', { name: 'A place among the best.', exact: true })
              .waitFor();
            assert.equal(
              await page.getByRole('button', { name: 'Manage competitions', exact: true }).count(),
              0,
            );
            assert.equal(
              await page.getByRole('button', { name: 'Delete competition', exact: true }).count(),
              0,
            );
            assert.equal(await page.getByText('Unawarded', { exact: true }).count(), 2);
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-finished.png`),
              fullPage: true,
            });
            await page.getByRole('button', { name: 'Add receiving address', exact: true }).click();
            await page
              .getByLabel('Mainnet CKB receiving address', { exact: true })
              .fill('ckt1testnet');
            assert.equal(
              await page
                .getByRole('button', { name: 'Save receiving address', exact: true })
                .isDisabled(),
              true,
            );
            await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
            await page.getByRole('button', { name: 'Add receiving address', exact: true }).click();
            await page
              .getByLabel('Mainnet CKB receiving address', { exact: true })
              .fill('ckb1' + 'q'.repeat(50));
            await page.getByLabel('I have checked this mainnet address', { exact: true }).check();
            await page.getByRole('button', { name: 'Save receiving address', exact: true }).click();
            await page
              .getByRole('button', { name: 'Review receiving address', exact: true })
              .click();
            assert.equal(
              await page
                .getByLabel('Mainnet CKB receiving address', { exact: true })
                .getAttribute('readonly'),
              '',
            );
            assert.equal(
              await page
                .getByRole('button', { name: 'Save receiving address', exact: true })
                .count(),
              0,
            );
            await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
            admin = true;
            await reload();
            await page.getByRole('button', { name: 'Manage competitions', exact: true }).click();
            assert.match(
              await page
                .getByRole('link', { name: 'Export entrants', exact: true })
                .getAttribute('href'),
              /action=export&id=calls&format=csv/,
            );
            await page.getByRole('button', { name: 'Verify payment', exact: true }).click();
            await page
              .getByLabel('Mainnet transaction hash', { exact: true })
              .fill('0x' + 'b'.repeat(64));
            await page.getByLabel('Recipient output index', { exact: true }).fill('0');
            await page.getByRole('button', { name: 'Verify payment proof', exact: true }).click();
            await page
              .getByText('This synthetic transaction does not have 24 confirmations yet.', {
                exact: true,
              })
              .waitFor();
            assert.equal(finished.awards[0].status, 'ready');
            await page
              .getByLabel('Mainnet transaction hash', { exact: true })
              .fill('0x' + 'C'.repeat(64));
            await page.getByRole('button', { name: 'Verify payment proof', exact: true }).click();
            await page.getByRole('button', { name: 'Recheck payment', exact: true }).waitFor();
            assert.equal(finished.awards[0].status, 'paid');
            assert.equal(writes.at(-1).transactionHash, '0x' + 'c'.repeat(64));
            finished.state = 'deleted';
            finished.deletedAt = iso();
            admin = false;
            await reload();
            await page.getByText('Competition archived', { exact: true }).waitFor();
            await page.getByText('Prize paid', { exact: true }).waitFor();
            admin = true;
            await navigate(base + '/season/?view=competitions');
            await page.getByRole('button', { name: 'Create competition', exact: true }).click();
            await page.getByLabel('Competition name', { exact: true }).fill('Unfinished challenge');
            const longDescription = 'A thoughtful invitation. '.repeat(150);
            await page.locator('#campaign-description').fill(longDescription);
            await page.getByRole('button', { name: 'Save draft', exact: true }).click();
            await page
              .getByRole('heading', { name: 'Unfinished challenge', exact: true, level: 1 })
              .waitFor();
            const savedDraft = writes.filter((w) => w.action === 'create').at(-1).draft;
            assert.equal(savedDraft.registrationClosesAt, '');
            assert.equal(savedDraft.prizes.length, 0);
            assert.equal(savedDraft.fixtureIds.length, 0);
            assert.equal(savedDraft.description, longDescription.trim());
            await reload();
            await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
            assert.equal(
              await page.getByLabel('Registration deadline', { exact: true }).inputValue(),
              '',
            );
            assert.equal(
              await page.locator('#campaign-description').inputValue(),
              longDescription.trim(),
            );
            assert.equal((await page.locator('body').innerText()).includes('Invalid Date'), false);
            finished.rehearsal = true;
            finished.draft.rehearsal = true;
            finished.awards[0].status = 'address-needed';
            finished.awards[0].transactionHash = null;
            delete finished.awards[0].receivingAddress;
            admin = false;
            await navigate(base + '/season/?view=competitions&campaign=calls');
            await page.getByText('Rehearsal award', { exact: true }).waitFor();
            assert.equal(
              await page
                .getByRole('button', { name: 'Add receiving address', exact: true })
                .count(),
              0,
            );
            assert.equal(
              await page
                .getByRole('button', { name: 'Review receiving address', exact: true })
                .count(),
              0,
            );
            admin = true;
            await artworkJourney({
              page,
              base,
              campaigns,
              writes,
              artworkState,
              width,
              engineName,
              output,
              navigate,
              reload,
            });
            await require('./competition-entry-browser.cjs')({
              page,
              base,
              campaigns,
              createCampaign,
              account,
              fixtures,
              navigate,
              reload,
              width,
              engineName,
              output,
            });
            viewerId = 'different-account';
            await navigate(base + '/season/?view=competitions&campaign=calls');
            await page.getByText('Competitions could not be loaded', { exact: true }).waitFor();
            assert.equal(
              await page.getByText('A place among the best.', { exact: true }).count(),
              0,
            );
            assert.deepEqual(errors, []);
            completed++;
            console.log(
              `${engineName} ${width}: registration, shared slip, 8 fixtures, 4 exact prizes, publication, deletion, Five route, final awards and admin guards passed.`,
            );
          } catch (error) {
            await page.screenshot({
              path: path.join(output, `${engineName}-${width}-failure.png`),
              fullPage: true,
            });
            fs.writeFileSync(
              path.join(output, `${engineName}-${width}-failure.txt`),
              await page.locator('body').innerText(),
            );
            throw error;
          } finally {
            await context.close();
          }
        }
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log(
    `${completed} built-app campaign browser journeys passed. Synthetic API only; no live funds or provider calls.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

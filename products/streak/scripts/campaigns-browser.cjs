/* Actual built React app, isolated synthetic API. No live keys, wallets, databases or providers. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium, webkit } = require('playwright');
const { chooseOption } = require('./browser-select.cjs');

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
        home: { name: f.home, code: 'HOM' },
        away: { name: f.away, code: 'AWY' },
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
          const availableGameweeks = gameweeks.map((week) => ({ ...week }));
          let optionsReads = 0;
          const campaigns = [createCampaign(), createCampaign('five', 'five')];
          page.on('pageerror', (error) => errors.push(error.message));
          await context.route('**/*', async (route) => {
            const req = route.request(),
              url = new URL(req.url());
            if (url.origin !== base) return route.abort();
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
              const result = (id = null) => ({
                admin,
                viewerId,
                now: iso(),
                campaigns,
                detail: campaigns.find((c) => c.id === id) ?? null,
              });
              if (req.method() === 'GET') {
                if (url.searchParams.get('action') === 'options') optionsReads++;
                return json(
                  url.searchParams.get('action') === 'options'
                    ? { fixtures, gameweeks: availableGameweeks }
                    : result(url.searchParams.get('id')),
                );
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
            await page.goto(base + '/season/?view=competitions&campaign=calls');
            await page.getByRole('heading', { name: 'Fixture Challenge', exact: true }).waitFor();
            await page.getByRole('button', { name: 'Join competition', exact: true }).click();
            await page
              .getByRole('button', { name: 'Agree & join competition', exact: true })
              .click();
            await page.getByText('You are registered · Rank #1', { exact: true }).waitFor();
            assert.equal(campaigns[0].own.points, 0);
            assert.equal(campaigns[0].leaderboard[0].participated, false);
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
            await page.getByRole('button', { name: 'Close prediction slip', exact: true }).click();
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
            await page.goto(base + '/season/?view=competitions&campaign=five');
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
            await page.goto(base + '/season/?view=competitions&campaign=calls');
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
            await page.reload();
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
            await page.reload();
            await page.getByText('Competition archived', { exact: true }).waitFor();
            await page.getByText('Prize paid', { exact: true }).waitFor();
            admin = true;
            await page.goto(base + '/season/?view=competitions');
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
            await page.reload();
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
            await page.goto(base + '/season/?view=competitions&campaign=calls');
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
            viewerId = 'different-account';
            await page.reload();
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

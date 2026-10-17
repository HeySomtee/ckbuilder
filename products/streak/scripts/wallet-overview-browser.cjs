/* Isolated real wallet components and CCC, with synthetic API and no external services. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { chromium, webkit } = require('playwright');

async function main() {
  process.env.NODE_ENV = 'production';
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-wallet-overview-'));
  const { build } = await import('vite');
  await build({
    configFile: false,
    root: path.resolve(__dirname, '..'),
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
    build: {
      outDir: temp,
      emptyOutDir: true,
      minify: false,
      lib: {
        entry: path.join(__dirname, 'wallet-overview-fixture.tsx'),
        formats: ['es'],
        fileName: () => 'overview.js',
      },
    },
  });
  const css = fs.readdirSync(temp).filter((file) => file.endsWith('.css'));
  const sdkFiles = fs
    .readdirSync(temp)
    .filter(
      (file) =>
        file.endsWith('.js') &&
        fs.readFileSync(path.join(temp, file), 'utf8').includes('ccc-connector'),
    );
  assert.ok(sdkFiles.length);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end(
        `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wallet component check</title>${css.map((file) => `<link rel="stylesheet" href="/${file}">`).join('')}<div id="root"></div><script type="module" src="/overview.js"></script>`,
      );
      return;
    }
    const file = path.resolve(temp, '.' + url.pathname);
    if (
      path.dirname(file) !== path.resolve(temp) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : 'text/javascript');
    res.end(fs.readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser, activePage, phase;
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      browser = await engine.launch({ headless: true });
      for (const width of [390, 1440]) {
        phase = `${name} ${width}: initial wallet`;
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          reducedMotion: 'reduce',
          serviceWorkers: 'block',
        });
        const external = [],
          errors = [],
          requests = [],
          writes = [];
        let account = null,
          badLink = false,
          failDisconnect = false;
        await context.route('**/*', (route) => {
          const req = route.request(),
            url = new URL(req.url());
          requests.push(url.pathname);
          if (url.origin !== base) {
            external.push(url.href);
            return route.abort();
          }
          const json = (data, status = 200) =>
            route.fulfill({ contentType: 'application/json', status, body: JSON.stringify(data) });
          if (url.pathname === '/api/me')
            return account ? json({ user: account }) : json({ error: 'Not signed in.' }, 401);
          if (req.method() === 'POST') {
            writes.push(url.pathname);
            if (url.pathname === '/api/integrations/telegram/connect')
              return json({
                url: badLink
                  ? 'https://example.com/unsafe'
                  : 'https://t.me/StreakTestBot?start=link_abcdefghijkLMNOP12345678',
                expiresAt: new Date(Date.now() + 900_000).toISOString(),
              });
            if (url.pathname === '/api/integrations/telegram/disconnect') {
              if (failDisconnect) return json({ error: 'Synthetic disconnect unavailable.' }, 503);
              account = { ...account, telegramConnected: false, telegramUsername: null };
              return json({ user: account });
            }
            return json({ error: 'Unexpected mutation.' }, 400);
          }
          return route.continue();
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        const page = await context.newPage();
        activePage = page;
        page.on('pageerror', (error) => {
          errors.push(error.message);
          console.error('Wallet component error:', error.message);
        });
        await page.goto(base);
        await page.getByRole('button', { name: 'Connect testnet wallet', exact: true }).waitFor();
        assert.equal(await page.getByRole('region', { name: 'Wallet summary' }).count(), 0);
        assert.ok(
          !requests.some((value) => sdkFiles.some((file) => value === '/' + file)),
          'Unconnected browsing does not download the wallet SDK.',
        );
        async function connect() {
          await page.getByRole('button', { name: 'Connect testnet wallet', exact: true }).click();
          await page.locator('ccc-connector').waitFor();
          await page.evaluate(async () =>
            (await import('/overview.js')).connectSynthetic(
              document.querySelector('ccc-connector'),
            ),
          );
          await page.getByRole('button', { name: 'Disconnect wallet', exact: true }).waitFor();
        }
        await connect();
        const overview = page.getByRole('region', { name: 'My Account overview' });
        await overview.getByText('1,234.00000001 tCKB', { exact: true }).waitFor();
        const address = await page.evaluate(() => window.syntheticEvm.address);
        await overview.getByRole('button', { name: 'Copy wallet address', exact: true }).click();
        assert.equal(
          await page.evaluate(async () => (await import('/overview.js')).copiedAddress()),
          address,
        );
        await overview.getByText('Copied', { exact: true }).waitFor();
        phase = `${name} ${width}: balance failure and refresh`;
        await page.evaluate(async () => (await import('/overview.js')).balanceFailure(true));
        await overview.getByRole('button', { name: 'Refresh balance', exact: true }).click();
        await overview.getByText('Balance unavailable', { exact: true }).waitFor();
        assert.equal(await overview.getByText('1,234.00000001 tCKB', { exact: true }).count(), 0);
        await page.evaluate(async () => {
          const fixture = await import('/overview.js');
          fixture.balanceFailure(false);
          fixture.setCapacity('99900000000');
        });
        await overview.getByRole('button', { name: 'Refresh balance', exact: true }).click();
        await overview.getByText('999 tCKB', { exact: true }).waitFor();
        phase = `${name} ${width}: Telegram connection`;
        account = {
          id: 'owner',
          username: 'streakfan',
          walletAddress: address,
          telegramConnected: false,
          telegramUsername: null,
          telegramAvailable: true,
        };
        await overview
          .getByRole('button', { name: 'Sign in to connect Telegram', exact: true })
          .click();
        await overview.getByRole('button', { name: 'Connect Telegram', exact: true }).waitFor();
        badLink = true;
        await overview.getByRole('button', { name: 'Connect Telegram', exact: true }).click();
        await overview
          .getByText('Telegram returned an invalid or expired connection link.', { exact: true })
          .waitFor();
        assert.equal(
          await overview.getByRole('link', { name: 'Open Telegram', exact: true }).count(),
          0,
        );
        badLink = false;
        await overview.getByRole('button', { name: 'Connect Telegram', exact: true }).click();
        await overview.getByRole('link', { name: 'Open Telegram', exact: true }).waitFor();
        assert.equal(writes.length, 2, 'Only explicit connection clicks create Telegram links.');
        account = { ...account, id: 'replacement-owner', username: 'nextfan' };
        await page.evaluate(async () => (await import('/overview.js')).refreshAccount());
        await overview.getByRole('button', { name: 'Connect Telegram', exact: true }).waitFor();
        assert.equal(await overview.getByRole('link', { name: 'Open Telegram', exact: true }).count(), 0, 'A pending Telegram link never crosses accounts.');
        await overview.getByRole('button', { name: 'Connect Telegram', exact: true }).click();
        await overview.getByRole('link', { name: 'Open Telegram', exact: true }).waitFor();
        account = { ...account, telegramConnected: true, telegramUsername: 'streak_fan' };
        await overview.getByRole('button', { name: 'Check connection', exact: true }).click();
        await overview.getByText('Connected as @streak_fan', { exact: true }).waitFor();
        failDisconnect = true;
        await overview.getByRole('button', { name: 'Disconnect Telegram', exact: true }).click();
        await overview.getByText('Synthetic disconnect unavailable.', { exact: true }).waitFor();
        assert.equal(
          await overview.getByText('Connected as @streak_fan', { exact: true }).count(),
          1,
        );
        failDisconnect = false;
        await overview.getByRole('button', { name: 'Disconnect Telegram', exact: true }).click();
        await overview.getByRole('button', { name: 'Connect Telegram', exact: true }).waitFor();
        phase = `${name} ${width}: navigation, reload and account invalidation`;
        await overview.getByRole('button', { name: /Your predictions/ }).click();
        await page.getByText('Activity opened', { exact: true }).waitFor();
        await overview.getByRole('button', { name: /Transaction recovery/ }).click();
        await page.getByText('Recovery opened', { exact: true }).waitFor();
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          true,
        );
        await page.reload();
        await overview
          .getByRole('button', { name: 'Connect testnet wallet', exact: true })
          .waitFor();
        assert.equal(await page.locator('ccc-connector').count(), 0);
        assert.equal(await overview.getByText('999 tCKB', { exact: true }).count(), 0);
        await connect();
        await overview.getByText('1,234.00000001 tCKB', { exact: true }).waitFor();
        await page.evaluate(() => window.syntheticEvm.replace());
        await overview
          .getByRole('button', { name: 'Connect testnet wallet', exact: true })
          .waitFor();
        assert.equal(await overview.getByText('1,234.00000001 tCKB', { exact: true }).count(), 0);
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        assert.ok(
          writes.every((value) =>
            [
              '/api/integrations/telegram/connect',
              '/api/integrations/telegram/disconnect',
            ].includes(value),
          ),
        );
        await context.close();
        console.log(`Wallet overview ${name} ${width}: passed.`);
      }
      await browser.close();
      browser = undefined;
    }
  } catch (error) {
    console.error('Wallet overview phase:', phase);
    if (activePage && !activePage.isClosed())
      console.error((await activePage.locator('body').innerText()).slice(-6000));
    throw error;
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
    assert.equal(path.dirname(path.resolve(temp)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temp).startsWith('streak-wallet-overview-'));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

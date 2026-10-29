/* Built startup UI only. Static loopback assets; every API read is held, no wallets or services. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
// A deliberately held module leaves WebKit's document.fonts.ready pending.
// Startup uses system Arial; capture that real pending state without waiting for document readiness.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const { chromium, webkit } = require('playwright');

const publicRoot = path.resolve(__dirname, '../public');
const html = fs.readFileSync(path.join(publicRoot, 'season/index.html'), 'utf8');
const entry = html.match(/<script\b[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
assert.ok(entry, 'Build the frontend before running startup checks.');
assert.ok(html.includes('id="streak-startup"'), 'The built entry must contain the startup UI.');
const evidence =
  process.env.STREAK_SCREENSHOTS || path.resolve(__dirname, '../../../.quality-artifacts');
fs.mkdirSync(evidence, { recursive: true });
const types = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const target = ['/', '/season', '/season/', '/welcome', '/welcome/'].includes(url.pathname)
    ? '/season/index.html'
    : url.pathname;
  const filename = path.resolve(publicRoot, '.' + decodeURIComponent(target));
  const relative = path.relative(publicRoot, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(fs.readFileSync(filename));
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function fixture(browser, base, options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 390, height: 900 },
    serviceWorkers: 'block',
    reducedMotion: options.reducedMotion || 'no-preference',
    javaScriptEnabled: options.javaScriptEnabled !== false,
  });
  await context.addInitScript(
    ({ inspectFastStartup, inspectLanding, hiddenDocument, reactFailure }) => {
      if (hiddenDocument) {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { get: () => 'hidden' });
      }
      if (reactFailure) {
        const createElement = document.createElement.bind(document);
        document.createElement = function (name, ...args) {
          if (name === 'nav') throw new Error('Synthetic startup render failure.');
          return createElement(name, ...args);
        };
      }
      const probe = { ready: null, logoFrame: null, exiting: null, removedAt: null };
      window.__streakStartupProbe = probe;
      if (inspectLanding) {
        probe.landing = { frames: 0, splashVisible: false, rootInert: false };
        const inspectFrame = () => {
          const splash = document.getElementById('streak-startup');
          const root = document.getElementById('root');
          probe.landing.frames++;
          probe.landing.splashVisible ||= !!splash && splash.getBoundingClientRect().height > 0;
          probe.landing.rootInert ||= root?.inert === true;
          requestAnimationFrame(inspectFrame);
        };
        requestAnimationFrame(inspectFrame);
      }
      let seenSplash = false;
      const observeExit = () => {
        const splash = document.getElementById('streak-startup');
        if (splash) seenSplash = true;
        if (splash?.dataset.phase === 'exiting' && !probe.exiting) {
          probe.exiting = {
            at: performance.now(),
            rootInert: document.getElementById('root')?.inert ?? false,
            inert: splash.inert,
            hiddenFromAssistiveTech: splash.getAttribute('aria-hidden') === 'true',
            pointerEvents: getComputedStyle(splash).pointerEvents,
          };
        }
        if (seenSplash && !splash && probe.removedAt === null) probe.removedAt = performance.now();
      };
      new MutationObserver(observeExit).observe(document, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-phase'],
      });
      document.addEventListener('streak:shell-ready', () => {
        queueMicrotask(() => {
          if (probe.ready) return;
          const splash = document.getElementById('streak-startup');
          const root = document.getElementById('root');
          const snapshot = {
            at: performance.now(),
            present: !!splash,
            phase: splash?.dataset.phase ?? null,
            rootMounted: !!root?.firstElementChild,
            rootInert: root?.inert ?? false,
            inert: splash?.inert ?? false,
            hiddenFromAssistiveTech: splash?.getAttribute('aria-hidden') === 'true',
            pointerEvents: splash ? getComputedStyle(splash).pointerEvents : null,
            pointerReachesShell: null,
            keyboardReachesShell: null,
          };
          if (inspectFastStartup && splash && root) {
            const link = [...root.querySelectorAll('nav a')].find((node) => {
              const rect = node.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            if (link) {
              const rect = link.getBoundingClientRect();
              snapshot.pointerReachesShell = root.contains(
                document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
              );
              link.focus({ preventScroll: true });
              snapshot.keyboardReachesShell = document.activeElement === link;
            }
          }
          probe.ready = snapshot;
          if (!splash) probe.removedAt = performance.now();
          observeExit();
        });
      });
      if (inspectFastStartup) {
        const observeLogo = () => {
          const logo = document.querySelector('.streak-startup-logo');
          if (logo?.complete && logo.naturalWidth > 0) {
            const rect = logo.getBoundingClientRect();
            const canvas = document.createElement('canvas');
            canvas.width = 215;
            canvas.height = 55;
            const drawing = canvas.getContext('2d');
            drawing.drawImage(logo, 0, 0, canvas.width, canvas.height);
            const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height).data;
            let paintedPixels = 0;
            for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 32) paintedPixels++;
            probe.logoFrame = {
              at: performance.now(),
              visible:
                rect.width > 0 && rect.height > 0 && getComputedStyle(logo).visibility !== 'hidden',
              paintedPixels,
            };
            return;
          }
          if (probe.removedAt === null) requestAnimationFrame(observeLogo);
        };
        requestAnimationFrame(observeLogo);
      }
    },
    {
      inspectFastStartup: options.inspectFastStartup === true,
      inspectLanding: options.inspectLanding === true,
      hiddenDocument: options.hiddenDocument === true,
      reactFailure: options.reactFailure === true,
    },
  );
  const bundle = deferred();
  const logo = deferred();
  const api = deferred();
  const apiObserved = deferred();
  const observations = { apiStarted: 0, apiCompleted: 0, external: [], errors: [] };
  let failBundle = Boolean(options.failBundle);
  let holdBundle = options.holdBundle !== false;
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      observations.external.push(url.origin);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      observations.apiStarted++;
      apiObserved.resolve();
      await api.promise;
      observations.apiCompleted++;
      return route.abort();
    }
    if (options.missingStartupCss && url.pathname === '/startup.css') return route.abort();
    if (options.missingController && url.pathname === '/startup.js') return route.abort();
    if (options.failingController && url.pathname === '/startup.js')
      return route.fulfill({
        contentType: 'application/javascript',
        body: "document.getElementById('root').inert = true; throw new Error('Synthetic startup controller failure.');",
      });
    if (url.pathname === '/brand/on-form-splash.svg') {
      if (options.holdLogo) await logo.promise;
      if (options.failLogo) return route.abort();
    }
    if (url.pathname === entry) {
      if (holdBundle) await bundle.promise;
      return failBundle ? route.abort() : route.continue();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => socket.close());
  const page = await context.newPage();
  page.on('pageerror', (error) => observations.errors.push(error.message));
  return {
    context,
    page,
    observations,
    apiObserved: apiObserved.promise,
    releaseLogo() {
      logo.resolve();
    },
    release({ fail = failBundle } = {}) {
      failBundle = fail;
      holdBundle = false;
      bundle.resolve();
    },
    async close() {
      bundle.resolve();
      logo.resolve();
      api.resolve();
      await context.close();
    },
  };
}

async function shellReady(fixture, { expectData = true } = {}) {
  await fixture.page.waitForFunction(
    () =>
      document.documentElement.dataset.streakShellReady === 'true' &&
      window.__streakStartupProbe.ready,
  );
  const ready = await fixture.page.evaluate(() => window.__streakStartupProbe.ready);
  assert.equal(ready.rootMounted, true, 'The application shell must mount behind the splash.');
  if (!expectData) return ready;
  // The shell's layout effect can precede React Query's passive effect in WebKit.
  // Observe the read beginning without releasing its response or delaying shell readiness.
  let timer;
  try {
    await Promise.race([
      fixture.apiObserved,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('App API read did not start.')), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
  assert.ok(fixture.observations.apiStarted > 0, 'App API reads should have started.');
  assert.equal(fixture.observations.apiCompleted, 0, 'The shell must mount while API reads wait.');
  return ready;
}

async function removed(fixture, { maximumAfterReady = 3500 } = {}) {
  await fixture.page.locator('#streak-startup').waitFor({
    state: 'detached',
    timeout: maximumAfterReady + 1000,
  });
  const probe = await fixture.page.evaluate(() => window.__streakStartupProbe);
  assert.ok(
    probe.removedAt - probe.ready.at < maximumAfterReady,
    `Startup removal must remain bounded (${Math.round(probe.removedAt - probe.ready.at)}ms).`,
  );
  assert.equal(await fixture.page.locator('#root').evaluate((n) => n.inert), false);
  if (probe.exiting) {
    assert.equal(probe.exiting.rootInert, false, 'Decorative exit must release the application.');
    assert.equal(
      probe.exiting.inert,
      true,
      'The exiting splash must leave the keyboard available.',
    );
    assert.equal(probe.exiting.hiddenFromAssistiveTech, true);
    assert.equal(
      probe.exiting.pointerEvents,
      'none',
      'The exiting splash must not intercept input.',
    );
    assert.ok(probe.removedAt - probe.exiting.at < 750, 'The decorative fade must be bounded.');
  }
  return probe;
}

async function mounted(fixture, options) {
  await shellReady(fixture, options);
  return removed(fixture, options);
}

async function main() {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  let groups = 0;
  try {
    for (const [engineName, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        for (const width of [320, 390, 1440]) {
          const f = await fixture(browser, base, { width });
          try {
            await f.page.goto(base + '/season/', { waitUntil: 'commit' });
            await f.page.locator('#streak-startup').waitFor();
            await f.page.waitForTimeout(2500);
            assert.equal(
              await f.page
                .locator('.streak-startup-logo')
                .evaluate((n) => n.complete && n.naturalWidth > 0),
              true,
            );
            assert.equal(
              await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
              false,
            );
            await f.page.screenshot({
              path: path.join(evidence, `startup-integration-${engineName}-${width}.png`),
            });
            if (width === 390) {
              await f.page.locator('#streak-startup-actions').waitFor();
              await f.page.locator('#streak-startup-retry').focus();
            }
            assert.equal(
              await f.page.getByRole('button', { name: 'Open Streak', exact: true }).isVisible(),
              false,
              'Skip must not expose an application whose bundle has not mounted.',
            );
            f.release();
            await mounted(f, { maximumAfterReady: 1000 });
            if (width === 390)
              assert.equal(await f.page.evaluate(() => document.activeElement.id), 'root');
            await f.page.waitForFunction(() =>
              [...document.querySelectorAll('.streak-wordmark')].every(
                (n) => n.complete && n.naturalWidth > 0,
              ),
            );
            const nav = f.page.getByRole('navigation', {
              name: width < 700 ? 'Mobile navigation' : 'Main navigation',
              exact: true,
            });
            await nav.getByRole('link', { name: 'Overview', exact: true }).click();
            await f.page.waitForURL(/view=overview/);
            assert.equal(
              await f.page.locator('#streak-startup').count(),
              0,
              'SPA navigation must not replay startup.',
            );
            assert.equal(
              await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
              false,
            );
            if (width !== 320)
              await f.page.screenshot({
                path: path.join(evidence, `startup-integration-${engineName}-${width}-shell.png`),
              });
            assert.deepEqual(f.observations.external, []);
            assert.deepEqual(f.observations.errors, []);
            groups++;
          } finally {
            await f.close();
          }
        }

        const fast = await fixture(browser, base, {
          width: 390,
          holdBundle: false,
          inspectFastStartup: true,
        });
        try {
          await fast.page.goto(base + '/season/', { waitUntil: 'commit' });
          const ready = await shellReady(fast);
          assert.equal(ready.present, true, 'Fast startup must retain a readable presentation.');
          assert.equal(ready.phase, 'presenting');
          assert.equal(ready.rootInert, true, 'The shell must not take input beneath the splash.');
          assert.equal(
            ready.inert,
            false,
            'The presentation must retain its accessible skip button.',
          );
          assert.equal(ready.hiddenFromAssistiveTech, false);
          assert.equal(ready.pointerReachesShell, false);
          assert.equal(ready.keyboardReachesShell, false);
          await fast.page.getByRole('button', { name: 'Open Streak', exact: true }).waitFor();
          const navLink = fast.page.locator('#root nav a:visible').first();
          const box = await navLink.boundingBox();
          await fast.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          assert.equal(
            new URL(fast.page.url()).search,
            '',
            'Pointer input must not click through.',
          );
          const probe = await removed(fast);
          assert.ok(probe.logoFrame?.visible, 'An unheld entry must paint the startup logo.');
          assert.ok(probe.logoFrame.paintedPixels > 20, 'The first logo frame must not be blank.');
          assert.ok(
            probe.exiting.at - probe.logoFrame.at >= 1850,
            'The visible artwork must receive approximately two seconds before automatic exit.',
          );
          assert.ok(
            probe.exiting.at - probe.logoFrame.at < 2600,
            'A fast entry must not add a second presentation interval.',
          );
          assert.equal(fast.observations.apiCompleted, 0);
          assert.deepEqual(fast.observations.external, []);
          assert.deepEqual(fast.observations.errors, []);
          groups++;
        } finally {
          await fast.close();
        }

        for (const exitWith of ['button', 'Escape']) {
          const f = await fixture(browser, base, { holdBundle: false });
          try {
            await f.page.goto(base + '/season/', { waitUntil: 'commit' });
            await shellReady(f);
            const skip = f.page.getByRole('button', { name: 'Open Streak', exact: true });
            await f.page.keyboard.press('Tab');
            assert.equal(await skip.evaluate((n) => document.activeElement === n), true);
            const exitRequestedAt = await f.page.evaluate(() => performance.now());
            if (exitWith === 'button') await f.page.keyboard.press('Enter');
            else await f.page.keyboard.press('Escape');
            const probe = await removed(f);
            assert.ok(
              probe.exiting.at - exitRequestedAt < 400,
              'Skip must immediately release input.',
            );
            assert.equal(await f.page.evaluate(() => document.activeElement.id), 'root');
            assert.equal(f.observations.apiCompleted, 0);
            assert.deepEqual(f.observations.errors, []);
            groups++;
          } finally {
            await f.close();
          }
        }

        for (const logoState of ['delayed', 'stalled', 'missing']) {
          const f = await fixture(browser, base, {
            holdBundle: false,
            holdLogo: logoState !== 'missing',
            failLogo: logoState === 'missing',
            inspectFastStartup: logoState === 'delayed',
          });
          try {
            await f.page.goto(base + '/season/', { waitUntil: 'commit' });
            await shellReady(f);
            if (logoState === 'delayed') {
              await f.page.waitForTimeout(300);
              f.releaseLogo();
            }
            const probe = await removed(f, {
              maximumAfterReady: logoState === 'delayed' ? 3500 : 1800,
            });
            if (logoState === 'delayed') {
              assert.ok(
                probe.logoFrame.at > probe.ready.at,
                'The fixture must load artwork after React.',
              );
              assert.ok(probe.logoFrame.paintedPixels > 20);
              assert.ok(
                probe.exiting.at - probe.logoFrame.at >= 1850,
                'Delayed artwork must receive its presentation after it becomes visible.',
              );
            }
            assert.equal(f.observations.apiCompleted, 0);
            assert.deepEqual(f.observations.errors, []);
            groups++;
          } finally {
            await f.close();
          }
        }

        const failed = await fixture(browser, base, { failBundle: true });
        try {
          await failed.page.goto(base + '/season/', { waitUntil: 'commit' });
          await failed.page.waitForFunction(
            () => document.getElementById('streak-startup-actions')?.hidden === true,
          );
          failed.release();
          await failed.page.locator('#streak-startup-actions').waitFor();
          assert.equal(await failed.page.locator('#streak-startup-progress').isVisible(), false);
          assert.equal(
            await failed.page
              .getByRole('link', { name: 'Open current Wallet', exact: true })
              .getAttribute('href'),
            '/index.html#wallet',
          );
          await failed.page.screenshot({
            path: path.join(evidence, `startup-integration-${engineName}-error.png`),
          });
          failed.release({ fail: false });
          await failed.page.locator('#streak-startup-retry').click();
          await mounted(failed);
          groups++;
        } finally {
          await failed.close();
        }

        for (const controllerState of ['missing', 'crashed']) {
          for (const failBundle of [true, false]) {
            const f = await fixture(browser, base, {
              missingController: controllerState === 'missing',
              failingController: controllerState === 'crashed',
              failBundle,
            });
            try {
              await f.page.goto(base + '/season/', { waitUntil: 'commit' });
              await f.page.locator('#streak-startup-actions').waitFor();
              f.release();
              if (failBundle) {
                await f.page.getByRole('link', { name: 'Try again', exact: true }).waitFor();
                await f.page
                  .getByRole('link', { name: 'Open current Wallet', exact: true })
                  .waitFor();
                assert.equal(
                  await f.page.locator('#streak-startup-retry').getAttribute('href'),
                  '',
                );
              } else {
                const probe = await mounted(f, { maximumAfterReady: 500 });
                assert.equal(
                  probe.ready.present,
                  false,
                  'A failed controller must not cover the shell.',
                );
              }
              groups++;
            } finally {
              await f.close();
            }
          }
        }

        const reduced = await fixture(browser, base, { reducedMotion: 'reduce' });
        try {
          await reduced.page.goto(base + '/season/', { waitUntil: 'commit' });
          await reduced.page.locator('#streak-startup').waitFor();
          await reduced.page.waitForFunction(() =>
            document
              .querySelector('.streak-startup-logo')
              ?.currentSrc.endsWith('/brand/on-form-splash-final.svg'),
          );
          assert.equal(
            await reduced.page
              .locator('#streak-startup-progress')
              .evaluate((n) => getComputedStyle(n, '::after').animationName),
            'none',
          );
          reduced.release();
          await mounted(reduced, { maximumAfterReady: 500 });
          assert.equal(
            await reduced.page.evaluate(() => window.__streakStartupProbe.ready.present),
            false,
            'Reduced motion must remove the splash immediately at shell readiness.',
          );
          await reduced.page
            .getByRole('navigation', { name: 'Mobile navigation', exact: true })
            .waitFor();
          groups++;
        } finally {
          await reduced.close();
        }

        for (const bypass of ['hidden', 'render failure']) {
          const f = await fixture(browser, base, {
            holdBundle: false,
            hiddenDocument: bypass === 'hidden',
            reactFailure: bypass === 'render failure',
          });
          try {
            await f.page.goto(base + '/season/', { waitUntil: 'commit' });
            const probe = await mounted(f, {
              maximumAfterReady: 500,
              expectData: bypass !== 'render failure',
            });
            assert.equal(
              probe.ready.present,
              false,
              `${bypass} must bypass presentation immediately.`,
            );
            if (bypass === 'render failure') {
              await f.page.getByRole('button', { name: 'Reload Streak', exact: true }).waitFor();
              await f.page
                .getByRole('link', { name: 'Open the current Wallet', exact: true })
                .waitFor();
            }
            groups++;
          } finally {
            await f.close();
          }
        }

        for (const landingRoute of ['/', '/welcome', '/welcome/']) {
          for (const missingController of [false, true]) {
            const f = await fixture(browser, base, {
              missingController,
              missingStartupCss: missingController && landingRoute === '/welcome/',
              inspectLanding: true,
            });
            try {
              await f.page.goto(base + landingRoute, { waitUntil: 'commit' });
              await f.page.locator('#root').waitFor({ state: 'attached' });
              await f.page.waitForFunction(() => window.__streakStartupProbe.landing.frames >= 3);
              assert.equal(await f.page.locator('#streak-startup').isVisible(), false);
              assert.equal(await f.page.locator('#root').evaluate((n) => n.inert), false);
              if (missingController) {
                await f.page
                  .getByRole('link', { name: 'Open current Wallet', exact: true })
                  .waitFor();
                await f.page.getByRole('link', { name: 'Try again', exact: true }).focus();
              }
              f.release();
              const probe = await mounted(f, { maximumAfterReady: 500 });
              assert.equal(
                probe.ready.present,
                false,
                'Landing content must never wait for branding.',
              );
              assert.equal(probe.ready.rootInert, false);
              if (missingController)
                assert.equal(await f.page.evaluate(() => document.activeElement.id), 'root');
              await f.page
                .getByRole('heading', { name: 'You know the game. Make it yours.' })
                .waitFor();
              assert.equal(await f.page.locator('#streak-landing-recovery').count(), 0);
              assert.deepEqual(
                await f.page.evaluate(() => ({
                  splashVisible: window.__streakStartupProbe.landing.splashVisible,
                  rootInert: window.__streakStartupProbe.landing.rootInert,
                })),
                { splashVisible: false, rootInert: false },
                'Landing frames must never paint the splash or disable input.',
              );
              assert.equal(f.observations.apiCompleted, 0);
              assert.deepEqual(f.observations.errors, []);
              groups++;
            } finally {
              await f.close();
            }
          }
        }

        const failedLanding = await fixture(browser, base, {
          failBundle: true,
          holdBundle: false,
          inspectLanding: true,
        });
        try {
          await failedLanding.page.goto(base + '/', { waitUntil: 'commit' });
          await failedLanding.page
            .getByRole('status')
            .filter({ hasText: 'Let’s get you back in.' })
            .waitFor();
          assert.equal(await failedLanding.page.locator('#streak-startup').count(), 0);
          assert.equal(await failedLanding.page.locator('#root').evaluate((n) => n.inert), false);
          await failedLanding.page
            .getByRole('link', { name: 'Open current Wallet', exact: true })
            .waitFor();
          groups++;
        } finally {
          await failedLanding.close();
        }

        for (const noJsRoute of ['/season/', '/', '/welcome', '/welcome/']) {
          const noJs = await fixture(browser, base, {
            javaScriptEnabled: false,
            holdBundle: false,
          });
          try {
            await noJs.page.goto(base + noJsRoute);
            await noJs.page
              .getByRole('heading', { name: 'Enable JavaScript to open Streak.' })
              .waitFor();
            assert.equal(await noJs.page.locator('#streak-startup').isVisible(), false);
            assert.equal(await noJs.page.locator('#root').evaluate((n) => n.inert), false);
            await noJs.page
              .getByRole('link', { name: 'Open current Wallet', exact: true })
              .waitFor();
            groups++;
          } finally {
            await noJs.close();
          }
        }
        const legacy = await fixture(browser, base, { failBundle: true, holdBundle: false });
        try {
          await legacy.page.goto(base + '/#wallet', { waitUntil: 'commit' });
          await legacy.page.waitForURL(base + '/index.html#wallet', { waitUntil: 'commit' });
          assert.equal(await legacy.page.locator('#streak-startup').count(), 0);
          groups++;
        } finally {
          await legacy.close();
        }
        console.log(
          `${engineName}: application-only startup, landing first frames and recovery, background shell/data, blocked click-through, skip/Escape focus, bounded exit, slow/missing logo, navigation, retry, missing/crashed controller, reduced motion, hidden document, render recovery, no-JavaScript and legacy redirects passed`,
        );
      } finally {
        await browser.close();
      }
    }
  } finally {
    await new Promise((done) => server.close(done));
  }
  console.log(
    `Startup browser checks passed: ${groups} groups. No API, provider, wallet or chain response used.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/* Isolated motion preview only. Start serve.cjs first; no app, API or wallet is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const base = 'http://127.0.0.1:4199';
const evidence = path.resolve(__dirname, '../../../../.quality-artifacts');
fs.mkdirSync(evidence, { recursive: true });

async function fixture(browser, options = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width || 390, height: 1000 },
    reducedMotion: options.reducedMotion || 'no-preference',
    serviceWorkers: 'block',
  });
  const observations = { external: [], api: [], sockets: [], errors: [] };
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      observations.external.push(url.href);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      observations.api.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    observations.sockets.push(socket.url());
    socket.close();
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => observations.errors.push(error.message));
  return { context, page, observations };
}

async function geometry(page) {
  return page.evaluate(() => {
    const result = {};
    for (const kind of ['circular', 'horizontal']) {
      const candidates = [...document.querySelectorAll(`.chain--${kind}`)]
        .filter((svg) => svg.getBoundingClientRect().width > 0)
        .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      const svg = candidates[0];
      if (!svg) throw new Error(`Missing visible ${kind} loader.`);
      const point = (node, x, y) => {
        const value = new DOMPoint(x, y).matrixTransform(node.getCTM());
        return { x: value.x, y: value.y };
      };
      result[kind] = {
        cells: [...svg.querySelectorAll('.cell')].map((cell) => {
          const box = cell.getBBox();
          const matrix = cell.getCTM();
          return {
            center: point(cell, box.x + box.width / 2, box.y + box.height / 2),
            left: point(cell, box.x, box.y + box.height / 2),
            right: point(cell, box.x + box.width, box.y + box.height / 2),
            scale: Math.hypot(matrix.a, matrix.b),
          };
        }),
        links: [...svg.querySelectorAll('.link')].map((link) => {
          const start = link.getPointAtLength(0);
          const end = link.getPointAtLength(link.getTotalLength());
          return {
            start: point(link, start.x, start.y),
            end: point(link, end.x, end.y),
            dash: getComputedStyle(link).strokeDashoffset,
          };
        }),
      };
    }
    return result;
  });
}

function span(values) {
  return Math.max(...values) - Math.min(...values);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function sample(page, count = 9, delay = 180) {
  const samples = [];
  for (let i = 0; i < count; i++) {
    samples.push(await geometry(page));
    if (i < count - 1) await page.waitForTimeout(delay);
  }
  return samples;
}

async function structure(page) {
  const loaders = await page.locator('.chain').evaluateAll((nodes) =>
    nodes.map((svg) => ({
      cells: [...svg.querySelectorAll('.cell')].map((cell) => ({
        tag: cell.tagName,
        width: cell.width.baseVal.value,
        height: cell.height.baseVal.value,
      })),
      links: svg.querySelectorAll('.link').length,
      decorative: svg.getAttribute('aria-hidden'),
    })),
  );
  assert.ok(loaders.length >= 2, 'Both loader variants must be visible in the preview.');
  for (const loader of loaders) {
    assert.equal(loader.cells.length, 3, 'Every loader must contain exactly three cells.');
    assert.equal(loader.links, 2, 'The three cells must retain two connecting links.');
    assert.equal(loader.decorative, 'true', 'Visible status text supplies the accessible label.');
    for (const cell of loader.cells) {
      assert.equal(cell.tag, 'rect');
      assert.equal(cell.width, cell.height, 'Loader cells must remain square.');
      assert.ok(cell.width > 0);
    }
  }
}

function moving(samples) {
  for (let i = 0; i < 3; i++) {
    const circles = samples.map((state) => state.circular.cells[i]);
    const angle = (state) => {
      const center = state.circular.cells.reduce(
        (sum, cell) => ({ x: sum.x + cell.center.x / 3, y: sum.y + cell.center.y / 3 }),
        { x: 0, y: 0 },
      );
      const cell = state.circular.cells[i].center;
      return Math.atan2(cell.y - center.y, cell.x - center.x);
    };
    const turn = angle(samples.at(-1)) - angle(samples[0]);
    assert.ok(
      Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.3,
      'Circular cells must rotate around their shared center.',
    );
    assert.ok(
      distance(circles[0].center, circles.at(-1).center) > 2,
      'Each circular cell must move around the orbit.',
    );
    const scales = circles.map((cell) => cell.scale);
    assert.ok(span(scales) > 0.005, 'Circular cells must visibly pulse as they rotate.');
    assert.ok(Math.max(...scales) / Math.min(...scales) < 1.35, 'The pulse must remain gentle.');
    const wave = samples.map((state) => state.horizontal.cells[i].center);
    assert.ok(span(wave.map((point) => point.y)) > 2, 'Every horizontal cell must rise and fall.');
    assert.ok(span(wave.map((point) => point.x)) < 1, 'The wave must retain horizontal spacing.');
  }
  for (let i = 0; i < 2; i++)
    assert.ok(
      span(
        samples.map(
          (state) => state.horizontal.cells[i].center.y - state.horizontal.cells[i + 1].center.y,
        ),
      ) > 2,
      'The horizontal cells must move with staggered wave phases, not fixed offsets.',
    );
  for (let i = 0; i < 2; i++) {
    assert.ok(
      new Set(samples.map((state) => state.horizontal.links[i].dash)).size > 1,
      'The horizontal connections must animate as well as the cells.',
    );
    for (const state of samples) {
      assert.ok(
        distance(state.horizontal.links[i].start, state.horizontal.cells[i].right) < 1.5,
        'Each link must remain attached to its moving starting cell.',
      );
      assert.ok(
        distance(state.horizontal.links[i].end, state.horizontal.cells[i + 1].left) < 1.5,
        'Each link must remain attached to its moving ending cell.',
      );
    }
  }
}

async function frozen(page, label) {
  // CSS pause commits at an animation frame boundary; sample after that handoff.
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.ready));
    await new Promise(requestAnimationFrame);
  });
  const samples = await sample(page, 3, 220);
  for (const state of samples.slice(1)) {
    for (const kind of ['circular', 'horizontal']) {
      for (let i = 0; i < 3; i++) {
        assert.ok(
          distance(samples[0][kind].cells[i].center, state[kind].cells[i].center) < 0.1,
          `${label} must stop ${kind} cell movement.`,
        );
        assert.ok(
          Math.abs(samples[0][kind].cells[i].scale - state[kind].cells[i].scale) < 0.001,
          `${label} must stop pulsing.`,
        );
      }
      assert.deepEqual(state[kind].links, samples[0][kind].links, `${label} must stop links.`);
    }
  }
}

async function controls(page) {
  const savedRows = await page.locator('.rows').innerText();
  const slow = page.getByRole('button', { name: 'Taking longer', exact: true });
  await slow.focus();
  await page.keyboard.press('Enter');
  assert.equal(await slow.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.states [aria-pressed="true"]').count(), 1);
  assert.equal(await page.locator('#payment-action').getAttribute('aria-busy'), 'true');
  await page.getByRole('button', { name: 'Needs attention', exact: true }).click();
  assert.equal(await page.locator('#payment-action').isEnabled(), true);
  assert.equal(await page.locator('#payment-action').getAttribute('aria-busy'), 'false');
  assert.equal(
    await page.locator('.canvas .chain').count(),
    0,
    'Errors must stop pending loaders.',
  );
  await page.locator('[data-retry]').click();
  assert.equal(await page.locator('body').getAttribute('data-state'), 'loading');
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  assert.equal(await page.locator('.canvas .chain').count(), 0, 'Completion must be static.');
  assert.equal(await page.locator('#payment-action').getAttribute('aria-busy'), 'false');
  await page.locator('#replay').click();
  assert.equal(await page.locator('body').getAttribute('data-state'), 'success');
  assert.match(await page.locator('#preview-status').textContent(), /illustrative/i);
  assert.equal(
    await page.locator('.rows').innerText(),
    savedRows,
    'State changes must retain rows.',
  );
  await page.locator('#dock-toggle').click();
  assert.equal(await page.locator('#dock-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('#dock-detail').isVisible(), true);
  await page.locator('#back-activity').click();
  assert.equal(
    await page.locator('.canvas-head h2').evaluate((node) => document.activeElement === node),
    true,
  );
  await page.locator('#dock-toggle').click();
  assert.equal(await page.locator('#dock-detail').isVisible(), false);
  await page.getByRole('button', { name: 'Loading', exact: true }).click();
}

async function main() {
  let groups = 0;
  for (const [engineName, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await engine.launch();
    try {
      for (const width of [320, 390, 1440]) {
        const f = await fixture(browser, { width });
        try {
          const response = await f.page.goto(base);
          assert.equal(response.status(), 200);
          assert.match(response.headers()['content-security-policy'], /connect-src 'none'/);
          await f.page.waitForFunction(() => {
            const image = document.querySelector('.studio-brand');
            return image?.complete && image.naturalWidth > 0;
          });
          await structure(f.page);
          moving(await sample(f.page));
          assert.equal(
            await f.page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
            false,
          );
          await f.page.screenshot({
            path: path.join(evidence, `loading-signature-refinement-${engineName}-${width}.png`),
            fullPage: true,
          });
          const pause = f.page.locator('#pause');
          await pause.click();
          assert.equal(await pause.getAttribute('aria-pressed'), 'true');
          await frozen(f.page, 'Pause');
          await pause.click();
          assert.equal(await pause.getAttribute('aria-pressed'), 'false');
          if (width === 390) moving(await sample(f.page));
          await f.page.locator('#reduce').check();
          await frozen(f.page, 'Reduced-motion checkbox');
          assert.equal(await f.page.locator('.chain animate,.chain animateTransform').count(), 0);
          await f.page.locator('#reduce').uncheck();
          if (width === 390) {
            moving(await sample(f.page));
            await f.page.evaluate(() => {
              Object.defineProperty(document, 'hidden', { configurable: true, value: true });
              document.dispatchEvent(new Event('visibilitychange'));
            });
            await frozen(f.page, 'Hidden document');
            await f.page.evaluate(() => {
              delete document.hidden;
              document.dispatchEvent(new Event('visibilitychange'));
            });
            moving(await sample(f.page));
          }
          await controls(f.page);
          await structure(f.page);
          assert.deepEqual(f.observations, { external: [], api: [], sockets: [], errors: [] });
          console.log(
            `${engineName} ${width}px: motion, connections, controls and recovery passed.`,
          );
          groups++;
        } finally {
          await f.context.close();
        }
      }
      const f = await fixture(browser, { reducedMotion: 'reduce' });
      try {
        await f.page.goto(base);
        await structure(f.page);
        await frozen(f.page, 'Operating-system reduced motion');
        await f.page.locator('#reduce').check();
        await f.page.locator('#reduce').uncheck();
        await frozen(f.page, 'Operating-system preference after checkbox toggle');
        assert.equal(await f.page.locator('.chain animate,.chain animateTransform').count(), 0);
        await f.page.emulateMedia({ reducedMotion: 'no-preference' });
        await f.page.waitForFunction(() => document.querySelector('.motion-study animate'));
        moving(await sample(f.page));
        assert.deepEqual(f.observations, { external: [], api: [], sockets: [], errors: [] });
        groups++;
      } finally {
        await f.context.close();
      }
      console.log(
        `${engineName}: three square cells, orbit/pulse, connected wave, pause/reduced motion, responsive states and focus passed.`,
      );
    } finally {
      await browser.close();
    }
  }
  console.log(
    `Loading signature preview checks passed: ${groups} groups. No API, wallet, provider or external request used.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

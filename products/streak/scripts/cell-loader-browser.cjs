/* Shared loader motion and real pending UI. Static loopback assets; no backend or wallet. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium, webkit } = require('playwright');

const publicRoot = path.resolve(__dirname, '../public');
const evidence =
  process.env.STREAK_SCREENSHOTS || path.resolve(__dirname, '../../../.quality-artifacts');
const moduleOnly = process.argv.includes('--module-only');
const contrastEvidence = [];
const controlStyles = [
  'design-system/styles.css',
  'design-system/predictions.css',
  'features/five/five.css',
  'features/survivor/survivor.css',
  'features/account/wallet.css',
  'features/direct/activity.css',
];
assert.ok(process.argv.slice(2).every((arg) => arg === '--module-only'));
fs.mkdirSync(evidence, { recursive: true });
const fixture = `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shared loading states</title><link rel="stylesheet" href="/cell-loader.css">
<style>body{margin:24px;background:#14201c;color:#edf2eb;font:16px Arial}main{max-width:540px}button{display:flex;align-items:center;gap:10px;min-height:44px;padding:10px 16px;border:1px solid #aec4b6;border-radius:10px;background:#25352c;color:inherit}#panel{display:flex;align-items:center;gap:12px;margin-top:24px}</style>
<main><h1>Working on your request</h1><button id="payment" disabled aria-busy="true"><span id="orbit" class="cell-loader-host" aria-hidden="true"></span>Waiting for wallet</button><div id="panel" role="status"><span id="wave" class="cell-loader-host" aria-hidden="true"></span>Reading your activity</div><div id="observed"></div></main>
<script type="module">
import {cellLoaderMarkup,registerCellLoader,observeCellLoaders} from '/cell-loader.js';
const variants=['orbit','wave'];
for(const variant of variants) document.getElementById(variant).innerHTML=cellLoaderMarkup(variant);
const svgs=variants.map(variant=>document.querySelector('#'+variant+' svg'));
let dispose=[];
const register=()=>{dispose=svgs.map(registerCellLoader)};
register();
window.loaderTest={
 stop(){dispose.forEach(stop=>stop())},
 remount(){dispose.forEach(stop=>stop());register()},
 observeCycle(){
  const root=document.getElementById('observed');
  const stop=observeCellLoaders(root);
  const host=document.createElement('span');host.innerHTML=cellLoaderMarkup('wave');
  const retired=host.firstElementChild;root.appendChild(host);host.remove();
  return new Promise(resolve=>requestAnimationFrame(()=>{
   const staleRegistered=retired.hasAttribute('data-paused');
   root.innerHTML=cellLoaderMarkup('wave');
   requestAnimationFrame(()=>{
    const live=root.firstElementChild;const registered=live.hasAttribute('data-paused');
    live.remove();requestAnimationFrame(()=>{
     const released=live.animationsPaused();stop();resolve({staleRegistered,registered,released});
    });
   });
  }));
 }
};
</script></html>`;
function controlsFixture(legacy) {
  const cases = legacy
    ? [
        ['', 'btn', 'Legacy secondary'],
        ['', 'btn btn-amber', 'Legacy primary'],
        ['', 'btn btn-down', 'Legacy destructive'],
      ]
    : [
        ['', '', 'Secondary'],
        ['prediction-slip', 'review-button', 'Payment approval'],
        ['five-page', 'btn primary', 'Save five'],
        ['', 'survivor-primary', 'Fund Survivor prize'],
        ['wallet-overview', 'wallet-primary', 'Wallet connection'],
        ['activity-ledger', '', 'Collect return'],
      ];
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pending button contrast</title><link rel="stylesheet" href="/cell-loader.css">
${legacy ? '<link rel="stylesheet" href="/styles.css">' : controlStyles.map((_, i) => `<link rel="stylesheet" href="/qa-control-style/${i}.css">`).join('')}
<style>body{margin:0;padding:24px;background:#14201c;color:#f1f3ed}.loader-control-cases{display:grid;gap:16px;max-width:540px}.loader-control-cases>section{position:static;width:auto;max-width:none;max-height:none;padding:12px;background:#14201c;display:grid;gap:8px}.loader-control-cases button{max-width:100%;display:flex;align-items:center;justify-content:center}.loader-control-cases h1{font-size:22px}</style>
<main class="loader-control-cases"><h1>Pending controls stay visible</h1>${cases.map(([parent, button, label], index) => `<section class="${parent}"><button class="${button}" disabled data-case="${label}" ${index === 3 ? '' : 'aria-busy="true"'}>${label}</button><button class="${button}" disabled data-inactive="${label}">Unavailable action</button></section>`).join('')}</main>
<script type="module">
import {cellLoaderMarkup,registerCellLoader} from '/cell-loader.js';
window.controlClicks=0;
for(const [index,button] of [...document.querySelectorAll('[data-case]')].entries()){
 const markup=cellLoaderMarkup(index%2 ? 'wave' : 'orbit');
 button.insertAdjacentHTML('afterbegin',${legacy ? 'markup' : '`<span class="cell-loader-host">${markup}</span>`'});
 registerCellLoader(button.querySelector('svg'));
 button.addEventListener('click',()=>window.controlClicks++);
}
window.controlsReady=true;
</script></html>`;
}
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
  if (url.pathname === '/loader-test') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end(fixture);
  }
  if (url.pathname === '/loader-controls') {
    res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
    return res.end(controlsFixture(url.searchParams.has('legacy')));
  }
  const style = /^\/qa-control-style\/(\d+)\.css$/.exec(url.pathname);
  if (style && controlStyles[Number(style[1])]) {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    return res.end(
      fs
        .readFileSync(
          path.resolve(__dirname, '../web/src', controlStyles[Number(style[1])]),
          'utf8',
        )
        .replaceAll('../../../public/', '/'),
    );
  }
  const pathname = ['/season', '/season/'].includes(url.pathname)
    ? '/season/index.html'
    : url.pathname;
  const filename = path.resolve(publicRoot, '.' + decodeURIComponent(pathname));
  const relative = path.relative(publicRoot, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return res.writeHead(403).end();
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) return res.writeHead(404).end();
  res.writeHead(200, {
    'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });
  res.end(fs.readFileSync(filename));
});

async function contextFor(
  browser,
  base,
  width,
  { reducedMotion = 'no-preference', app = false, legacy = false } = {},
) {
  const context = await browser.newContext({
    viewport: { width, height: 900 },
    reducedMotion,
    serviceWorkers: 'block',
  });
  const observations = { external: [], api: [], sockets: [], errors: [] };
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) {
      observations.external.push(url.href);
      return route.abort();
    }
    if (url.pathname.startsWith('/api/')) {
      observations.api.push(url.pathname);
      assert.ok(app, 'The standalone shared loader must never request an API.');
      assert.match(route.request().method(), /^(GET|HEAD)$/, 'Loading states only read data.');
      if (!legacy && url.pathname === '/api/me')
        return route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: '{"error":"Synthetic guest"}',
        });
      await held;
      return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', (socket) => {
    observations.sockets.push(socket.url());
    socket.close();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => observations.errors.push(error.message));
  return {
    context,
    page,
    observations,
    async close() {
      release();
      await context.close();
    },
  };
}

async function geometry(page, selector = 'main') {
  return page.locator(selector).evaluate((root) => {
    const result = {};
    for (const variant of ['orbit', 'wave']) {
      const svg = root.querySelector(`.cell-loader--${variant}`);
      if (!svg) continue;
      const point = (node, x, y) => {
        const p = new DOMPoint(x, y).matrixTransform(node.getCTM());
        return { x: p.x, y: p.y };
      };
      result[variant] = {
        cells: [...svg.querySelectorAll('.cell-block')].map((cell) => {
          const box = cell.getBBox(),
            matrix = cell.getCTM();
          return {
            center: point(cell, box.x + box.width / 2, box.y + box.height / 2),
            left: point(cell, box.x, box.y + box.height / 2),
            right: point(cell, box.x + box.width, box.y + box.height / 2),
            scale: Math.hypot(matrix.a, matrix.b),
          };
        }),
        links: [...svg.querySelectorAll('.cell-link')].map((link) => {
          const start = link.getPointAtLength(0),
            end = link.getPointAtLength(link.getTotalLength());
          const css = getComputedStyle(link);
          return {
            start: point(link, start.x, start.y),
            end: point(link, end.x, end.y),
            dash: Number.parseFloat(css.strokeDashoffset),
            opacity: Number(css.opacity),
          };
        }),
      };
    }
    return result;
  });
}
const span = (values) => Math.max(...values) - Math.min(...values);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Connecting links deliberately hold still from 30% to 64% of their 2.4s
// cycle (816ms). Observe longer than that hold so a valid animation cannot
// appear frozen simply because the browser starts sampling in that phase.
async function samples(page, count = 8, delay = 160, selector) {
  const values = [];
  for (let i = 0; i < count; i++) {
    values.push(await geometry(page, selector));
    if (i + 1 < count) await page.waitForTimeout(delay);
  }
  return values;
}
function moving(values) {
  for (const variant of Object.keys(values[0])) {
    for (let i = 0; i < 3; i++) {
      const cells = values.map((value) => value[variant].cells[i]);
      if (variant === 'orbit') {
        const angle = (value) => {
          const center = value.orbit.cells.reduce(
            (sum, cell) => ({ x: sum.x + cell.center.x / 3, y: sum.y + cell.center.y / 3 }),
            { x: 0, y: 0 },
          );
          return Math.atan2(
            value.orbit.cells[i].center.y - center.y,
            value.orbit.cells[i].center.x - center.x,
          );
        };
        const turn = angle(values.at(-1)) - angle(values[0]);
        assert.ok(
          Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > 0.2,
          'Cells rotate around their shared center.',
        );
        assert.ok(distance(cells[0].center, cells.at(-1).center) > 1, 'Every orbit cell moves.');
        assert.ok(span(cells.map((cell) => cell.scale)) > 0.003, 'Orbit cells gently pulse.');
        assert.ok(
          Math.max(...cells.map((cell) => cell.scale)) /
            Math.min(...cells.map((cell) => cell.scale)) <
            1.2,
        );
      } else {
        assert.ok(
          span(cells.map((cell) => cell.center.y)) > 0.8,
          'Native SMIL moves every wave cell.',
        );
        assert.ok(span(cells.map((cell) => cell.center.x)) < 0.05, 'Wave spacing stays fixed.');
      }
    }
    if (variant === 'wave')
      for (let i = 0; i < 2; i++) {
        assert.ok(
          span(
            values.map((value) => value.wave.cells[i].center.y - value.wave.cells[i + 1].center.y),
          ) > 0.8,
          'Wave phases are staggered.',
        );
        assert.ok(
          span(values.map((value) => value.wave.links[i].dash)) > 0.01,
          'Connections draw while moving.',
        );
        for (const value of values) {
          assert.ok(
            distance(value.wave.links[i].start, value.wave.cells[i].right) < 0.1,
            'Link starts at its moving cell.',
          );
          assert.ok(
            distance(value.wave.links[i].end, value.wave.cells[i + 1].left) < 0.1,
            'Link ends at its moving cell.',
          );
        }
      }
  }
}
async function frozen(page, selector) {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((animation) => animation.ready));
    await new Promise(requestAnimationFrame);
  });
  const [first, second] = await samples(page, 2, 220, selector);
  for (const variant of Object.keys(first)) {
    for (let i = 0; i < 3; i++) {
      assert.ok(
        distance(first[variant].cells[i].center, second[variant].cells[i].center) < 0.03,
        'Paused cells remain still.',
      );
      assert.ok(
        Math.abs(first[variant].cells[i].scale - second[variant].cells[i].scale) < 0.001,
        'Paused cells stop pulsing.',
      );
    }
    assert.deepEqual(second[variant].links, first[variant].links, 'Paused links remain still.');
  }
}
async function structure(page, selector = 'main', expectedVariants = ['orbit', 'wave']) {
  const values = await page.locator(`${selector} .cell-loader`).evaluateAll((svgs) =>
    svgs.map((svg) => ({
      variant: svg.classList.contains('cell-loader--orbit')
        ? 'orbit'
        : svg.classList.contains('cell-loader--wave')
          ? 'wave'
          : 'unknown',
      hidden: svg.getAttribute('aria-hidden'),
      focusable: svg.getAttribute('focusable'),
      cells: [...svg.querySelectorAll('rect')].map((cell) => [
        cell.width.baseVal.value,
        cell.height.baseVal.value,
      ]),
      links: svg.querySelectorAll('path.cell-link').length,
      box: { width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height },
    })),
  );
  assert.ok(values.length, 'A real loading state renders a shared loader.');
  assert.deepEqual(
    [...new Set(values.map((value) => value.variant))].sort(),
    [...expectedVariants].sort(),
    'Every expected loader variant is present.',
  );
  for (const value of values) {
    assert.equal(value.cells.length, 3);
    assert.equal(value.links, 2);
    assert.equal(value.hidden, 'true');
    assert.equal(value.focusable, 'false');
    for (const [width, height] of value.cells) {
      assert.equal(width, height);
      assert.ok(width > 0);
    }
    assert.ok(
      value.box.width >= 20 && value.box.width <= 48,
      'Compact loader keeps its intended width.',
    );
    assert.ok(
      value.box.height >= 18 && value.box.height <= 26,
      'Context CSS must not stretch the loader.',
    );
  }
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'No horizontal overflow.',
  );
}
function clean(observations) {
  assert.deepEqual(observations.external, []);
  assert.deepEqual(observations.sockets, []);
  assert.deepEqual(observations.errors, []);
}
async function pendingControls(browser, base, width, name) {
  for (const legacy of [false, true]) {
    const f = await contextFor(browser, base, width);
    try {
      await f.page.goto(base + '/loader-controls' + (legacy ? '?legacy' : ''));
      await f.page.waitForFunction(() => window.controlsReady);
      const inspect = () =>
        f.page.locator('[data-case]').evaluateAll((buttons) => {
          const rgba = (value) => {
            const values = value.match(/[\d.]+/g).map(Number);
            return [...values.slice(0, 3), values[3] ?? 1];
          };
          const mix = (front, back, alpha = front[3]) =>
            front.slice(0, 3).map((channel, i) => channel * alpha + back[i] * (1 - alpha));
          const luminance = (rgb) =>
            rgb.reduce((sum, channel, i) => {
              const normalized = channel / 255;
              return (
                sum +
                (normalized <= 0.04045
                  ? normalized / 12.92
                  : ((normalized + 0.055) / 1.055) ** 2.4) *
                  [0.2126, 0.7152, 0.0722][i]
              );
            }, 0);
          const ratio = (first, second) => {
            const a = luminance(first),
              b = luminance(second);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          };
          return buttons.map((button) => {
            let backgrounds = [[0, 0, 0]],
              opacity = 1;
            const ancestors = [];
            for (let node = button; node; node = node.parentElement) ancestors.unshift(node);
            for (const node of ancestors) {
              const css = getComputedStyle(node);
              backgrounds = backgrounds.map((background) =>
                mix(rgba(css.backgroundColor), background),
              );
              const stops = css.backgroundImage.match(/rgba?\([^)]+\)/g);
              if (stops?.length)
                backgrounds = stops.flatMap((stop) =>
                  backgrounds.map((background) => mix(rgba(stop), background)),
                );
              opacity *= Number(css.opacity);
            }
            const svg = button.querySelector('svg'),
              css = getComputedStyle(svg);
            const orbit = svg.classList.contains('cell-loader--orbit');
            const reduced = svg.dataset.reduced === 'true';
            const floor = reduced
              ? 1
              : Number(css.getPropertyValue(orbit ? '--cell-pulse-min' : '--cell-stroke-min'));
            const cells = [...svg.querySelectorAll('.cell-block')].map((cell) => {
              const style = getComputedStyle(cell);
              return {
                stroke: style.stroke,
                strokeWidth: Number.parseFloat(style.strokeWidth),
                minimumContrast: Math.min(
                  ...backgrounds.map((background) =>
                    ratio(mix(rgba(style.stroke), background, floor * opacity), background),
                  ),
                ),
              };
            });
            button.click();
            const inactive = button.parentElement.querySelector('[data-inactive]');
            return {
              label: button.dataset.case,
              disabled: button.disabled,
              opacity,
              foreground: getComputedStyle(button).color,
              backgrounds,
              cells,
              inactiveDisabled: inactive.disabled,
              inactiveOpacity: Number(getComputedStyle(inactive).opacity),
              links: svg.querySelectorAll('.cell-link').length,
            };
          });
        });
      for (const motion of ['no-preference', 'reduce']) {
        await f.page.emulateMedia({ reducedMotion: motion });
        await f.page.waitForFunction(
          (reduced) =>
            [...document.querySelectorAll('.cell-loader')].every(
              (svg) => svg.dataset.reduced === String(reduced),
            ),
          motion === 'reduce',
        );
        const values = await inspect();
        for (const value of values) {
          assert.equal(value.disabled, true, 'Pending actions cannot be submitted twice.');
          assert.equal(value.opacity, 1, `${value.label}: ancestors must not fade pending work.`);
          assert.equal(value.inactiveDisabled, true);
          assert.ok(
            value.inactiveOpacity < 0.7,
            'Unavailable actions keep their disabled styling.',
          );
          assert.equal(value.cells.length, 3);
          assert.equal(value.links, 2);
          for (const cell of value.cells) {
            assert.equal(
              cell.stroke,
              value.foreground,
              'Button cells use its contrasting foreground.',
            );
            assert.ok(cell.strokeWidth >= 2);
            assert.ok(
              cell.minimumContrast >= 3,
              `${value.label}: cell contrast ${cell.minimumContrast}; ${JSON.stringify(value)}`,
            );
          }
        }
        assert.equal(await f.page.evaluate(() => window.controlClicks), 0);
        contrastEvidence.push({ browser: name, width, legacy, motion, values });
      }
      await f.page.emulateMedia({ reducedMotion: 'no-preference' });
      await f.page.screenshot({
        path: path.join(
          evidence,
          `cell-loader-controls-${legacy ? 'legacy' : 'season'}-${name}-${width}.png`,
        ),
        fullPage: true,
      });
      clean(f.observations);
    } finally {
      await f.close();
    }
  }
}
async function appStates(browser, base, width, name) {
  for (const legacy of [true, false]) {
    const f = await contextFor(browser, base, width, { app: true, legacy });
    try {
      await f.page.goto(base + (legacy ? '/index.html' : '/season/?view=overview'));
      const selector = legacy ? '.boot-note' : '.overview-grid';
      await f.page.locator(`${selector} .cell-loader`).first().waitFor();
      if (!legacy) {
        await f.page.waitForFunction(
          () => document.documentElement.dataset.streakShellReady === 'true',
        );
        await f.page.keyboard.press('Escape');
        await f.page.locator('#streak-startup').waitFor({ state: 'detached' });
      }
      await structure(f.page, selector, [legacy ? 'orbit' : 'wave']);
      moving(await samples(f.page, 8, 160, selector));
      assert.ok(
        f.observations.api.includes(legacy ? '/api/me' : '/api/markets'),
        'The real loading UI remains visible while its specific API read is held.',
      );
      await f.page.screenshot({
        path: path.join(
          evidence,
          `cell-loader-${legacy ? 'legacy' : 'season'}-${name}-${width}.png`,
        ),
      });
      clean(f.observations);
    } finally {
      await f.close();
    }
  }
}

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let groups = 0;
  try {
    for (const [name, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      const browser = await engine.launch();
      try {
        for (const width of [390, 1440]) {
          const f = await contextFor(browser, base, width);
          try {
            await f.page.goto(base + '/loader-test');
            await f.page.waitForFunction(() => !!window.loaderTest);
            await structure(f.page);
            assert.equal(
              await f.page
                .getByRole('button', { name: 'Waiting for wallet', exact: true })
                .isDisabled(),
              true,
            );
            assert.equal(await f.page.locator('#payment').getAttribute('aria-busy'), 'true');
            assert.ok((await f.page.locator('#payment').boundingBox()).height >= 44);
            assert.equal(await f.page.getByRole('status').innerText(), 'Reading your activity');
            moving(await samples(f.page));
            await f.page.evaluate(() => window.loaderTest.remount());
            assert.equal(
              await f.page.locator('#wave animate').count(),
              5,
              'Cleanup/re-register retains one set of SMIL nodes.',
            );
            assert.deepEqual(await f.page.evaluate(() => window.loaderTest.observeCycle()), {
              staleRegistered: false,
              registered: true,
              released: true,
            });
            await f.page.emulateMedia({ reducedMotion: 'reduce' });
            await f.page.waitForFunction(
              () => document.querySelector('#wave svg').dataset.reduced === 'true',
            );
            assert.equal(
              await f.page.locator('#wave animate').count(),
              0,
              'Reduced motion removes native animation.',
            );
            await frozen(f.page);
            await f.page.emulateMedia({ reducedMotion: 'no-preference' });
            await f.page.waitForFunction(
              () => document.querySelector('#wave svg').dataset.reduced === 'false',
            );
            moving(await samples(f.page));
            await f.page.evaluate(() => {
              Object.defineProperty(document, 'hidden', { configurable: true, value: true });
              document.dispatchEvent(new Event('visibilitychange'));
            });
            await frozen(f.page);
            await f.page.evaluate(() => {
              delete document.hidden;
              document.dispatchEvent(new Event('visibilitychange'));
            });
            moving(await samples(f.page));
            clean(f.observations);
            assert.deepEqual(f.observations.api, []);
            await f.page.screenshot({
              path: path.join(evidence, `cell-loader-module-${name}-${width}.png`),
            });
            groups++;
          } finally {
            await f.close();
          }
          await pendingControls(browser, base, width, name);
          if (!moduleOnly) await appStates(browser, base, width, name);
        }
        const f = await contextFor(browser, base, 390, { reducedMotion: 'reduce' });
        try {
          await f.page.goto(base + '/loader-test');
          await f.page.waitForFunction(() => !!window.loaderTest);
          await structure(f.page);
          await f.page.evaluate(() => {
            window.loaderTest.remount();
            window.loaderTest.remount();
          });
          assert.equal(await f.page.locator('#wave animate').count(), 0);
          await frozen(f.page);
          await f.page.emulateMedia({ reducedMotion: 'no-preference' });
          await f.page.waitForFunction(
            () => document.querySelector('#wave svg').dataset.reduced === 'false',
          );
          assert.equal(
            await f.page.locator('#wave animate').count(),
            5,
            'Initial reduced StrictMode cleanup retains animations for later playback.',
          );
          moving(await samples(f.page));
          await f.page.evaluate(() => window.loaderTest.stop());
          await f.page.emulateMedia({ reducedMotion: 'reduce' });
          await f.page.evaluate(async () => {
            Object.defineProperty(document, 'hidden', { configurable: true, value: true });
            document.dispatchEvent(new Event('visibilitychange'));
            await new Promise(requestAnimationFrame);
          });
          assert.deepEqual(
            await f.page
              .locator('main .cell-loader')
              .evaluateAll((svgs) =>
                svgs.map((svg) => [
                  svg.dataset.reduced,
                  svg.dataset.paused,
                  svg.animationsPaused(),
                ]),
              ),
            [
              ['false', 'false', true],
              ['false', 'false', true],
            ],
            'Final cleanup releases visibility and preference updates.',
          );
          clean(f.observations);
          assert.deepEqual(f.observations.api, []);
          groups++;
        } finally {
          await f.close();
        }
        console.log(
          `${name}: 390/1440px orbit/pulse, linked native wave, reduced motion, hidden tabs, remount and observer cleanup passed${moduleOnly ? ' (module only)' : '; real legacy and Season pending reads passed'}.`,
        );
      } finally {
        await browser.close();
      }
    }
    console.log(
      `Cell loader checks passed: ${groups} motion groups${moduleOnly ? '; application checks explicitly not run' : ' plus eight real application loading states'}. No backend, wallet, provider or external request used.`,
    );
    fs.writeFileSync(
      path.join(evidence, 'cell-loader-button-contrast.json'),
      JSON.stringify(
        {
          at: new Date().toISOString(),
          scope: 'Isolated controls with actual app and legacy styles; no wallet or live payment',
          checks: contrastEvidence,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

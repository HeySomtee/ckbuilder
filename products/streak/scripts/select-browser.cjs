require('../../../scripts/quality/test-env.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { openSelect, chooseOption } = require('./browser-select.cjs');
const requested = process.argv.slice(2);
assert.ok(
  requested.length <= 1 &&
    requested.every((arg) => ['--react-only', '--legacy-only'].includes(arg)),
);
const implementations = requested.includes('--legacy-only')
  ? ['legacy']
  : requested.includes('--react-only')
    ? ['react']
    : ['react', 'legacy'];

const styles = `<style>
body{margin:0;background:#14201c;color:#edf2eb;font:16px Arial}
.select-fixture{padding:20px;max-width:620px;display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.select-fixture form{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}h1{font-size:22px}
.select-fixture input,.select-fixture button,dialog button{min-height:44px}
.select-corner{position:fixed;right:8px;bottom:8px;width:180px}
dialog{box-sizing:border-box;padding:22px;width:min(420px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#14201c;color:#edf2eb;border:1px solid #9caf9f;border-radius:16px}
dialog output{display:block;padding:16px 0}dialog::backdrop{background:#0008}
</style>`;
const optionMarkup = `<option value="alpha">Alpha league</option><option value="beta" disabled>Beta unavailable</option><option value="gamma">Gamma league</option><option value="delta">Delta league with a longer name that should wrap safely on small screens</option>`;
const dialogOptionMarkup =
  optionMarkup +
  Array.from(
    { length: 30 },
    (_, index) => `<option value="extra-${index}">Extra league ${index + 1}</option>`,
  ).join('');
const legacy = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Legacy dropdown check</title><link rel="stylesheet" href="/select-controls.css">${styles}
<main class="select-fixture"><h1>Shared dropdown check</h1><form id="fixture-form"><input aria-label="Outside field"><div id="main-select"><select data-streak-select id="league" name="league" aria-label="Test league">${optionMarkup}</select></div><button type="submit">Submit fixture</button></form>
<output aria-label="Selected value">alpha</output><output aria-label="Change count">0</output><output aria-label="Submitted value">none</output>
<select data-streak-select aria-label="Unavailable league" disabled>${optionMarkup}</select><select data-streak-select aria-label="Empty league"></select><button id="open-dialog">Open fixture dialog</button></main>
<div class="select-corner"><select data-streak-select aria-label="Corner league">${optionMarkup}</select></div>
<dialog aria-label="Fixture dialog"><h2>Choose inside a dialog</h2><div aria-hidden="true" style="height:480px"></div><select data-streak-select aria-label="Dialog league">${dialogOptionMarkup}</select><output aria-label="Dialog value">alpha</output><div aria-hidden="true" style="height:240px"></div><button id="close-dialog">Close fixture dialog</button></dialog>
<script type="module">
import {observeSelectControls} from '/select-controls.js';
observeSelectControls(document.body);
const options=${JSON.stringify(optionMarkup)};
const main=document.getElementById('main-select');
let selected='alpha',changes=0,redrawNext=false;
document.body.addEventListener('change',event=>{
 if(event.target.id==='league'){
  selected=event.target.value;
  document.querySelector('[aria-label="Selected value"]').textContent=selected;
  document.querySelector('[aria-label="Change count"]').textContent=String(++changes);
  if(redrawNext){redrawNext=false;const replacement=document.createElement('select');replacement.dataset.streakSelect='';replacement.id='league';replacement.name='league';replacement.setAttribute('aria-label','Test league');replacement.innerHTML=event.target.innerHTML;replacement.value=selected;main.replaceChildren(replacement);}
 }
 if(event.target.getAttribute('aria-label')==='Dialog league') document.querySelector('[aria-label="Dialog value"]').textContent=event.target.value;
});
document.getElementById('fixture-form').onsubmit=event=>{event.preventDefault();document.querySelector('[aria-label="Submitted value"]').textContent=new FormData(event.target).get('league')};
document.getElementById('open-dialog').onclick=()=>document.querySelector('dialog').showModal();
document.getElementById('close-dialog').onclick=()=>document.querySelector('dialog').close();
window.updateSelectFixture=action=>{
 const select=document.getElementById('league');
 if(action==='redraw-next')redrawNext=true;
 if(action==='replace')select.innerHTML='<option value="gamma">Gamma league</option><option value="delta">Delta league with a longer name that should wrap safely on small screens</option>';
 if(action==='empty')select.innerHTML='';
 if(action==='restore'){select.innerHTML=options;select.value=selected;}
 if(action==='hide')main.replaceChildren();
 if(action==='show'){main.innerHTML='<select data-streak-select id="league" name="league" aria-label="Test league">'+options+'</select>';document.getElementById('league').value=selected;}
};
</script></html>`;

async function main() {
  process.env.NODE_ENV = 'production';
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'streak-select-'));
  const evidence = path.resolve(__dirname, '../../../.quality-artifacts/select-browser');
  fs.mkdirSync(evidence, { recursive: true });
  const { build } = await import('vite');
  await build({
    configFile: false,
    envDir: false,
    root: path.resolve(__dirname, '..'),
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'error',
    build: {
      outDir: temp,
      emptyOutDir: true,
      lib: {
        entry: path.join(__dirname, 'select-browser-fixture.tsx'),
        formats: ['es'],
        fileName: () => 'select.js',
      },
    },
  });
  const css = fs.readdirSync(temp).filter((file) => file.endsWith('.css'));
  const publicRoot = path.resolve(__dirname, '../public');
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (pathname === '/legacy' || pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      return res.end(
        pathname === '/legacy'
          ? legacy
          : `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>React dropdown check</title>${css.map((file) => `<link rel="stylesheet" href="/${file}">`).join('')}<link rel="stylesheet" href="/select-controls.css">${styles}<div id="root"></div><script type="module" src="/select.js"></script></html>`,
      );
    }
    const root = ['/select-controls.js', '/select-controls.css'].includes(pathname)
      ? publicRoot
      : temp;
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile())
      return res.writeHead(404).end();
    res.setHeader(
      'Content-Type',
      file.endsWith('.css')
        ? 'text/css'
        : file.endsWith('.js')
          ? 'text/javascript'
          : 'application/octet-stream',
    );
    res.end(fs.readFileSync(file));
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser, currentPage, phase;
  let groups = 0;
  try {
    for (const [engineName, engine] of [
      ['chromium', chromium],
      ['webkit', webkit],
    ]) {
      browser = await engine.launch();
      for (const [width, height] of [
        [320, 640],
        [390, 900],
        [640, 360],
        [1440, 900],
      ]) {
        for (const implementation of implementations) {
          phase = `${engineName} ${width} ${implementation}`;
          const touch = width < 800;
          const context = await browser.newContext({
            viewport: { width, height },
            hasTouch: touch,
            reducedMotion: 'reduce',
            serviceWorkers: 'block',
          });
          context.setDefaultTimeout(12000);
          const external = [],
            errors = [];
          await context.route('**/*', (route) => {
            if (new URL(route.request().url()).origin !== base) {
              external.push(route.request().url());
              return route.abort();
            }
            return route.continue();
          });
          await context.routeWebSocket('**/*', (socket) => socket.close());
          const page = (currentPage = await context.newPage());
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(base + (implementation === 'legacy' ? '/legacy' : '/'));
          const combo = page.getByRole('combobox', { name: 'Test league', exact: true });
          await combo.waitFor();
          await page.evaluate(() => {
            window.dropdownEvents = [];
            for (const type of ['keydown', 'keyup', 'click', 'mousedown', 'focusin'])
              document.addEventListener(type, (event) => {
                window.dropdownEvents.push({
                  type,
                  key: event.key,
                  target:
                    event.target.getAttribute?.('aria-label') ||
                    event.target.getAttribute?.('role'),
                  prevented: event.defaultPrevented,
                  expanded: document
                    .querySelector('[aria-label="Test league"]')
                    ?.getAttribute('aria-expanded'),
                });
                if (window.dropdownEvents.length > 50) window.dropdownEvents.shift();
              });
          });
          const selected = page.getByLabel('Selected value', { exact: true });
          const change = (action) =>
            page.evaluate(
              async ({ implementation, action }) => {
                if (implementation === 'legacy') window.updateSelectFixture(action);
                else (await import('/select.js')).updateSelectFixture(action);
              },
              { implementation, action },
            );
          await chooseOption(page, 'Test league', 'Gamma league', { touch });
          assert.equal(await selected.innerText(), 'gamma');
          assert.equal(
            await page.getByLabel('Submitted value').innerText(),
            'none',
            'Choosing never submits its parent form.',
          );
          assert.equal(await combo.evaluate((el) => el === document.activeElement), true);
          await combo.press('ArrowDown');
          await page.getByRole('listbox').waitFor();
          await page.keyboard.press('Home');
          await page.keyboard.press('ArrowDown');
          let active = await combo.getAttribute('aria-activedescendant');
          assert.match(
            await page.locator(`[id="${active}"]`).innerText(),
            /Gamma league/,
            'Arrow navigation skips disabled choices.',
          );
          await page.keyboard.press('Home');
          await page.keyboard.press('Enter');
          assert.equal(await selected.innerText(), 'alpha');
          await combo.press('Space');
          await page.getByRole('listbox').waitFor();
          await page.keyboard.type('de');
          active = await combo.getAttribute('aria-activedescendant');
          assert.match(await page.locator(`[id="${active}"]`).innerText(), /^Delta league/);
          await page.keyboard.press('Escape');
          assert.equal(await selected.innerText(), 'alpha');
          assert.equal(await combo.evaluate((el) => el === document.activeElement), true);
          await combo.press('g');
          await page.getByRole('listbox').waitFor();
          active = await combo.getAttribute('aria-activedescendant');
          assert.match(
            await page.locator(`[id="${active}"]`).innerText(),
            /Gamma league/,
            'Reopening starts a new typeahead search.',
          );
          await page.keyboard.press('Escape');
          await openSelect(page, 'Test league', { touch });
          await page.getByRole('textbox', { name: 'Outside field' }).click();
          await page.getByRole('listbox').waitFor({ state: 'hidden' });
          assert.equal(
            await page
              .getByRole('textbox', { name: 'Outside field' })
              .evaluate((el) => el === document.activeElement),
            true,
          );
          await openSelect(page, 'Test league');
          await page.keyboard.press('Tab');
          await page.getByRole('listbox').waitFor({ state: 'hidden' });
          assert.equal(
            await combo.evaluate((el) => el === document.activeElement),
            false,
            'Tab advances out instead of trapping focus.',
          );
          assert.equal(
            await page.getByRole('combobox', { name: 'Unavailable league' }).isDisabled(),
            true,
          );
          const empty = page.getByRole('combobox', { name: 'Empty league' });
          if (!(await empty.isDisabled())) {
            await empty.click();
            assert.equal(await page.getByRole('option').count(), 0);
            await page.keyboard.press('Escape');
          }
          await openSelect(page, 'Test league');
          await change('replace');
          await page.getByRole('option', { name: /^Delta league/ }).waitFor();
          await page.keyboard.press('End');
          await page.keyboard.press('Enter');
          assert.equal(await selected.innerText(), 'delta');
          await openSelect(page, 'Test league');
          await change('empty');
          await page.waitForFunction(
            () => document.querySelectorAll('[role="option"]').length === 0,
          );
          await page.keyboard.press('Escape');
          await change('restore');
          await chooseOption(page, 'Test league', 'Alpha league', { touch });
          await page.getByRole('button', { name: 'Submit fixture' }).click();
          assert.equal(
            await page.getByLabel('Submitted value').innerText(),
            'alpha',
            'The custom control preserves the submitted form value.',
          );
          await openSelect(page, 'Test league');
          await change('hide');
          await page.getByRole('listbox').waitFor({ state: 'hidden' });
          await change('show');
          await combo.waitFor();
          await chooseOption(page, 'Test league', 'Gamma league', { touch });
          assert.equal(
            await selected.innerText(),
            'gamma',
            'Remounted controls keep their real change handler.',
          );
          if (implementation === 'legacy') {
            await change('redraw-next');
            await chooseOption(page, 'Test league', /^Delta league/, { touch });
            assert.equal(await selected.innerText(), 'delta');
            await page.waitForFunction(
              () =>
                document.activeElement?.getAttribute('role') === 'combobox' &&
                document.activeElement?.getAttribute('aria-label') === 'Test league',
            );
          }
          await page.getByRole('button', { name: 'Open fixture dialog' }).click();
          const dialog = page.getByRole('dialog', { name: 'Fixture dialog' });
          await openSelect(page, 'Dialog league', { touch });
          const dialogScroll = await dialog.evaluate((el) => el.scrollTop);
          await page.keyboard.press('End');
          assert.ok(
            await page.getByRole('listbox').evaluate((el) => el.scrollTop > 0),
            'Long lists scroll their active option into view.',
          );
          assert.equal(
            await dialog.evaluate((el) => el.scrollTop),
            dialogScroll,
            'Keyboard option navigation does not scroll its parent dialog.',
          );
          await page.keyboard.press('Escape');
          assert.equal(
            await dialog.isVisible(),
            true,
            'Dropdown Escape must not close the parent dialog.',
          );
          assert.equal(
            await dialog.getByRole('combobox').evaluate((el) => el === document.activeElement),
            true,
          );
          await chooseOption(page, 'Dialog league', 'Gamma league', { touch });
          assert.equal(await dialog.isVisible(), true);
          await page.waitForFunction(
            () => document.querySelector('[aria-label="Dialog value"]').textContent === 'gamma',
          );
          assert.equal(await page.getByLabel('Dialog value').innerText(), 'gamma');
          await openSelect(page, 'Dialog league', { touch });
          await page.screenshot({
            path: path.join(evidence, `${phase.replaceAll(' ', '-')}-dialog.png`),
          });
          await page.keyboard.press('Escape');
          await page.getByRole('button', { name: 'Close fixture dialog' }).click();
          await openSelect(page, 'Corner league', { touch });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
            false,
          );
          await page.screenshot({
            path: path.join(evidence, `${phase.replaceAll(' ', '-')}-corner.png`),
          });
          await page.keyboard.press('Escape');
          assert.deepEqual(errors, []);
          assert.deepEqual(external, []);
          await context.close();
          currentPage = null;
          groups++;
          console.log(
            `PASS dropdown ${phase}: touch, keyboard, dialog, dynamic options and bounds.`,
          );
        }
      }
      await browser.close();
      browser = null;
    }
    console.log(
      `PASS shared dropdowns: ${groups} actual React/legacy journeys, Chromium/WebKit, touch/desktop, keyboard, dynamic/empty/disabled options, dialog focus and viewport bounds.`,
    );
  } catch (error) {
    console.error(`Dropdown phase: ${phase}`);
    if (currentPage && !currentPage.isClosed()) {
      await currentPage.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
      console.error(
        await currentPage
          .locator('body')
          .innerText()
          .catch(() => 'Page unavailable'),
      );
      console.error(await currentPage.evaluate(() => window.dropdownEvents).catch(() => []));
      console.error(
        await currentPage
          .evaluate(() => ({
            width: innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            x: scrollX,
            overflow: [...document.querySelectorAll('body *')]
              .filter((el) => el.getBoundingClientRect().right > innerWidth + 1)
              .slice(0, 8)
              .map((el) => ({
                tag: el.tagName,
                className: el.className,
                width: el.getBoundingClientRect().width,
                right: el.getBoundingClientRect().right,
              })),
          }))
          .catch(() => null),
      );
    }
    throw error;
  } finally {
    await browser?.close();
    await new Promise((done) => server.close(done));
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/* Built UI with loopback fixtures only. These checks prove behavior, not physical-device frame rate. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { inflateSync } = require('node:zlib');
const { observeReads, accountReadFinished } = require('./browser-readiness.cjs');

// Playwright's transparent screenshots are eight-bit RGBA PNGs. Decode this
// narrow test format without adding a production image dependency.
function screenshotPixels(png) {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  let width, height;
  const compressed = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8);
      assert.equal(data[9], 6, 'The transparent evidence screenshot must be RGBA.');
      assert.equal(data[12], 0);
    }
    if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(compressed));
  const stride = width * 4;
  assert.equal(raw.length, (stride + 1) * height);
  const pixels = new Uint8Array(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= 4 ? pixels[index - 4] : 0;
      const above = y ? pixels[index - stride] : 0;
      const corner = x >= 4 && y ? pixels[index - stride - 4] : 0;
      const predictor = [
        0,
        left,
        above,
        Math.floor((left + above) / 2),
        paeth(left, above, corner),
      ][filter];
      pixels[index] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { pixels, width, height };
}

function silhouette({ pixels, width, height }) {
  const rows = [];
  let visiblePixels = 0;
  for (let y = 0; y < height; y++) {
    let left = width,
      right = -1;
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 80) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        visiblePixels++;
      }
    }
    if (right >= left) rows.push({ y, width: right - left + 1 });
  }
  return {
    visiblePixels,
    topWidth: rows[Math.floor(rows.length * 0.1)]?.width ?? 0,
    bottomWidth: rows[Math.floor(rows.length * 0.9)]?.width ?? 0,
    rowCount: rows.length,
  };
}

async function clickWithoutWaitingForMotion(page, selector) {
  await page.locator(selector).evaluate((element) => element.click());
}

async function started(page, direction) {
  await page.waitForFunction(
    (expected) => {
      const layer = document.querySelector('.genie-layer');
      const canvas = layer?.querySelector('.genie-canvas');
      return (
        layer?.getAttribute('data-direction') === expected &&
        layer.getAttribute('data-phase') === 'animating' &&
        canvas?.getAnimations().some((animation) => animation.startTime !== null)
      );
    },
    direction,
    { timeout: 3000 },
  );
}

async function clean(page, open, saved, routeFocus = false) {
  await page.waitForFunction(
    ({ expected, routeFocus }) => {
      const dialog = document.querySelector('.prediction-slip');
      const focused = expected
        ? dialog.contains(document.activeElement)
        : routeFocus
          ? document.activeElement?.matches('.market-detail h1')
          : document.activeElement?.classList.contains('prediction-dock');
      return !document.querySelector('.genie-layer') && dialog.open === expected && focused;
    },
    { expected: open, routeFocus },
    { timeout: 3000 },
  );
  const state = await page.evaluate(() => {
    const dialog = document.querySelector('.prediction-slip');
    const style = getComputedStyle(dialog);
    const ids = [...document.querySelectorAll('[id]')].map((element) => element.id);
    return {
      open: dialog.open,
      opacity: style.opacity,
      visibility: style.visibility,
      focusInDialog: dialog.contains(document.activeElement),
      focusOnDock: document.activeElement?.classList.contains('prediction-dock'),
      focusOnRoute: document.activeElement?.matches('.market-detail h1'),
      clones: document.querySelectorAll('.genie-copy').length,
      preparing: document.querySelectorAll('.genie-preparing, .genie-restoring').length,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      saved: localStorage.getItem('streak.predictionDraft.v1'),
    };
  });
  assert.equal(state.open, open);
  assert.equal(state.clones, 0, 'Motion snapshots must be disposed.');
  assert.equal(state.preparing, 0, 'No motion class may keep the real surface hidden.');
  assert.deepEqual(state.duplicateIds, []);
  assert.equal(state.saved, saved, 'Motion never changes the stored draft.');
  if (open) {
    assert.equal(state.opacity, '1');
    assert.notEqual(state.visibility, 'hidden');
    assert.ok(state.focusInDialog, 'Restoring returns keyboard focus to the native dialog.');
  } else if (routeFocus) {
    assert.ok(state.focusOnRoute, 'Navigation moves focus to the newly loaded market heading.');
  } else {
    assert.ok(state.focusOnDock, 'Minimizing returns keyboard focus to the retained slip.');
  }
}

async function inspectNeck(page) {
  await page.evaluate(() => {
    for (const animation of document.querySelector('.genie-canvas').getAnimations()) {
      animation.pause();
      animation.currentTime = Number(animation.effect.getTiming().duration) * 0.4;
    }
  });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.genie-canvas');
    return canvas && Math.abs(Number(canvas.dataset.progress) - 0.4) < 0.002;
  });
  const result = await page.evaluate(async () => {
    const layer = document.querySelector('.genie-layer');
    const canvas = layer.querySelector('.genie-canvas');
    // Read immediately after the renderer's queued frame, before WebGL clears
    // its non-preserved drawing buffer. Assert pixels, not just DOM attributes.
    const pixels = await new Promise((resolve, reject) =>
      requestAnimationFrame(() => {
        try {
          if (canvas.dataset.renderer === 'webgl') {
            const gl = canvas.getContext('webgl');
            const raw = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
            const upright = new Uint8Array(raw.length);
            const stride = canvas.width * 4;
            for (let y = 0; y < canvas.height; y++)
              upright.set(
                raw.subarray((canvas.height - y - 1) * stride, (canvas.height - y) * stride),
                y * stride,
              );
            resolve(upright);
          } else {
            resolve(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data);
          }
        } catch (error) {
          if (error.name === 'SecurityError') resolve(null);
          else reject(error);
        }
      }),
    );
    const rows = [];
    let visiblePixels = 0;
    for (let y = 0; pixels && y < canvas.height; y++) {
      let left = canvas.width,
        right = -1;
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 80) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          visiblePixels++;
        }
      }
      if (right >= left) rows.push({ y, width: right - left + 1 });
    }
    return {
      renderer: canvas.dataset.renderer,
      screenshotRequired: pixels === null,
      progress: Number(canvas.dataset.progress),
      visiblePixels,
      topWidth: rows[Math.floor(rows.length * 0.1)]?.width ?? 0,
      bottomWidth: rows[Math.floor(rows.length * 0.9)]?.width ?? 0,
      rowCount: rows.length,
      hidden: layer.getAttribute('aria-hidden'),
      decorativeInputs: layer.querySelectorAll('input, button, [id]').length,
      layers: document.querySelectorAll('.genie-layer').length,
      canvases: layer.querySelectorAll('.genie-canvas').length,
    };
  });
  if (result.screenshotRequired) {
    // A foreignObject snapshot can taint canvas readback while still painting
    // normally. Inspect the compositor output with identical shape assertions.
    const png = await page.locator('.genie-canvas').screenshot({
      animations: 'allow',
      omitBackground: true,
      style:
        'html,body { background: transparent !important; } body > :not(.genie-layer) { visibility: hidden !important; } html::before,html::after,body::before,body::after { display: none !important; }',
    });
    Object.assign(result, silhouette(screenshotPixels(png)));
  }
  assert.equal(result.layers, 1);
  assert.equal(result.canvases, 1);
  assert.equal(result.hidden, 'true');
  assert.equal(result.decorativeInputs, 0);
  assert.ok(result.visiblePixels > 10000, 'The Genie must contain the visible slip snapshot.');
  assert.ok(result.rowCount > 100, 'The animated surface remains connected.');
  assert.ok(
    result.bottomWidth < result.topWidth * 0.35,
    `The slip must narrow into a neck, not shrink as a rectangle (${result.topWidth}/${result.bottomWidth}).`,
  );
  return result;
}

module.exports = async function predictionMotion({ browser, base, name, evidence }) {
  const measurements = [];
  for (const width of [390, 1440]) {
    const height = width === 390 ? 844 : 900;
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    const errors = [],
      writes = [],
      external = [];
    await context.route('**/*', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== base) {
        external.push(url.href);
        return route.abort();
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        writes.push(url.pathname);
        return route.abort();
      }
      return route.continue();
    });
    await context.routeWebSocket('**/*', (socket) => socket.close());
    const page = await context.newPage();
    const reads = observeReads(page, base);
    await page.addInitScript(() => {
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      window.predictionSnapshotMarkup = [];
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        ...source,
        set(value) {
          const prefix = 'data:image/svg+xml;charset=utf-8,';
          if (String(value).startsWith(prefix))
            window.predictionSnapshotMarkup.push(
              decodeURIComponent(String(value).slice(prefix.length)),
            );
          source.set.call(this, value);
        },
      });
    });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await reads.goto(base + '/season/?market=m-slip-one');
      await page.locator('.detail-outcomes').getByRole('button').first().click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Minimize slip', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      await accountReadFinished(page);
      await reads.goto(base + '/season/?market=m-slip-two');
      await page.locator('.detail-outcomes').getByRole('button').nth(1).click();
      await page.locator('.prediction-dock').click();
      await dialog
        .getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' })
        .fill('10.00000001');
      await dialog.getByRole('textbox', { name: 'Stake for Liverpool vs Tottenham' }).fill('25.5');
      assert.equal(await dialog.locator('.slip-pick').count(), 2);
      assert.equal(await dialog.locator('.slip-total strong').textContent(), '35.50000001 tCKB');
      assert.equal(
        await dialog.getByRole('button', { name: 'Close slip', exact: true }).count(),
        0,
      );
      assert.equal(
        await dialog.getByRole('button', { name: 'Minimize slip', exact: true }).count(),
        1,
      );
      let saved = await page.evaluate(() => localStorage.getItem('streak.predictionDraft.v1'));
      await page.screenshot({
        path: path.join(evidence, `prediction-genie-source-${name}-${width}.png`),
      });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await clickWithoutWaitingForMotion(page, '.slip-controls button');
      await started(page, 'minimize');
      await page.locator('.genie-canvas').evaluate((canvas) => {
        canvas.getAnimations().forEach((animation) => {
          animation.pause();
          animation.currentTime = 0;
        });
      });
      await page.waitForFunction(
        () => document.querySelector('.genie-canvas')?.dataset.progress === '0',
      );
      await page.screenshot({
        path: path.join(evidence, `prediction-genie-initial-${name}-${width}.png`),
        animations: 'allow',
      });
      measurements.push({ engine: name, width, ...(await inspectNeck(page)) });
      await page.screenshot({
        path: path.join(evidence, `prediction-genie-neck-${name}-${width}.png`),
        animations: 'allow',
      });
      await page
        .locator('.genie-canvas')
        .evaluate((canvas) => canvas.getAnimations().forEach((animation) => animation.play()));
      await clean(page, false, saved);

      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await started(page, 'restore');
      await clean(page, true, saved);
      assert.equal(await dialog.locator('.slip-total strong').textContent(), '35.50000001 tCKB');

      // Reopen before the minimize focus RAF runs. The old callback may not
      // steal focus from the newly restored dialog.
      await page.evaluate(async () => {
        document.querySelector('.slip-controls button').click();
        await Promise.resolve();
        document.querySelector('.prediction-dock').click();
      });
      await clean(page, true, saved);

      // Changing an amount immediately before minimizing cannot replay a warm
      // snapshot of an earlier draft. The intercepted data URL is local test
      // evidence only and never contains an authenticated account surface.
      await dialog
        .getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' })
        .fill('11.00000001');
      saved = await page.evaluate(() => localStorage.getItem('streak.predictionDraft.v1'));

      // Reverse while the surface is moving. Old completion callbacks must not
      // hide the reopened native dialog or resurrect a disposed overlay.
      await clickWithoutWaitingForMotion(page, '.slip-controls button');
      await started(page, 'minimize');
      const captured = await page.evaluate(() => window.predictionSnapshotMarkup.at(-1));
      assert.ok(captured.includes('11.00000001'), 'Snapshot uses the most recent amount.');
      assert.ok(captured.includes('25.5'), 'Snapshot preserves every independent pick.');
      assert.doesNotMatch(captured, /<input\b|<textarea\b|\sid="/);
      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await clean(page, true, saved);
      await clickWithoutWaitingForMotion(page, '.slip-controls button');
      await started(page, 'minimize');
      await clean(page, false, saved);
      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await started(page, 'restore');
      await page.keyboard.press('Escape');
      await clean(page, false, saved);

      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await started(page, 'restore');
      await page.setViewportSize({ width: width - 10, height: height - 20 });
      await page.waitForFunction(() => !document.querySelector('.genie-layer'), null, {
        timeout: 250,
      });
      await clean(page, true, saved);
      await page.setViewportSize({ width, height });

      // SPA navigation must dispose motion without mutating the retained slip.
      await clickWithoutWaitingForMotion(page, '.slip-controls button');
      await started(page, 'minimize');
      await page.evaluate(() => {
        history.pushState({}, '', '/season/?market=m-slip-one');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await page.waitForFunction(() => !document.querySelector('.genie-layer'), null, {
        timeout: 250,
      });
      await clean(page, false, saved, true);
      await page.getByRole('heading', { name: 'Arsenal vs Chelsea', exact: true }).waitFor();

      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await started(page, 'restore');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => !document.querySelector('.genie-layer'), null, {
        timeout: 250,
      });
      await clean(page, true, saved);
      await clickWithoutWaitingForMotion(page, '.slip-controls button');
      await clean(page, false, saved);
      assert.equal(await page.locator('.genie-layer').count(), 0);
      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await clean(page, true, saved);
      assert.equal(await page.locator('.genie-layer').count(), 0);
      await page.keyboard.press('Escape');
      await clean(page, false, saved);

      // If rasterization fails, focus and the live draft still change state
      // immediately. A GPU or canvas failure cannot strand an invisible modal.
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await clean(page, true, saved);
      await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = () => null;
        window.restorePredictionCanvas = () => {
          HTMLCanvasElement.prototype.getContext = original;
        };
      });
      await dialog
        .getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' })
        .fill('12.00000001');
      saved = await page.evaluate(() => localStorage.getItem('streak.predictionDraft.v1'));
      await clickWithoutWaitingForMotion(page, '.slip-controls button');
      await clean(page, false, saved);
      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await clean(page, true, saved);
      assert.equal(
        await dialog.getByRole('textbox', { name: 'Stake for Arsenal vs Chelsea' }).inputValue(),
        '12.00000001',
      );
      await page.evaluate(() => window.restorePredictionCanvas());
      // Restore a valid maximum-size draft through the public storage adapter.
      // All eight markets are real synthetic API fixtures, not invented UI data.
      await page.evaluate(() => {
        const key = 'streak.predictionDraft.v1';
        const draft = JSON.parse(localStorage.getItem(key));
        for (let index = 3; index <= 8; index++)
          draft.picks.push({
            lineId: crypto.randomUUID(),
            marketId: `m-slip-${index}`,
            matchId: `slip-${index}`,
            outcome: index % 2 ? 'home' : 'away',
            amountCkb: '100',
          });
        draft.revision = crypto.randomUUID();
        localStorage.setItem(key, JSON.stringify(draft));
      });
      await accountReadFinished(page);
      await reads.reload();
      await page.locator('.prediction-dock').click();
      await dialog
        .getByRole('textbox', { name: 'Stake for Home 8 vs Away 8' })
        .waitFor({ state: 'attached' });
      await page.waitForFunction(() => !document.querySelector('.slip-body [role="status"]'));
      await accountReadFinished(page);
      assert.equal(await dialog.locator('.slip-pick').count(), 8);
      saved = await page.evaluate(() => localStorage.getItem('streak.predictionDraft.v1'));
      await clickWithoutWaitingForMotion(page, '.slip-controls button');
      await started(page, 'minimize');
      measurements.push({ engine: name, width, picks: 8, ...(await inspectNeck(page)) });
      await page.screenshot({
        path: path.join(evidence, `prediction-genie-eight-${name}-${width}.png`),
        animations: 'allow',
      });
      await page
        .locator('.genie-canvas')
        .evaluate((canvas) => canvas.getAnimations().forEach((animation) => animation.play()));
      await clean(page, false, saved);
      await clickWithoutWaitingForMotion(page, '.prediction-dock');
      await started(page, 'restore');
      await clean(page, true, saved);
      assert.equal(await dialog.locator('.slip-pick').count(), 8);
      await reads.settled();
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, [], 'Decorative motion cannot issue a financial request.');
      assert.deepEqual(external, []);
    } catch (error) {
      await fs.writeFile(
        path.join(evidence, `prediction-motion-reads-${name}-${width}.json`),
        JSON.stringify(reads.trace, null, 2),
      );
      await page.screenshot({
        path: path.join(evidence, `prediction-genie-failure-${name}-${width}.png`),
        animations: 'allow',
      });
      throw error;
    } finally {
      await context.close();
    }
  }
  await fs.writeFile(
    path.join(evidence, `prediction-genie-${name}.json`),
    JSON.stringify(measurements, null, 2),
  );
  return 2;
};

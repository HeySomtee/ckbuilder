/* Preview motion checks. Headless WebKit is not a physical iPhone performance test. */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { chromium, webkit } = require("../../node_modules/playwright");

const base = process.env.STREAK_PREVIEW_URL || "http://127.0.0.1:4175";
const baseline = process.argv.includes("--baseline");
const snapshotsOnly = process.argv.includes("--snapshots-only");
const evidence = path.join(__dirname, "evidence");
const results = [];
const measurements = [];
const pageErrors = [];
const artifacts = [];
const geometryMeasurements = [];
const snapshotMeasurements = [];

async function check(name, run) {
  if (
    snapshotsOnly &&
    !name.includes("multi-pick minimize") &&
    !name.includes("scrolled basket snapshot") &&
    name !== "No uncaught browser errors"
  )
    return;
  const start = Date.now();
  try {
    await run();
    results.push({ name, status: "passed", durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, status: "failed", error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function openSlip(page) {
  if (await page.locator("dialog[open]").count()) {
    await page.keyboard.press("Escape");
  }
  await page.locator('[data-action="pick"]').first().click();
  await page.locator("#stake").fill("200");
  await page.evaluate(async () => {
    const { captureSurface } = await import("./motion.mjs");
    const start = performance.now();
    while (!captureSurface(document.querySelector("#dialog"))) {
      if (performance.now() - start > 5000)
        throw new Error("Snapshot preparation timed out");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  });
}

async function click(page, action) {
  // DOM click intentionally avoids Playwright waiting for an in-flight surface
  // to become stable when testing an interruption in the middle of motion.
  await page.evaluate((value) => {
    const button = document.querySelector(`[data-action="${value}"]`);
    if (!button) throw new Error(`Missing action ${value}`);
    button.click();
  }, action);
}

async function motionStarted(page) {
  await page.waitForFunction(() => {
    const animations = [...document.querySelectorAll(".genie-canvas")].flatMap(
      (element) => element.getAnimations(),
    );
    return (
      animations.length > 0 &&
      animations.every((animation) => animation.startTime !== null)
    );
  });
}

async function clean(page, expectOpen, expectedAmount = "200") {
  await page.waitForFunction(() => !document.querySelector(".genie-layer"));
  const state = await page.evaluate(() => {
    const dialog = document.querySelector("#dialog");
    return {
      open: dialog.open,
      opacity: getComputedStyle(dialog).opacity,
      visibility: getComputedStyle(dialog).visibility,
      focused: dialog.contains(document.activeElement),
      clones: document.querySelectorAll(".genie-copy").length,
      duplicateIds: [...document.querySelectorAll("[id]")]
        .map((element) => element.id)
        .filter((id, index, ids) => ids.indexOf(id) !== index),
    };
  });
  assert.equal(state.open, expectOpen);
  assert.equal(state.clones, 0);
  assert.equal(
    await page.locator(".genie-preparing, .genie-restoring").count(),
    0,
  );
  assert.deepEqual(state.duplicateIds, []);
  if (expectOpen) {
    assert.equal(
      state.opacity,
      "1",
      "Interrupted restore reveals the real dialog",
    );
    assert.notEqual(state.visibility, "hidden");
    assert.ok(state.focused, "Keyboard focus remains within the native dialog");
    assert.equal(await page.locator("#stake").inputValue(), expectedAmount);
  }
}

async function holdSnapshotPreparation(page) {
  await page.evaluate(() => {
    const original = HTMLImageElement.prototype.decode;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    HTMLImageElement.prototype.decode = function (...args) {
      const decoded = original.apply(this, args);
      return gate.then(() => decoded);
    };
    window.releaseMotionSnapshot = () => {
      HTMLImageElement.prototype.decode = original;
      delete window.releaseMotionSnapshot;
      release();
    };
  });
}

async function releaseSnapshotPreparation(page) {
  await page.evaluate(() => window.releaseMotionSnapshot?.());
}

async function benchmark(page, engine, viewport, direction) {
  if (direction === "minimize") await openSlip(page);
  const result = await page.evaluate(
    async (action) => {
      const frames = [];
      const longTasks = [];
      let observer;
      const supportsLongTasks =
        PerformanceObserver.supportedEntryTypes.includes("longtask");
      if (supportsLongTasks) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            longTasks.push({
              startMs: entry.startTime,
              durationMs: entry.duration,
            });
          }
        });
        observer.observe({ type: "longtask" });
      }
      let frame;
      const start = performance.now();
      const tick = (time) => {
        frames.push(time);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      document.querySelector(`[data-action="${action}"]`).click();
      const setupMs = performance.now() - start;
      const layers = document.querySelectorAll(".genie-layer").length;
      await new Promise((resolve) => setTimeout(resolve, 1050));
      cancelAnimationFrame(frame);
      observer?.disconnect();
      const intervals = frames
        .slice(1)
        .map((time, index) => time - frames[index]);
      const sorted = [...intervals].sort((a, b) => a - b);
      return {
        setupMs,
        firstFrameDelayMs: frames.length
          ? Math.max(0, frames[0] - start)
          : null,
        frameCount: frames.length,
        intervalMedianMs: sorted[Math.floor(sorted.length * 0.5)] ?? null,
        intervalP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? null,
        intervalMaxMs: sorted.at(-1) ?? null,
        intervalsOver25Ms: intervals.filter((value) => value > 25).length,
        longTaskObserverSupported: supportsLongTasks,
        longTasks: longTasks.map((task) => ({
          ...task,
          startMs: task.startMs - start,
        })),
        layerCreated: layers === 1,
        layerCleaned: !document.querySelector(".genie-layer"),
      };
    },
    direction === "minimize" ? "minimize" : "restore-slip",
  );
  measurements.push({ engine, viewport, direction, ...result });
  if (!baseline) {
    assert.ok(
      result.layerCreated,
      `${direction} uses the shared decorative motion surface`,
    );
    assert.ok(result.layerCleaned);
  }
}

async function geometry() {
  const { genieGeometry } = await import(
    pathToFileURL(path.join(__dirname, "genie-geometry.mjs")).href
  );
  for (const width of [320, 390, 1440]) {
    const source =
      width === 1440
        ? { x: 480, y: 130, width: 480, height: 730 }
        : { x: 0, y: 113, width, height: 731 };
    const target = {
      x: width - 192,
      y: width === 1440 ? 950 : 725,
      width: 20,
      height: 3,
    };
    for (let step = 0; step <= 100; step++) {
      const progress = step / 100;
      const strips = genieGeometry(source, target, progress, 40);
      assert.equal(strips.length, 40);
      for (let index = 0; index < strips.length; index++) {
        const strip = strips[index];
        assert.ok(strip.top.right > strip.top.left);
        assert.ok(strip.bottom.right > strip.bottom.left);
        assert.ok(strip.bottom.y > strip.top.y);
        for (const edge of [strip.top, strip.bottom]) {
          for (const value of Object.values(edge))
            assert.ok(Number.isFinite(value));
          assert.ok(
            edge.left >= -0.05 && edge.right <= width + 0.05,
            `Projected surface stays inside ${width}px viewport at ${progress}`,
          );
        }
        if (index) assert.deepEqual(strips[index - 1].bottom, strip.top);
      }
    }
    const neck = genieGeometry(source, target, 0.4, 40);
    assert.ok(neck[0].top.right - neck[0].top.left >= source.width * 0.8);
    assert.ok(
      neck.at(-1).bottom.right - neck.at(-1).bottom.left <= source.width * 0.2,
    );
  }
}

async function capture(page, engine, width) {
  await openSlip(page);
  await page.locator("#dialog").evaluate((dialog) => {
    dialog.style.animation = "none";
  });
  const source = await page
    .locator("#dialog")
    .evaluate((element) => element.getBoundingClientRect().toJSON());
  await click(page, "minimize");
  await motionStarted(page);
  const paused = await page.evaluate(() => {
    const animations = [...document.querySelectorAll(".genie-canvas")].flatMap(
      (element) => element.getAnimations(),
    );
    for (const animation of animations) {
      animation.pause();
      animation.currentTime =
        Number(animation.effect.getTiming().duration) * 0.4;
    }
    return animations.length;
  });
  assert.ok(paused > 0);
  await page.waitForFunction(() => {
    const canvas = document.querySelector(".genie-canvas");
    return canvas && Math.abs(Number(canvas.dataset.progress) - 0.4) < 0.002;
  });
  const rendered = await page.evaluate(async (source) => {
    const canvas = document.querySelector(".genie-canvas");
    const { genieGeometry, dockMouth } = await import("./genie-geometry.mjs");
    // Renderer tick was already queued, so this reads its next frame before
    // composition clears a WebGL drawing buffer with preservation disabled.
    const data = await new Promise((resolve) =>
      requestAnimationFrame(() => {
        if (canvas.dataset.renderer === "webgl") {
          const gl = canvas.getContext("webgl");
          const raw = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(
            0,
            0,
            canvas.width,
            canvas.height,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            raw,
          );
          const pixels = new Uint8Array(raw.length);
          const stride = canvas.width * 4;
          for (let y = 0; y < canvas.height; y++) {
            pixels.set(
              raw.subarray(
                (canvas.height - y - 1) * stride,
                (canvas.height - y) * stride,
              ),
              y * stride,
            );
          }
          resolve(pixels);
        } else {
          resolve(
            canvas
              .getContext("2d")
              .getImageData(0, 0, canvas.width, canvas.height).data,
          );
        }
      }),
    );
    const progress = Number(canvas.dataset.progress);
    const target = dockMouth(
      document.querySelector(".dock-symbol").getBoundingClientRect(),
    );
    const expected = genieGeometry(source, target, progress, 40);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const topY = expected[0].top.y;
    const bottomY = expected.at(-1).bottom.y;
    let visiblePixels = 0,
      leakedSamples = 0;
    for (let index = 3; index < data.length; index += 4)
      if (data[index] > 20) visiblePixels++;
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        if (data[(y * canvas.width + x) * 4 + 3] < 100) continue;
        const cssX = rect.left + (x + 0.5) / scaleX;
        const cssY = rect.top + (y + 0.5) / scaleY;
        if (cssY < topY - 3 || cssY > bottomY + 3) {
          leakedSamples++;
          continue;
        }
        const index = Math.max(
          0,
          Math.min(39, Math.floor(((cssY - topY) / (bottomY - topY)) * 40)),
        );
        const row = expected[index];
        const fraction = Math.max(
          0,
          Math.min(1, (cssY - row.top.y) / (row.bottom.y - row.top.y)),
        );
        const left = row.top.left + (row.bottom.left - row.top.left) * fraction;
        const right =
          row.top.right + (row.bottom.right - row.top.right) * fraction;
        if (cssX < left - 3 || cssX > right + 3) leakedSamples++;
      }
    }
    return {
      progress,
      renderer: canvas.dataset.renderer,
      visiblePixels,
      leakedSamples,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    };
  }, source);
  assert.ok(Math.abs(rendered.progress - 0.4) < 0.02);
  assert.ok(
    rendered.visiblePixels > 10000,
    "The paused frame contains a visible rendered surface",
  );
  assert.equal(
    rendered.leakedSamples,
    0,
    "No painted bands escape the expected funnel silhouette",
  );
  geometryMeasurements.push({ engine, width, ...rendered });
  const filename = `motion-neck-${engine}-${width}.png`;
  await page.screenshot({
    path: path.join(evidence, filename),
    animations: "allow",
  });
  artifacts.push(filename);
  await page.evaluate(async () => (await import("./motion.mjs")).stopMotion());
  await clean(page, false);
}

async function main() {
  await fs.mkdir(evidence, { recursive: true });
  if (!baseline)
    await check(
      "Funnel geometry: continuous edges, finite coordinates and narrow lower neck",
      geometry,
    );
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch({ headless: true });
    try {
      for (const width of [390, 1440]) {
        const context = await browser.newContext({
          viewport: { width, height: width === 390 ? 844 : 1000 },
          deviceScaleFactor: width === 390 ? 3 : 1,
          isMobile: width === 390,
          hasTouch: width === 390,
        });
        const page = await context.newPage();
        page.setDefaultTimeout(6000);
        page.on("pageerror", (error) =>
          pageErrors.push({ engine, width, message: error.message }),
        );
        await page.goto(`${base}/#/markets`);
        await page.locator('[data-action="pick"]').first().waitFor();
        if (snapshotsOnly) {
          await openSlip(page);
          await click(page, "minimize");
          await motionStarted(page);
          await clean(page, false);
        }
        await check(
          `${engine} ${width}: unrecorded minimize and restore timing`,
          async () => {
            await benchmark(page, engine, width, "minimize");
            await benchmark(page, engine, width, "restore");
            await clean(page, true);
          },
        );
        if (!baseline) {
          await check(
            `${engine} ${width}: one inert raster surface, shared timeline and saved stake`,
            async () => {
              await openSlip(page);
              await click(page, "minimize");
              await motionStarted(page);
              const state = await page.evaluate(() => {
                const layer = document.querySelector(".genie-layer");
                const animations = [
                  ...layer.querySelectorAll(".genie-canvas"),
                ].flatMap((element) => element.getAnimations());
                return {
                  inputs: layer.querySelectorAll(
                    'input,textarea,select,form,[id],a[href],button:not([tabindex="-1"])',
                  ).length,
                  inert: layer.inert,
                  ariaHidden: layer.getAttribute("aria-hidden"),
                  starts: animations.map((animation) => animation.startTime),
                  count: animations.length,
                  canvases: layer.querySelectorAll("canvas").length,
                  renderer: layer.querySelector("canvas")?.dataset.renderer,
                };
              });
              assert.equal(
                state.inputs,
                0,
                "No interactive or duplicate-id snapshot content",
              );
              assert.equal(state.inert, true);
              assert.equal(state.ariaHidden, "true");
              assert.equal(state.count, 1);
              assert.equal(state.canvases, 1);
              assert.ok(["canvas", "webgl"].includes(state.renderer));
              assert.ok(state.starts.every((value) => value !== null));
              assert.equal(
                new Set(state.starts).size,
                1,
                "The surface uses one absolute animation clock",
              );
              await click(page, "restore-slip");
              await clean(page, true);
            },
          );
          await check(
            `${engine} ${width}: rapid restore, Escape and route interruption`,
            async () => {
              await click(page, "minimize");
              await click(page, "restore-slip");
              await page.keyboard.press("Escape");
              await clean(page, false);
              await click(page, "restore-slip");
              await page.evaluate(() => {
                location.hash = "#/five";
              });
              await clean(page, false);
              await page.evaluate(() => {
                location.hash = "#/markets";
              });
              await page.locator('[data-action="pick"]').first().waitFor();
              await click(page, "restore-slip");
              await clean(page, true);
            },
          );
          await check(
            `${engine} ${width}: queued no-op viewport events do not cancel a visible transition`,
            async () => {
              for (const action of ["minimize", "restore-slip"]) {
                await click(page, action);
                await motionStarted(page);
                await page.evaluate(() => {
                  window.dispatchEvent(new Event("resize"));
                  window.dispatchEvent(new Event("scroll"));
                  visualViewport.dispatchEvent(new Event("resize"));
                  visualViewport.dispatchEvent(new Event("scroll"));
                });
                assert.equal(
                  await page.locator(".genie-layer").count(),
                  1,
                  "An event with unchanged geometry must not tear down the renderer",
                );
                await clean(page, action === "restore-slip");
              }
            },
          );
          await check(
            `${engine} ${width}: scroll, resize, visual viewport and hidden-document cleanup`,
            async () => {
              for (const interrupt of [
                "scroll",
                "resize",
                "visual-scroll",
                "visual-resize",
                "visibility",
              ]) {
                await click(page, "minimize");
                await clean(page, false);
                await click(page, "restore-slip");
                await page.evaluate((kind) => {
                  if (kind === "visibility") {
                    Object.defineProperty(document, "hidden", {
                      configurable: true,
                      value: true,
                    });
                    document.dispatchEvent(new Event("visibilitychange"));
                    delete document.hidden;
                  } else {
                    const isVisual = kind.startsWith("visual-");
                    const event = isVisual ? kind.slice(7) : kind;
                    const target = isVisual ? window.visualViewport : window;
                    const property = isVisual
                      ? event === "resize"
                        ? "width"
                        : "offsetTop"
                      : event === "resize"
                        ? "innerWidth"
                        : "scrollY";
                    const descriptor = Object.getOwnPropertyDescriptor(
                      target,
                      property,
                    );
                    const value = target[property];
                    Object.defineProperty(target, property, {
                      configurable: true,
                      value: value + 10,
                    });
                    target.dispatchEvent(new Event(event));
                    if (descriptor)
                      Object.defineProperty(target, property, descriptor);
                    else delete target[property];
                  }
                }, interrupt);
                await clean(page, true);
              }
            },
          );
          await check(
            `${engine} ${width}: reduced-motion bypass and live preference change`,
            async () => {
              await page.emulateMedia({ reducedMotion: "reduce" });
              await click(page, "minimize");
              assert.equal(await page.locator(".genie-layer").count(), 0);
              await click(page, "restore-slip");
              await clean(page, true);
              await page.emulateMedia({ reducedMotion: "no-preference" });
              await click(page, "minimize");
              await page.emulateMedia({ reducedMotion: "reduce" });
              await clean(page, false);
              await page.emulateMedia({ reducedMotion: "no-preference" });
            },
          );
          await check(
            `${engine} ${width}: cold open and immediate stake edit both animate without prewarming`,
            async () => {
              for (const amount of [null, "317"]) {
                await page.reload();
                await page.locator('[data-action="pick"]').first().waitFor();
                await holdSnapshotPreparation(page);
                try {
                  // Both user actions occur in one browser task. No locator
                  // stability wait or cache-readiness poll can hide the race.
                  const expectedAmount = await page.evaluate((amount) => {
                    document.querySelector('[data-action="pick"]').click();
                    const input = document.querySelector("#stake");
                    if (amount) {
                      input.value = amount;
                      input.dispatchEvent(
                        new Event("input", { bubbles: true }),
                      );
                    }
                    const value = input.value;
                    document.querySelector('[data-action="minimize"]').click();
                    return value;
                  }, amount);
                  assert.equal(
                    await page.locator("#dialog[open]").count(),
                    1,
                    "The live slip remains available while its snapshot prepares",
                  );
                  await page.evaluate(() => {
                    document
                      .querySelector("#dialog")
                      .dispatchEvent(new Event("scroll"));
                    window.visualViewport.dispatchEvent(new Event("resize"));
                  });
                  await releaseSnapshotPreparation(page);
                  await motionStarted(page).catch((error) => {
                    throw new Error(
                      `Cold ${amount ? "edited" : "initial"} minimize: ${error.message}`,
                    );
                  });
                  await clean(page, false);
                  await click(page, "restore-slip");
                  await motionStarted(page).catch((error) => {
                    throw new Error(
                      `Cold ${amount ? "edited" : "initial"} restore: ${error.message}`,
                    );
                  });
                  await clean(page, true, expectedAmount);
                } finally {
                  await releaseSnapshotPreparation(page);
                }
              }
              await page.locator("#stake").fill("200");
            },
          );
          await check(
            `${engine} ${width}: pending preparation respects close, navigation and stake edits`,
            async () => {
              for (const interrupt of ["close", "navigate", "edit"]) {
                await page.goto(`${base}/#/markets`);
                await page.reload();
                await page.locator('[data-action="pick"]').first().waitFor();
                await holdSnapshotPreparation(page);
                try {
                  await page.evaluate((interrupt) => {
                    document.querySelector('[data-action="pick"]').click();
                    const input = document.querySelector("#stake");
                    input.value = "317";
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                    document.querySelector('[data-action="minimize"]').click();
                    if (interrupt === "close") {
                      document
                        .querySelector('[data-action="close-modal"]')
                        .click();
                    } else if (interrupt === "navigate") {
                      location.hash = "#/five";
                    } else {
                      input.value = "416";
                      input.dispatchEvent(
                        new Event("input", { bubbles: true }),
                      );
                    }
                  }, interrupt);
                  if (interrupt === "navigate")
                    await page.waitForURL("**/#/five");
                  await releaseSnapshotPreparation(page);
                  await page.waitForTimeout(500);
                  await clean(page, interrupt === "edit", "416");
                  if (interrupt === "navigate")
                    assert.equal(new URL(page.url()).hash, "#/five");
                  assert.equal(
                    await page.locator(".genie-restoring").count(),
                    0,
                    "A stale preparation must not hide the current dialog",
                  );
                } finally {
                  await releaseSnapshotPreparation(page);
                }
              }
              await page.locator("#stake").fill("200");
            },
          );
          await check(
            `${engine} ${width}: persisted dock restores with an empty image cache`,
            async () => {
              await page.reload();
              await page.locator('[data-action="restore-slip"]').waitFor();
              await holdSnapshotPreparation(page);
              try {
                await click(page, "restore-slip");
                assert.equal(await page.locator("#dialog[open]").count(), 1);
                assert.equal(
                  await page
                    .locator("#dialog")
                    .evaluate((dialog) =>
                      dialog.contains(document.activeElement),
                    ),
                  true,
                  "The native dialog owns focus while the reverse surface prepares",
                );
                await releaseSnapshotPreparation(page);
                await motionStarted(page);
                await clean(page, true);
              } finally {
                await releaseSnapshotPreparation(page);
              }
              await page.reload();
              await page.locator('[data-action="restore-slip"]').waitFor();
              await holdSnapshotPreparation(page);
              try {
                await click(page, "restore-slip");
                await page.keyboard.press("Escape");
                await releaseSnapshotPreparation(page);
                await page.waitForTimeout(500);
                await clean(page, false);
              } finally {
                await releaseSnapshotPreparation(page);
              }
            },
          );
          await check(
            `${engine} ${width}: WebGL unavailable uses the canvas fallback`,
            async () => {
              await openSlip(page);
              await page.evaluate(() => {
                window.originalCanvasContext =
                  HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function (
                  type,
                  ...args
                ) {
                  if (type === "webgl" || type === "experimental-webgl")
                    return null;
                  return window.originalCanvasContext.call(this, type, ...args);
                };
              });
              try {
                await click(page, "minimize");
                assert.equal(
                  await page
                    .locator(".genie-canvas")
                    .getAttribute("data-renderer"),
                  "canvas",
                );
                await clean(page, false);
                await click(page, "restore-slip");
                await clean(page, true);
              } finally {
                await page.evaluate(() => {
                  HTMLCanvasElement.prototype.getContext =
                    window.originalCanvasContext;
                  delete window.originalCanvasContext;
                });
              }
            },
          );
          await check(
            `${engine} ${width}: context loss reveals the real dialog and releases the overlay`,
            async () => {
              await click(page, "minimize");
              await clean(page, false);
              await click(page, "restore-slip");
              const lost = await page.evaluate(() => {
                const canvas = document.querySelector(".genie-canvas");
                if (canvas.dataset.renderer !== "webgl") return false;
                const extension = canvas
                  .getContext("webgl")
                  .getExtension("WEBGL_lose_context");
                if (!extension) return false;
                extension.loseContext();
                return true;
              });
              assert.ok(lost, "Test browser supports forced WebGL loss");
              await clean(page, true);
            },
          );
          await check(`${engine} ${width}: neck-phase visual evidence`, () =>
            capture(page, engine, width),
          );
          await check(
            `${engine} ${width}: multi-pick minimize and restore preserve separate stakes and refresh redistributed amounts`,
            async () => {
              await click(page, "restore-slip");
              await clean(page, true);
              await click(page, "add-more-picks");
              await page.evaluate(() =>
                document
                  .querySelector(
                    '[data-action="pick"][data-fixture="mci-liv"][data-side="2"]',
                  )
                  .click(),
              );
              await page.evaluate(() =>
                document
                  .querySelector(
                    '[data-action="pick"][data-fixture="avl-tot"][data-side="1"]',
                  )
                  .click(),
              );
              assert.equal(await page.locator("dialog[open]").count(), 0);
              await click(page, "restore-slip");
              await page.locator('input[data-fixture="mci-liv"]').fill("375");
              await click(page, "minimize");
              await motionStarted(page);
              await clean(page, false);
              await click(page, "restore-slip");
              await motionStarted(page);
              await clean(page, true);
              assert.equal(
                await page
                  .locator('input[data-fixture="mci-liv"]')
                  .inputValue(),
                "375",
              );
              const cached = await page.evaluate(async () => {
                const { captureSurface } = await import("./motion.mjs");
                // Keep both the first input and aggregate total unchanged.
                // Only the other two inputs change, exposing first-input-only keys.
                for (const [fixture, amount] of [
                  ["mci-liv", "275"],
                  ["avl-tot", "200"],
                ]) {
                  const input = document.querySelector(
                    `input[data-fixture="${fixture}"]`,
                  );
                  input.value = amount;
                  input.dispatchEvent(new Event("input", { bubbles: true }));
                }
                const stale = !!captureSurface(
                  document.querySelector("#dialog"),
                );
                document.querySelector('[data-action="minimize"]').click();
                return stale;
              });
              assert.equal(
                cached,
                false,
                "Equal aggregate totals cannot reuse a snapshot containing different per-pick stakes",
              );
              await motionStarted(page);
              await clean(page, false);
              await click(page, "restore-slip");
              await motionStarted(page);
              await clean(page, true);
              assert.equal(
                await page
                  .locator('input[data-fixture="mci-liv"]')
                  .inputValue(),
                "275",
              );
              assert.equal(
                await page
                  .locator('input[data-fixture="avl-tot"]')
                  .inputValue(),
                "200",
              );
              assert.equal(
                Number.parseFloat(
                  (
                    await page.locator('[data-total="pay"]').textContent()
                  ).replaceAll(",", ""),
                ),
                1638.005,
              );
            },
          );
          await check(
            `${engine} ${width}: scrolled basket snapshot retains the visible total and review button`,
            async () => {
              await page.locator("#dialog").evaluate((dialog) => {
                dialog.style.animation = "none";
                dialog.scrollTo({
                  top: dialog.scrollHeight,
                  behavior: "instant",
                });
              });
              await page.evaluate(
                () =>
                  new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve)),
                  ),
              );
              const layout = await page.evaluate(async () => {
                const { ensureSurface } = await import("./motion.mjs");
                const dialog = document.querySelector("#dialog");
                await ensureSurface(dialog);
                const source = dialog.getBoundingClientRect();
                const targets = [
                  '[data-total="pay"]',
                  '[data-action="review-prediction"]',
                ].map((selector) => {
                  const rect = dialog
                    .querySelector(selector)
                    .getBoundingClientRect();
                  return {
                    selector,
                    x: rect.x - source.x,
                    y: rect.y - source.y,
                    width: rect.width,
                    height: rect.height,
                  };
                });
                return {
                  source: source.toJSON(),
                  targets,
                  scrollTop: dialog.scrollTop,
                };
              });
              assert.ok(
                layout.scrollTop > 0,
                "The basket is actually scrolled",
              );
              for (const target of layout.targets) {
                assert.ok(
                  target.y >= 0 &&
                    target.y + target.height <= layout.source.height + 1,
                  `${target.selector} is visible in the real sheet`,
                );
              }
              const screenshot = await page.screenshot({ clip: layout.source });
              const comparison = await page.evaluate(
                async ({ screenshot, layout }) => {
                  const { captureSurface } = await import("./motion.mjs");
                  const snapshot = captureSurface(
                    document.querySelector("#dialog"),
                  );
                  if (!snapshot)
                    throw new Error("The scrolled snapshot is unavailable");
                  const real = new Image();
                  real.src = `data:image/png;base64,${screenshot}`;
                  await real.decode();
                  const read = (image) => {
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.round(layout.source.width);
                    canvas.height = Math.round(layout.source.height);
                    const context = canvas.getContext("2d");
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    return { context, canvas };
                  };
                  const actual = read(real),
                    prepared = read(snapshot);
                  const measurements = layout.targets.map((target) => {
                    const x = Math.ceil(target.x + 2),
                      y = Math.ceil(target.y + 2);
                    const w = Math.floor(target.width - 4),
                      h = Math.floor(target.height - 4);
                    const a = actual.context.getImageData(x, y, w, h).data;
                    const b = prepared.context.getImageData(x, y, w, h).data;
                    let bright = 0,
                      mismatchedBright = 0,
                      absoluteError = 0;
                    for (let i = 0; i < a.length; i += 4) {
                      const error = Math.max(
                        Math.abs(a[i] - b[i]),
                        Math.abs(a[i + 1] - b[i + 1]),
                        Math.abs(a[i + 2] - b[i + 2]),
                      );
                      absoluteError += error;
                      if (Math.max(a[i], a[i + 1], a[i + 2]) > 130) {
                        bright++;
                        if (error > 80) mismatchedBright++;
                      }
                    }
                    return {
                      selector: target.selector,
                      brightPixels: bright,
                      mismatchedBrightRatio:
                        mismatchedBright / Math.max(bright, 1),
                      meanChannelError: absoluteError / (a.length / 4) / 255,
                    };
                  });
                  // PNG encoding is evidence work only. The user transition
                  // draws the cached raster canvas without a codec round trip.
                  return {
                    measurements,
                    snapshot: snapshot.toDataURL("image/png"),
                  };
                },
                { screenshot: screenshot.toString("base64"), layout },
              );
              const realName = `motion-scrolled-real-${engine}-${width}.png`;
              const imageName = `motion-scrolled-snapshot-${engine}-${width}.png`;
              await fs.writeFile(path.join(evidence, realName), screenshot);
              await fs.writeFile(
                path.join(evidence, imageName),
                Buffer.from(comparison.snapshot.split(",")[1], "base64"),
              );
              artifacts.push(realName, imageName);
              snapshotMeasurements.push({
                engine,
                width,
                scrollTop: layout.scrollTop,
                ...comparison,
                snapshot: undefined,
              });
              for (const target of comparison.measurements) {
                assert.ok(
                  target.brightPixels > 30,
                  `${target.selector} has visible text or button color`,
                );
                assert.ok(
                  target.mismatchedBrightRatio < 0.25,
                  `${target.selector} snapshot retains its visible content (${target.mismatchedBrightRatio})`,
                );
                assert.ok(
                  target.meanChannelError < 0.15,
                  `${target.selector} stays in its displayed location (${target.meanChannelError})`,
                );
              }
              await click(page, "minimize");
              await motionStarted(page);
              await clean(page, false);
            },
          );
        }
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  if (!baseline)
    await check("No uncaught browser errors", async () =>
      assert.deepEqual(pageErrors, []),
    );
  const output = {
    scope: "Local simulated design preview only",
    environment:
      "Headless desktop-host Chromium and WebKit. Mobile viewport emulation, not a physical iPhone.",
    timingMethod:
      "No video recording or screenshots during timing runs. rAF measures scheduling, not proof of compositor frames. Long-task API is unavailable in WebKit.",
    capturedAt: new Date().toISOString(),
    results,
    measurements,
    geometryMeasurements,
    snapshotMeasurements,
    pageErrors,
    artifacts,
  };
  await fs.writeFile(
    path.join(
      evidence,
      baseline
        ? "motion-baseline.json"
        : snapshotsOnly
          ? "motion-snapshot-checks.json"
          : "motion-checks.json",
    ),
    JSON.stringify(output, null, 2) + "\n",
  );
  if (results.some((result) => result.status !== "passed"))
    process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

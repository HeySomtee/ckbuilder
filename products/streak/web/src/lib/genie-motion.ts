import { dockMouth, genieGeometry, GENIE_CLOSE_MS, GENIE_OPEN_MS } from './genie-geometry';
import { createGenieMesh } from './genie-mesh';
import { cloneSurface, rasterizeSurface, snapshotKey } from './genie-snapshot';

export type GenieMotion = {
  warm: (surface: HTMLDialogElement) => void;
  minimize: (surface: HTMLDialogElement, dock: HTMLElement) => boolean;
  restore: (surface: HTMLDialogElement, dock: HTMLElement) => boolean;
  cancel: () => void;
  dispose: () => void;
};
const reduced = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ||
  matchMedia('(forced-colors: active)').matches;
const preferencesState = () =>
  [
    '(prefers-reduced-motion: reduce)',
    '(prefers-reduced-transparency: reduce)',
    '(prefers-contrast: more)',
    '(forced-colors: active)',
  ]
    .map((query) => matchMedia(query).matches)
    .join('|');
const scrollState = (surface?: HTMLDialogElement) =>
  surface
    ? [
        surface.scrollTop,
        ...[...surface.querySelectorAll('*')].map((element) => element.scrollTop),
      ].join('|')
    : '';
const viewState = () =>
  [
    innerWidth,
    innerHeight,
    scrollX,
    scrollY,
    window.visualViewport?.width,
    window.visualViewport?.height,
    window.visualViewport?.offsetTop,
    window.visualViewport?.offsetLeft,
    window.visualViewport?.scale,
  ].join('|');
const release = (bitmap?: HTMLCanvasElement) => {
  if (bitmap) {
    bitmap.width = 0;
    bitmap.height = 0;
  }
};

// This controller owns decoration only. Callers commit state and focus in the
// same event. Preparation, a failed GPU, or interruption cannot hold a dialog.
export function createGenieMotion(): GenieMotion {
  let cached: { key: string; bitmap: HTMLCanvasElement } | undefined;
  let warmTimer: ReturnType<typeof setTimeout> | undefined;
  let preparing: { key: string; controller: AbortController } | undefined;
  let finishActive: (() => void) | undefined;
  let detach: (() => void) | undefined;
  let observed: HTMLDialogElement | undefined;
  let generation = 0;
  let acceptedPreferences: string | undefined;
  let activeView: string | undefined;
  let activeScroll: string | undefined;

  const clearCache = () => {
    release(cached?.bitmap);
    cached = undefined;
  };
  const cancel = () => {
    generation++;
    clearTimeout(warmTimer);
    preparing?.controller.abort();
    preparing = undefined;
    finishActive?.();
    finishActive = undefined;
    activeView = undefined;
    activeScroll = undefined;
  };
  const remember = (key: string, bitmap: HTMLCanvasElement) => {
    if (cached?.bitmap !== bitmap) clearCache();
    cached = { key, bitmap };
  };
  const bind = () => {
    if (detach) return;
    acceptedPreferences = preferencesState();
    const cleanups: (() => void)[] = [];
    const listen = (
      target: EventTarget,
      event: string,
      listener: EventListener,
      options?: AddEventListenerOptions,
    ) => {
      target.addEventListener(event, listener, options);
      cleanups.push(() => target.removeEventListener(event, listener, options));
    };
    const interrupt = () => cancel();
    const preferences = () => {
      const current = preferencesState();
      // Media events can arrive after a new interaction already observed the
      // updated preference. Do not cancel that valid transition retroactively.
      if (current === acceptedPreferences) return;
      acceptedPreferences = current;
      cancel();
      clearCache();
      if (observed?.open) warm(observed);
    };
    const changed = (event: Event) => {
      const internalScrollChanged =
        event.type === 'scroll' &&
        observed?.open &&
        event.target instanceof Node &&
        observed.contains(event.target) &&
        scrollState(observed) !== activeScroll;
      if (finishActive && viewState() === activeView && !internalScrollChanged) return;
      cancel();
      if (observed?.open) warm(observed);
    };
    listen(document, 'pointerdown', interrupt, { capture: true, passive: true });
    listen(document, 'keydown', interrupt, { capture: true });
    listen(window, 'resize', changed, { passive: true });
    listen(document, 'scroll', changed, { capture: true, passive: true });
    listen(window, 'wheel', interrupt, { passive: true });
    listen(window, 'popstate', interrupt);
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', changed, { passive: true });
      listen(window.visualViewport, 'scroll', changed, { passive: true });
    }
    listen(document, 'visibilitychange', () => {
      if (document.hidden) cancel();
    });
    for (const query of [
      '(prefers-reduced-motion: reduce)',
      '(prefers-reduced-transparency: reduce)',
      '(prefers-contrast: more)',
      '(forced-colors: active)',
    ])
      listen(matchMedia(query), 'change', preferences);
    // Capture native details toggles and edits as well as React renders.
    const contentChanged = (event: Event) => {
      if (observed?.open && event.target instanceof Node && observed.contains(event.target))
        warm(observed);
    };
    listen(document, 'input', contentChanged, { capture: true });
    listen(document, 'change', contentChanged, { capture: true });
    listen(document, 'toggle', contentChanged, { capture: true });
    detach = () => {
      cleanups.forEach((cleanup) => cleanup());
      detach = undefined;
    };
  };
  const warm = (surface: HTMLDialogElement) => {
    bind();
    observed = surface;
    clearTimeout(warmTimer);
    if (reduced() || !surface.open || document.hidden || finishActive) return;
    warmTimer = setTimeout(() => {
      if (!surface.open || reduced() || document.hidden || finishActive) return;
      const key = snapshotKey(surface);
      if (cached?.key === key || preparing?.key === key) return;
      preparing?.controller.abort();
      const clone = cloneSurface(surface);
      if (!clone) return;
      const controller = new AbortController();
      const task = { key, controller };
      preparing = task;
      const deadline = setTimeout(() => controller.abort(), 700);
      void rasterizeSurface(clone, surface.offsetWidth, surface.offsetHeight, controller.signal)
        .then((bitmap) => {
          if (!bitmap) return;
          if (controller.signal.aborted || !surface.isConnected || snapshotKey(surface) !== key)
            release(bitmap);
          else remember(key, bitmap);
        })
        .catch(() => {
          // Preparation is decorative. A browser rasterizer failure leaves the
          // real surface available and the next minimize uses an immediate path.
          controller.abort();
        })
        .finally(() => {
          clearTimeout(deadline);
          if (preparing === task) preparing = undefined;
        });
    }, 60);
  };

  const transition = (surface: HTMLDialogElement, dock: HTMLElement, reverse: boolean) => {
    bind();
    observed = surface;
    cancel();
    const preferences = preferencesState();
    if (preferences !== acceptedPreferences) clearCache();
    acceptedPreferences = preferences;
    if (
      reduced() ||
      document.hidden ||
      !surface.open ||
      !dock.isConnected ||
      typeof HTMLElement.prototype.showPopover !== 'function'
    )
      return false;
    const source = surface.getBoundingClientRect();
    const dockRect = dock.getBoundingClientRect();
    if (!source.width || !source.height || !dockRect.width || !dockRect.height) return false;
    const target = dockMouth(dockRect);
    const key = snapshotKey(surface);
    const bitmap = cached?.key === key ? cached.bitmap : undefined;
    // The first open has no minimized image to restore. Show the usable dialog
    // immediately and prepare its real content for the first minimize.
    if (reverse && !bitmap) {
      warm(surface);
      return false;
    }
    const clone = bitmap ? null : cloneSurface(surface);
    if (!bitmap && !clone) return false;
    const layer = document.createElement('div');
    layer.className = 'genie-layer';
    layer.dataset.direction = reverse ? 'restore' : 'minimize';
    layer.dataset.phase = 'preparing';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('popover', 'manual');
    layer.inert = true;
    Object.assign(layer.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      maxWidth: 'none',
      maxHeight: 'none',
      margin: '0',
      padding: '0',
      border: '0',
      background: 'transparent',
      overflow: 'visible',
      pointerEvents: 'none',
    });
    let canvas: HTMLCanvasElement | undefined;
    let mesh: ReturnType<typeof createGenieMesh> = null;
    let clock: Animation | undefined;
    let frame = 0;
    let ended = false;
    let prepTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const originalOpacity = surface.style.opacity;
    const originalPriority = surface.style.getPropertyPriority('opacity');
    let concealed = false;
    const version = generation;
    const initialView = viewState();
    const finish = () => {
      if (ended) return;
      ended = true;
      controller.abort();
      clearTimeout(prepTimer);
      cancelAnimationFrame(frame);
      clock?.cancel();
      layer.remove();
      mesh?.dispose();
      release(canvas);
      if (concealed) {
        if (originalOpacity)
          surface.style.setProperty('opacity', originalOpacity, originalPriority);
        else surface.style.removeProperty('opacity');
        surface.removeAttribute('data-genie-restoring');
      }
      if (finishActive === finish) {
        finishActive = undefined;
        activeView = undefined;
        activeScroll = undefined;
      }
    };
    const animate = (snapshot: HTMLCanvasElement) => {
      if (ended || generation !== version || viewState() !== initialView) {
        finish();
        return;
      }
      clearTimeout(prepTimer);
      const scale = Math.min(devicePixelRatio || 1, 2);
      const makeCanvas = () => {
        const element = document.createElement('canvas');
        element.className = 'genie-canvas';
        element.width = Math.ceil(innerWidth * scale);
        element.height = Math.ceil(innerHeight * scale);
        Object.assign(element.style, {
          position: 'absolute',
          inset: '0',
          width: `${innerWidth}px`,
          height: `${innerHeight}px`,
          pointerEvents: 'none',
        });
        return element;
      };
      canvas = makeCanvas();
      mesh = createGenieMesh(canvas, snapshot);
      if (!mesh) canvas = makeCanvas();
      const context = mesh ? null : canvas.getContext('2d');
      if (!mesh && !context) {
        finish();
        return;
      }
      const imageWidth = snapshot.width;
      const imageHeight = snapshot.height;
      canvas.dataset.renderer = mesh ? 'webgl' : 'canvas';
      const count = mesh
        ? 128
        : Math.min(
            1600,
            Math.ceil(Math.max(source.height, target.y + target.height - source.y) * scale),
          );
      const paint = (progress: number) => {
        if (!canvas) return;
        const rows = genieGeometry(source, target, progress, count);
        const alpha = progress > 0.96 ? Math.max(0, (1 - progress) / 0.04) : 1;
        if (mesh) {
          if (!mesh.paint(rows, alpha)) throw Error('Motion surface unavailable');
        } else if (context) {
          context.setTransform(scale, 0, 0, scale, 0, 0);
          context.clearRect(0, 0, innerWidth, innerHeight);
          context.globalAlpha = alpha;
          const imageRow = imageHeight / count;
          rows.forEach(({ top, bottom }, index) => {
            const left = (top.left + bottom.left) / 2;
            const width = (top.right + bottom.right) / 2 - left;
            const y = Math.round(top.y * scale) / scale;
            const height = Math.round(bottom.y * scale) / scale - y;
            if (height > 0)
              context.drawImage(
                snapshot,
                0,
                index * imageRow,
                imageWidth,
                imageRow,
                left,
                y,
                width,
                height,
              );
          });
        }
        canvas.dataset.progress = String(progress);
      };
      try {
        paint(reverse ? 1 : 0);
        layer.replaceChildren(canvas);
        layer.dataset.phase = 'animating';
        if (reverse) {
          surface.style.setProperty('opacity', '0', 'important');
          surface.setAttribute('data-genie-restoring', 'true');
          concealed = true;
        }
        canvas.addEventListener('webglcontextlost', finish, { once: true });
        const duration = reverse ? GENIE_OPEN_MS : GENIE_CLOSE_MS;
        clock = canvas.animate([{ opacity: 1 }, { opacity: 1 }], {
          duration,
          easing: 'linear',
          fill: 'both',
        });
        clock.pause();
        clock.currentTime = 0;
        const tick = () => {
          if (ended || !clock) return;
          if (viewState() !== initialView) {
            finish();
            return;
          }
          const progress = Math.min(1, Number(clock.currentTime ?? 0) / duration);
          try {
            paint(reverse ? 1 - progress : progress);
          } catch {
            finish();
            return;
          }
          if (clock.playState === 'finished') {
            finish();
            return;
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(() => {
          clock?.play();
          tick();
        });
      } catch {
        finish();
      }
    };
    try {
      document.body.append(layer);
      layer.showPopover();
      finishActive = finish;
      activeView = initialView;
      activeScroll = scrollState(surface);
      if (bitmap) animate(bitmap);
      else if (clone) {
        // Serialize before positioning the temporary, inert clone. This lets
        // the actual dialog close immediately, including on a cold first use.
        const prepared = rasterizeSurface(clone, source.width, source.height, controller.signal);
        Object.assign(clone.style, {
          position: 'absolute',
          left: `${source.x}px`,
          top: `${source.y}px`,
        });
        layer.append(clone);
        prepTimer = setTimeout(finish, 240);
        void prepared
          .then((ready) => {
            if (!ready) {
              finish();
              return;
            }
            if (ended || version !== generation || controller.signal.aborted) {
              release(ready);
              return;
            }
            remember(key, ready);
            animate(ready);
          })
          .catch(finish);
      }
      return !ended;
    } catch {
      finish();
      return false;
    }
  };

  return {
    warm,
    minimize: (surface, dock) => transition(surface, dock, false),
    restore: (surface, dock) => transition(surface, dock, true),
    cancel,
    // Reusable after cleanup so React StrictMode's setup/cleanup rehearsal is
    // harmless. No global listener, bitmap or hidden surface survives disposal.
    dispose: () => {
      cancel();
      detach?.();
      observed = undefined;
      clearCache();
    },
  };
}

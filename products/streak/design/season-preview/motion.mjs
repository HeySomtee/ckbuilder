import { createMeshRenderer } from "./genie-mesh.mjs";
import {
  genieGeometry,
  GENIE_CLOSE_MS,
  GENIE_OPEN_MS,
} from "./genie-geometry.mjs";

let active;
let activeView;
const viewState = () =>
  [
    innerWidth,
    innerHeight,
    scrollX,
    scrollY,
    window.visualViewport?.width,
    window.visualViewport?.height,
    window.visualViewport?.offsetLeft,
    window.visualViewport?.offsetTop,
    window.visualViewport?.scale,
  ].join("|");
const stopIfViewChanged = () => {
  if (active && activeView !== viewState()) stopMotion();
};
const prepared = new Map();
const preparing = new Map();
let warmTimer;
const surfaceKey = (surface) =>
  [
    surface.offsetWidth,
    surface.offsetHeight,
    surface.scrollTop,
    surface.textContent,
    matchMedia("(prefers-reduced-transparency: reduce)").matches,
    matchMedia("(prefers-contrast: more)").matches,
    matchMedia("(forced-colors: active)").matches,
    [...surface.querySelectorAll("input")]
      .map((input) => input.value)
      .join(","),
  ].join("|");
export const reducedMotion = () =>
  matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.dataset.reduced === "true";
export function stopMotion() {
  active?.();
  active = undefined;
  activeView = undefined;
}

function rimOutline(width, height, radii, inset = 0) {
  const left = inset,
    top = inset,
    right = width - inset,
    bottom = height - inset;
  const [tl, tr, br, bl] = radii.map((radius) =>
    Math.max(
      0,
      Math.min(radius - inset, (right - left) / 2, (bottom - top) / 2),
    ),
  );
  return [
    `M ${left + tl} ${top}`,
    `H ${right - tr} A ${tr} ${tr} 0 0 1 ${right} ${top + tr}`,
    `V ${bottom - br} A ${br} ${br} 0 0 1 ${right - br} ${bottom}`,
    `H ${left + bl} A ${bl} ${bl} 0 0 1 ${left} ${bottom - bl}`,
    `V ${top + tl} A ${tl} ${tl} 0 0 1 ${left + tl} ${top} Z`,
  ].join(" ");
}

// Rasterize once while the preview slip is idle. A single canvas deforms the
// cached image, avoiding repeated DOM painting and WebKit projective clipping.
// No screen capture, network request, user key or wallet surface is involved.
async function prepareSurface(surface, key) {
  const width = surface.offsetWidth,
    height = surface.offsetHeight;
  const wrapper = document.createElement("div");
  const rootStyle = getComputedStyle(surface);
  wrapper.style.cssText = Array.from(
    rootStyle,
    (p) => `${p}:${rootStyle.getPropertyValue(p)};`,
  ).join("");
  Object.assign(wrapper.style, {
    position: "relative",
    inset: "auto",
    margin: "0",
    width: `${width}px`,
    height: `${height}px`,
    maxWidth: "none",
    maxHeight: "none",
    transform: "none",
    animation: "none",
    opacity: "1",
    boxShadow: "none",
    backdropFilter: "none",
    webkitBackdropFilter: "none",
    overflow: "hidden",
  });
  const tree = surface.cloneNode(true);
  const pinned = [];
  const surfaceRect = surface.getBoundingClientRect();
  const borderTop = parseFloat(rootStyle.borderTopWidth) || 0;
  const borderLeft = parseFloat(rootStyle.borderLeftWidth) || 0;
  const originals = surface.querySelectorAll("*"),
    copies = tree.querySelectorAll("*");
  originals.forEach((original, i) => {
    const copy = copies[i];
    const style = getComputedStyle(original);
    copy.style.cssText = Array.from(
      style,
      (p) => `${p}:${style.getPropertyValue(p)};`,
    ).join("");
    copy.style.animation = "none";
    copy.style.transition = "none";
    copy.style.backdropFilter = "none";
    copy.style.webkitBackdropFilter = "none";
    // Interaction focus belongs to the real controls, not their flying image.
    copy.style.outline = "none";
    if (style.position === "sticky") {
      pinned.push({
        copy,
        rect: original.getBoundingClientRect(),
        children: original.classList.contains("slip-footer")
          ? [...original.children].map((child, index) => ({
              copy: copy.children[index],
              rect: child.getBoundingClientRect(),
            }))
          : [],
      });
    }
    for (const attr of [
      "id",
      "for",
      "autofocus",
      "tabindex",
      "data-action",
      "aria-labelledby",
    ])
      copy.removeAttribute(attr);
    if (original instanceof HTMLInputElement) {
      const value = document.createElement("div");
      value.style.cssText = copy.style.cssText;
      value.textContent = original.value;
      value.style.display = "block";
      copy.replaceWith(value);
    }
  });
  // SVG foreignObject serialization does not include generated content. Copy
  // only the marked glass rims, after measuring all real sticky controls, so
  // the decorative border travels with its surface without changing layout.
  originals.forEach((original, i) => {
    const style = getComputedStyle(original, "::before");
    if (
      style.getPropertyValue("--preview-specular").trim() !== "1" ||
      style.content === "none" ||
      style.content === "normal"
    )
      return;
    const rim = document.createElement("span");
    rim.setAttribute("aria-hidden", "true");
    rim.inert = true;
    rim.style.cssText = Array.from(
      style,
      (p) => `${p}:${style.getPropertyValue(p)};`,
    ).join("");
    Object.assign(rim.style, {
      content: "none",
      animation: "none",
      transition: "none",
      pointerEvents: "none",
    });
    const measuredWidth = parseFloat(style.width);
    const measuredHeight = parseFloat(style.height);
    const contentBox = style.boxSizing !== "border-box";
    const extraWidth = contentBox
      ? [
          style.paddingLeft,
          style.paddingRight,
          style.borderLeftWidth,
          style.borderRightWidth,
        ].reduce((total, value) => total + (parseFloat(value) || 0), 0)
      : 0;
    const extraHeight = contentBox
      ? [
          style.paddingTop,
          style.paddingBottom,
          style.borderTopWidth,
          style.borderBottomWidth,
        ].reduce((total, value) => total + (parseFloat(value) || 0), 0)
      : 0;
    const width = Number.isFinite(measuredWidth)
      ? measuredWidth + extraWidth
      : original.clientWidth;
    const height = Number.isFinite(measuredHeight)
      ? measuredHeight + extraHeight
      : original.clientHeight;
    const edge = parseFloat(style.borderTopWidth) || 1;
    const radii = [
      style.borderTopLeftRadius,
      style.borderTopRightRadius,
      style.borderBottomRightRadius,
      style.borderBottomLeftRadius,
    ].map((radius) => parseFloat(radius) || 0);
    // A pair of full-surface CSS masks is expensive inside WebKit's SVG
    // rasterizer. The fixed snapshot can use one equivalent rounded ring clip,
    // keeping the computed highlight gradient without the two mask layers.
    const outline = `path(evenodd, "${rimOutline(width, height, radii)} ${rimOutline(width, height, radii, edge)}")`;
    if (CSS.supports("clip-path", outline)) {
      Object.assign(rim.style, {
        mask: "none",
        webkitMask: "none",
        clipPath: outline,
        webkitClipPath: outline,
      });
    }
    copies[i].prepend(rim);
  });
  const content = document.createElement("div");
  content.style.cssText = `position:relative;transform:translateY(${-surface.scrollTop}px);`;
  while (tree.firstChild) content.append(tree.firstChild);
  wrapper.append(content);
  wrapper
    .querySelectorAll("script,style,link,iframe,object,embed,video,canvas")
    .forEach((el) => el.remove());
  // A rasterized foreignObject has no scrolling viewport. Preserve each sticky
  // control at its measured visible position, retaining its space in the flow.
  for (const { copy, rect, children } of pinned) {
    const placeholder = copy.cloneNode(false);
    placeholder.style.visibility = "hidden";
    placeholder.style.position = "relative";
    placeholder.style.inset = "auto";
    copy.before(placeholder);
    Object.assign(copy.style, {
      position: "absolute",
      inset: "auto",
      top: `${rect.top - surfaceRect.top - borderTop}px`,
      left: `${rect.left - surfaceRect.left - borderLeft}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      boxSizing: "border-box",
      margin: "0",
      transform: "none",
    });
    // Computed pixel heights can change margin collapsing in the clone. Keep
    // the payment controls exactly where the user saw them before minimizing.
    const topBorder = parseFloat(copy.style.borderTopWidth) || 0;
    const leftBorder = parseFloat(copy.style.borderLeftWidth) || 0;
    for (const { copy: child, rect: childRect } of children) {
      Object.assign(child.style, {
        position: "absolute",
        inset: "auto",
        top: `${childRect.top - rect.top - topBorder}px`,
        left: `${childRect.left - rect.left - leftBorder}px`,
        width: `${childRect.width}px`,
        height: `${childRect.height}px`,
        boxSizing: "border-box",
        margin: "0",
      });
    }
    wrapper.append(copy);
  }
  const markup = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject x="0" y="0" width="100%" height="100%">${markup}</foreignObject></svg>`;
  const vector = new Image();
  vector.decoding = "async";
  vector.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await vector.decode();
  // Materialize the foreignObject once. Leaving it as a vector image makes
  // WebKit repaint its full HTML tree for every transformed band.
  const scale = Math.min(devicePixelRatio || 1, 2);
  const raster = document.createElement("canvas");
  raster.width = Math.ceil(width * scale);
  raster.height = Math.ceil(height * scale);
  const context = raster.getContext("2d");
  if (!context) return;
  context.scale(scale, scale);
  context.drawImage(vector, 0, 0, width, height);
  // Both rendering paths accept a canvas directly. Keep this raster in memory
  // instead of blocking the click flow on a PNG encode/decode round trip.
  prepared.set(key, raster);
  while (prepared.size > 3) prepared.delete(prepared.keys().next().value);
}
export function ensureSurface(surface) {
  if (reducedMotion() || !surface.open) return Promise.resolve(null);
  const key = surfaceKey(surface);
  const bitmap = prepared.get(key);
  if (bitmap) return Promise.resolve(bitmap);
  if (preparing.has(key)) return preparing.get(key);
  let timeout;
  const task = Promise.race([
    prepareSurface(surface, key).then(() => prepared.get(key) || null),
    new Promise((resolve) => {
      timeout = setTimeout(() => resolve(null), 700);
    }),
  ])
    .catch(() => null)
    .finally(() => {
      clearTimeout(timeout);
      preparing.delete(key);
    });
  preparing.set(key, task);
  return task;
}

export function warmSurface(surface, { eager = false } = {}) {
  clearTimeout(warmTimer);
  if (reducedMotion()) return;
  warmTimer = setTimeout(
    () => {
      if (!surface.open || surface.classList.contains("genie-restoring"))
        return;
      ensureSurface(surface);
    },
    eager ? 0 : 80,
  );
}

// This is an inert image of the synthetic preview slip, never a wallet prompt.
// The synchronous cache is an optimization. Click handlers call ensureSurface
// on a miss, so a new slip or freshly edited amount still gets its transition.
export function captureSurface(surface) {
  return prepared.get(surfaceKey(surface)) || null;
}

export function ticketGenie(
  source,
  target,
  snapshot,
  { reverse = false, surface = null } = {},
) {
  stopMotion();
  if (reducedMotion() || !snapshot || !source?.width || !target?.width)
    return false;
  const supportsTopLayer =
    typeof HTMLElement.prototype.showPopover === "function";
  if (surface && !supportsTopLayer) return false;
  const layer = document.createElement("div");
  layer.className = "genie-layer";
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  layer.dataset.direction = reverse ? "restore" : "minimize";
  if (supportsTopLayer) layer.setAttribute("popover", "manual");
  const scale = Math.min(devicePixelRatio || 1, 2);
  const makeCanvas = () => {
    const element = document.createElement("canvas");
    element.className = "genie-canvas";
    element.width = Math.ceil(innerWidth * scale);
    element.height = Math.ceil(innerHeight * scale);
    element.style.width = `${innerWidth}px`;
    element.style.height = `${innerHeight}px`;
    return element;
  };
  let canvas = makeCanvas();
  const mesh = createMeshRenderer(canvas, snapshot);
  // A canvas cannot switch context types after WebGL initialization fails.
  if (!mesh) canvas = makeCanvas();
  const context = mesh ? null : canvas.getContext("2d");
  if (!mesh && !context) return false;
  const snapshotWidth = snapshot.naturalWidth || snapshot.width;
  const snapshotHeight = snapshot.naturalHeight || snapshot.height;
  canvas.dataset.renderer = mesh ? "webgl" : "canvas";
  const duration = reverse ? GENIE_OPEN_MS : GENIE_CLOSE_MS;
  const count = mesh
    ? 128
    : Math.min(
        2048,
        Math.ceil(
          Math.max(source.height, target.y + target.height - source.y) * scale,
        ),
      );
  let disposed = false,
    frame = 0,
    clock;
  const finish = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    clock?.cancel();
    layer.remove();
    mesh?.dispose();
    // Release the backing store immediately on cancellation or completion.
    canvas.width = 0;
    canvas.height = 0;
    if (surface) {
      surface.classList.remove("genie-restoring");
      surface.style.animation = "none";
    }
    if (active === finish) {
      active = undefined;
      activeView = undefined;
    }
  };
  const paint = (progress) => {
    const rows = genieGeometry(source, target, progress, count);
    if (!rows.length) throw new Error("Invalid motion geometry");
    const alpha = progress > 0.96 ? Math.max(0, (1 - progress) / 0.04) : 1;
    if (mesh) {
      if (!mesh.paint(rows, alpha))
        throw new Error("Motion surface unavailable");
      canvas.dataset.progress = String(progress);
      return;
    }
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, innerWidth, innerHeight);
    context.globalAlpha = alpha;
    // Align adjacent rows to device pixels. Fractional vertical drawImage
    // bounds otherwise leave translucent horizontal seams in WebKit.
    const imageRow = snapshotHeight / count;
    for (let i = 0; i < rows.length; i++) {
      const { top, bottom } = rows[i];
      const left = (top.left + bottom.left) / 2;
      const width = (top.right + bottom.right) / 2 - left;
      const y = Math.round(top.y * scale) / scale;
      const height = Math.round(bottom.y * scale) / scale - y;
      if (height > 0)
        context.drawImage(
          snapshot,
          0,
          i * imageRow,
          snapshotWidth,
          imageRow,
          left,
          y,
          width,
          height,
        );
    }
    canvas.dataset.progress = String(progress);
  };
  canvas.addEventListener("webglcontextlost", finish, { once: true });
  try {
    layer.append(canvas);
    document.body.append(layer);
    if (supportsTopLayer) layer.showPopover();
    paint(reverse ? 1 : 0);
    if (surface) surface.classList.add("genie-restoring");
    // One browser timeline drives every row. Keeping the native clock also
    // allows deterministic pausing and frame inspection in developer tools.
    clock = canvas.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration,
      easing: "linear",
      fill: "both",
    });
    clock.pause();
    clock.currentTime = 0;
    active = finish;
    activeView = viewState();
    const tick = () => {
      if (disposed) return;
      const time = Math.min(1, Number(clock.currentTime || 0) / duration);
      try {
        paint(reverse ? 1 - time : time);
      } catch {
        finish();
        return;
      }
      if (clock.playState === "finished") {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(() => {
      if (disposed) return;
      clock.play();
      tick();
    });
    return true;
  } catch {
    finish();
    return false;
  }
}

document.addEventListener(
  "pointerdown",
  () => {
    if (active) stopMotion();
  },
  { capture: true, passive: true },
);
document.addEventListener(
  "keydown",
  () => {
    if (active) stopMotion();
  },
  { capture: true },
);
window.addEventListener("resize", stopIfViewChanged, { passive: true });
window.addEventListener("scroll", stopIfViewChanged, { passive: true });
window.addEventListener("wheel", stopMotion, { passive: true });
window.visualViewport?.addEventListener("resize", stopIfViewChanged, {
  passive: true,
});
window.visualViewport?.addEventListener("scroll", stopIfViewChanged, {
  passive: true,
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopMotion();
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
  "change",
  stopMotion,
);
for (const preference of [
  "(prefers-reduced-transparency: reduce)",
  "(prefers-contrast: more)",
  "(forced-colors: active)",
])
  matchMedia(preference).addEventListener("change", stopMotion);

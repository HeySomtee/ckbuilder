// One geometry and motion source for the Season app and retained legacy pages.
// Native SVG timelines keep the links attached without a JavaScript frame loop.
const samples = Array.from({ length: 33 }, (_, i) => (i / 32) * Math.PI * 2);
const waveY = (time, cell) => (10 + 3.8 * Math.sin(time - (cell * Math.PI) / 2)).toFixed(3);
const animate = (attribute, values) =>
  `<animate attributeName="${attribute}" values="${values.join(';')}" begin="indefinite" dur="2.4s" repeatCount="indefinite" calcMode="linear"/>`;
const waveLinks = [0, 1]
  .map((i) => {
    const x = 14 + i * 20;
    return `<path class="cell-link ${i ? 'second' : 'first'}" pathLength="1" d="M${x} 14h12">${animate(
      'd',
      samples.map(
        (t) =>
          `M${x} ${(+waveY(t, i) + 4).toFixed(3)}L${x + 12} ${(+waveY(t, i + 1) + 4).toFixed(3)}`,
      ),
    )}</path>`;
  })
  .join('');
const waveCells = ['home', 'draw', 'away']
  .map(
    (color, i) =>
      `<rect class="cell-block ${color}" x="${6 + i * 20}" y="10" width="8" height="8" rx="1.1">${animate(
        'y',
        samples.map((t) => waveY(t, i)),
      )}</rect>`,
  )
  .join('');
const markup = {
  orbit:
    '<svg class="cell-loader cell-loader--orbit" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><g class="cell-orbit"><g class="cell-pulse"><path class="cell-link" d="M22.3 13l4.9 8.5"/><path class="cell-link" d="M25.5 25.5h-11"/><rect class="cell-block home" x="16" y="5" width="8" height="8" rx="1.1"/><rect class="cell-block draw" x="25.5" y="21.5" width="8" height="8" rx="1.1"/><rect class="cell-block away" x="6.5" y="21.5" width="8" height="8" rx="1.1"/></g></g></svg>',
  wave: `<svg class="cell-loader cell-loader--wave" viewBox="0 0 60 28" aria-hidden="true" focusable="false">${waveLinks}${waveCells}</svg>`,
};

/** Fixed internal SVG only. Labels and other caller text never enter this markup. */
export function cellLoaderMarkup(variant = 'orbit') {
  return variant === 'wave' ? markup.wave : markup.orbit;
}

const registered = new Map();
let preference;
function syncAll() {
  for (const sync of registered.values()) sync();
}

/** Suspend hidden-page work and restore genuinely static geometry for reduced motion. */
export function registerCellLoader(svg) {
  if (registered.has(svg)) return () => {};
  if (!preference) preference = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = [...svg.querySelectorAll('animate')].map((node) => ({
    node,
    parent: node.parentNode,
  }));
  let frame = 0;
  let started = false;
  let reduced;
  const sync = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    const changed = reduced !== preference.matches;
    reduced = preference.matches;
    svg.dataset.reduced = String(reduced);
    svg.dataset.paused = String(document.hidden || reduced);
    if (changed) {
      started = false;
      for (const { node, parent } of animations) {
        if (reduced) node.remove();
        else if (!node.isConnected) parent.appendChild(node);
      }
    }
    if (document.hidden || reduced) {
      svg.pauseAnimations();
      return;
    }
    svg.unpauseAnimations();
    if (!started && animations.length) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!svg.isConnected || document.hidden || preference.matches) return;
        for (const { node } of animations) node.beginElement();
        svg.unpauseAnimations();
        started = true;
      });
    }
  };
  if (!registered.size) {
    document.addEventListener('visibilitychange', syncAll);
    preference.addEventListener('change', syncAll);
  }
  registered.set(svg, sync);
  sync();
  return () => {
    cancelAnimationFrame(frame);
    svg.pauseAnimations();
    // React StrictMode may register the same mounted SVG again after cleanup.
    for (const { node, parent } of animations) {
      if (!node.parentNode) parent.appendChild(node);
    }
    registered.delete(svg);
    if (!registered.size) {
      document.removeEventListener('visibilitychange', syncAll);
      preference.removeEventListener('change', syncAll);
    }
  };
}

/** Legacy views replace HTML; attach only to new loaders and release removed ones. */
export function observeCellLoaders(root) {
  const owned = new Map();
  const discover = (node) => {
    if (!(node instanceof Element) || !root.contains(node)) return;
    const loaders = node.matches('svg.cell-loader')
      ? [node]
      : node.querySelectorAll('svg.cell-loader');
    for (const svg of loaders) {
      if (!owned.has(svg)) owned.set(svg, registerCellLoader(svg));
    }
  };
  discover(root);
  const observer = new MutationObserver((changes) => {
    for (const [svg, cleanup] of owned) {
      if (!root.contains(svg)) {
        cleanup();
        owned.delete(svg);
      }
    }
    for (const change of changes) for (const node of change.addedNodes) discover(node);
  });
  observer.observe(root, { subtree: true, childList: true });
  return () => {
    observer.disconnect();
    for (const cleanup of owned.values()) cleanup();
    owned.clear();
  };
}

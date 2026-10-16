// Only the explicit, public prediction surface is copied. No page screenshot,
// wallet surface, network fetch, storage, or durable image cache is involved.
const properties = [
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'box-sizing',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'background-color',
  'background-image',
  'background-size',
  'background-position',
  'background-clip',
  'color',
  'opacity',
  'visibility',
  'overflow',
  'overflow-x',
  'overflow-y',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant-numeric',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-transform',
  'text-decoration',
  'white-space',
  'word-break',
  'overflow-wrap',
  'text-overflow',
  'vertical-align',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'order',
  'align-items',
  'align-self',
  'align-content',
  'justify-content',
  'justify-items',
  'justify-self',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  'gap',
  'row-gap',
  'column-gap',
  'object-fit',
  'object-position',
  'transform',
  'transform-origin',
  'clip-path',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
];

function copyStyle(original: Element, copy: HTMLElement | SVGElement) {
  const style = getComputedStyle(original);
  copy.style.cssText = '';
  for (const property of properties) {
    const value = style.getPropertyValue(property);
    // The renderer never follows URLs embedded in computed styles.
    if (!value.includes('url(')) copy.style.setProperty(property, value);
  }
  copy.style.setProperty('animation', 'none');
  copy.style.setProperty('transition', 'none');
  copy.style.setProperty('pointer-events', 'none');
  copy.style.setProperty('outline', 'none');
  if (
    original instanceof HTMLElement &&
    /auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)
  ) {
    // A foreignObject must not create its own native scroll controls. Keep the
    // real viewport and its reserved gutter, then offset the copied children.
    // Otherwise Chromium paints white UA scrollbars into the moving texture.
    const verticalGutter = Math.max(
      0,
      original.offsetWidth -
        original.clientWidth -
        (parseFloat(style.borderLeftWidth) || 0) -
        (parseFloat(style.borderRightWidth) || 0),
    );
    const horizontalGutter = Math.max(
      0,
      original.offsetHeight -
        original.clientHeight -
        (parseFloat(style.borderTopWidth) || 0) -
        (parseFloat(style.borderBottomWidth) || 0),
    );
    copy.style.overflow = 'hidden';
    copy.style.paddingRight = `${(parseFloat(style.paddingRight) || 0) + verticalGutter}px`;
    copy.style.paddingBottom = `${(parseFloat(style.paddingBottom) || 0) + horizontalGutter}px`;
  }
  return style;
}

function copyRim(original: Element, copy: Element) {
  const style = getComputedStyle(original, '::before');
  if (style.content === 'none' || style.content === 'normal' || style.position !== 'absolute')
    return;
  const rim = document.createElement('span');
  for (const property of properties) {
    const value = style.getPropertyValue(property);
    if (!value.includes('url(')) rim.style.setProperty(property, value);
  }
  // An inset ring avoids WebKit's expensive two-mask rasterization. It keeps
  // the measured gradient/radii while leaving all centre content untouched.
  const width = original.getBoundingClientRect().width;
  const height = original.getBoundingClientRect().height;
  const radius = Math.min(parseFloat(style.borderTopLeftRadius) || 22, width / 2, height / 2);
  const outline = (inset: number) => {
    const r = Math.max(0, radius - inset);
    const right = width - inset;
    const bottom = height - inset;
    return `M ${inset + r} ${inset} H ${right - r} Q ${right} ${inset} ${right} ${inset + r} V ${bottom - r} Q ${right} ${bottom} ${right - r} ${bottom} H ${inset + r} Q ${inset} ${bottom} ${inset} ${bottom - r} V ${inset + r} Q ${inset} ${inset} ${inset + r} ${inset} Z`;
  };
  Object.assign(rim.style, {
    position: 'absolute',
    inset: '0',
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: 'none',
    padding: '0',
    margin: '0',
    clipPath: `path(evenodd, "${outline(0)} ${outline(1)}")`,
  });
  copy.prepend(rim);
}

function staticImage(original: HTMLImageElement, copy: HTMLImageElement) {
  copy.removeAttribute('src');
  copy.removeAttribute('srcset');
  if (!original.complete || !original.naturalWidth) return;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(128, original.naturalWidth);
  canvas.height = Math.max(
    1,
    Math.round((canvas.width * original.naturalHeight) / original.naturalWidth),
  );
  const context = canvas.getContext('2d');
  if (!context) return;
  try {
    context.drawImage(original, 0, 0, canvas.width, canvas.height);
    copy.src = canvas.toDataURL();
  } catch {
    // A provider logo without CORS cannot enter a local raster. Keep its
    // measured frame and alt text; never issue another request to work around it.
    copy.style.visibility = 'hidden';
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function snapshotKey(surface: HTMLDialogElement) {
  return JSON.stringify([
    surface.offsetWidth,
    surface.offsetHeight,
    surface.scrollTop,
    surface.textContent,
    [...surface.querySelectorAll('input')].map((input) => [input.type, input.value]),
    [...surface.querySelectorAll('*')]
      .filter((element) => element.scrollTop)
      .map((element) => element.scrollTop),
    [...surface.querySelectorAll('img')].map((image) => [image.currentSrc, image.complete]),
    [...surface.querySelectorAll('details')].map((details) => details.open),
    matchMedia('(prefers-reduced-transparency: reduce)').matches,
    matchMedia('(prefers-contrast: more)').matches,
  ]);
}

export function cloneSurface(surface: HTMLDialogElement): HTMLDivElement | null {
  try {
    return buildSurface(surface);
  } catch {
    // Unsupported computed styles or allocation failures cannot break the
    // actual slip. Its controller will use the immediate state transition.
    return null;
  }
}

function buildSurface(surface: HTMLDialogElement): HTMLDivElement | null {
  if (surface.querySelector('input[type=password],iframe,[data-private],[data-wallet]'))
    return null;
  const originals = [...surface.querySelectorAll('*')];
  if (originals.length > 500 || surface.offsetWidth > 1600 || surface.offsetHeight > 1600)
    return null;
  const tree = surface.cloneNode(true);
  if (!(tree instanceof HTMLElement)) return null;
  const copies = [...tree.querySelectorAll('*')];
  const root = document.createElement('div');
  copyStyle(surface, root);
  Object.assign(root.style, {
    position: 'relative',
    inset: 'auto',
    margin: '0',
    width: `${surface.offsetWidth}px`,
    height: `${surface.offsetHeight}px`,
    minWidth: '0',
    minHeight: '0',
    maxWidth: 'none',
    maxHeight: 'none',
    boxSizing: 'border-box',
    overflow: 'hidden',
    transform: 'none',
    opacity: '1',
    boxShadow: 'none',
  });
  root.inert = true;
  root.setAttribute('aria-hidden', 'true');
  originals.forEach((original, index) => {
    const copy = copies[index];
    if (!(copy instanceof HTMLElement || copy instanceof SVGElement)) return;
    copyStyle(original, copy);
    for (const attribute of [...copy.attributes]) {
      if (attribute.name === 'style') continue;
      if (
        ['id', 'class', 'for', 'autofocus', 'tabindex', 'href', 'srcset', 'name', 'form'].includes(
          attribute.name,
        ) ||
        attribute.name.endsWith(':href') ||
        attribute.name.startsWith('on') ||
        attribute.name.startsWith('aria-') ||
        attribute.name.startsWith('data-')
      )
        copy.removeAttribute(attribute.name);
    }
    if (original instanceof HTMLImageElement && copy instanceof HTMLImageElement)
      staticImage(original, copy);
    if (original instanceof HTMLInputElement || original instanceof HTMLTextAreaElement) {
      const value = document.createElement('div');
      value.style.cssText = copy.style.cssText;
      value.style.display = 'block';
      value.style.overflow = 'hidden';
      value.style.whiteSpace = 'nowrap';
      value.textContent = original.value;
      copy.replaceWith(value);
    }
  });
  originals.forEach((original, index) => {
    const copy = copies[index];
    if (!copy.isConnected && !tree.contains(copy)) return;
    // Preserve nested native scroll positions without a live scroll viewport.
    if (original.scrollTop) {
      for (const child of copy.children)
        if (child instanceof HTMLElement) {
          child.style.position = 'relative';
          child.style.top = `${-original.scrollTop}px`;
        }
    }
    copyRim(original, copy);
  });
  while (tree.firstChild) root.append(tree.firstChild);
  if (surface.scrollTop) {
    for (const child of root.children)
      if (child instanceof HTMLElement) {
        child.style.position = 'relative';
        child.style.top = `${-surface.scrollTop}px`;
      }
  }
  root
    .querySelectorAll('script,style,link,iframe,object,embed,video,audio,canvas,source')
    .forEach((element) => element.remove());
  copyRim(surface, root);
  return root;
}

export async function rasterizeSurface(
  clone: HTMLDivElement,
  width: number,
  height: number,
  signal: AbortSignal,
): Promise<HTMLCanvasElement | null> {
  const markup = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`;
  const vector = new Image();
  const loaded = new Promise<boolean>((resolve) => {
    const abort = () => {
      vector.removeAttribute('src');
      finish(false);
    };
    const finish = (success: boolean) => {
      signal.removeEventListener('abort', abort);
      vector.onload = null;
      vector.onerror = null;
      resolve(success);
    };
    signal.addEventListener('abort', abort, { once: true });
    vector.onload = () => finish(true);
    vector.onerror = () => finish(false);
    vector.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    if (signal.aborted) abort();
  });
  if (!(await loaded) || signal.aborted) return null;
  const scale = Math.min(devicePixelRatio || 1, 2);
  const raster = document.createElement('canvas');
  raster.width = Math.ceil(width * scale);
  raster.height = Math.ceil(height * scale);
  const context = raster.getContext('2d');
  if (!context) return null;
  try {
    context.scale(scale, scale);
    context.drawImage(vector, 0, 0, width, height);
    return raster;
  } catch {
    raster.width = 0;
    raster.height = 0;
    return null;
  }
}

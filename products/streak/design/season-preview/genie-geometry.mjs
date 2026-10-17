// Shared edges keep the curved silhouette continuous in either direction.
// Geometry is pure and expressed in viewport CSS pixels.
export const GENIE_STRIPS = 40;
export const GENIE_CLOSE_MS = 720;
export const GENIE_OPEN_MS = 620;
const clamp = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const valid = (rect) =>
  rect &&
  [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
  rect.width > 0 &&
  rect.height > 0;

export function dockMouth(rect) {
  const width = Math.min(20, rect.width * 0.6);
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + rect.height / 2 - 1.5,
    width,
    height: 3,
  };
}

export function genieGeometry(source, target, progress, count = GENIE_STRIPS) {
  if (
    !valid(source) ||
    !valid(target) ||
    !Number.isFinite(progress) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 2048
  )
    return [];
  const t = clamp(progress);
  // The foot forms first. The top starts moving only once a neck exists.
  const neck = smooth(t / 0.43);
  const pull = smooth((t - 0.38) / 0.62);
  const crown = smooth((t - 0.48) / 0.52);
  const sourceCenter = source.x + source.width / 2;
  const targetCenter = target.x + target.width / 2;
  const topY = mix(source.y, target.y, pull);
  const bottomY = mix(source.y + source.height, target.y + target.height, neck);
  const edge = (row) => {
    if (t === 0)
      return {
        left: source.x,
        right: source.x + source.width,
        y: source.y + source.height * row,
      };
    if (t === 1)
      return {
        left: target.x,
        right: target.x + target.width,
        y: target.y + target.height * row,
      };
    const bow = smooth(row) ** 2;
    const taper = crown + (1 - crown) * neck * bow;
    const width = mix(source.width, target.width, taper);
    const center = mix(sourceCenter, targetCenter, taper);
    return {
      left: center - width / 2,
      right: center + width / 2,
      y: mix(topY, bottomY, row),
    };
  };
  const strips = [];
  let top = edge(0);
  for (let i = 0; i < count; i++) {
    const bottom = edge((i + 1) / count);
    strips.push({
      y: (i * source.height) / count,
      height: source.height / count,
      top,
      bottom,
    });
    top = bottom;
  }
  return strips;
}

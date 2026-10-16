// A continuous surface, not a scaled rectangle. The foot narrows before the
// crown follows it into the dock. All coordinates are viewport CSS pixels.
export const GENIE_CLOSE_MS = 720;
export const GENIE_OPEN_MS = 620;
export type GenieRect = { x: number; y: number; width: number; height: number };
export type GenieEdge = { left: number; right: number; y: number };
export type GenieRow = { top: GenieEdge; bottom: GenieEdge };
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const valid = (rect: GenieRect) =>
  [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
  rect.width > 0 &&
  rect.height > 0;

export function dockMouth(rect: GenieRect): GenieRect {
  const width = Math.min(20, rect.width * 0.6);
  return {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + rect.height / 2 - 1.5,
    width,
    height: 3,
  };
}

export function genieGeometry(
  source: GenieRect,
  target: GenieRect,
  progress: number,
  count = 128,
): GenieRow[] {
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
  const neck = smooth(t / 0.43);
  const pull = smooth((t - 0.38) / 0.62);
  const crown = smooth((t - 0.48) / 0.52);
  const sourceCenter = source.x + source.width / 2;
  const targetCenter = target.x + target.width / 2;
  const topY = mix(source.y, target.y, pull);
  const bottomY = mix(source.y + source.height, target.y + target.height, neck);
  const edge = (row: number): GenieEdge => {
    if (t === 0)
      return { left: source.x, right: source.x + source.width, y: source.y + source.height * row };
    if (t === 1)
      return { left: target.x, right: target.x + target.width, y: target.y + target.height * row };
    const taper = crown + (1 - crown) * neck * smooth(row) ** 2;
    const width = mix(source.width, target.width, taper);
    const center = mix(sourceCenter, targetCenter, taper);
    return { left: center - width / 2, right: center + width / 2, y: mix(topY, bottomY, row) };
  };
  const rows: GenieRow[] = [];
  let top = edge(0);
  for (let index = 0; index < count; index++) {
    const bottom = edge((index + 1) / count);
    rows.push({ top, bottom });
    top = bottom;
  }
  return rows;
}

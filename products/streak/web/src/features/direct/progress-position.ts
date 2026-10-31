export type ProgressCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export interface ProgressPoint {
  x: number;
  y: number;
}
export interface ProgressBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export const progressSize = 56;

export function clearProgressPoint(
  point: ProgressPoint,
  bounds: ProgressBounds,
  obstacles: ProgressBounds[],
) {
  return (
    point.x >= bounds.left &&
    point.y >= bounds.top &&
    point.x + progressSize <= bounds.right &&
    point.y + progressSize <= bounds.bottom &&
    !obstacles.some(
      (rect) =>
        point.x < rect.right + 12 &&
        point.x + progressSize > rect.left - 12 &&
        point.y < rect.bottom + 12 &&
        point.y + progressSize > rect.top - 12,
    )
  );
}

/** Corners move inward past occupied UI, without covering it or leaving the viewport. */
export function progressCorners(bounds: ProgressBounds, obstacles: ProgressBounds[]) {
  const result: Partial<Record<ProgressCorner, ProgressPoint>> = {};
  for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const) {
    const top = corner.startsWith('top');
    const point = {
      x: corner.endsWith('left') ? bounds.left : bounds.right - progressSize,
      y: top ? bounds.top : bounds.bottom - progressSize,
    };
    for (let i = 0; i <= obstacles.length; i++) {
      const collision = obstacles.find(
        (rect) =>
          point.x < rect.right + 12 &&
          point.x + progressSize > rect.left - 12 &&
          point.y < rect.bottom + 12 &&
          point.y + progressSize > rect.top - 12,
      );
      if (!collision) break;
      point.y = top ? collision.bottom + 12 : collision.top - progressSize - 12;
    }
    if (clearProgressPoint(point, bounds, obstacles)) result[corner] = point;
  }
  return result;
}

export function nearestProgressCorner(
  point: ProgressPoint,
  corners: ReturnType<typeof progressCorners>,
) {
  return (Object.entries(corners) as [ProgressCorner, ProgressPoint][]).sort(
    (a, b) =>
      Math.hypot(a[1].x - point.x, a[1].y - point.y) -
      Math.hypot(b[1].x - point.x, b[1].y - point.y),
  )[0];
}

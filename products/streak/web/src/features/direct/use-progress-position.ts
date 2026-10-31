import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
  type CSSProperties,
} from 'react';
import {
  clearProgressPoint,
  nearestProgressCorner,
  progressCorners,
  progressSize,
  type ProgressCorner,
  type ProgressPoint,
  type ProgressBounds,
} from './progress-position';

const obstaclesSelector =
  '.topbar, .network-strip, .prediction-dock, .mobile-dock, dialog[open], [role="dialog"]:not([hidden])';
const mobileQuery = '(max-width: 1050px), (max-height: 620px)';
type Geometry = {
  bounds: ProgressBounds;
  obstacles: ProgressBounds[];
  corners: ReturnType<typeof progressCorners>;
};

/** Event-driven placement only. It never changes payment state or starts polling. */
export function useProgressPosition(enabled: boolean) {
  const host = useRef<HTMLElement>(null);
  const corner = useRef<ProgressCorner>('bottom-right');
  const geometry = useRef<Geometry | null>(null);
  const layoutKey = useRef('');
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    origin: ProgressPoint;
    moved: boolean;
  } | null>(null);
  const skipClick = useRef(false);
  const [placement, setPlacement] = useState<{ mobile: boolean; point: ProgressPoint | null }>({
    mobile: false,
    point: null,
  });
  function place(point: ProgressPoint | null, mobile = true) {
    setPlacement((old) =>
      old.mobile === mobile && old.point?.x === point?.x && old.point?.y === point?.y
        ? old
        : { mobile, point },
    );
  }
  useLayoutEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const media = matchMedia(mobileQuery);
    const observed = new Set<Element>();
    const resize = new ResizeObserver(schedule);
    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    function measure() {
      if (!media.matches) {
        geometry.current = null;
        place(null, false);
        return;
      }
      const view = window.visualViewport;
      const css = host.current && getComputedStyle(host.current);
      const safeTop = parseFloat(css?.getPropertyValue('--payment-safe-top') ?? '') || 0;
      const safeBottom = parseFloat(css?.getPropertyValue('--payment-safe-bottom') ?? '') || 0;
      const safeLeft = parseFloat(css?.getPropertyValue('--payment-safe-left') ?? '') || 0;
      const safeRight = parseFloat(css?.getPropertyValue('--payment-safe-right') ?? '') || 0;
      const left = view?.offsetLeft ?? 0,
        top = view?.offsetTop ?? 0;
      const bounds = {
        left: left + 16 + safeLeft,
        top: top + 16 + safeTop,
        right: left + (view?.width ?? document.documentElement.clientWidth) - 16 - safeRight,
        bottom: top + (view?.height ?? innerHeight) - 16 - safeBottom,
      };
      const elements = [...document.querySelectorAll<HTMLElement>(obstaclesSelector)].filter(
        (el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden',
      );
      for (const el of observed)
        if (!elements.includes(el as HTMLElement)) {
          resize.unobserve(el);
          observed.delete(el);
        }
      for (const el of elements)
        if (!observed.has(el)) {
          observed.add(el);
          resize.observe(el);
        }
      const obstacles = elements.map((el) => el.getBoundingClientRect());
      const corners = progressCorners(bounds, obstacles);
      const key = [bounds, ...obstacles]
        .map((rect) => `${rect.left},${rect.top},${rect.right},${rect.bottom}`)
        .join(';');
      const changed = key !== layoutKey.current;
      layoutKey.current = key;
      geometry.current = { bounds, obstacles, corners };
      // Native modal dialogs own the interaction layer. Restore the button when they close.
      if (elements.some((el) => el.matches('dialog[open], [aria-modal="true"]'))) {
        drag.current = null;
        place(null);
        return;
      }
      if (drag.current && !changed) return;
      if (drag.current) {
        drag.current = null;
        skipClick.current = true;
      }
      const preferred = {
        x: corner.current.endsWith('left') ? bounds.left : bounds.right - progressSize,
        y: corner.current.startsWith('top') ? bounds.top : bounds.bottom - progressSize,
      };
      place(corners[corner.current] ?? nearestProgressCorner(preferred, corners)?.[1] ?? null);
    }
    const mutations = new MutationObserver(schedule);
    mutations.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open', 'hidden', 'aria-hidden'],
    });
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    media.addEventListener('change', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      media.removeEventListener('change', schedule);
      drag.current = null;
    };
  }, [enabled]);

  const active = enabled && placement.mobile;
  function finish(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    skipClick.current = current.moved;
    const space = geometry.current;
    if (space && current.moved) {
      const target = cancel
        ? space.corners[corner.current]
        : { x: event.clientX - progressSize / 2, y: event.clientY - progressSize / 2 };
      const next = target && nearestProgressCorner(target, space.corners);
      if (next) {
        corner.current = next[0];
        place(next[1]);
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return {
    host,
    movable: active,
    blocked: active && !placement.point,
    style:
      active && placement.point
        ? ({
            left: placement.point.x,
            top: placement.point.y,
            right: 'auto',
            bottom: 'auto',
          } as CSSProperties)
        : undefined,
    consumeDragClick: (detail: number) => {
      const ignore = detail !== 0 && skipClick.current;
      skipClick.current = false;
      return ignore;
    },
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      skipClick.current = false;
      if (!active || !placement.point || event.button !== 0 || !event.isPrimary) return;
      drag.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        origin: placement.point,
        moved: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const current = drag.current,
        space = geometry.current;
      if (!current || current.id !== event.pointerId || !space) return;
      const dx = event.clientX - current.x,
        dy = event.clientY - current.y;
      if (Math.hypot(dx, dy) < 6 && !current.moved) return;
      current.moved = true;
      const point = {
        x: Math.max(
          space.bounds.left,
          Math.min(space.bounds.right - progressSize, current.origin.x + dx),
        ),
        y: Math.max(
          space.bounds.top,
          Math.min(space.bounds.bottom - progressSize, current.origin.y + dy),
        ),
      };
      if (clearProgressPoint(point, space.bounds, space.obstacles)) place(point);
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event),
    onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
    onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (!active || !event.key.startsWith('Arrow') || !geometry.current) return;
      event.preventDefault();
      const vertical =
        event.key === 'ArrowUp'
          ? 'top'
          : event.key === 'ArrowDown'
            ? 'bottom'
            : corner.current.split('-')[0];
      const horizontal =
        event.key === 'ArrowLeft'
          ? 'left'
          : event.key === 'ArrowRight'
            ? 'right'
            : corner.current.split('-')[1];
      const next = `${vertical}-${horizontal}` as ProgressCorner;
      const point = geometry.current.corners[next];
      if (point) {
        corner.current = next;
        place(point);
      }
    },
  };
}

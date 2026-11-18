import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const clampZoom = (value: number) => Math.min(1.6, Math.max(0.4, +value.toFixed(2)));
type Point = { x: number; y: number };

/** Native scrolling for pan; transform zoom and pointer work are coalesced once per frame. */
export function usePanZoom(stageRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(zoom);
  const appliedZoom = useRef(zoom);
  const frame = useRef(0);
  const pointers = useRef(new Map<number, Point>());
  const pan = useRef<{ point: Point; left: number; top: number } | null>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const moved = useRef(false);
  const pendingPan = useRef<Point | null>(null);
  const focal = useRef<Point | null>(null);
  const pendingScroll = useRef<Point | null>(null);

  const schedule = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const stage = stageRef.current;
      if (!stage) return;
      if (pendingPan.current) {
        stage.scrollLeft = pendingPan.current.x;
        stage.scrollTop = pendingPan.current.y;
        pendingPan.current = null;
      }
      const next = zoomRef.current;
      if (next === appliedZoom.current) return;
      const point = focal.current;
      if (point) {
        const rect = stage.getBoundingClientRect();
        const x = point.x - rect.left;
        const y = point.y - rect.top;
        const width = Number(
          stage.querySelector<HTMLElement>('[data-chart-width]')?.dataset.chartWidth ?? 0,
        );
        const oldOffset = Math.max(0, (stage.clientWidth - width * appliedZoom.current) / 2);
        const newOffset = Math.max(0, (stage.clientWidth - width * next) / 2);
        const ratio = next / appliedZoom.current;
        pendingScroll.current = {
          x: (stage.scrollLeft + x - oldOffset) * ratio + newOffset - x,
          y: (stage.scrollTop + y) * ratio - y,
        };
      }
      focal.current = null;
      setZoomState(next);
    });
  }, [stageRef]);

  const setZoom = useCallback(
    (value: number, point?: Point) => {
      zoomRef.current = clampZoom(value);
      focal.current = point ?? null;
      schedule();
    },
    [schedule],
  );
  const zoomBy = useCallback((delta: number) => setZoom(zoomRef.current + delta), [setZoom]);

  useLayoutEffect(() => {
    appliedZoom.current = zoom;
    if (stageRef.current && pendingScroll.current) {
      stageRef.current.scrollLeft = pendingScroll.current.x;
      stageRef.current.scrollTop = pendingScroll.current.y;
    }
    pendingScroll.current = null;
  }, [zoom, stageRef]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const stage = stageRef.current;
      if (!stage || event.button > 0) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) {
        pan.current = {
          point: { x: event.clientX, y: event.clientY },
          left: stage.scrollLeft,
          top: stage.scrollTop,
        };
        moved.current = false;
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: zoomRef.current };
        pan.current = null;
        pendingPan.current = null;
      }
    },
    [stageRef],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinch.current && pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        setZoom(
          (pinch.current.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / (pinch.current.distance || 1),
          { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        );
        moved.current = true;
      } else if (pan.current) {
        const dx = event.clientX - pan.current.point.x;
        const dy = event.clientY - pan.current.point.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
        pendingPan.current = { x: pan.current.left - dx, y: pan.current.top - dy };
        schedule();
      }
    },
    [schedule, setZoom],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!pointers.current.size) pan.current = null;
  }, []);
  const didPan = useCallback(() => moved.current, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !enabled) return;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom(zoomRef.current + (event.deltaY > 0 ? -0.1 : 0.1), {
        x: event.clientX,
        y: event.clientY,
      });
    };
    stage.addEventListener('wheel', wheel, { passive: false });
    return () => stage.removeEventListener('wheel', wheel);
  }, [enabled, setZoom, stageRef]);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      pendingPan.current = null;
      pendingScroll.current = null;
      focal.current = null;
      zoomRef.current = appliedZoom.current;
      pointers.current.clear();
      pan.current = null;
      pinch.current = null;
    },
    [enabled],
  );

  return { zoom, setZoom, zoomBy, onPointerDown, onPointerMove, onPointerUp, didPan };
}

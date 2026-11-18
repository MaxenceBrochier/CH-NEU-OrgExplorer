import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import type { OrgNode } from '../types';
import { CATEGORY_META, type CategoryId } from '../lib/categories';
import {
  DEFAULT_TAGS,
  chartWindow,
  intersects,
  layoutChart,
  measureCardHeights,
  queryChart,
  type Rect,
} from '../lib/chartLayout';
import { CategoryLegend, TreeBlock } from './OrgChart';
import { NodeCard } from './NodeCard';
import { t } from '../i18n';

interface Props {
  roots: OrgNode[];
  collapsed: Set<string>;
  visibleKeys: Set<string> | null;
  matchedKeys: Set<string>;
  categories: Map<string, CategoryId[]>;
  selectedKey: string | null;
  focusedKey: string | null;
  zoom: number;
  stageRef: RefObject<HTMLElement>;
  onToggle: (key: string) => void;
  onSelect: (node: OrgNode) => void;
}

export const OrgChart = memo(function OrgChart({
  roots,
  collapsed,
  visibleKeys,
  matchedKeys,
  categories,
  selectedKey,
  focusedKey,
  zoom,
  stageRef,
  onToggle,
  onSelect,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [legendHeight, setLegendHeight] = useState(28);
  const [minWidth, setMinWidth] = useState(() => stageRef.current?.clientWidth ?? 0);
  const [revision, setRevision] = useState(0);
  const { heights, measured } = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) throw new Error('Canvas text measurement is unavailable.');
    const family = getComputedStyle(document.documentElement).fontFamily;
    return {
      heights: measureCardHeights(roots, categories, (text, size, weight) => {
        context.font = `${weight} ${size}px ${family}`;
        return context.measureText(text).width;
      }),
      measured: new Set<string>(),
    };
  }, [roots, categories]);
  const layout = useMemo(
    () => layoutChart(roots, collapsed, visibleKeys, categories, heights, legendHeight, minWidth),
    // Measurements are retained when their cards leave the viewport.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roots, collapsed, visibleKeys, categories, heights, legendHeight, minWidth, revision],
  );
  const current = useRef({ layout, zoom });
  current.current = { layout, zoom };
  const updateViewport = useRef<() => void>();
  const [viewport, setViewport] = useState<Rect>({ x: 0, y: 0, width: 1536, height: 1536 });
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const anchor = useRef<{ key: string; offset: number } | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const reverseFocus = useRef(false);
  const pendingNavigation = useRef<string | null>(null);
  const lastFocused = useRef<string | null>(null);
  const indices = useMemo(() => queryChart(layout, viewport), [layout, viewport]);
  const visible = useMemo(() => {
    const items = indices.map((index) => layout.items[index]);
    const active = activeKey ? layout.cards.get(activeKey) : undefined;
    if (active && !items.includes(active)) items.push(active);
    return items.sort((a, b) => a.id - b.id);
  }, [indices, layout, activeKey]);

  const scrollToCard = useCallback(
    (key: string) => {
      const stage = stageRef.current;
      const card = layout.cards.get(key);
      if (!stage || !card) return;
      const offsetX = Math.max(0, (stage.clientWidth - layout.width * zoom) / 2);
      stage.scrollLeft = offsetX + (card.x + card.width / 2) * zoom - stage.clientWidth / 2;
      stage.scrollTop = (card.y + card.height / 2) * zoom - stage.clientHeight / 2;
    },
    [layout, stageRef, zoom],
  );

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || printing) return;
    let frame = 0;
    let idle = 0;
    const update = (trim = false) => {
      frame = 0;
      const { layout, zoom } = current.current;
      const offsetX = Math.max(0, (stage.clientWidth - layout.width * zoom) / 2);
      setMinWidth(stage.clientWidth);
      setViewport((old) =>
        chartWindow(
          {
            x: (stage.scrollLeft - offsetX) / zoom,
            y: stage.scrollTop / zoom,
            width: stage.clientWidth / zoom,
            height: stage.clientHeight / zoom,
          },
          zoom,
          old,
          trim,
        ),
      );
      if (!trim) {
        window.clearTimeout(idle);
        idle = window.setTimeout(() => update(true), 180);
      }
    };
    const schedule = () => {
      window.clearTimeout(idle);
      if (!frame) frame = requestAnimationFrame(() => update());
    };
    const observer = new ResizeObserver(schedule);
    updateViewport.current = update;
    observer.observe(stage);
    stage.addEventListener('scroll', schedule, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
      observer.disconnect();
      updateViewport.current = undefined;
      stage.removeEventListener('scroll', schedule);
    };
  }, [stageRef, printing]);

  useEffect(() => {
    updateViewport.current?.();
  }, [zoom, layout.width, layout.height]);

  useLayoutEffect(() => {
    if (printing) return;
    if (focusedKey !== lastFocused.current) {
      lastFocused.current = focusedKey;
      pendingNavigation.current = focusedKey;
      pendingFocus.current = focusedKey;
    }
    if (pendingNavigation.current && layout.cards.has(pendingNavigation.current)) {
      scrollToCard(pendingNavigation.current);
      if (measured.has(pendingNavigation.current)) pendingNavigation.current = null;
    } else if (anchor.current && stageRef.current) {
      const card = layout.cards.get(anchor.current.key);
      if (card) stageRef.current.scrollTop = card.y * zoom - anchor.current.offset;
    }
    anchor.current = null;
    const element = pendingFocus.current
      ? document.getElementById(`node-${pendingFocus.current}`)
      : null;
    if (element) {
      (reverseFocus.current ? (element.querySelector('button') ?? element) : element).focus({
        preventScroll: true,
      });
      pendingFocus.current = null;
      reverseFocus.current = false;
    }
  }, [focusedKey, layout, measured, scrollToCard, stageRef, zoom, visible, printing]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || printing) return;
    const observer = new ResizeObserver((entries) => {
      const { zoom } = current.current;
      let changed = false;
      for (const entry of entries) {
        if (!entry.target.isConnected) continue;
        const key = (entry.target as HTMLElement).dataset.cardKey;
        if (key) measured.add(key);
        const height = entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height;
        if (key && Math.abs((heights.get(key) ?? 0) - height) > 0.25) {
          heights.set(key, height);
          changed = true;
        } else if (key && pendingNavigation.current === key) {
          pendingNavigation.current = null;
        } else if (entry.target === legendRef.current) {
          setLegendHeight((old) => (Math.abs(old - height) > 0.25 ? height : old));
        }
      }
      if (!changed) return;
      const offsetX = Math.max(0, (stage.clientWidth - layout.width * zoom) / 2);
      const bounds = {
        x: (stage.scrollLeft - offsetX) / zoom,
        y: stage.scrollTop / zoom,
        width: stage.clientWidth / zoom,
        height: stage.clientHeight / zoom,
      };
      const first = visible
        .filter((item) => item.kind === 'card' && intersects(item, bounds))
        .sort((a, b) => Math.abs(a.y - bounds.y) - Math.abs(b.y - bounds.y))[0];
      if (first?.kind === 'card') {
        anchor.current = { key: first.node.employee.key, offset: first.y * zoom - stage.scrollTop };
      }
      setRevision((value) => value + 1);
    });
    hostRef.current
      ?.querySelectorAll('[data-card-key]')
      .forEach((element) => observer.observe(element));
    if (legendRef.current) observer.observe(legendRef.current);
    return () => observer.disconnect();
  }, [heights, measured, visible, layout, stageRef, printing]);

  useEffect(() => {
    const before = () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) {
        const key = active.closest<HTMLElement>('[data-card-key]')?.dataset.cardKey;
        if (key) {
          pendingFocus.current = key;
          reverseFocus.current = active.tagName === 'BUTTON';
        }
      }
      flushSync(() => setPrinting(true));
    };
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !(event.target instanceof HTMLElement)) return;
    const card = event.target.closest<HTMLElement>('[data-card-key]');
    if (!card) return;
    const focusables = card.querySelectorAll<HTMLElement>('[tabindex="0"], button');
    const boundary = event.shiftKey ? focusables[0] : focusables[focusables.length - 1];
    if (event.target !== boundary) return;
    const keys = [...layout.cards.keys()];
    const next = keys[keys.indexOf(card.dataset.cardKey ?? '') + (event.shiftKey ? -1 : 1)];
    if (!next) return;
    event.preventDefault();
    scrollToCard(next);
    setActiveKey(next);
    pendingFocus.current = next;
    reverseFocus.current = event.shiftKey;
  };

  const scene = useMemo(
    () => (
      <>
        <div ref={legendRef} className="absolute top-10 right-10 left-10">
          <CategoryLegend />
        </div>
        {layout.frames
          .filter((frame) => intersects(frame, viewport))
          .map((frame) => (
            <div
              key={frame.y}
              className="pointer-events-none absolute rounded-3xl border border-slate-200 bg-white/60 shadow-sm"
              style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height }}
            />
          ))}
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            left: viewport.x,
            top: viewport.y,
            width: viewport.width,
            height: viewport.height,
          }}
          viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        >
          {[false, true].map((dashed) => (
            <path
              key={String(dashed)}
              fill="none"
              vectorEffect="non-scaling-stroke"
              stroke={dashed ? '#94a3b8' : '#cbd5e1'}
              strokeDasharray={dashed ? '3 3' : undefined}
              d={visible
                .filter((item) => item.kind === 'line' && item.dashed === dashed)
                .map((item) => `M${item.x} ${item.y}h${item.width}v${item.height}`)
                .join('')}
            />
          ))}
        </svg>
        {visible.map((item) => {
          if (item.kind === 'line') return null;
          const key = item.kind === 'label' ? `label-${item.x}-${item.y}` : item.node.employee.key;
          return (
            <div
              key={`${item.kind}-${key}`}
              data-card-key={item.kind === 'card' ? key : undefined}
              className="absolute"
              style={{ left: item.x, top: item.y, width: item.width }}
            >
              {item.kind === 'card' ? (
                <NodeCard
                  node={item.node}
                  tags={categories.get(key) ?? DEFAULT_TAGS}
                  collapsed={item.collapsed && item.node.children.length > 0}
                  highlighted={matchedKeys.has(key)}
                  selected={selectedKey === key}
                  focused={focusedKey === key}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ) : item.kind === 'header' ? (
                <header className="flex items-center justify-center gap-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
                  <span className="size-1.5 rounded-full bg-indigo-500" />
                  {item.node.employee.worker}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] normal-case">
                    {t.tree.people(item.node.descendants + 1)}
                  </span>
                </header>
              ) : (
                <span
                  className={`tag-chip inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-inset ${CATEGORY_META.contractor.chip}`}
                >
                  {item.text}
                </span>
              )}
            </div>
          );
        })}
      </>
    ),
    [
      layout.frames,
      visible,
      viewport,
      categories,
      matchedKeys,
      selectedKey,
      focusedKey,
      onToggle,
      onSelect,
    ],
  );

  if (!layout.cards.size)
    return <p className="p-16 text-center text-sm text-slate-500">{t.stage.noMatch}</p>;
  if (printing)
    return (
      <div
        className="inline-flex min-w-full flex-col items-center gap-8 p-10"
        style={{ zoom, '--hair': `${1 / zoom}px` } as CSSProperties}
      >
        <CategoryLegend />
        {roots
          .filter((root) => !visibleKeys || visibleKeys.has(root.employee.key))
          .map((root) => (
            <TreeBlock
              key={root.employee.key}
              root={root}
              collapsed={collapsed}
              visibleKeys={visibleKeys}
              matchedKeys={matchedKeys}
              categories={categories}
              selectedKey={selectedKey}
              focusedKey={focusedKey}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
      </div>
    );

  return (
    <div
      ref={hostRef}
      data-chart-width={layout.width}
      className="relative overflow-hidden transition-none"
      style={{
        width: `max(100%, ${layout.width * zoom}px)`,
        height: layout.height * zoom,
        overflowAnchor: 'none',
        contain: 'strict',
      }}
      onKeyDownCapture={onKeyDown}
      onFocusCapture={(event) => {
        const card = event.target.closest<HTMLElement>('[data-card-key]');
        if (card) setActiveKey(card.dataset.cardKey ?? null);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setActiveKey(null);
      }}
    >
      <div
        className="absolute top-0 transition-none"
        style={{
          width: layout.width,
          height: layout.height,
          left: '50%',
          marginLeft: -layout.width / 2,
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
        }}
      >
        {scene}
      </div>
    </div>
  );
});

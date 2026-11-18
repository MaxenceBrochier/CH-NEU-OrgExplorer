import type { OrgNode } from '../types';
import { CATEGORY_META, CATEGORY_SORT, type CategoryId } from './categories';
import { t } from '../i18n';

export const DEFAULT_TAGS: CategoryId[] = ['internal'];
export const CARD_WIDTH = 240;
export const TILE_SIZE = 512;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RailRow {
  id: string;
  node?: OrgNode;
  label?: string;
  dashedTrail: boolean;
}

export function branchRows(
  node: OrgNode,
  visibleKeys: Set<string> | null,
  categories: Map<string, CategoryId[]>,
) {
  const childrenOf = (parent: OrgNode) =>
    visibleKeys
      ? parent.children.filter((child) => visibleKeys.has(child.employee.key))
      : parent.children;
  const tagsOf = (target: OrgNode) => categories.get(target.employee.key) ?? DEFAULT_TAGS;
  const rank = (target: OrgNode) =>
    target.dotted ? 3.5 : Math.min(...tagsOf(target).map((tag) => CATEGORY_SORT[tag]));
  const leaders: OrgNode[] = [];
  const individuals: OrgNode[] = [];
  const children = childrenOf(node);
  for (const child of children) (childrenOf(child).length ? leaders : individuals).push(child);
  const compare = (a: OrgNode, b: OrgNode) =>
    rank(a) - rank(b) || a.employee.worker.localeCompare(b.employee.worker);
  leaders.sort(compare);
  individuals.sort(compare);
  const contractors = individuals.filter((child) => tagsOf(child).includes('contractor'));
  let dashedTrail = false;
  const rows: RailRow[] = [
    ...individuals
      .filter((child) => !tagsOf(child).includes('contractor'))
      .map((child) => ({
        id: child.employee.key,
        node: child,
      })),
    ...(contractors.length
      ? [{ id: `contractors-${node.employee.key}`, label: `Contractors · ${contractors.length}` }]
      : []),
    ...contractors.map((child) => ({ id: child.employee.key, node: child })),
  ].map((row) => {
    if ('node' in row && row.node?.dotted) dashedTrail = true;
    return { ...row, dashedTrail };
  });
  return { children, leaders, tagsOf, rows };
}

export type ChartItem = Rect & { id: number } & (
    | { kind: 'card'; node: OrgNode; collapsed: boolean }
    | { kind: 'label'; text: string }
    | { kind: 'header'; node: OrgNode }
    | { kind: 'line'; dashed: boolean }
  );

export interface ChartLayout {
  width: number;
  height: number;
  items: ChartItem[];
  cards: Map<string, ChartItem & { kind: 'card' }>;
  frames: Rect[];
  tiles: Map<string, number[]>;
}

// NodeCard has fixed-width text/chips. Measure their wrapping without mounting offscreen cards.
// ResizeObserver corrects exceptional browser line breaks and keeps the measured value cached.
export function measureCardHeights(
  roots: OrgNode[],
  categories: Map<string, CategoryId[]>,
  textWidth: (text: string, size: number, weight: number) => number,
): Map<string, number> {
  const heights = new Map<string, number>();
  const titles = new Map<string, number>();
  const widths = new Map<string, number>();
  const chipWidth = (text: string, weight: number) => {
    const key = `${weight}:${text}`;
    let width = widths.get(key);
    if (width === undefined) {
      width = textWidth(text, 11, weight) + 16;
      widths.set(key, width);
    }
    return width;
  };
  const walk = (node: OrgNode) => {
    const e = node.employee;
    const title = e.jobTitle || '—';
    let lines = titles.get(title);
    if (lines === undefined) {
      lines = 1;
      let line = '';
      let space = '';
      for (const token of title.match(/\s+|[^\s/-]+[-/]*|[-/]+/g) ?? []) {
        if (/^\s+$/.test(token)) {
          space = line ? ' ' : '';
          continue;
        }
        const next = line + space + token;
        if (line && textWidth(next, 12, 400) > 156) {
          lines++;
          line = token;
        } else line = next;
        space = '';
      }
      titles.set(title, lines);
    }
    const chips = (categories.get(e.key) ?? DEFAULT_TAGS).map((tag) =>
      chipWidth(CATEGORY_META[tag].label, 600),
    );
    const unit = e.subServices || e.service || e.department;
    if (unit) chips.push(Math.min(208, chipWidth(unit, 500)));
    if (e.managementLevel.trim())
      chips.push(Math.min(208, chipWidth(e.managementLevel.trim(), 600)));
    if (node.dotted) chips.push(chipWidth(t.card.dotted, 500));
    let rows = 0;
    let used = 0;
    for (const width of chips) {
      if (!rows || used + 6 + width > 208) {
        rows++;
        used = width;
      } else used += 6 + width;
    }
    heights.set(
      e.key,
      16 +
        Math.max(40, 22 + lines * 16.5) +
        12 +
        rows * 20.5 +
        Math.max(0, rows - 1) * 6 +
        8 +
        (node.children.length ? 37.5 : 0),
    );
    node.children.forEach(walk);
  };
  roots.forEach(walk);
  return heights;
}

export function intersects(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

export function chartWindow(view: Rect, zoom: number, previous: Rect, trim = false): Rect {
  const step = TILE_SIZE / 4;
  const buffer = 160 / zoom;
  const x = Math.floor((view.x - buffer) / step) * step;
  const y = Math.floor((view.y - buffer) / step) * step;
  const width = Math.ceil((view.x + view.width + buffer - x) / step) * step;
  const height = Math.ceil((view.y + view.height + buffer - y) / step) * step;
  // Retain nearby cards through a gesture; trim the temporary zoom cache once interaction is idle.
  if (
    previous.x <= view.x &&
    previous.y <= view.y &&
    previous.x + previous.width >= view.x + view.width &&
    previous.y + previous.height >= view.y + view.height &&
    (!trim ||
      (previous.width <= Math.max(2 * view.width, width) &&
        previous.height <= Math.max(2 * view.height, height)))
  )
    return previous;
  return { x, y, width, height };
}

// Positions and the spatial index change only with the tree, filters or measured card sizes.
export function layoutChart(
  roots: OrgNode[],
  collapsed: Set<string>,
  visibleKeys: Set<string> | null,
  categories: Map<string, CategoryId[]>,
  heights: ReadonlyMap<string, number>,
  legendHeight = 28,
  minWidth = 0,
): ChartLayout {
  interface Branch {
    node: OrgNode;
    width: number;
    height: number;
    cardHeight: number;
    rows: RailRow[];
    leaders: Branch[];
    collapsed: boolean;
  }
  const heightOf = (node: OrgNode) =>
    heights.get(node.employee.key) ?? (node.children.length ? 174 : 144);
  const measure = (node: OrgNode): Branch => {
    const folded = collapsed.has(node.employee.key);
    const { rows, leaders } = folded
      ? { rows: [], leaders: [] }
      : branchRows(node, visibleKeys, categories);
    const branches = leaders.map(measure);
    const cardHeight = heightOf(node);
    return {
      node,
      rows,
      leaders: branches,
      collapsed: folded,
      cardHeight,
      width: Math.max(
        CARD_WIDTH,
        rows.length ? 544 : 0,
        branches.reduce((sum, b) => sum + b.width + 32, 0),
      ),
      height:
        cardHeight +
        (rows.length
          ? 8 +
            rows.reduce(
              (sum, row, i) =>
                sum +
                (row.node ? heightOf(row.node) : 24.5) +
                (i === rows.length - 1 && !branches.length ? 0 : row.node ? 12 : 8),
              0,
            )
          : 0) +
        (branches.length ? 60 + Math.max(...branches.map((b) => b.height)) : 0),
    };
  };
  const branches = roots
    .filter((root) => !visibleKeys || visibleKeys.has(root.employee.key))
    .map(measure);
  const blockWidth = (b: Branch) => Math.max(b.width, b.node.employee.worker.length * 8 + 180) + 66;
  const width = Math.max(minWidth - 80, 320, ...branches.map(blockWidth)) + 80;
  const items: ChartItem[] = [];
  const cards: ChartLayout['cards'] = new Map();
  const frames: Rect[] = [];
  const addCard = (node: OrgNode, x: number, y: number, folded: boolean) => {
    const item: ChartItem & { kind: 'card' } = {
      id: items.length,
      kind: 'card',
      node,
      x,
      y,
      width: CARD_WIDTH,
      height: heightOf(node),
      collapsed: folded,
    };
    cards.set(node.employee.key, item);
    items.push(item);
  };
  const line = (x1: number, y1: number, x2: number, y2: number, dashed = false) => {
    if (x1 === x2 && y1 === y2) return;
    items.push({
      id: items.length,
      kind: 'line',
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
      dashed,
    });
  };
  const place = (branch: Branch, x: number, y: number) => {
    const axis = x + branch.width / 2;
    addCard(branch.node, axis - CARD_WIDTH / 2, y, branch.collapsed);
    let bottom = y + branch.cardHeight;
    if (branch.rows.length) {
      line(axis, bottom, axis, bottom + 8);
      bottom += 8;
      branch.rows.forEach((row, i) => {
        const last = i === branch.rows.length - 1 && !branch.leaders.length;
        const height = row.node ? heightOf(row.node) : 24.5;
        const rowHeight = height + (last ? 0 : row.node ? 12 : 8);
        line(axis, bottom, axis, bottom + (last && row.node ? 36 : rowHeight), row.dashedTrail);
        if (row.node) {
          line(axis, bottom + 36, axis + 32, bottom + 36, row.dashedTrail || row.node.dotted);
          addCard(row.node, axis + 32, bottom, false);
        } else {
          items.push({
            id: items.length,
            kind: 'label',
            text: row.label ?? '',
            x: axis + 32,
            y: bottom,
            width: CARD_WIDTH,
            height,
          });
        }
        bottom += rowHeight;
      });
    }
    if (!branch.leaders.length) return;
    line(axis, bottom, axis, bottom + 40);
    const leaderWidth = branch.leaders.reduce((sum, b) => sum + b.width + 32, 0);
    let left = axis - leaderWidth / 2;
    let dashed = false;
    branch.leaders.forEach((leader, i) => {
      if (leader.node.dotted) dashed = true;
      const center = left + 16 + leader.width / 2;
      if (i > 0) line(left, bottom + 40, center, bottom + 40, dashed);
      if (i < branch.leaders.length - 1)
        line(center, bottom + 40, left + leader.width + 32, bottom + 40, dashed);
      line(center, bottom + 40, center, bottom + 60, dashed);
      place(leader, left + 16, bottom + 60);
      left += leader.width + 32;
    });
  };
  let top = 40 + legendHeight + 32;
  for (const branch of branches) {
    const w = blockWidth(branch);
    frames.push({ x: (width - w) / 2, y: top, width: w, height: branch.height + 86.5 });
    items.push({
      id: items.length,
      kind: 'header',
      node: branch.node,
      x: (width - w) / 2 + 33,
      y: top + 17,
      width: w - 66,
      height: 20.5,
    });
    place(branch, (width - branch.width) / 2, top + 53.5);
    top += branch.height + 118.5;
  }
  const tiles = new Map<string, number[]>();
  items.forEach((item, index) => {
    for (
      let y = Math.floor(item.y / TILE_SIZE);
      y <= Math.floor((item.y + item.height) / TILE_SIZE);
      y++
    ) {
      for (
        let x = Math.floor(item.x / TILE_SIZE);
        x <= Math.floor((item.x + item.width) / TILE_SIZE);
        x++
      ) {
        const key = `${x},${y}`;
        const bucket = tiles.get(key);
        if (bucket) bucket.push(index);
        else tiles.set(key, [index]);
      }
    }
  });
  return { width, height: top + 8, items, cards, frames, tiles };
}

export function queryChart(layout: ChartLayout, viewport: Rect): number[] {
  const found = new Set<number>();
  for (
    let y = Math.floor(viewport.y / TILE_SIZE);
    y <= Math.floor((viewport.y + viewport.height) / TILE_SIZE);
    y++
  ) {
    for (
      let x = Math.floor(viewport.x / TILE_SIZE);
      x <= Math.floor((viewport.x + viewport.width) / TILE_SIZE);
      x++
    ) {
      for (const index of layout.tiles.get(`${x},${y}`) ?? []) {
        if (intersects(layout.items[index], viewport)) found.add(index);
      }
    }
  }
  return [...found].sort((a, b) => a - b);
}

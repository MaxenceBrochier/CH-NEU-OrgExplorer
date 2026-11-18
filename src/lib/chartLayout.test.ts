import { describe, expect, it } from 'vitest';
import type { Employee, OrgNode } from '../types';
import {
  branchRows,
  chartWindow,
  intersects,
  layoutChart,
  measureCardHeights,
  queryChart,
  type Rect,
} from './chartLayout';
import type { CategoryId } from './categories';

function node(key: string, children: OrgNode[] = [], dotted = false): OrgNode {
  const employee: Employee = {
    key,
    worker: key,
    leaveOrNot: 'A',
    jobTitle: '',
    managementLevel: '',
    email: '',
    id: '',
    department: '',
    service: '',
    subServices: '',
    departmentServices: '',
    manager: '',
    employeeId: '',
    costCenter: '',
    dateEntreeHr: '',
    dateEntreeSite: '',
    dateFinContrat: '',
  };
  return {
    employee,
    children,
    dotted,
    depth: 0,
    descendants: children.reduce((sum, child) => sum + child.descendants + 1, 0),
  };
}

const categories = new Map<string, CategoryId[]>();
const heights = new Map<string, number>();
const collapsed = new Set<string>();

describe('chart layout', () => {
  it('reuses the mounted window for small pans and zoom-ins, and replaces it before revealing uncached space', () => {
    const view = { x: 0, y: 0, width: 1200, height: 700 };
    const initial = chartWindow(view, 1, { x: 0, y: 0, width: 0, height: 0 });
    expect(chartWindow({ ...view, x: 20 }, 1, initial)).toBe(initial);
    expect(chartWindow({ x: 100, y: 50, width: 1000, height: 600 }, 1.2, initial)).toBe(initial);
    for (const next of [
      { ...view, x: 10000, y: 2000 },
      { x: -100, y: -100, width: 3000, height: 1700 },
    ]) {
      const window = chartWindow(next, 0.4, initial);
      expect(window).not.toBe(initial);
      expect(window.x).toBeLessThanOrEqual(next.x);
      expect(window.y).toBeLessThanOrEqual(next.y);
      expect(window.x + window.width).toBeGreaterThanOrEqual(next.x + next.width);
      expect(window.y + window.height).toBeGreaterThanOrEqual(next.y + next.height);
    }
    const zoomCache = { x: -5000, y: -5000, width: 12000, height: 12000 };
    expect(chartWindow(view, 1, zoomCache)).toBe(zoomCache);
    expect(chartWindow(view, 1, zoomCache, true)).not.toEqual({
      x: -5000,
      y: -5000,
      width: 12000,
      height: 12000,
    });
  });

  it('reserves wrapped title and chip rows while keeping truncated names and unbroken words on one line', () => {
    const short = node('short');
    const long = node('long');
    long.employee.jobTitle = 'Quality operations specialist '.repeat(5);
    const unbroken = node('unbroken');
    unbroken.employee.jobTitle = 'x'.repeat(200);
    unbroken.employee.worker = 'A very long employee name '.repeat(10);
    const tagged = node('tagged');
    tagged.employee.managementLevel = 'A very long management level '.repeat(10);
    const estimated = measureCardHeights(
      [short, long, unbroken, tagged],
      categories,
      (text, size) => (text.length * size) / 2,
    );
    expect(estimated.get('long')).toBeGreaterThan(estimated.get('short')!);
    expect(estimated.get('tagged')).toBeGreaterThan(estimated.get('short')!);
    expect(estimated.get('unbroken')).toBe(estimated.get('short'));
  });

  it('keeps category order, dotted trails and the contractor separator shared with print', () => {
    const root = node('root', [node('z'), node('contractor'), node('dotted', [], true), node('a')]);
    const tags = new Map<string, CategoryId[]>([['contractor', ['contractor']]]);
    const { rows } = branchRows(root, null, tags);
    expect(rows.map((row) => row.id)).toEqual([
      'a',
      'z',
      'dotted',
      'contractors-root',
      'contractor',
    ]);
    expect(rows.map((row) => row.dashedTrail)).toEqual([false, false, true, true, true]);
    expect(root.children.map((child) => child.employee.key)).toEqual([
      'z',
      'contractor',
      'dotted',
      'a',
    ]);
  });

  it('lays out variable-height cards without overlap and keeps leaders below the individual rail', () => {
    const root = node('root', [node('individual'), node('leader', [node('report')])]);
    const layout = layoutChart(
      [root],
      collapsed,
      null,
      categories,
      new Map([
        ['root', 240],
        ['individual', 320],
        ['leader', 280],
        ['report', 400],
      ]),
    );
    const cards = [...layout.cards.values()];
    for (const a of cards)
      for (const b of cards) {
        if (a !== b) expect(intersects(a, b)).toBe(false);
      }
    const leader = layout.cards.get('leader')!;
    const individual = layout.cards.get('individual')!;
    expect(leader.y).toBeGreaterThan(individual.y + individual.height);
    expect(layout.height).toBeGreaterThan(layout.cards.get('report')!.y + 400);
  });

  it('removes folded descendants and preserves ancestor paths when filtering', () => {
    const root = node('root', [node('manager', [node('match'), node('other')]), node('hidden')]);
    const filtered = new Set(['root', 'manager', 'match']);
    expect([...layoutChart([root], collapsed, filtered, categories, heights).cards.keys()]).toEqual(
      ['root', 'manager', 'match'],
    );
    const folded = layoutChart([root], new Set(['manager']), filtered, categories, heights);
    expect([...folded.cards.keys()]).toEqual(['root', 'manager']);
    expect(folded.cards.get('manager')!.collapsed).toBe(true);
    expect(layoutChart([root], collapsed, new Set(), categories, heights).cards.size).toBe(0);
  });

  it('updates following branches when a measured card grows, without discarding other measurements', () => {
    const roots = [node('first', [node('child')]), node('second')];
    const measured = new Map([['child', 500]]);
    const initial = layoutChart(roots, collapsed, null, categories, measured);
    measured.set('first', 350);
    const updated = layoutChart(roots, collapsed, null, categories, measured);
    expect(updated.cards.get('child')!.height).toBe(500);
    expect(updated.cards.get('second')!.y - initial.cards.get('second')!.y).toBe(176);
  });

  it('matches exact intersection queries, including connections crossing a viewport with offscreen endpoints', () => {
    const root = node(
      'root',
      Array.from({ length: 60 }, (_, i) => node(`leader-${i}`, [node(`report-${i}`)])),
    );
    const layout = layoutChart([root], collapsed, null, categories, heights);
    const viewports: Rect[] = [
      { x: -512, y: -512, width: 1024, height: 1536 },
      { x: layout.width / 2, y: 0, width: 512, height: 512 },
      { x: 512, y: 0, width: 1, height: layout.height },
      { x: 0, y: 512, width: layout.width, height: 0 },
    ];
    for (const viewport of viewports) {
      expect(queryChart(layout, viewport)).toEqual(
        layout.items.filter((item) => intersects(item, viewport)).map((item) => item.id),
      );
    }
    const bus = layout.items.find((item) => item.kind === 'line' && item.width > 100)!;
    const crossing = { x: bus.x + bus.width / 2, y: bus.y - 1, width: 1, height: 2 };
    expect(queryChart(layout, crossing)).toContain(bus.id);
  });

  it('keeps the viewport result bounded when thousands of cards are expanded', () => {
    const root = node(
      'root',
      Array.from({ length: 5000 }, (_, i) => node(`person-${i}`)),
    );
    const layout = layoutChart([root], collapsed, null, categories, heights);
    const viewport = { x: layout.width / 2, y: 10000, width: 800, height: 1600 };
    const result = queryChart(layout, viewport);
    expect(layout.cards.size).toBe(5001);
    expect(result.length).toBeLessThan(80);
    expect(result.length).toBeGreaterThan(0);
  });
});

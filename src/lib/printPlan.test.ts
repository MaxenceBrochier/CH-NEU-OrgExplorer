import { describe, expect, it } from 'vitest';
import { DEFAULT_PRINT_OPTIONS, planPrint, type PrintBlock } from './printPlan';

describe('planPrint', () => {
  it('returns an empty plan for no blocks', () => {
    const plan = planPrint([], DEFAULT_PRINT_OPTIONS);
    expect(plan.pages).toHaveLength(0);
    expect(plan.overflow).toBe(false);
  });

  it('keeps a single small block on one page at scale <= 1', () => {
    const blocks: PrintBlock[] = [{ key: 'a', width: 300, height: 300 }];
    const plan = planPrint(blocks, DEFAULT_PRINT_OPTIONS);
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0]).toEqual(['a']);
    expect(plan.scale).toBeLessThanOrEqual(1);
  });

  it('splits very wide content across multiple pages', () => {
    const blocks: PrintBlock[] = Array.from({ length: 6 }, (_, i) => ({
      key: `b${i}`,
      width: 4000,
      height: 400,
    }));
    const plan = planPrint(blocks, { ...DEFAULT_PRINT_OPTIONS, maxLengthMm: 400 });
    const placed = plan.pages.flat();
    expect(placed).toHaveLength(6);
    expect(plan.pages.length).toBeGreaterThan(1);
  });

  it('flags overflow when text becomes too small', () => {
    const blocks: PrintBlock[] = [{ key: 'huge', width: 40000, height: 40000 }];
    const plan = planPrint(blocks, DEFAULT_PRINT_OPTIONS);
    expect(plan.overflow).toBe(true);
  });
});

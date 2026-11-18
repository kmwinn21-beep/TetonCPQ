import { describe, expect, it } from 'vitest';
import { paginate, textRowHeight } from './paginate';

describe('paginate', () => {
  it('fills the first page, then later pages with their own budget', () => {
    expect(paginate([50, 50, 50, 50, 50], (x) => x, 120, 160)).toEqual([[50, 50], [50, 50, 50]]);
    expect(paginate([], (x: number) => x, 100, 100)).toEqual([[]]);
    // An item taller than a page still gets a page of its own.
    expect(paginate([500, 10], (x) => x, 100, 100)).toEqual([[500], [10]]);
  });
  it('estimates text height from length', () => {
    expect(textRowHeight('x'.repeat(70), 35)).toBe(2 * 19 + 26);
    expect(textRowHeight('', 35, 19, 26, 2)).toBe(64);
  });
});

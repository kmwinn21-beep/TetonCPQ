import { describe, expect, it } from 'vitest';
import { addMonthsYm, pilotFirstOrder, staggerBatches, staggerGoLives } from './stagger';

describe('staggered go-lives', () => {
  it('13 communities, 3 per batch, every 3 months: the leftover one goes last, at the next increment', () => {
    const m = staggerGoLives(13, { firstMonth: '2027-03', monthsBetween: 3, perBatch: 3 });
    expect(m).toEqual([
      '2027-03', '2027-03', '2027-03',
      '2027-06', '2027-06', '2027-06',
      '2027-09', '2027-09', '2027-09',
      '2027-12', '2027-12', '2027-12',
      '2028-03',
    ]);
  });

  it('even split has no partial batch', () => {
    expect(staggerBatches([0, 1, 2, 3], { firstMonth: '2027-01', monthsBetween: 2, perBatch: 2 })).toEqual([
      { month: '2027-01', indices: [0, 1] },
      { month: '2027-03', indices: [2, 3] },
    ]);
  });

  it('a remainder of two forms the final, furthest batch', () => {
    const b = staggerBatches([0, 1, 2, 3, 4, 5, 6, 7], { firstMonth: '2027-11', monthsBetween: 3, perBatch: 3 });
    expect(b.map((x) => [x.month, x.indices.length])).toEqual([
      ['2027-11', 3],
      ['2028-02', 3],
      ['2028-05', 2],
    ]);
  });

  it('batch size larger than the list puts everyone on the first date; zero months between does the same', () => {
    expect(new Set(staggerGoLives(5, { firstMonth: '2027-03', monthsBetween: 3, perBatch: 10 }))).toEqual(new Set(['2027-03']));
    expect(new Set(staggerGoLives(5, { firstMonth: '2027-03', monthsBetween: 0, perBatch: 1 }))).toEqual(new Set(['2027-03']));
  });

  it('crosses year boundaries', () => {
    expect(addMonthsYm('2027-11', 3)).toBe('2028-02');
    expect(addMonthsYm('2027-01', -1)).toBe('2026-12');
  });

  it('pilot sites can be put in the first batch', () => {
    const order = pilotFirstOrder([false, true, false, true, false]);
    expect(order).toEqual([1, 3, 0, 2, 4]);
    expect(staggerBatches(order, { firstMonth: '2027-03', monthsBetween: 3, perBatch: 2 })[0]).toEqual({ month: '2027-03', indices: [1, 3] });
  });
});

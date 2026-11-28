import { describe, expect, it } from 'vitest';
import { cleanReads, matchNumbers, type RawRead } from './roomNumbers';

const read = (text: string, x: number, y: number, conf = 90, ratio = 1.8): RawRead => ({ text, conf, x, y, ratio });

describe('cleaning OCR reads into room numbers', () => {
  const floor2 = ['201', '203', '205', '207', '209', '215', '217', '220'].map((t, i) => read(t, 0.1 + i * 0.05, 0.5));

  it('keeps clear 3-digit reads and drops numbers that don’t fit the floor (an address line)', () => {
    const out = cleanReads([...floor2, read('502', 0.6, 0.95), read('499', 0.65, 0.95)]);
    expect(out.map((l) => l.t).sort()).toEqual(['201', '203', '205', '207', '209', '215', '217', '220']);
    expect(out.every((l) => l.sure)).toBe(true);
  });

  it('repairs a blurred number three digits wide as a guess, using the floor’s first digit', () => {
    const out = cleanReads([...floor2, read('13', 0.3, 0.7), read('0', 0.4, 0.7, 90, 1.6), read('9', 0.5, 0.7, 90, 0.8)]);
    expect(out.find((l) => l.t === '213')).toMatchObject({ sure: false });
    expect(out.find((l) => l.t === '210')).toMatchObject({ sure: false });
    // Too narrow to be three digits: dropped.
    expect(out.some((l) => l.t.endsWith('9') && l.y === 0.7)).toBe(false);
  });

  it('marks low-confidence reads as not sure and keeps the clear one of a repeated number', () => {
    const out = cleanReads([...floor2, read('230', 0.2, 0.2, 60), read('230', 0.8, 0.8, 92)]);
    const l = out.filter((x) => x.t === '230');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ x: 0.8, sure: true });
  });
});

describe('matching tags to numbers', () => {
  const page = {
    aspect: 1.3,
    labels: [
      { t: '137', x: 0.2, y: 0.2, sure: true },
      { t: '139', x: 0.2, y: 0.3, sure: true },
      { t: '141', x: 0.2, y: 0.4, sure: false },
      { t: '150', x: 0.6, y: 0.2, sure: true },
      { t: '152', x: 0.62, y: 0.2, sure: true },
    ],
  };

  it('gives each tag the closest number in reach, one number per tag', () => {
    const m = matchNumbers(
      [
        { id: 'a', x: 0.21, y: 0.21 },
        { id: 'b', x: 0.22, y: 0.2 }, // also nearest 137, but a is closer: b goes without (139 is out of reach)
        { id: 'c', x: 0.21, y: 0.3 },
        { id: 'far', x: 0.9, y: 0.9 },
      ],
      page,
    );
    expect(m.get('a')).toEqual({ t: '137', sure: true });
    expect(m.get('c')).toEqual({ t: '139', sure: true });
    expect(m.has('b')).toBe(false);
    expect(m.has('far')).toBe(false);
  });

  it('only suggests guessed numbers and close calls, and skips numbers already used', () => {
    const m = matchNumbers(
      [
        { id: 'g', x: 0.2, y: 0.41 },
        { id: 'mid', x: 0.61, y: 0.2 }, // halfway between 150 and 152
        { id: 'taken', x: 0.2, y: 0.21 },
      ],
      page,
      new Set(['137']),
    );
    expect(m.get('g')).toEqual({ t: '141', sure: false });
    expect(m.get('mid')?.sure).toBe(false);
    expect(m.has('taken')).toBe(false);
  });
});

describe('order after a fill from the plan', () => {
  it('puts numbers to confirm first, then blank rooms, then numbered ones, keeping order within each', async () => {
    const { fillOrder } = await import('./roomNumbers');
    const rows = [
      { id: 'a', label: '101' },
      { id: 'b', label: '', suggest: '102' },
      { id: 'c', label: '' },
      { id: 'd', label: '104' },
      { id: 'e', label: '', suggest: '105' },
      { id: 'f', label: '' },
    ];
    expect(fillOrder(rows).map((r) => r.id)).toEqual(['b', 'e', 'c', 'f', 'a', 'd']);
  });
});


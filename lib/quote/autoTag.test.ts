import { describe, expect, it } from 'vitest';
import { careFromName, fillOf, groupByColor, isFill, labelsToTag, legendNames, nearestBadge, skippedWords, type RGB } from './autoTag';

const lp = {
  aspect: 1.3,
  labels: [
    { t: '101', x: 0.2, y: 0.2, sure: true },
    { t: '102', x: 0.3, y: 0.2, sure: false },
    { t: '103', x: 0.4, y: 0.2, sure: true },
    { t: '201', x: 0.8, y: 0.8, sure: true },
  ],
};

describe('auto-tag', () => {
  it('tags the numbers inside the box that aren’t tagged yet', () => {
    const box = { x0: 0.1, y0: 0.1, x1: 0.5, y1: 0.5 };
    expect(labelsToTag(lp, box, [], new Set()).map((l) => l.t)).toEqual(['101', '102', '103']);
    // 101 already has a number on this plan; 103 has an unnumbered tag right on it.
    expect(labelsToTag(lp, box, [{ x: 0.401, y: 0.201 }], new Set(['101'])).map((l) => l.t)).toEqual(['102']);
  });

  it('reads a colored fill, and nothing on white paper or ink', () => {
    expect(isFill([255, 255, 255])).toBe(false);
    expect(isFill([20, 20, 20])).toBe(false);
    expect(isFill([141, 180, 224])).toBe(true);
    expect(isFill([214, 212, 196])).toBe(true);
    const blue: RGB = [141, 180, 224];
    expect(fillOf([blue, blue, [255, 255, 255], [30, 30, 30], [143, 182, 222]])).toEqual([141, 180, 224]);
    expect(fillOf([[255, 255, 255], [250, 250, 250], [30, 30, 30], blue])).toBeNull();
  });

  it('groups numbers by color, largest first, uncolored last', () => {
    const items = [
      { color: [141, 180, 224] as RGB },
      { color: [200, 196, 230] as RGB },
      { color: [143, 178, 226] as RGB },
      { color: null },
      { color: [139, 181, 223] as RGB },
    ];
    const { items: out, groups } = groupByColor(items);
    expect(groups.map((g) => g.count)).toEqual([3, 1, 1]);
    expect(groups[2].key).toBe('none');
    expect(out[0].group).toBe(out[2].group);
    expect(out[1].group).not.toBe(out[0].group);
  });

  it('names colors from the legend and lists the words it skipped', () => {
    const groups = [{ key: 'g0', color: [141, 180, 224] as RGB }, { key: 'g1', color: [253, 232, 139] as RGB }];
    const words = [
      { str: 'One Bedroom', x: 0.6, y: 0.9, h: 0.01, swatch: [140, 181, 225] as RGB },
      { str: 'Studio', x: 0.3, y: 0.9, h: 0.01, swatch: [252, 233, 140] as RGB },
      { str: 'Kitchen', x: 0.4, y: 0.3, h: 0.01, swatch: null },
      // Inside a blue room: its left neighbor is blue too, but it isn't the legend.
      { str: 'Therapy', x: 0.5, y: 0.3, h: 0.01, swatch: [141, 180, 224] as RGB, bg: [141, 180, 224] as RGB },
      // Beside a long blue room: blue beyond the "swatch" too.
      { str: 'Laundry', x: 0.5, y: 0.4, h: 0.01, swatch: [141, 180, 224] as RGB, beyond: [141, 180, 224] as RGB },
    ];
    expect(legendNames(words, groups)).toEqual({ g0: 'One Bedroom', g1: 'Studio' });
    const box = { x0: 0, y0: 0, x1: 1, y1: 0.8 };
    expect(skippedWords([...words.filter((w) => w.str !== 'Therapy' && w.str !== 'Laundry'), { str: 'Courtyard', x: 0.2, y: 0.2, h: 0.01 }, { str: 'Courtyard', x: 0.5, y: 0.5, h: 0.01 }, { str: 'RR', x: 0.5, y: 0.5, h: 0.01 }], box, new Set())).toEqual(['Courtyard ×2', 'Kitchen']);
  });

  it('picks a badge color and care setting from the legend', () => {
    expect(nearestBadge([141, 180, 224])).toBe('#3F6FD8');
    expect(nearestBadge([214, 212, 200])).toBe('#5B6472');
    expect(careFromName('Memory Care Neighborhood')).toBe('mc');
    expect(careFromName('One Bedroom Deluxe')).toBe('al');
  });
});

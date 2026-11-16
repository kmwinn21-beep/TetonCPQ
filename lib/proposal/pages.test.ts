import { describe, expect, it } from 'vitest';
import { autoFit, estimateAutomatic, groupPages, moveSection, orderFromPages, PAGE_HEIGHT_PX, pageHeight, SECTION_GAP_PX, startsOf } from './pages';

const P = PAGE_HEIGHT_PX;

describe('page plans', () => {
  it('groups sections at the page starts and back', () => {
    const vis = ['scope', 'terms', 'summary', 'roi', 'assumptions'];
    const pages = groupPages(vis, ['summary', 'assumptions', 'hidden-one']);
    expect(pages).toEqual([['scope', 'terms'], ['summary', 'roi'], ['assumptions']]);
    expect(startsOf(pages)).toEqual(['summary', 'assumptions']);
  });

  it('moves a section between pages, onto a new page, and drops empty pages', () => {
    const pages = [['scope', 'terms'], ['summary'], ['roi', 'assumptions']];
    expect(moveSection(pages, 'roi', 1, 1)).toEqual([['scope', 'terms'], ['summary', 'roi'], ['assumptions']]);
    expect(moveSection(pages, 'summary', 3, 0)).toEqual([['scope', 'terms'], ['roi', 'assumptions'], ['summary']]);
    expect(moveSection(pages, 'scope', 0, 2)).toEqual([['terms', 'scope'], ['summary'], ['roi', 'assumptions']]);
  });

  it('keeps hidden sections in their slots when reordering', () => {
    const order = ['scope', 'terms', 'implementation', 'summary', 'roi'];
    const visible = ['scope', 'terms', 'summary', 'roi'];
    expect(orderFromPages(order, visible, [['scope', 'summary'], ['terms', 'roi']])).toEqual(['scope', 'summary', 'implementation', 'terms', 'roi']);
  });

  it('auto-fits into the fewest pages in order', () => {
    const h = { a: P * 0.5, b: P * 0.3, c: P * 0.6, d: P * 0.2 };
    expect(autoFit(['a', 'b', 'c', 'd'], h)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(pageHeight(['a', 'b'], h)).toBeCloseTo(P * 0.8 + SECTION_GAP_PX);
    // A section taller than a page still gets a page of its own.
    expect(autoFit(['a', 'x', 'd'], { ...h, x: P * 1.4 })).toEqual([['a'], ['x'], ['d']]);
  });

  it('estimates the browser: whole sections move, splittable ones continue, own-page sits alone', () => {
    const pages = estimateAutomatic(
      [
        { id: 'scope', height: P * 0.5, splittable: true },
        { id: 'impl', height: P * 0.7, ownPage: true },
        { id: 'summary', height: P * 0.3 },
        { id: 'roi', height: P * 0.8 },
        { id: 'assumptions', height: P * 0.15 },
      ],
      P * 0.2,
    );
    expect(pages).toEqual([['scope'], ['impl'], ['summary'], ['roi', 'assumptions']]);
  });
});

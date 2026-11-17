import { describe, expect, it } from 'vitest';
import { addBackBcPage, defaultBcPages, insertBcPage, moveBcPage, removeBcPage, removedBcPages } from './bcPages';
import { DEFAULT_LAYOUT, sanitizeLayout } from './layout';

describe('business-case pages', () => {
  it('follows the standard sections until changed', () => {
    expect(defaultBcPages(DEFAULT_LAYOUT)).toEqual(['cover', 'pilot', 'scope', 'roi', 'summary', 'cashflow', 'implementation', 'resources', 'terms']);
    expect(defaultBcPages({ hiddenSections: ['implementation', 'summary'] })).toEqual(['cover', 'pilot', 'scope', 'roi', 'resources', 'terms']);
  });

  it('moves, removes and adds back in the standard position', () => {
    const p = ['cover', 'scope', 'roi', 'summary', 'terms'];
    expect(moveBcPage(p, 'roi', -1)).toEqual(['cover', 'roi', 'scope', 'summary', 'terms']);
    expect(moveBcPage(p, 'cover', -1)).toEqual(p);
    // Pages that aren't shown (e.g. no resources yet) are skipped over when moving.
    expect(moveBcPage(['scope', 'resources', 'terms'], 'terms', -1, ['scope', 'terms'])).toEqual(['terms', 'resources', 'scope']);
    const r = removeBcPage(p, 'roi');
    expect(removedBcPages(r)).toEqual(['pilot', 'roi', 'cashflow', 'implementation', 'resources']);
    expect(addBackBcPage(p, 'pilot')).toEqual(['cover', 'pilot', 'scope', 'roi', 'summary', 'terms']);
    expect(addBackBcPage(r, 'roi')).toEqual(p);
    expect(addBackBcPage(['scope', 'terms'], 'cover')).toEqual(['cover', 'scope', 'terms']);
    expect(insertBcPage(p, 2, 'bcpage-x')).toEqual(['cover', 'scope', 'bcpage-x', 'roi', 'summary', 'terms']);
  });

  it('keeps only known pages when saved', () => {
    const l = sanitizeLayout({ bcPages: ['roi', 'nope', 'bcpage-a', 'bcpage-gone', 'roi'], bcCustom: { 'bcpage-a': { title: 'Why Teton', html: '<p>x</p>' } } }, (h) => h);
    expect(l.bcPages).toEqual(['roi', 'bcpage-a']);
    expect(() => sanitizeLayout({ bcCustom: { 'custom-a': { title: 'x', html: '' } } }, (h) => h)).toThrow();
    expect(sanitizeLayout({}, (h) => h).bcPages).toBeNull();
  });

  it('keeps the section order of each page', () => {
    const l = sanitizeLayout({ bcBlocks: { scope: ['communities', 'overview', 'costs'], roi: ['callout'] } }, (h) => h);
    expect(l.bcBlocks).toEqual({ scope: ['communities', 'overview', 'costs'], roi: ['callout'] });
    expect(sanitizeLayout({}, (h) => h).bcBlocks).toEqual({});
    expect(() => sanitizeLayout({ bcBlocks: ['x'] }, (h) => h)).toThrow();
  });
});

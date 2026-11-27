import { describe, expect, it } from 'vitest';
import { addCopy, copyBlockId, copyScope, dropCopies, hasCopy, removeCopy, sanitizeCopies, scoped, scopedTable } from './bcCopies';
import { DEFAULT_LAYOUT, sanitizeLayout } from './layout';
import { TEMPLATE_LAYOUT_KEYS, templateFrom } from './templates';

describe('section copies', () => {
  it('adds once per page and removes', () => {
    let l = addCopy({ ...DEFAULT_LAYOUT }, 'roi', 'sitescope:types', 'abc123');
    expect(l.bcCopies).toEqual({ roi: [{ src: 'sitescope:types', key: 'abc123' }] });
    expect(addCopy(l, 'roi', 'sitescope:types', 'zzz999')).toBe(l); // the same section twice on a page
    expect(addCopy(l, 'summary', 'sitescope:types', 'abc123')).toBe(l); // a key in use
    l = addCopy(l, 'summary', 'sitescope:types', 'def456');
    expect(hasCopy(l, 'summary', 'sitescope:types')).toBe(true);
    l = removeCopy(l, 'roi', 'abc123');
    expect(l.bcCopies).toEqual({ summary: [{ src: 'sitescope:types', key: 'def456' }] });
    expect(dropCopies(l, (p) => p === 'summary').bcCopies).toBeUndefined();
  });

  it('names a copy and scopes its keys', () => {
    expect(copyBlockId('abc123')).toBe('c-abc123');
    expect(scoped(copyScope('abc123'), 'bc.site.title')).toBe('bc.cp.abc123.bc.site.title');
    expect(scoped('', 'bc.site.title')).toBe('bc.site.title');
    expect(scopedTable(copyScope('abc123'), 'pilot')).toBe('abc123-pilot');
    expect(scopedTable('', 'pilot')).toBe('pilot');
  });

  it('drops bad stored copies', () => {
    const v = { roi: [{ src: 'sitescope:types', key: 'abc123' }, { src: 'sitescope:types', key: 'xyz789' }, { src: 'bad', key: 'k1k1k1' }, { src: 'a:b', key: 'abc123' }], 'bad page!': [{ src: 'a:b', key: 'qqq111' }] };
    expect(sanitizeCopies(v, (p) => /^[a-z0-9-]+$/.test(p))).toEqual({ roi: [{ src: 'sitescope:types', key: 'abc123' }] });
    expect(sanitizeCopies('x', () => true)).toBeUndefined();
  });

  it('is kept by the layout and by templates', () => {
    const l = sanitizeLayout({ ...DEFAULT_LAYOUT, format: 'businessCase', bcCopies: { roi: [{ src: 'sitescope:types', key: 'abc123' }] } }, (h: string) => h);
    expect(l.bcCopies).toEqual({ roi: [{ src: 'sitescope:types', key: 'abc123' }] });
    expect(TEMPLATE_LAYOUT_KEYS).toContain('bcCopies');
    const t = templateFrom({ 'bc.cp.abc123.bc.site.title': 'Our own heading' }, l, { customer: 'Acme', communities: '2', bedCount: '100' } as never);
    expect(t.layout.bcCopies).toEqual(l.bcCopies);
    expect(t.edits['bc.cp.abc123.bc.site.title']).toBe('Our own heading');
  });
});

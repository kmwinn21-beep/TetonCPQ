import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, layoutChanges, sanitizeLayout } from '@/lib/proposal/layout';
import { cleanRichText } from '@/lib/proposal/richText';

const id = (h: string) => h;

describe('proposal layout', () => {
  it('defaults to the four standard sections', () => {
    expect(sanitizeLayout(null, id)).toEqual(DEFAULT_LAYOUT);
    expect(layoutChanges(DEFAULT_LAYOUT)).toBe(0);
  });

  it('keeps a reorder, removed sections and figures, and added sections', () => {
    const l = sanitizeLayout(
      {
        order: ['roi', 'custom-a', 'summary', 'scope', 'implementation', 'assumptions'],
        hiddenSections: ['assumptions'],
        hiddenValues: ['card.net.value'],
        custom: { 'custom-a': { title: 'Why now', html: '<b>Hi</b>' } },
      },
      id,
    );
    expect(l.order).toEqual(['roi', 'custom-a', 'summary', 'scope', 'implementation', 'assumptions']);
    expect(layoutChanges(l)).toBe(4);
  });

  it('repairs the order: drops unknown ids, appends missing sections', () => {
    const l = sanitizeLayout({ order: ['scope', 'nope', 'custom-gone'], custom: { 'custom-b': { title: 'x', html: '' } } }, id);
    expect(l.order).toEqual(['summary', 'scope', 'implementation', 'roi', 'assumptions', 'custom-b']);
  });

  it('puts a newly added standard section after the one it normally follows', () => {
    // A layout saved before Implementation existed, with Scope moved to the end.
    expect(sanitizeLayout({ order: ['summary', 'roi', 'assumptions', 'scope'] }, id).order).toEqual(['summary', 'roi', 'assumptions', 'scope', 'implementation']);
  });

  it('only hides standard sections', () => {
    expect(sanitizeLayout({ hiddenSections: ['summary', 'custom-x'] }, id).hiddenSections).toEqual(['summary']);
  });

  it('rejects malformed input', () => {
    expect(() => sanitizeLayout([], id)).toThrow();
    expect(() => sanitizeLayout({ order: ['bad id!'] }, id)).toThrow();
    expect(() => sanitizeLayout({ custom: { 'not-custom': { title: '', html: '' } } }, id)).toThrow();
    expect(() => sanitizeLayout({ custom: { 'custom-a': { title: 5, html: '' } } }, id)).toThrow();
  });
});

describe('rich text cleaning', () => {
  it('keeps the formatting the editor offers', () => {
    const html = '<span style="font-weight:bold;color:rgb(63, 140, 234);font-size:19px">Three</span> reasons<ul><li><i>a</i></li><ul><li><u>b</u></li></ul></ul><blockquote style="margin-left:40px">c</blockquote>';
    expect(cleanRichText(html)).toBe(html.replace('font-weight:bold;color:rgb(63, 140, 234);font-size:19px', 'font-weight:bold;color:rgb(63, 140, 234);font-size:19px'));
  });

  it('strips scripts, handlers, links, images and stray styles', () => {
    const out = cleanRichText('<p onclick="x()">hi<script>alert(1)</script><a href="javascript:x">l</a><img src=x onerror=y><span style="position:fixed;color:red;background:url(x)">s</span></p>');
    expect(out).not.toMatch(/script|onclick|onerror|href|img|position|background/i);
    expect(out).toContain('hi');
  });
});

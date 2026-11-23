import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT, type ProposalLayout } from './layout';
import { applyTemplate, dealVars, matchesTemplate, templateFrom, toPlaceholders } from './templates';

const vars = dealVars({ customerName: 'ABC Senior Living', communities: [{ ilBeds: 100, alBeds: 100, mcBeds: 5, snfBeds: 0 }, { ilBeds: 0, alBeds: 100, mcBeds: 0, snfBeds: 0 }, { ilBeds: 0, alBeds: 0, mcBeds: 0, snfBeds: 0 }] as never });

describe('business case templates', () => {
  it('swaps the deal name and counts for placeholders', () => {
    expect(vars).toEqual({ customer: 'ABC Senior Living', communities: '3', bedCount: '305' });
    expect(toPlaceholders('ABC Senior Living runs 3 communities with 305 beds (305 AL beds).', vars)).toBe('{customer} runs {communities} communities with {bedCount} beds ({bedCount} AL beds).');
    // Other numbers stay; a count without its word stays.
    expect(toPlaceholders('Save 3 hours across 13 communities and 1,305 beds; 3 sites.', vars)).toBe('Save 3 hours across 13 communities and 1,305 beds; 3 sites.');
  });

  it('takes the business case layout and wording only', () => {
    const layout: ProposalLayout = { ...structuredClone(DEFAULT_LAYOUT), format: 'businessCase', order: ['terms'], pageStarts: ['terms'], bcPages: ['cover', 'roi', 'bcpage-x'], bcCustom: { 'bcpage-x': { title: 'Clinical', html: '<p>Body</p>' } }, hiddenRows: { 'roi.falls': 'Falls' }, hiddenValues: ['fp.missing.c1'], bcChart: 'stacked' };
    const t = templateFrom({ 'bc.exec.lede': 'For ABC Senior Living', 'cover.title': 'Standard wording' }, layout, vars);
    expect(t.edits).toEqual({ 'bc.exec.lede': 'For {customer}' });
    expect(t.layout).toEqual({ bcPages: ['cover', 'roi', 'bcpage-x'], bcCustom: { 'bcpage-x': { title: 'Clinical', html: '<p>Body</p>' } }, hiddenRows: { 'roi.falls': 'Falls' }, bcChart: 'stacked' });
    const noText = templateFrom({}, layout, vars, { pages: true, tables: false, wording: false, customText: false });
    expect(noText.layout).toEqual({ bcPages: ['cover', 'roi', 'bcpage-x'], bcCustom: { 'bcpage-x': { title: 'Clinical', html: '' } } });
  });

  it('applies everything, or just the layout, leaving the standard format alone', () => {
    const tpl = { edits: { 'bc.exec.lede': 'For {customer}' }, layout: { bcPages: ['cover', 'roi'], bcChart: 'stacked' as const } };
    const current = { edits: { 'bc.exec.lede': 'Mine', 'bc.other': 'x', 'cover.title': 'Std' }, layout: { ...structuredClone(DEFAULT_LAYOUT), pageStarts: ['terms'], hiddenRows: { a: 'A' }, bcImpl: 'gantt' as const } };
    const all = applyTemplate(current, tpl, 'all', { id: 7, name: 'CFO' });
    expect(all.edits).toEqual({ 'cover.title': 'Std', 'bc.exec.lede': 'For {customer}' });
    expect(all.layout).toMatchObject({ format: 'businessCase', pageStarts: ['terms'], bcPages: ['cover', 'roi'], bcChart: 'stacked', bcTemplate: { id: 7, name: 'CFO', wording: true } });
    expect(all.layout.hiddenRows).toBeUndefined();
    expect(all.layout.bcImpl).toBeUndefined();
    expect(matchesTemplate(all, tpl)).toBe(true);
    expect(matchesTemplate({ ...all, edits: { ...all.edits, 'bc.exec.lede': 'Changed' } }, tpl)).toBe(false);
    const lay = applyTemplate(current, tpl, 'layout', { id: 7, name: 'CFO' });
    expect(lay.edits).toEqual(current.edits);
    expect(lay.layout.bcTemplate?.wording).toBeUndefined();
    expect(matchesTemplate(lay, tpl)).toBe(true); // own wording isn't a change
    expect(matchesTemplate({ ...lay, layout: { ...lay.layout, bcChart: undefined } }, tpl)).toBe(false);
  });
});

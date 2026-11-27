import { describe, expect, it } from 'vitest';
import { sanitizeLayout } from './layout';
const normalizeLayout = (x: unknown) => sanitizeLayout(x, (h) => h);
import { caseRows } from '@/components/proposal/FourCases';
import { priceBook } from '@/lib/pricing/catalog';
import { defaultDraft, newCommunity } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { runModel } from '@/lib/model';

describe('All four cases block', () => {
  it('is off until added; the view and hidden cases are kept, never all four hidden', () => {
    expect(normalizeLayout({}).bcCases).toBeUndefined();
    const l = normalizeLayout({ bcCases: true, bcCasesView: 'cards', bcCasesHide: ['underperforming', 'bogus'] });
    expect([l.bcCases, l.bcCasesView, l.bcCasesHide]).toEqual([true, 'cards', ['underperforming']]);
    expect(normalizeLayout({ bcCases: true, bcCasesHide: ['stretch', 'target', 'base', 'underperforming'] }).bcCasesHide).toBeUndefined();
    expect(normalizeLayout({ bcCasesView: 'grid' }).bcCasesView).toBeUndefined();
  });
  it('shows the results page’s numbers for each case, stretch above underperforming', () => {
    const d = defaultDraft('Cases', priceBook(), new Date('2026-11-01T00:00:00Z'));
    d.communities = [{ ...newCommunity(0), name: 'A', alBeds: 120 }];
    const inputs = toModelInputs(d);
    const out = runModel(inputs);
    const rows = caseRows(out, '9%');
    expect(rows.map((r) => r.key)).toEqual(['roi', 'return', 'breakeven', 'revpor', 'noi', 'value']);
    const roi = rows[0];
    expect(out.annual.stretch.totals.annualRoi).toBeGreaterThan(out.annual.underperforming.totals.annualRoi);
    expect(roi.fmt('target')).toMatch(/^\$/);
    expect(rows[2].fmt('target')).toBe(`${out.annual.target.totals.breakevenMonths.toFixed(1)} mo`);
    expect(rows[5].sub).toBe('At a 9% cap rate');
  });
});

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

describe('All four cases, equipment purchase basis', () => {
  it('stabilized return on the yearly cost of ownership, breakeven on year 1, equipment kept out of NOI', async () => {
    const { computeCapex } = await import('@/lib/pricing/capex');
    const { totalOccupiedUnits } = await import('@/lib/model/annual');
    const d = defaultDraft('Cases capex', priceBook(), new Date('2026-11-01T00:00:00Z'));
    d.presentation = 'capex';
    d.communities = [{ ...newCommunity(0), name: 'A', alBeds: 120 }];
    const inputs = toModelInputs(d);
    const out = runModel(inputs);
    const cx = computeCapex(d);
    const yrs = cx.ownershipMonths / 12;
    const running = cx.softwareMonthly * 12 + cx.renewals / yrs;
    const year1 = cx.equipment + cx.softwareMonthly * 12;
    const rows = caseRows(out, '9%', { kind: 'capex', annualCost: cx.ownershipTotal / yrs, year1, running, occupied: totalOccupiedUnits(inputs), capRate: 0.09 });
    const t = out.annual.target.totals;
    expect(rows[1].fmt('target')).toBe(`${(t.annualRoi / (cx.ownershipTotal / yrs)).toFixed(1)}×`);
    expect(rows[2].fmt('target')).toBe(`${(year1 / (t.annualRoi / 12)).toFixed(1)} mo`);
    // NOI: the same gains and savings, less only the running cost (not the equipment).
    const noi = t.annualNetNoiImpact + t.annualRecurringCost - running;
    expect(noi).toBeGreaterThan(t.annualNetNoiImpact);
    expect(rows[1].label).toBe('Stabilized return on cost');
  });
  it('subscription: stabilized return is the benefit over the yearly fees, not the year-1 figure', () => {
    const d = defaultDraft('Cases sub', priceBook(), new Date('2026-11-01T00:00:00Z'));
    d.communities = [{ ...newCommunity(0), name: 'A', alBeds: 120 }];
    const out = runModel(toModelInputs(d));
    const t = out.annual.target.totals;
    const rows = caseRows(out, '9%', { kind: 'subscription', annualCost: t.annualRecurringCost });
    expect(rows[1].fmt('target')).toBe(`${(t.annualRoi / t.annualRecurringCost).toFixed(1)}×`);
    expect(t.annualRoi / t.annualRecurringCost).toBeGreaterThan(t.returnOnCost);
  });
});

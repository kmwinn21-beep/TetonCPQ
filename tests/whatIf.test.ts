import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { defaultDraft, newCommunity } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { priceBook } from '@/lib/pricing/catalog';
import { applyChanges, describeChanges, effectiveChanges, figureSpec, formatField, getPath, setPath, traceFields, fieldByPath } from '@/lib/proposal/whatIf';

const book = priceBook([
  { sku: 'TETON-PLATFORM', name: 'Platform', pricingModel: 'per_bed_month', list: 99, description: '' },
] as never);
const draft = () => {
  const d = defaultDraft('Acme', book, new Date(Date.UTC(2026, 10, 1)));
  d.communities = [{ ...newCommunity(0), name: 'Site A', alBeds: 100, pilot: true }];
  return d;
};

describe('proposal what-if', () => {
  it('finds the deal inputs behind a traced figure', () => {
    const d = draft();
    const traces = runModel(toModelInputs(d)).traces;
    const fields = traceFields(traces['annual.fallCostAvoidance'], d);
    expect(fields).toEqual(expect.arrayContaining(['client.occupancy', 'client.fallsPerResidentYear', 'client.pctFallsHospitalization', 'client.costPerHospitalization', `caseMetrics.${d.roiCase}.fallReduction`]));
    expect(fields).not.toContain('commercial.platformRate');
    const net = traceFields(traces['kpi.netBenefit12'], d);
    expect(net).toEqual(expect.arrayContaining(['commercial.platformRate', 'commercial.installRate', 'client.occupancy']));
  });

  it('maps every clickable figure to inputs', () => {
    for (const k of ['card.net.value', 'scope.oneTime.value', 'rate.subscription.value', 'capex.price.value', 'assume.occupancy.value', 'impl.baseline.weeks', 'roi.outcome.valuation.value']) {
      const s = figureSpec(k);
      expect(s, k).not.toBeNull();
      expect(!!s!.trace || !!s!.fields?.length, k).toBe(true);
    }
    expect(figureSpec('nope.value')).toBeNull();
  });

  it('applies changes without mutating the draft, and validates them', () => {
    const d = draft();
    const out = applyChanges(d, { 'commercial.platformRate': 89, 'client.occupancy': 0.92 });
    expect(out.commercial.platformRate).toBe(89);
    expect(d.commercial.platformRate).toBe(99);
    expect(() => applyChanges(d, { 'communities.0.alBeds': 5 })).toThrow();
    expect(() => applyChanges(d, { 'client.occupancy': 1.5 })).toThrow();
    expect(() => applyChanges(d, { 'commercial.platformRate': null })).toThrow();
    expect(applyChanges(d, { 'commercial.specialRate': null }).commercial.specialRate).toBeNull();
  });

  it('drops changes equal to the saved value', () => {
    expect(effectiveChanges(draft(), { 'commercial.platformRate': 99, 'client.occupancy': 0.92 })).toEqual({ 'client.occupancy': 0.92 });
  });

  it('formats and describes changes', () => {
    const d = draft();
    expect(formatField(fieldByPath(d, 'client.occupancy')!, 0.92)).toBe('92%');
    expect(describeChanges(d, { 'commercial.platformRate': 89, 'client.occupancy': 0.92 })).toBe('Platform rate / bed / mo $99 → $89; Occupancy 90% → 92%');
  });

  it('reads and writes paths', () => {
    const o = { a: { b: { c: 1 } } };
    expect(getPath(setPath(o, 'a.b.c', 2), 'a.b.c')).toBe(2);
    expect(o.a.b.c).toBe(1);
  });

  it('offers the Case setup switch for ROI line items and accepts on/off', () => {
    expect(figureSpec('roi.benefit.los.value')!.fields).toContain('components.fallsDischarge');
    expect(figureSpec('roi.total.value')!.fields).toHaveLength(6);
    const d = draft();
    const off = applyChanges(d, { 'components.fallsDischarge': false });
    expect(off.components.fallsDischarge).toBe(false);
    expect(runModel(toModelInputs(off)).annual[d.roiCase].totals.revenueFromLosIncrease).toBe(0);
    expect(() => applyChanges(d, { 'components.fallsDischarge': 0 })).toThrow('on or off');
    expect(describeChanges(d, { 'components.fallsDischarge': false })).toBe('Falls → Discharge On → Off');
  });

  it('changes implementation stages as one plan change', async () => {
    const { removeStage, addCustomStage, defaultPlan } = await import('@/lib/quote/implementationPlan');
    const d = draft();
    const plan = addCustomStage(removeStage(defaultPlan(), 'baseline'), 'Site survey', 2).plan;
    expect(figureSpec('impl.custom-abc.weeks')!.fields).toEqual(['implementationPlan']);
    const out = applyChanges(d, { implementationPlan: plan });
    expect(out.implementationPlan.order).not.toContain('baseline');
    expect(effectiveChanges(d, { implementationPlan: JSON.parse(JSON.stringify(d.implementationPlan)) })).toEqual({});
    expect(describeChanges(d, { implementationPlan: plan })).toBe('Implementation timeline: removed Baseline, added Site survey (2 wk)');
  });
});

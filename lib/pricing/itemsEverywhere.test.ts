/** Generic items wherever prices are shown: the pricing check (and its self-checks), previews, proposals, one-pagers. */
import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { computeOutputs } from '@/lib/quote/outputs';
import { buildPricingCheck } from '@/lib/quote/pricingCheck';
import { previewTotals } from '@/lib/quote/previewTotals';
import { subscriptionTable, purchaseTable } from '@/lib/proposal/onePager';
import { buildProposalData } from '@/components/proposal/proposalData';
import { priceBook } from './catalog';
import { computeCapex } from './capex';
import { DEFAULT_LINEUP, type ItemSpec, type Lineup } from './lineup';

const book = priceBook();
const SUPPORT: ItemSpec = { name: 'Remote support', code: 'TT-X-001', list: 5, billing: 'monthly', counted: 'monitoredBeds', pilot: 'free' };
const SURVEY: ItemSpec = { name: 'Site survey', code: 'TT-X-002', list: 250, billing: 'once', counted: 'perCommunity', pilot: 'credited' };
const BATTERY: ItemSpec = { name: 'Battery swap', code: 'TT-X-003', list: 20, billing: 'years', everyYears: 2, counted: 'ecallBeds', pilot: 'none' };
const CA_BUY: ItemSpec = { name: 'Common area sensor (purchase)', code: 'TT-CAP-014', list: 450, billing: 'once', counted: 'commonAreaSensors', pilot: 'credited' };
const CLOUD: ItemSpec = { name: 'Cloud storage', code: 'TT-X-004', list: 2, billing: 'monthly', counted: 'monitoredBeds', pilot: 'free' };

function lineup(): Lineup {
  const l = structuredClone(DEFAULT_LINEUP);
  l.version = 2;
  const core = (id: string) => l.cores.find((c) => c.id === id)!;
  core('monitoring').sides.subscription.items.push({ sku: 'X-SUPPORT', item: SUPPORT }, { sku: 'X-SURVEY', item: SURVEY });
  core('monitoring').sides.capex.items.push({ sku: 'X-CLOUD', item: CLOUD });
  core('ecall').sides.subscription.items.push({ sku: 'X-BATTERY', item: BATTERY });
  core('commonArea').sides.capex = { offered: true, items: [{ sku: 'X-CABUY', item: CA_BUY }] };
  return l;
}

function deal(withItems = true, presentation: QuoteDraft['presentation'] = 'opex'): QuoteDraft {
  const d = defaultDraft('Items SL', book, new Date('2026-11-01T00:00:00Z'));
  d.commercial.installCreditPct = 0.5;
  d.presentation = presentation;
  d.communities = [
    { ...newCommunity(0), name: 'Pilot', alBeds: 100, pilot: true, commonAreaSensors: 4 },
    { ...newCommunity(1), name: 'Second', alBeds: 60, mcBeds: 20, commonAreaSensors: 2 },
  ];
  d.products = presentation === 'capex' ? ['capex', 'ecall', 'commonArea'] : presentation === 'both' ? ['subscription', 'capex', 'ecall', 'commonArea'] : ['subscription', 'ecall', 'commonArea'];
  if (withItems) d.lineup = lineup();
  return normalizeDraft(d);
}

function check(d: QuoteDraft) {
  const inputs = toModelInputs(d);
  const r = runModel(inputs);
  const o = computeOutputs(d, book);
  const { traces: _t, ...model } = r;
  const { trace: _c, ...capex } = computeCapex(d);
  return buildPricingCheck({ draft: d, inputs, out: model, capex, lines: o.lines, book, money: (n) => `$${n.toFixed(2)}`, count: String });
}

describe('generic items everywhere prices are shown', () => {
  it('the pricing check’s self-checks pass, and the items are listed', () => {
    for (const p of ['opex', 'capex', 'both'] as const) {
      const c = check(deal(true, p));
      const bad = c.checks.filter((x) => !x.ok && !x.warn);
      expect(bad, `${p}: ${bad.map((x) => `${x.label} ${x.detail}`).join(' | ')}`).toEqual([]);
      const labels = c.inputs.map((x) => x.label).join(' | ');
      if (p !== 'capex') expect(labels).toContain('Remote support');
      if (p !== 'opex') expect(labels).toContain('Common area sensor (purchase)');
    }
  });
  it('previews, proposal totals and one-pagers include them', () => {
    const d = deal();
    const d0 = deal(false);
    const t = previewTotals(d, toModelInputs(d), runModel(toModelInputs(d)), book);
    const t0 = previewTotals(d0, toModelInputs(d0), runModel(toModelInputs(d0)), book);
    expect(t.opex!.items).toBeGreaterThan(0);
    expect(t.opex!.monthly - t0.opex!.monthly).toBeCloseTo(5 * 180, 6);
    expect(t.opex!.contract).toBeGreaterThan(t0.opex!.contract);
    const o = computeOutputs(d, book);
    const o0 = computeOutputs(d0, book);
    expect(buildProposalData(d, o.outputs, o.lines).serviceMonthly - buildProposalData(d0, o0.outputs, o0.lines).serviceMonthly).toBeCloseTo(900, 6);
    expect(subscriptionTable(d, null).rows.map((x) => x.label)).toEqual(expect.arrayContaining(['Remote support', 'Site survey', 'Battery swap (every 2 years)']));
    expect(purchaseTable(deal(true, 'capex'), null).rows.map((x) => x.label)).toEqual(expect.arrayContaining(['Common area sensor (purchase)', 'Plus Cloud storage']));
  });
});

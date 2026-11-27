import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { priceBook } from './catalog';
import { buildPriceLines, lineTotal } from './lines';
import { computeCapex } from './capex';
import { capexCashFlow } from './capexCashFlow';
import { DEFAULT_LINEUP, type ItemSpec, type Lineup } from './lineup';
import { activeItems } from './items';

const book = priceBook();
const spec = (s: Partial<ItemSpec> & Pick<ItemSpec, 'name' | 'list' | 'billing' | 'counted'>): ItemSpec => ({ code: s.name.toUpperCase().slice(0, 6), pilot: s.billing === 'monthly' ? 'free' : 'credited', ...s });
const SUPPORT = spec({ name: 'Remote support', list: 5, billing: 'monthly', counted: 'monitoredBeds' });
const SURVEY = spec({ name: 'Site survey', list: 250, billing: 'once', counted: 'perCommunity' });
const BATTERY = spec({ name: 'Battery swap', list: 20, billing: 'years', everyYears: 2, counted: 'ecallBeds', pilot: 'none' });
const CA_BUY = spec({ name: 'Common area sensor (purchase)', list: 450, billing: 'once', counted: 'commonAreaSensors' });
const CLOUD = spec({ name: 'Cloud storage', list: 2, billing: 'monthly', counted: 'monitoredBeds' });

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

function deal(withLineup = true): QuoteDraft {
  const d = defaultDraft('Items SL', book, new Date('2026-11-01T00:00:00Z'));
  d.commercial.installCreditPct = 0.5;
  d.schedule.horizonMonths = 60;
  d.communities = [
    { ...newCommunity(0), name: 'Pilot', alBeds: 100, pilot: true, commonAreaSensors: 4 },
    { ...newCommunity(1), name: 'Second', alBeds: 60, mcBeds: 20, commonAreaSensors: 2 },
  ];
  d.products = ['subscription', 'ecall', 'commonArea'];
  if (withLineup) d.lineup = lineup();
  return normalizeDraft(d);
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('generic items on the subscription', () => {
  it('only the picked core products’ items, for the way the deal is sold', () => {
    expect(activeItems(deal()).map((x) => `${x.side}:${x.sku}`)).toEqual(['subscription:X-SUPPORT', 'subscription:X-SURVEY', 'subscription:X-BATTERY']);
    const noEcall = { ...deal(), products: ['subscription' as const] };
    expect(activeItems(noEcall).map((x) => x.sku)).toEqual(['X-SUPPORT', 'X-SURVEY']);
    expect(activeItems(deal(false))).toEqual([]);
  });

  it('bill exactly what the lines say: monthly after a free pilot, one-time credited on pilot sites, renewals every 2 years', () => {
    const d = deal();
    const base = deal(false);
    const inputs = toModelInputs(d);
    const r = runModel(inputs);
    const r0 = runModel(toModelInputs(base));
    const lines = buildPriceLines(d, inputs, book);
    const lines0 = buildPriceLines(base, toModelInputs(base), book);
    const extra = lines.filter((l) => l.sku.startsWith('X-'));
    // Monthly support: 0 during the pilot, then $5 × monitored beds for 36 months.
    const support = extra.filter((l) => l.sku === 'X-SUPPORT');
    expect(support.map((l) => [l.qty, l.unitNet, l.termMonths])).toEqual([[100, 5, 36], [80, 5, 36]]);
    // Site survey: $250 per community, 50% credit at the pilot site.
    const survey = extra.filter((l) => l.sku === 'X-SURVEY');
    expect(survey.map((l) => lineTotal(l))).toEqual([250, -125, 250]);
    // Battery: E-Call beds × $20 at the one-time charge, again every 2 years inside the 36-month term; no credit.
    const battery = extra.filter((l) => l.sku === 'X-BATTERY');
    expect(battery.filter((l) => l.communityPosition === 0).length).toBe(2);
    // The cash flow bills the same on top of the deal without the items.
    // Over each community's pilot + 36-month term (the horizon runs longer).
    const fees = (x: typeof r) => sum(x.cashFlow.communities.map((cc) => sum(cc.fees.slice(cc.goLiveMonth - 1, cc.firstPostPilotMonth - 1 + 36))));
    expect(fees(r) - fees(r0)).toBeCloseTo(sum(support.map(lineTotal)), 6);
    const firstCharges = sum(extra.filter((l) => l.billing === 'one_time' && !l.description.endsWith('(renewal)')).map(lineTotal));
    expect(sum(r.cashFlow.communities.map((c) => c.installCost)) - sum(r0.cashFlow.communities.map((c) => c.installCost))).toBeCloseTo(firstCharges, 6);
    // Renewals land in the cash flow 24 months after each one-time charge.
    const cc = r.cashFlow.communities[0];
    const bat0 = battery.find((l) => l.communityPosition === 0)!;
    expect(r.cashFlow.install[cc.oneTimeMonth + 24 - 1] - r0.cashFlow.install[cc.oneTimeMonth + 24 - 1]).toBeCloseTo(bat0.qty * 20 + (r.cashFlow.communities[1].oneTimeMonth + 24 === cc.oneTimeMonth + 24 ? 80 * 20 : 0), 6);
    expect(lines0.some((l) => l.sku.startsWith('X-'))).toBe(false);
  });

  it('a monthly item billed during the pilot, and a deal price below list', () => {
    const d = deal();
    d.lineup!.cores[0].sides.subscription.items[4] = { sku: 'X-SUPPORT', item: { ...SUPPORT, pilot: 'charged' } };
    d.commercial.items = { 'X-SUPPORT': 4 };
    const lines = buildPriceLines(d, toModelInputs(d), book).filter((l) => l.sku === 'X-SUPPORT');
    expect(lines.map((l) => [l.description, l.unitNet, l.concessionCode])).toEqual([
      ['Remote support — pilot', 4, 'ITEM_DISCOUNT'],
      ['Remote support', 4, 'ITEM_DISCOUNT'],
      ['Remote support', 4, 'ITEM_DISCOUNT'],
    ]);
  });
});

describe('generic items on equipment purchase', () => {
  it('one-time items join the equipment; monthly ones and renewals join the cost of ownership', () => {
    const d = { ...deal(), presentation: 'capex' as const, products: ['capex' as const, 'commonArea' as const] };
    const base = { ...deal(false), presentation: 'capex' as const, products: ['capex' as const, 'commonArea' as const] };
    const c = computeCapex(d);
    const c0 = computeCapex(base);
    expect(c.items?.map((x) => [x.sku, x.qty, x.total])).toEqual([
      ['X-CLOUD', 180, 360],
      ['X-CABUY', 6, 2700],
    ]);
    expect(c.equipment - c0.equipment).toBe(2700);
    expect(c.itemsMonthly).toBe(360);
    expect(c.ownershipTotal - c0.ownershipTotal).toBe(2700 + 360 * 48);
    const r = runModel(toModelInputs(d));
    const cf = capexCashFlow(r.cashFlow, c);
    const cf0 = capexCashFlow(r.cashFlow, c0);
    expect(sum(cf.software) - sum(cf0.software)).toBeCloseTo(360 * cf.software.filter((x, i) => x - cf0.software[i] > 0).length, 6);
  });
  it('not offered that way: not priced', () => {
    const d = { ...deal(), presentation: 'capex' as const, products: ['capex' as const, 'commonArea' as const] };
    d.lineup!.cores.find((x) => x.id === 'commonArea')!.sides.capex.offered = false;
    expect(computeCapex(d).items?.map((x) => x.sku)).toEqual(['X-CLOUD']);
  });
});

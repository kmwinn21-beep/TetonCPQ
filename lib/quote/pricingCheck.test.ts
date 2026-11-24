import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { computeCapex } from '@/lib/pricing/capex';
import { priceBook } from '@/lib/pricing/catalog';
import { buildPriceLines, lineTotal } from '@/lib/pricing/lines';
import { count, usd } from '@/lib/format';
import { allProducts, defaultDraft, newCommunity, type QuoteDraft } from './draft';
import { toModelInputs } from './toModelInputs';
import { buildPricingCheck, lineBilledThrough } from './pricingCheck';
import { pricingCheckSheets, pricingCheckXlsx } from './pricingCheckXlsx';

const book = priceBook();

function draft(): QuoteDraft {
  const d = defaultDraft('Check SL', book, new Date(Date.UTC(2026, 10, 12)));
  d.implementation.desiredGoLive = '2027-03-01';
  d.commercial.installCreditPct = 1;
  d.commercial.specialRate = 89;
  d.commercial.specialTermMonths = 6;
  d.commercial.sensorPrice = 250;
  d.communities = [
    { ...newCommunity(0), name: 'Pilot', alBeds: 100, pilot: true, pilotUnits: 60, additionalSensors: 4, commonAreas: [{ id: 'a', name: 'Bath', kind: 'bathroom', count: 3, pendants: 1 }] },
    { ...newCommunity(1), name: 'Full', alBeds: 80, coverage: 'full_facility', goLiveMonth: '2027-06' },
    { ...newCommunity(2), name: 'E-Call only', alBeds: 40, products: allProducts({ monitoring: false, ecall: true }), goLiveMonth: '2027-06' },
  ];
  return d;
}

function build(d: QuoteDraft) {
  const inputs = toModelInputs(d);
  const { traces: _t, ...out } = runModel(inputs);
  const { trace: _c, ...capex } = computeCapex(d);
  const lines = buildPriceLines(d, inputs, book);
  return { lines, check: buildPricingCheck({ draft: d, inputs, out, capex, lines, book, money: (n, c) => usd(n, { cents: c }), count }) };
}

describe('pricing check', () => {
  it('passes its self-checks and flags prices that differ from the price book', () => {
    const { check } = build(draft());
    const byKey = Object.fromEntries(check.checks.map((c) => [c.key, c]));
    expect(byKey['lines-model'].ok).toBe(true);
    expect(byKey['lines-cf'].ok).toBe(true);
    expect(byKey.year1.ok).toBe(true);
    expect(byKey.equipment.ok).toBe(true);
    expect(byKey.book.warn).toBe(true);
    expect(check.inputs.find((r) => r.key === 'sensor')).toMatchObject({ deal: '$250', book: '$300', differs: true });
  });

  it('shows every price line once for the deal, and once per community, with the same totals', () => {
    const { check, lines } = build(draft());
    const groups = check.groups.filter((g) => g.key === 'subscription' || g.key === 'ecall');
    const dealRows = groups.flatMap((g) => g.rows.filter((r) => r.calc && r.community == null));
    const commRows = groups.flatMap((g) => g.rows.filter((r) => r.calc && r.community != null));
    const all = lines.reduce((s, l) => s + lineTotal(l), 0);
    expect(dealRows.reduce((s, r) => s + r.result, 0)).toBeCloseTo(all, 6);
    expect(commRows.reduce((s, r) => s + r.result, 0)).toBeCloseTo(all, 6);
    for (const r of [...dealRows, ...commRows]) expect(r.result).toBeCloseTo(r.calc!.qty * r.calc!.unit * (r.calc!.months ?? 1), 6);
  });

  it('counts E-Call devices from rooms and common areas', () => {
    const { check } = build(draft());
    const ec = check.groups.find((g) => g.key === 'ecall')!;
    const dev = ec.rows.find((r) => r.key === 'ec.dev')!;
    // 100 rooms + 3 bath pendants, 80, and 40 at the E-Call-only community.
    expect(dev.result).toBe(103 + 80 + 40);
    expect(check.scope.map((s) => s.devices)).toEqual([103, 80, 40]);
    expect(check.scope[2].ecallOnly).toBe(true);
  });

  it('per room: bills rooms + common areas monthly and the devices beyond them once', () => {
    const d = draft();
    d.communities[0].commonAreas = [{ id: 'a', name: 'Bath', kind: 'bathroom', count: 3, pendants: 2 }];
    const { check } = build(d);
    const ec = check.groups.find((g) => g.key === 'ecall')!;
    // Pilot: 100 rooms + 3 areas billed, 106 devices → 3 extra.
    expect(ec.rows.find((r) => r.key === 'ec.rooms.c0')!.result).toBe(103);
    expect(ec.rows.find((r) => r.key === 'ec.extra.c0')!.result).toBe(3);
    expect(check.scope[0]).toMatchObject({ devices: 106, ecallUnits: 103, extraDevices: 3 });
    expect(check.checks.every((c) => c.ok || c.warn)).toBe(true);
    d.commercial.ecallBilling = 'device';
    const dev = build(d).check;
    expect(dev.scope[0]).toMatchObject({ ecallUnits: 106, extraDevices: 0 });
    expect(dev.groups.find((g) => g.key === 'ecall')!.rows.some((r) => r.key === 'ec.rooms')).toBe(false);
  });

  it('flags a saved version whose equipment figures no longer match its inputs', () => {
    const d = draft();
    const inputs = toModelInputs(d);
    const { traces: _t, ...out } = runModel(inputs);
    const { trace: _c, ...capex } = computeCapex(d);
    const stale = { ...capex, ownershipTotal: capex.ownershipTotal + 100 };
    const check = buildPricingCheck({ draft: d, inputs, out, capex: stale, capexLive: capex, lines: buildPriceLines(d, inputs, book), book, money: (n) => usd(n), count });
    expect(check.checks.find((c) => c.key === 'equipment')!.ok).toBe(false);
  });

  it('bills a line only for the months inside the window', () => {
    const l = { communityPosition: 0, communityName: 'x', sku: 's', description: 'd', qty: 10, unitList: 5, unitNet: 5, billing: 'monthly' as const, startMonth: 4, termMonths: 36, concessionCode: null };
    expect(lineBilledThrough(l, 3)).toBe(0);
    expect(lineBilledThrough(l, 12)).toBe(10 * 5 * 9);
    expect(lineBilledThrough(l, 100)).toBe(10 * 5 * 36);
  });

  it('downloads as a workbook with live formulas', () => {
    const { check } = build(draft());
    const sheets = pricingCheckSheets(check, { deal: 'Check SL', showing: 'Current draft' });
    expect(sheets.map((s) => s.name)).toEqual(['Inputs', 'Scope', 'Calculations', 'By community', 'Checks']);
    const calc = sheets[2].rows.flat().filter((c) => c && typeof c === 'object' && 'f' in c && c.f) as Array<{ f: string }>;
    expect(calc.some((c) => /^F\d+$/.test(c.f) === false && /\*/.test(c.f))).toBe(true);
    expect(calc.some((c) => c.f.startsWith('SUM('))).toBe(true);
    const bytes = pricingCheckXlsx(check, { deal: 'Check SL', showing: 'Current draft' });
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });
});

import { describe, expect, it } from 'vitest';
import { priceBook } from './catalog';
import { defaultDraft } from '@/lib/quote/draft';
import { DEFAULT_LINEUP, effectiveCommercial, normalizeLineup, pricedRoles, sameLineup, type Lineup } from './lineup';
import { SKU } from './catalog';

const book = priceBook();
const k = () => defaultDraft('X', book, new Date('2026-11-01T00:00:00Z')).commercial;
const without = (l: Lineup, core: string, side: 'subscription' | 'capex', sku: string, role?: string): Lineup => {
  const n = structuredClone(l);
  const c = n.cores.find((x) => x.id === core)!;
  c.sides[side].items = c.sides[side].items.filter((e) => !(e.sku === sku && (role === undefined || (e.role ?? '') === role)));
  return n;
};

describe('the line-up', () => {
  it('the default prices every built-in item: nothing is removed', () => {
    const c = k();
    expect(effectiveCommercial(c, DEFAULT_LINEUP)).toBe(c);
    expect(effectiveCommercial(c, undefined)).toBe(c);
    expect(effectiveCommercial(c, normalizeLineup(JSON.parse(JSON.stringify(DEFAULT_LINEUP))))).toBe(c);
  });
  it('an item in no list is free; one still in another list is not', () => {
    const noInstall = without(DEFAULT_LINEUP, 'monitoring', 'subscription', SKU.install);
    const c = effectiveCommercial(k(), noInstall);
    expect(c.installRate).toBe(0);
    expect(c.ecallInstallRate).toBe(k().ecallInstallRate); // E-Call installation is its own role
    // Move additional sensors from Resident monitoring to Common area sensors: still priced.
    const moved = without(DEFAULT_LINEUP, 'monitoring', 'subscription', SKU.sensor);
    moved.cores.find((x) => x.id === 'commonArea')!.sides.subscription.items.push({ sku: SKU.sensor });
    expect(effectiveCommercial(k(), moved).sensorPrice).toBe(300);
    expect(effectiveCommercial(k(), without(DEFAULT_LINEUP, 'monitoring', 'subscription', SKU.sensor)).sensorPrice).toBe(0);
  });
  it('removing skilled nursing bills SNF beds at the subscription rate; the bundle off means no saving', () => {
    expect(effectiveCommercial(k(), without(DEFAULT_LINEUP, 'monitoring', 'subscription', SKU.snf)).snfRate).toBeNull();
    const off = structuredClone(DEFAULT_LINEUP);
    off.combos.find((x) => x.id === 'bundle-ble')!.enabled = false;
    const c = effectiveCommercial(k(), off);
    expect(c.bundleDiscount).toEqual({ ble: 0, inovonics: k().bundleDiscount!.inovonics });
  });
  it('system-specific items only touch their system', () => {
    const c = effectiveCommercial(k(), without(DEFAULT_LINEUP, 'ecall', 'capex', SKU.capexBleRenewal));
    expect([c.capex.bleRenewal, c.capex.inovonicsRenewal]).toEqual([0, k().capex.inovonicsRenewal]);
  });
  it('normalizing keeps built-in core products and combinations, drops junk', () => {
    const n = normalizeLineup({ version: 3, cores: [{ id: 'ecall', name: 'E-Call', sides: { subscription: { offered: false, items: [{ sku: SKU.ecallBle }, { sku: SKU.ecallBle }] } } }, { id: 'bogus' }, { id: 'core-x1', name: 'Extra', sides: {} }], combos: [{ id: 'capex-ecall-ble', enabled: false }, { id: 'bundle-ble', enabled: false }] });
    expect(n.version).toBe(3);
    expect(n.cores.map((c) => c.id)).toEqual(['monitoring', 'ecall', 'commonArea', 'finish', 'core-x1']);
    const ec = n.cores.find((c) => c.id === 'ecall')!;
    // E-Call is always offered both ways (OFFER_LOCKED); duplicates are dropped.
    expect(ec.sides.subscription).toEqual({ offered: true, items: [{ sku: SKU.ecallBle }] });
    expect(n.combos.find((c) => c.id === 'capex-ecall-ble')!.enabled).toBe(true);
    expect(n.combos.find((c) => c.id === 'bundle-ble')!.enabled).toBe(false);
    expect(sameLineup(normalizeLineup(DEFAULT_LINEUP), DEFAULT_LINEUP)).toBe(true);
    expect(pricedRoles(DEFAULT_LINEUP).size).toBeGreaterThan(20);
  });
});

import { runModel } from '@/lib/model';
import { newCommunity } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { buildPriceLines, lineTotal } from './lines';
import { computeCapex } from './capex';

describe('deals priced with a line-up', () => {
  const deal = () => {
    const d = defaultDraft('Lineup SL', book, new Date('2026-11-01T00:00:00Z'));
    d.commercial.installCreditPct = 0.5;
    d.communities = [
      { ...newCommunity(0), name: 'Pilot', alBeds: 100, pilot: true, additionalSensors: 6, commonAreaSensors: 4 },
      { ...newCommunity(1), name: 'Second', alBeds: 60, mcBeds: 20 },
    ];
    d.schedule.horizonMonths = 60;
    return d;
  };
  const check = (d: ReturnType<typeof deal>) => {
    const inputs = toModelInputs(d);
    const r = runModel(inputs);
    const lines = buildPriceLines(d, inputs, book);
    const oneTime = lines.filter((l) => l.billing === 'one_time').reduce((s, l) => s + lineTotal(l), 0);
    expect(oneTime).toBeCloseTo(r.cashFlow.communities.reduce((s, c) => s + c.installCost, 0), 6);
    r.cashFlow.communities.forEach((cc, i) => {
      const monthly = lines.filter((l) => l.communityPosition === i && l.billing === 'monthly').reduce((s, l) => s + lineTotal(l), 0);
      expect(monthly).toBeCloseTo(cc.fees.slice(cc.goLiveMonth - 1, cc.firstPostPilotMonth - 1 + 36).reduce((s, x) => s + x, 0), 6);
    });
    return { r, lines };
  };
  it('the default line-up prices the same as no line-up', () => {
    const a = deal();
    const b = { ...deal(), lineup: structuredClone(DEFAULT_LINEUP) };
    expect(toModelInputs(b)).toEqual(toModelInputs(a));
    expect(buildPriceLines(b, toModelInputs(b), book)).toEqual(buildPriceLines(a, toModelInputs(a), book));
  });
  it('without installation: no installation charge or lines, and the lines still add up to the cash flow', () => {
    const d = { ...deal(), lineup: without(DEFAULT_LINEUP, 'monitoring', 'subscription', SKU.install) };
    const { lines } = check(d);
    expect(lines.some((l) => l.sku === SKU.install)).toBe(false);
    const full = check(deal());
    const installTotal = full.lines.filter((l) => l.sku === SKU.install).reduce((s, l) => s + lineTotal(l), 0);
    expect(installTotal).toBeGreaterThan(0);
    const sum = (x: { lines: typeof lines }) => x.lines.reduce((s, l) => s + lineTotal(l), 0);
    expect(sum({ lines })).toBeCloseTo(sum(full) - installTotal, 6);
  });
  it('without the common-area monthly fee or the extra devices: those lines go, the rest stays', () => {
    let l = without(DEFAULT_LINEUP, 'commonArea', 'subscription', SKU.commonAreaMonthly);
    l = without(l, 'ecall', 'subscription', SKU.ecallBleButton);
    const { lines } = check({ ...deal(), lineup: l });
    expect(lines.some((x) => x.sku === SKU.commonAreaMonthly)).toBe(false);
    expect(lines.some((x) => x.sku === SKU.commonAreaSetup)).toBe(true);
    expect(lines.some((x) => x.sku === SKU.ecallBleButton)).toBe(false);
  });
  it('equipment purchase without renewals or the software fee', () => {
    // Inovonics renews every 3 years, so once inside the 4-year ownership period (Bluetooth's 4 years: never).
    const base = { ...deal(), presentation: 'capex' as const };
    base.commercial.ecall = 'inovonics';
    const full = computeCapex(base);
    let l = without(DEFAULT_LINEUP, 'ecall', 'capex', SKU.capexInovonicsRenewal);
    l = without(l, 'monitoring', 'capex', SKU.capexSoftware);
    const c = computeCapex({ ...base, lineup: l });
    expect(full.renewals).toBeGreaterThan(0);
    expect(c.renewals).toBe(0);
    expect(c.softwareMonthly).toBe(0);
    expect(c.equipment).toBe(full.equipment);
  });
});

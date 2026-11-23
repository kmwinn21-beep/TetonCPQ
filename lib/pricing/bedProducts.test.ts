import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { allProducts, defaultDraft, newCommunity, normalizeCommunity, scopeOf, type DraftCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { applyRoomTypes } from '@/lib/quote/roomTypes';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { priceBook } from './catalog';
import { computeCapex, grossBaseRows } from './capex';
import { buildPriceLines, lineTotal } from './lines';

const book = priceBook();

/** AL 80 with both products, IL 27 with E-Call only, MC 30 monitored without E-Call, 10 SNF with nothing. */
const mixed = (over: Partial<DraftCommunity> = {}): DraftCommunity => ({
  ...newCommunity(0),
  name: 'Jackson Creek',
  ilBeds: 27,
  alBeds: 80,
  mcBeds: 30,
  snfBeds: 10,
  products: {
    il: { monitoring: false, ecall: true },
    al: { monitoring: true, ecall: true },
    mc: { monitoring: true, ecall: false },
    snf: { monitoring: false, ecall: false },
  },
  ...over,
});

const deal = (communities: DraftCommunity[]): QuoteDraft => {
  const d = defaultDraft('Acme Senior Living', book, new Date('2026-11-19'));
  d.commercial.ecall = 'ble';
  d.commercial.ecallRate = 10;
  d.commercial.ecallPilotRate = 0;
  d.commercial.ecallInstallRate = 25;
  d.communities = communities;
  return d;
};

describe('products per care type', () => {
  it('new communities leave independent living out; the rest get both products', () => {
    const c = { ...newCommunity(0), ilBeds: 20, alBeds: 50 };
    const s = scopeOf(c);
    expect(s).toMatchObject({ beds: 70, priced: 50, unpriced: 20, monitored: 50, ecall: 50, uniform: { monitoring: true, ecall: true } });
    const inputs = toModelInputs(deal([c]));
    expect(inputs.communities[0].units).toBe(50);
    // E-Call is billed per device: one per E-Call bed here (no room types), at the E-Call rate.
    expect(inputs.communities[0].extras).toEqual([{ units: 50, rates: expect.objectContaining({ postPilotFeePerBedMonth: 10 }) }]);
  });

  it('communities saved before per-care-type products keep pricing every bed', () => {
    const { products: _p, ...legacy } = { ...newCommunity(0), ilBeds: 20, alBeds: 50, ecall: false };
    expect(scopeOf(legacy)).toMatchObject({ priced: 70, monitored: 70, ecall: 0 });
    expect(normalizeCommunity(legacy as DraftCommunity).products?.il).toEqual({ monitoring: true, ecall: false });
  });

  it('counts monitored, E-Call and E-Call-only beds', () => {
    expect(scopeOf(mixed())).toMatchObject({ beds: 147, priced: 137, unpriced: 10, monitored: 110, ecall: 107, monitoredEcall: 80, ecallOnly: 27, uniform: null });
    // Without E-Call in the deal, the IL beds have nothing.
    expect(scopeOf(mixed(), false)).toMatchObject({ priced: 110, ecall: 0, ecallOnly: 0, uniform: { monitoring: true, ecall: false } });
  });

  it('bills the monitored beds, E-Call on its own beds and the E-Call installation on E-Call-only beds', () => {
    const d = deal([mixed()]);
    const inputs = toModelInputs(d);
    const c = inputs.communities[0];
    expect(c.units).toBe(110);
    expect(c.monitoring).toBe(true);
    expect(c.rates?.postPilotFeePerBedMonth).toBe(d.commercial.platformRate);
    expect(c.extras?.map((x) => [x.units, x.rates.postPilotFeePerBedMonth, x.rates.postPilotInstallPerBed])).toEqual([
      [107, 10, 0],
      [27, 0, 25],
    ]);
    const lines = buildPriceLines(d, inputs, book).filter((l) => !l.description.includes('pilot'));
    expect(lines.find((l) => l.description === 'Teton subscription')?.qty).toBe(110);
    expect(lines.find((l) => l.description.startsWith('E-Call ('))?.qty).toBe(107);
    expect(lines.find((l) => l.description === 'E-Call installation')).toMatchObject({ qty: 27, unitNet: 25 });
  });

  it('price lines still add up to exactly what the cash flow bills, pilot included', () => {
    const d = deal([mixed({ pilot: true }), mixed({ id: 'b', name: 'Second', goLiveMonth: '2027-06' })]);
    d.commercial.installCreditPct = 0.5;
    d.schedule.horizonMonths = 60;
    const inputs = toModelInputs(d);
    const r = runModel(inputs);
    const lines = buildPriceLines(d, inputs, book);
    const oneTime = lines.filter((l) => l.billing === 'one_time').reduce((s, l) => s + lineTotal(l), 0);
    expect(oneTime).toBeCloseTo(r.cashFlow.communities.reduce((s, c) => s + c.installCost, 0), 6);
    r.cashFlow.communities.forEach((cc, i) => {
      const monthly = lines.filter((l) => l.communityPosition === i && l.billing === 'monthly').reduce((s, l) => s + lineTotal(l), 0);
      const billed = cc.fees.slice(cc.goLiveMonth - 1, cc.firstPostPilotMonth - 1 + 36).reduce((s, x) => s + x, 0);
      expect(monthly, `community ${i}`).toBeCloseTo(billed, 6);
    });
  });

  it('only monitored beds add ROI benefits', () => {
    const r = runModel(toModelInputs(deal([mixed()])));
    const onlyMonitored = runModel(toModelInputs(deal([mixed({ ilBeds: 0, snfBeds: 0 })])));
    expect(r.annual.target.communities[0].annualRoi).toBeCloseTo(onlyMonitored.annual.target.communities[0].annualRoi, 6);
  });

  it('equipment purchase: base packages with and without E-Call, E-Call only units, software', () => {
    const c = computeCapex(deal([mixed()]));
    const p = c.pricing;
    expect(c.communities[0].parts?.map((x) => [x.monitoring, x.ecall, x.beds, x.perBed])).toEqual([
      [true, 'ble', 80, p.bleBasePrice],
      [true, 'none', 30, p.basePrice],
      [false, 'ble', 27, 165],
    ]);
    expect(c.basePackages).toBe(80 * p.bleBasePrice + 30 * p.basePrice + 27 * 165);
    // Software: monitored beds at the software rate, E-Call-only beds at the E-Call software rate.
    expect(c.softwareMonthly).toBe(110 * p.softwareRate + 27 * 5);
    expect(grossBaseRows(c).map((r) => [r.key, r.units])).toEqual([
      ['ble', 80],
      ['none', 30],
      ['ecallonly', 27],
    ]);
  });

  it('room types: every room sets the beds, only monitored rooms get sensors', () => {
    const c = applyRoomTypes({
      ...newCommunity(0),
      products: allProducts({ monitoring: true, ecall: true }),
      roomTypes: [
        { id: 'a', name: 'Studio', care: 'al', rooms: 50, sensors: 2 },
        { id: 'b', name: 'Cottage', care: 'il', rooms: 20, sensors: 3 },
      ],
      sensorAllowancePct: 0,
    });
    expect([c.ilBeds, c.alBeds, c.additionalSensors]).toEqual([20, 50, 50 + 40]);
    const ilEcallOnly = applyRoomTypes({ ...c, products: { ...c.products, il: { monitoring: false, ecall: true } } });
    expect([ilEcallOnly.ilBeds, ilEcallOnly.alBeds, ilEcallOnly.additionalSensors]).toEqual([20, 50, 50]);
  });
});

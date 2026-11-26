/**
 * The price book matched to the official Teton pricing sheet: skilled nursing at its own rate, the Teton One + E-Call
 * bundle, common areas priced per sensor, and software & services billed monthly or upfront on equipment purchases.
 * Older deals (saved without these fields) price exactly as they did.
 */
import { describe, expect, it } from 'vitest';
import { bundleDiscountFrom, defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { priceBook, SEED_PRODUCTS, SKU } from './catalog';
import { toModelInputs, pricingAdjustments } from '@/lib/quote/toModelInputs';
import { runModel } from '@/lib/model';
import { buildPriceLines, lineTotal } from './lines';
import { computeCapex } from './capex';
import { capexCashFlow } from './capexCashFlow';
import { lineBilledThrough } from '@/lib/quote/pricingCheck';

const book = priceBook();
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function deal(over: (d: QuoteDraft) => void = () => {}): QuoteDraft {
  const d = defaultDraft('Test', book, new Date('2026-11-01T00:00:00Z'));
  d.schedule.withPilot = false;
  d.communities = [{ ...newCommunity(0), name: 'One', alBeds: 80, snfBeds: 20 }];
  over(d);
  return normalizeDraft(d);
}

/** The price lines bill what the cash flow bills, month by month. */
function linesMatchCashFlow(d: QuoteDraft) {
  const inputs = toModelInputs(d);
  const r = runModel(inputs);
  const lines = buildPriceLines(d, inputs, book);
  const H = r.cashFlow.months.length;
  const billed = sum(lines.map((l) => lineBilledThrough(l, H)));
  const cf = sum(r.cashFlow.recurringFees) + sum(r.cashFlow.install);
  expect(billed).toBeCloseTo(cf, 6);
  return { r, lines };
}

describe('the official sheet’s prices', () => {
  it('seeds the new products and the changed prices', () => {
    const list = (sku: string) => SEED_PRODUCTS.find((p) => p.sku === sku)?.list;
    expect([list(SKU.snf), list(SKU.bundleBle), list(SKU.bundleInovonics), list(SKU.commonAreaSetup), list(SKU.commonAreaMonthly)]).toEqual([49, 105, 110, 200, 50]);
    expect([list(SKU.capexBase), list(SKU.capexEcallInstallBle), list(SKU.capexSoftwareUpfront), list(SKU.capexEcallSoftwareUpfront)]).toEqual([4570, 240, 480, 240]);
    expect(bundleDiscountFrom(book)).toEqual({ ble: 4, inovonics: 4 });
  });
});

describe('skilled nursing beds', () => {
  it('bill at the SNF rate: $99 × 80 + $49 × 20 (+ E-Call, less the bundle discount)', () => {
    const { r, lines } = linesMatchCashFlow(deal((d) => (d.commercial.ecall = 'none')));
    expect(r.cashFlow.recurringFees[0]).toBe(99 * 80 + 49 * 20);
    expect(lines.find((l) => l.sku === SKU.snf)).toMatchObject({ qty: 20, unitNet: -50 });
  });
  it('never above the platform rate, and pilot beds take the lower of the two', () => {
    const cheap = deal((d) => ((d.commercial.ecall = 'none'), (d.commercial.platformRate = 45)));
    expect(pricingAdjustments(cheap, cheap.communities[0])).toEqual([]);
    const pilot = deal((d) => {
      d.commercial.ecall = 'none';
      d.schedule.withPilot = true;
      d.communities[0].pilot = true;
      d.communities[0].pilotUnits = 50; // half the beds: 10 of the 20 SNF beds
    });
    const { r } = linesMatchCashFlow(pilot);
    expect(r.cashFlow.recurringFees[0]).toBe(75 * 50 + (49 - 75) * 10);
  });
  it('older deals (no SNF rate) keep pricing SNF beds at the platform rate', () => {
    const d = deal((x) => (x.commercial.ecall = 'none'));
    const old = normalizeDraft({ ...d, commercial: { ...d.commercial, snfRate: undefined } } as QuoteDraft);
    expect(runModel(toModelInputs(old)).cashFlow.recurringFees[0]).toBe(99 * 100);
  });
});

describe('the Teton One + E-Call bundle', () => {
  it('takes $4 off each bed with both: $105 (Bluetooth), $110 (Inovonics)', () => {
    const ble = deal((d) => (d.communities[0].snfBeds = 0));
    expect(linesMatchCashFlow(ble).r.cashFlow.recurringFees[0]).toBe(80 * 105);
    const ino = deal((d) => ((d.communities[0].snfBeds = 0), (d.commercial.ecall = 'inovonics'), (d.commercial.ecallRate = 15)));
    expect(linesMatchCashFlow(ino).r.cashFlow.recurringFees[0]).toBe(80 * 110);
  });
  it('not during a free E-Call pilot, and not on older deals', () => {
    const pilot = deal((d) => ((d.communities[0].snfBeds = 0), (d.schedule.withPilot = true), (d.communities[0].pilot = true)));
    expect(linesMatchCashFlow(pilot).r.cashFlow.recurringFees[0]).toBe(80 * 75);
    const d = deal((x) => (x.communities[0].snfBeds = 0));
    const old = normalizeDraft({ ...d, commercial: { ...d.commercial, bundleDiscount: undefined } } as QuoteDraft);
    expect(runModel(toModelInputs(old)).cashFlow.recurringFees[0]).toBe(80 * 109);
  });
});

describe('common areas', () => {
  it('price each sensor: $200 setup (with the pilot install credit) and $50 a month after the pilot', () => {
    const d = deal((x) => {
      x.commercial.ecall = 'none';
      x.communities[0].snfBeds = 0;
      x.communities[0].commonAreaSensors = 10;
      x.schedule.withPilot = true;
      x.communities[0].pilot = true;
      x.commercial.installCreditPct = 0.5;
    });
    const { r, lines } = linesMatchCashFlow(d);
    const s = r.cashFlow.communities[0];
    expect(r.cashFlow.recurringFees[0]).toBe(80 * 75); // pilot: no common-area fee
    expect(r.cashFlow.recurringFees[s.firstPostPilotMonth - 1]).toBe(80 * 99 + 10 * 50);
    expect(s.installCost).toBe(80 * 400 * 0.5 + 10 * 200 * 0.5);
    expect(lines.filter((l) => l.sku === SKU.commonAreaSetup).map(lineTotal)).toEqual([2000, -1000]);
  });
  it('communities still on the full-facility multiplier keep it (and ignore sensors)', () => {
    const d = deal((x) => {
      x.commercial.ecall = 'none';
      x.communities[0].snfBeds = 0;
      x.communities[0].coverage = 'full_facility';
      x.communities[0].commonAreaSensors = 10;
    });
    expect(linesMatchCashFlow(d).r.cashFlow.recurringFees[0]).toBeCloseTo(80 * 99 * 1.3, 6);
  });
});

describe('software & services billing on an equipment purchase', () => {
  const cx = (billing: 'monthly' | 'upfront') =>
    deal((d) => {
      d.presentation = 'capex';
      d.commercial.capex.softwareBilling = billing;
      d.communities = [
        { ...newCommunity(0), name: 'One', alBeds: 100 },
        { ...newCommunity(1), name: 'Two', alBeds: 40, products: { il: { monitoring: false, ecall: false }, al: { monitoring: false, ecall: true }, mc: { monitoring: false, ecall: true }, snf: { monitoring: false, ecall: true } } },
      ];
    });
  it('upfront: $480 a monitored bed and $240 an E-Call-only bed at install, the same four-year total as monthly', () => {
    const m = computeCapex(cx('monthly'));
    const u = computeCapex(cx('upfront'));
    expect(m.softwareMonthly).toBe(100 * 10 + 40 * 5);
    expect([u.softwareMonthly, u.softwareUpfront]).toEqual([0, 100 * 480 + 40 * 240]);
    expect(u.software).toBe(m.software);
    expect(u.ownershipTotal).toBe(m.ownershipTotal);
    // The Year 1 investment includes software paid upfront.
    const d = cx('upfront');
    const cf = runModel(toModelInputs(d)).cashFlow;
    const c = capexCashFlow(cf, u);
    expect(c.investment12).toBe(c.equipment12 + u.softwareUpfront);
    expect(capexCashFlow(cf, m).investment12).toBe(capexCashFlow(cf, m).equipment12);
  });
  it('new deals start from the price book default; older deals bill monthly', () => {
    expect(defaultDraft('X', book, new Date(), { softwareBilling: 'upfront' }).commercial.capex.softwareBilling).toBe('upfront');
    expect(defaultDraft('X', book).commercial.capex.softwareBilling).toBe('monthly');
    const d = cx('upfront');
    const { softwareBilling: _drop, ...older } = d.commercial.capex;
    expect(normalizeDraft({ ...d, commercial: { ...d.commercial, capex: older } } as QuoteDraft).commercial.capex.softwareBilling).toBe('monthly');
  });
});

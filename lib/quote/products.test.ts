import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { runModel } from '@/lib/model';
import { defaultDraft, newCommunity, normalizeDraft, scopeOf, type QuoteDraft } from './draft';
import { toModelInputs } from './toModelInputs';
import { sampleDraft } from './sampleDraft';
import { previewTotals } from './previewTotals';
import { addProducts, applyKit, clearSensors, dealProducts, fitCommunity, hasSensors, removeBlock, removeProduct, switchStructure, visibleSettings } from './products';

const book = priceBook();
const today = new Date('2026-11-01T00:00:00Z');
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Deals saved before products, with a mix of settings. */
function olderDeals(): QuoteDraft[] {
  const a = sampleDraft(book, today); // E-Call (Bluetooth), pilot
  const b = sampleDraft(book, today);
  b.commercial.ecall = 'none';
  b.presentation = 'both';
  b.communities[1].additionalSensors = 12;
  b.communities[2].snfBeds = 18;
  b.commercial.finish = { ...b.commercial.finish, concealed: true };
  const c = sampleDraft(book, today);
  c.presentation = 'capex';
  c.commercial.ecall = 'inovonics';
  c.communities[0].commonAreaSensors = 6;
  const e = sampleDraft(book, today); // E-Call only
  e.communities = e.communities.map((x) => ({ ...x, products: { il: { monitoring: false, ecall: false }, al: { monitoring: false, ecall: true }, mc: { monitoring: false, ecall: true }, snf: { monitoring: false, ecall: true } } }));
  return [a, b, c, e].map(normalizeDraft);
}

describe('products on older deals', () => {
  it('are implied by the settings', () => {
    const [a, b, c, e] = olderDeals();
    expect(dealProducts(a)).toEqual(['subscription', 'ecall']);
    expect(dealProducts(b)).toEqual(['subscription', 'snf', 'sensor', 'capex', 'finish']);
    expect(dealProducts(c)).toEqual(['ecall', 'commonArea', 'capex']);
    expect(dealProducts(e)).toEqual(['ecall']);
  });
  it('re-adding the implied products changes nothing the engine reads', () => {
    for (const d of olderDeals()) {
      const again = addProducts(d, dealProducts(d), book);
      expect(toModelInputs(normalizeDraft(again))).toEqual(toModelInputs(d));
      expect(again.presentation).toBe(d.presentation);
    }
  });
});

describe('adding and removing products', () => {
  const fresh = () => {
    const d = defaultDraft('New', book, today);
    d.products = [];
    d.commercial.ecall = 'none';
    d.communities = d.communities.map((c) => fitCommunity(d, c));
    return normalizeDraft(d);
  };
  it('a new deal starts with no products and its communities priced with nothing', () => {
    const d = fresh();
    expect(dealProducts(d)).toEqual([]);
    expect(scopeOf({ ...d.communities[0], alBeds: 10 }).priced).toBe(0);
    expect(visibleSettings(dealProducts(d)).pilot).toBe(false);
  });
  it('subscription turns monitoring on; E-Call sets the system at list, free in the pilot; presentation follows', () => {
    let d = addProducts(fresh(), ['subscription'], book);
    expect(d.presentation).toBe('opex');
    expect(scopeOf({ ...d.communities[0], alBeds: 10 }).monitored).toBe(10);
    d = addProducts(d, ['ecall'], book, { ecall: 'inovonics' });
    expect([d.commercial.ecall, d.commercial.ecallRate, d.commercial.ecallPilotRate]).toEqual(['inovonics', 15, 0]);
    expect(scopeOf({ ...d.communities[0], alBeds: 10 }).monitoredEcall).toBe(10);
    d = addProducts(d, ['capex'], book);
    expect(d.presentation).toBe('both');
    d = removeProduct(d, 'subscription');
    expect(d.presentation).toBe('capex');
    // Equipment purchase is still resident monitoring.
    expect(scopeOf({ ...d.communities[0], alBeds: 10 }).monitoredEcall).toBe(10);
    d = removeProduct(d, 'ecall');
    expect(d.commercial.ecall).toBe('none');
  });
  it('blocks removing a product that is still in use', () => {
    const d = addProducts(fresh(), ['subscription', 'sensor'], book);
    d.communities[0].additionalSensors = 4;
    expect(removeBlock(d, 'sensor')).toMatch('4 additional sensors');
    expect(() => removeProduct(d, 'sensor')).toThrow();
  });
  it('new communities follow the deal’s products', () => {
    const d = addProducts(fresh(), ['ecall'], book);
    const c = fitCommunity(d, { ...newCommunity(1), alBeds: 20 });
    expect(scopeOf(c, true)).toMatchObject({ monitored: 0, ecall: 20 });
  });
});

describe('the resident monitoring pilot kit', () => {
  it('120 pilot beds: $0 for 3 months, then $99 × 120 = $11,880 a month; implementation fully credited', () => {
    const base = defaultDraft('Aspen Ridge', book, today);
    base.products = [];
    base.commercial.ecall = 'none';
    base.communities = [{ ...fitCommunity(base, newCommunity(0)), name: 'Aspen Ridge', alBeds: 90, mcBeds: 30, pilot: true }];
    const d = normalizeDraft(applyKit(base, 'rm-pilot', book));
    expect(dealProducts(d)).toEqual(['subscription']);
    expect(d.commercial).toMatchObject({ pilotRate: 0, installCreditPct: 1, installClawback: true, platformRate: 99, ecall: 'none' });
    expect(d.schedule).toMatchObject({ withPilot: true, pilotLengthMonths: 3 });
    const r = runModel(toModelInputs(d));
    const fees = r.cashFlow.recurringFees;
    expect(fees.slice(0, 3)).toEqual([0, 0, 0]);
    expect(fees[3]).toBe(11880);
    expect(sum(r.cashFlow.install)).toBe(0);
    // Contract value: 36 months after the pilot (a 39-month term with it).
    const t = previewTotals(d, toModelInputs(d), r, book);
    expect(t.opex).toMatchObject({ contract: 427680, termMonths: 39 });
  });
});

describe('switching how the deal is sold', () => {
  const subDeal = () => {
    const d = defaultDraft('Switch', book, today);
    d.products = [];
    d.commercial.ecall = 'none';
    d.communities = [{ ...fitCommunity(d, newCommunity(0)), name: 'A', alBeds: 100, additionalSensors: 20 }];
    return normalizeDraft(addProducts(d, ['subscription', 'ecall'], book, { ecall: 'ble' }));
  };
  it('subscription → equipment purchase in one step keeps monitoring, E-Call and sensors (priced at purchase prices)', () => {
    const d = normalizeDraft(switchStructure(subDeal(), 'capex', book));
    expect(dealProducts(d)).toEqual(['ecall', 'capex']);
    expect(d.presentation).toBe('capex');
    expect(scopeOf(d.communities[0], true)).toMatchObject({ monitored: 100, monitoredEcall: 100 });
    expect(hasSensors(d)).toBe(true);
    const back = normalizeDraft(switchStructure(d, 'subscription', book));
    expect(back.presentation).toBe('opex');
    expect(dealProducts(back)).toEqual(['subscription', 'ecall']);
  });
  it('removing the subscription while equipment purchase stays keeps resident monitoring', () => {
    const both = normalizeDraft(addProducts(subDeal(), ['capex'], book));
    expect(both.presentation).toBe('both');
    const d = normalizeDraft(removeProduct(both, 'subscription'));
    expect(scopeOf(d.communities[0], true).monitored).toBe(100);
  });
  it('adding equipment purchase to an E-Call-only deal turns monitoring back on', () => {
    const ecallOnly = normalizeDraft(removeProduct(subDeal(), 'subscription'));
    expect(scopeOf(ecallOnly.communities[0], true).monitored).toBe(0);
    const d = normalizeDraft(addProducts(ecallOnly, ['capex'], book));
    expect(scopeOf(d.communities[0], true).monitored).toBe(100);
  });
  it('removing all additional sensors sets them to 0 and drops the product', () => {
    const r = clearSensors(subDeal());
    expect(r.kept).toEqual([]);
    expect(r.draft.communities[0].additionalSensors).toBe(0);
    expect(hasSensors(normalizeDraft(r.draft))).toBe(false);
  });
});

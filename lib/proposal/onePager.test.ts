import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { computeCapex } from '@/lib/pricing/capex';
import { allProducts, defaultDraft, newCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { draftForSystem, isOnePager, ONE_PAGERS, onePagerCounts, onePagerInfo, onePagerParts, onePagerScope, purchaseTable, subscriptionTable } from './onePager';
import { sanitizeLayout } from './layout';
import { removedBcPages } from './bcPages';

const book = priceBook();

function draft(): QuoteDraft {
  const d = defaultDraft('One SL', book, new Date(Date.UTC(2026, 10, 12)));
  d.implementation.desiredGoLive = '2027-03-01';
  d.commercial.installCreditPct = 1;
  d.communities = [
    { ...newCommunity(0), name: 'Pilot', alBeds: 60, pilot: true, pilotUnits: 60, additionalSensors: 6, commonAreas: [{ id: 'a', name: 'Bath', kind: 'bathroom', count: 4, pendants: 1 }] },
    { ...newCommunity(1), name: 'Second', alBeds: 40, goLiveMonth: '2027-06' },
  ];
  return d;
}

describe('one pagers', () => {
  it('names nine pages, three per scope', () => {
    expect(ONE_PAGERS).toHaveLength(9);
    expect(onePagerParts('op-both-capex')).toEqual({ scope: 'both', mode: 'capex' });
    expect(isOnePager('op-rm-opex')).toBe(true);
    expect(isOnePager('pilot')).toBe(false);
  });

  it('follows the deal’s products', () => {
    const d = draft();
    expect(onePagerScope(d)).toBe('both');
    expect(onePagerScope({ ...d, commercial: { ...d.commercial, ecall: 'none' } })).toBe('rm');
    const ec = { ...d, communities: d.communities.map((c) => ({ ...c, products: allProducts({ monitoring: false, ecall: true }) })) };
    expect(onePagerScope(ec)).toBe('ec');
    expect(onePagerInfo(d)).toEqual({ scope: 'both', pilot: true });
  });

  it('keeps the page ids through the layout sanitizer, and never lists them as removed built-in pages', () => {
    const l = sanitizeLayout({ bcPages: ['cover', 'op-rm-both', 'op-nope'], bcOpPilotTable: ['op-rm-both', 'x'] }, (h) => h);
    expect(l.bcPages).toEqual(['cover', 'op-rm-both']);
    expect(l.bcOpPilotTable).toEqual(['op-rm-both']);
    expect(removedBcPages(['cover'])).not.toContain('op-rm-both');
  });

  it('prices each E-Call system: the deal’s own rate, the other at its comparison rate', () => {
    const d = draft();
    d.commercial.ecall = 'ble';
    d.commercial.ecallRate = 8;
    d.commercial.ecallCompareRate = 13;
    expect(draftForSystem(d, 'ble').commercial).toMatchObject({ ecall: 'ble', ecallRate: 8 });
    expect(draftForSystem(d, 'inov').commercial).toMatchObject({ ecall: 'inovonics', ecallRate: 13 });
    const ble = subscriptionTable(d, 'ble');
    const inov = subscriptionTable(d, 'inov');
    const ec = (t: typeof ble) => t.rows.find((r) => r.key === 'ecall')!;
    // 100 rooms + 4 common areas, per room.
    expect(ec(ble)).toMatchObject({ qty: 104, min: 8, total: 832, kind: 'monthly' });
    expect(ec(inov)).toMatchObject({ qty: 104, min: 13, total: 1352 });
    expect(ec(ble).label).toBe('E-Call, per room (incl. 4 common areas)');
  });

  it('subscription: standard monthly fees and one-time charges, without pilot fees or credits', () => {
    const d = draft();
    d.commercial.ecall = 'none';
    const t = subscriptionTable(d, null);
    const sub = t.rows.find((r) => r.key === 'sub')!;
    expect(sub).toMatchObject({ qty: 100, min: d.commercial.platformRate, total: 100 * d.commercial.platformRate });
    expect(t.rows.find((r) => r.key === 'install')).toMatchObject({ qty: 100, total: 100 * d.commercial.installRate });
    expect(t.rows.find((r) => r.key === 'sensors')).toMatchObject({ qty: 6 });
    expect(t.rows.some((r) => r.total < 0)).toBe(false);
    expect(t.monthly).toBe(sub.total);
    expect(t.upfront).toBe(100 * d.commercial.installRate + 6 * d.commercial.sensorPrice);
  });

  it('purchase: equipment at list (before conversion credits) with a total, then software per month', () => {
    const d = draft();
    d.commercial.ecall = 'none';
    d.commercial.capex = { ...(d.commercial.capex ?? {}), conversionCredit: 250 } as typeof d.commercial.capex;
    const t = purchaseTable(d, null);
    const c = computeCapex(d);
    expect(t.rows.map((r) => r.key)).toEqual(['base', 'sensors', 'total', 'software']);
    expect(t.rows.find((r) => r.key === 'base')).toMatchObject({ qty: 100, min: c.pricing.basePrice, total: 100 * c.pricing.basePrice });
    expect(t.upfront).toBe(100 * c.pricing.basePrice + 6 * c.pricing.sensorPrice);
    expect(t.rows.find((r) => r.key === 'total')!.total).toBe(t.upfront);
    expect(t.monthly).toBe(100 * c.pricing.softwareRate);
  });

  it('purchase with E-Call uses each system’s base package', () => {
    const d = draft();
    const ble = purchaseTable(d, 'ble').rows.find((r) => r.key === 'baseec')!;
    const inov = purchaseTable(d, 'inov').rows.find((r) => r.key === 'baseec')!;
    const p = computeCapex(d).pricing;
    expect([ble.min, inov.min]).toEqual([p.bleBasePrice, p.inovonicsBasePrice]);
  });

  it('counts the scope', () => {
    expect(onePagerCounts(draft())).toMatchObject({ beds: 100, edges: 100, sensors: 106, areas: 4 });
  });
});

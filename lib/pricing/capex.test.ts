import { describe, expect, it } from 'vitest';
import { defaultDraft, allProducts, newCommunity, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { priceBook } from './catalog';
import { computeCapex } from './capex';

const forestHills = (ecall: QuoteDraft['commercial']['ecall'] = 'none'): QuoteDraft => {
  const d = defaultDraft('Triple Crown', priceBook(), new Date('2026-11-16'));
  d.commercial.ecall = ecall;
  d.communities = [{ ...newCommunity(0), name: 'Forest Hills Commons', ilBeds: 0, alBeds: 99, mcBeds: 20, snfBeds: 0, additionalSensors: 50, ecall: true }];
  return d;
};

describe('equipment purchase (CapEx)', () => {
  it('reproduces the Forest Hills Commons example from the pricing deck', () => {
    const c = computeCapex(forestHills());
    expect(c.basePackages).toBe(543_830); // 119 × $4,570 (the official sheet: edge unit $4,120 + sensor $200 + install $250)
    expect(c.sensorCost).toBe(22_500); // 50 × $450
    expect(c.equipment).toBe(566_330);
    expect(c.softwareMonthly).toBe(1_190); // 119 × $10
    expect(c.software).toBe(57_120); // four years
    expect(c.ownershipTotal).toBe(623_450);
    expect(Math.round(c.equipmentShare * 100)).toBe(91);
    expect(c.trace.value).toBe(566_330);
  });

  it('uses the complete-solution price for beds with E-Call, and counts renewals inside four years', () => {
    const ble = computeCapex(forestHills('ble'));
    expect(ble.basePackages).toBe(119 * 5_300);
    expect(ble.renewals).toBe(0); // Bluetooth renews every 4 years: the first renewal starts after the period
    const ino = computeCapex(forestHills('inovonics'));
    expect(ino.basePackages).toBe(119 * 5_450);
    expect(ino.renewals).toBe(119 * 400); // Inovonics renews after its first 3-year contract
    expect(ino.ownershipTotal).toBe(119 * 5_450 + 22_500 + 57_120 + 119 * 400);
  });

  it('prices communities without E-Call at the base package', () => {
    const d = forestHills('ble');
    d.communities[0].products = allProducts({ monitoring: true, ecall: false });
    expect(computeCapex(d).basePackages).toBe(543_830);
  });

  it('gives older drafts the list prices and drops the old discount rate', () => {
    const d = forestHills() as QuoteDraft & { commercial: Record<string, unknown> };
    const old = { ...d, commercial: { ...d.commercial, capexDiscountRate: 0.04, capex: undefined } } as unknown as QuoteDraft;
    const n = normalizeDraft(old);
    expect(n.commercial.capex.basePrice).toBe(4_570);
    expect('capexDiscountRate' in n.commercial).toBe(false);
  });
});

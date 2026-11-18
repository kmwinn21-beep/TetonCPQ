import { describe, expect, it } from 'vitest';
import { defaultDraft, newCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { priceBook } from './catalog';
import { basePackageRows, computeCapex, conversionCreditOf, sensorRows, unitPriceText } from './capex';

const deal = (credit: number | null): QuoteDraft => {
  const d = defaultDraft('Acme Senior Living', priceBook(), new Date('2026-11-17'));
  d.commercial.ecall = 'none';
  d.schedule.withPilot = true;
  d.commercial.capex = { ...d.commercial.capex!, basePrice: 4600, sensorPrice: 450, conversionCredit: credit };
  d.communities = [
    { ...newCommunity(0), id: 'p', name: 'Pilot', alBeds: 100, additionalSensors: 50, pilot: true },
    { ...newCommunity(1), id: 'n', name: 'Later', alBeds: 60, additionalSensors: 20, pilot: false },
  ];
  return d;
};
const usd = (n: number) => `$${n.toLocaleString('en-US')}`;

describe('conversion credit (equipment purchase)', () => {
  it('takes the credit off each base package and sensor at pilot communities only', () => {
    const c = computeCapex(deal(250));
    expect(c.communities[0].basePerBed).toBe(4350);
    expect(c.communities[0].sensorPrice).toBe(200);
    expect(c.communities[1].basePerBed).toBe(4600);
    expect(c.equipment).toBe(100 * 4350 + 50 * 200 + 60 * 4600 + 20 * 450);
    expect(conversionCreditOf(c)).toBe(250);
  });

  it('shows the math split into credited and full-price rows', () => {
    const c = computeCapex(deal(250));
    expect(basePackageRows(c).map((r) => `${r.beds} beds × ${unitPriceText(r, usd)}`)).toEqual(['100 beds × ($4,600 − $250)', '60 beds × $4,600']);
    expect(sensorRows(c).map((r) => `${r.units} sensors × ${unitPriceText(r, usd)}`)).toEqual(['50 sensors × ($450 − $250)', '20 sensors × $450']);
  });

  it('is unchanged when blank or $0, and never takes a price below $0', () => {
    for (const blank of [null, 0]) {
      const c = computeCapex(deal(blank));
      expect(conversionCreditOf(c)).toBe(0);
      expect(basePackageRows(c)).toHaveLength(1);
      expect(c.equipment).toBe(160 * 4600 + 70 * 450);
    }
    const big = computeCapex(deal(500));
    expect(big.communities[0].sensorPrice).toBe(0);
    expect(big.communities[0].basePerBed).toBe(4100);
  });
});

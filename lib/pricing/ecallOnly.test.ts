import { describe, expect, it } from 'vitest';
import { defaultDraft, newCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { priceBook } from './catalog';
import { computeCapex, grossBaseRows } from './capex';
import { buildPriceLines, lineTotal } from './lines';
import { communityRates, toModelInputs } from '@/lib/quote/toModelInputs';
import { annualForCase } from '@/lib/model/annual';

const deal = (): QuoteDraft => {
  const d = defaultDraft('Acme Senior Living', priceBook(), new Date('2026-11-19'));
  d.commercial.ecall = 'ble';
  d.commercial.ecallRate = 10;
  d.commercial.ecallPilotRate = 0;
  d.schedule.withPilot = false;
  d.communities = [
    { ...newCommunity(0), id: 'm', name: 'Monitored', alBeds: 100, additionalSensors: 20, ecall: true },
    { ...newCommunity(1), id: 'e', name: 'E-Call only', alBeds: 50, additionalSensors: 10, ecall: true, monitoring: false },
  ];
  return d;
};

describe('E-Call-only communities (no resident monitoring)', () => {
  it('pay the E-Call rate and the E-Call installation price only', () => {
    const d = deal();
    d.commercial.ecallInstallRate = 25;
    const r = communityRates(d, d.communities[1]);
    expect(r.postPilotFeePerBedMonth).toBe(10);
    expect(r.postPilotInstallPerBed).toBe(25);
    expect(communityRates(d, d.communities[0]).postPilotFeePerBedMonth).toBe(d.commercial.platformRate + 10);
  });

  it('have no subscription or sensor lines, and E-Call installation defaults to $0', () => {
    const d = deal();
    const lines = buildPriceLines(d, toModelInputs(d), priceBook()).filter((l) => l.communityPosition === 1);
    expect(lines.some((l) => l.sku === 'TETON-PLATFORM')).toBe(false);
    expect(lines.some((l) => l.description === 'Additional sensors')).toBe(false);
    expect(lines.filter((l) => l.description === 'E-Call installation').map(lineTotal)).toEqual([0]);
    expect(lines.filter((l) => l.description.startsWith('E-Call (')).map((l) => l.qty * l.unitNet)).toEqual([500]);
  });

  it('add no ROI benefits', () => {
    const d = deal();
    const a = annualForCase(toModelInputs(d), 'target');
    expect(a.communities[1].annualRoi).toBe(0);
    expect(a.communities[0].annualRoi).toBeGreaterThan(0);
  });

  it('buy E-Call units at $480 a bed on an equipment purchase, with no sensors or software', () => {
    const c = computeCapex(deal());
    expect(c.communities[1]).toMatchObject({ basePackages: 50 * 480, sensors: 0, softwareMonthly: 0, monitoring: false });
    expect(c.softwareMonthly).toBe(100 * c.pricing.softwareRate);
    expect(grossBaseRows(c).find((r) => r.key === 'ecallonly')?.total).toBe(24000);
  });
});

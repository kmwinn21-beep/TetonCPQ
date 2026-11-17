import { describe, expect, it } from 'vitest';
import { defaultDraft, newCommunity, normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { priceBook } from './catalog';
import { computeCapex } from './capex';
import { computeFinish } from './finish';

/** Forest Hills Commons as in the internal deck: 109 personal care + 20 memory care rooms, 82 additional sensors, no E-Call. */
const forestHills = (): QuoteDraft => {
  const d = defaultDraft('Triple Crown Senior Living', priceBook(), new Date('2026-11-17'));
  d.commercial.ecall = 'none';
  d.communities = [{ ...newCommunity(0), name: 'Forest Hills Commons', ilBeds: 0, alBeds: 109, mcBeds: 20, snfBeds: 0, additionalSensors: 82 }];
  return d;
};

describe('Forest Hills Commons deck', () => {
  it('matches the equipment purchase price', () => {
    const c = computeCapex(forestHills());
    expect(c.basePackages).toBe(593_400); // 129 × $4,600
    expect(c.sensorCost).toBe(36_900); // 82 × $450
    expect(c.equipment).toBe(630_300);
    expect(c.softwareMonthly * 12).toBe(15_480);
    expect(c.software).toBe(61_920);
    expect(c.ownershipTotal).toBe(692_220);
    expect(Math.round(c.equipment / c.beds)).toBe(4_886); // per room upfront
  });

  it('prices the concealed finish as a range after the standard credit', () => {
    const d = forestHills();
    d.commercial.finish.concealed = true;
    const f = computeFinish(d);
    expect([f.low, f.high, f.credit]).toEqual([700, 1_000, 400]);
    expect([f.netLow, f.netHigh]).toEqual([300, 600]);
    expect([f.totalLow, f.totalHigh]).toEqual([38_700, 77_400]);
    // Not part of the equipment price.
    expect(computeCapex(d).equipment).toBe(630_300);
  });

  it('gives older drafts the standard finish', () => {
    const d = forestHills();
    const old = { ...d, commercial: { ...d.commercial, finish: undefined } } as unknown as QuoteDraft;
    expect(normalizeDraft(old).commercial.finish).toEqual({ concealed: false, low: 700, high: 1_000, credit: 400 });
  });
});

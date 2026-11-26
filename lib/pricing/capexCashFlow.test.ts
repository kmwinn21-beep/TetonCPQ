import { describe, expect, it } from 'vitest';
import { defaultDraft, newCommunity } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { buildCashFlow, runModel } from '@/lib/model';
import { stayPaidMonth } from '@/lib/model/cashflow';
import { priceBook } from './catalog';
import { computeCapex } from './capex';
import { capexCashFlow } from './capexCashFlow';

describe('equipment purchase cash flow', () => {
  const d = defaultDraft('Triple Crown Senior Living', priceBook(), new Date('2026-11-17'));
  d.commercial.ecall = 'none';
  d.communities = [{ ...newCommunity(0), name: 'Forest Hills Commons', alBeds: 109, mcBeds: 20, additionalSensors: 82, pilot: true }];
  const inputs = toModelInputs(d);
  const cf = buildCashFlow(inputs, runModel(inputs).annual[inputs.roiCase], 48);
  const c = capexCashFlow(cf, computeCapex(d));

  it('pays the equipment at install, so the cash flow starts negative', () => {
    const live = cf.communities[0].goLiveMonth;
    expect(c.equipment[live - 1]).toBe(626_430);
    expect(c.equipment12).toBe(626_430);
    expect(c.discountedNet[live - 1]).toBeLessThan(0);
    expect(c.cumulativeDiscountedNet[0]).toBeLessThan(0);
  });

  it('bills software from the first post-pilot month, and pays back later than the subscription', () => {
    const post = cf.communities[0].firstPostPilotMonth;
    expect(c.software[post - 2] ?? 0).toBe(0);
    expect(c.software[post - 1]).toBe(1_290);
    expect(c.net12).toBe(c.gross12 - c.equipment12 - c.running12);
    expect(c.discountedPaybackMonth).toBeGreaterThan(stayPaidMonth(cf.cumulativeDiscountedNet)!);
  });
});

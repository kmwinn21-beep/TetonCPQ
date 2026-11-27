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
    expect(c.net12).toBeCloseTo(c.gross12 - c.equipment12 - c.running12 - c.pilot12, 6);
    expect(c.discountedPaybackMonth).toBeGreaterThan(stayPaidMonth(cf.cumulativeDiscountedNet)!);
  });

  it('counts the pilot fees: billed each pilot month as the subscription bills them, and in the cost of ownership', () => {
    const cx = computeCapex(d);
    const s = cf.communities[0];
    const pilotMonths = s.firstPostPilotMonth - s.goLiveMonth;
    expect(pilotMonths).toBeGreaterThan(0);
    // 129 beds at the pilot rate, each pilot month.
    expect(cx.pilotFees).toBeCloseTo(129 * d.commercial.pilotRate * pilotMonths, 6);
    expect(c.pilot.reduce((t, x) => t + x, 0)).toBeCloseTo(cx.pilotFees!, 6);
    expect(c.pilot[s.goLiveMonth - 1]).toBeCloseTo(129 * d.commercial.pilotRate, 6);
    expect(c.pilot[s.firstPostPilotMonth - 1]).toBe(0);
    expect(cx.ownershipTotal).toBeCloseTo(cx.equipment + cx.software + cx.renewals + cx.pilotFees!, 6);
    expect(c.totalCost[s.goLiveMonth]).toBeCloseTo(c.equipment[s.goLiveMonth] + c.software[s.goLiveMonth] + c.renewals[s.goLiveMonth] + c.pilot[s.goLiveMonth], 6);
  });

  it('no pilot, no pilot fees (and the same numbers as before)', () => {
    const e = { ...d, schedule: { ...d.schedule, withPilot: false } };
    const cx = computeCapex(e);
    expect(cx.pilotFees).toBeUndefined();
    expect(cx.communities[0].pilotFees).toBeUndefined();
    expect(cx.ownershipTotal).toBe(cx.equipment + cx.software + cx.renewals);
    const free = { ...d, commercial: { ...d.commercial, pilotRate: 0 } };
    expect(computeCapex(free).pilotFees).toBeUndefined();
  });

  it('match the pilot fee lines the proposal’s pilot section shows', async () => {
    const { buildPriceLines, lineTotal } = await import('./lines');
    const book = priceBook();
    const lines = buildPriceLines(d, toModelInputs(d), book).filter((l) => l.billing === 'monthly' && l.description.includes('— pilot'));
    expect(computeCapex(d).pilotFees).toBeCloseTo(lines.reduce((t, l) => t + lineTotal(l), 0), 6);
  });
});

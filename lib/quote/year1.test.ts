import { describe, expect, it } from 'vitest';
import { priceBook } from '@/lib/pricing/catalog';
import { computeOutputs } from './outputs';
import { defaultDraft, newCommunity } from './draft';
import { year1Figures } from './year1';

describe('Year 1 figures follow the pricing the proposal shows', () => {
  const d = defaultDraft('Triple Crown Senior Living', priceBook(), new Date('2026-11-17'));
  d.commercial.ecall = 'none';
  d.communities = [{ ...newCommunity(0), name: 'Forest Hills Commons', alBeds: 109, mcBeds: 20, additionalSensors: 82, pilot: true }];

  it('uses the subscription on an opex deal', () => {
    const { outputs } = computeOutputs({ ...d, presentation: 'opex' }, priceBook());
    const y = year1Figures({ ...d, presentation: 'opex' }, outputs);
    expect(y.capex).toBe(false);
    expect(y.investment).toBe(outputs.kpis.totalInvestment12);
  });

  it('uses the equipment purchase on a capex deal: the investment is the one-time equipment cost', () => {
    const cx = { ...d, presentation: 'capex' as const };
    const { outputs } = computeOutputs(cx, priceBook());
    const y = year1Figures(cx, outputs);
    expect(y.capex).toBe(true);
    expect(y.investment).toBe(626_430);
    expect(y.payback).toBeGreaterThan(outputs.kpis.discountedPaybackMonth!);
  });
});

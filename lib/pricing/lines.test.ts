import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { defaultDraft, newCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { priceBook } from './catalog';
import { buildPriceLines, lineTotal } from './lines';

const book = priceBook();

function draft(): QuoteDraft {
  const d = defaultDraft('Lines SL', book, new Date(Date.UTC(2026, 10, 12)));
  d.implementation.desiredGoLive = '2027-03-01';
  d.commercial.installCreditPct = 1;
  d.commercial.installClawback = true;
  d.commercial.specialRate = 89;
  d.commercial.specialTermMonths = 6;
  d.communities = [
    { ...newCommunity(0), name: 'Pilot', alBeds: 100, pilot: true, pilotUnits: 60, additionalSensors: 4 },
    { ...newCommunity(1), name: 'Full', alBeds: 80, coverage: 'full_facility', goLiveMonth: '2027-06' },
    { ...newCommunity(2), name: 'No e-call', alBeds: 50, ecall: false, goLiveMonth: '2027-06' },
  ];
  return d;
}

describe('price lines', () => {
  it('add up to exactly what the cash flow bills over pilot + 36-month term', () => {
    const d = draft();
    d.schedule.horizonMonths = 60; // long enough to include every site's full term
    const inputs = toModelInputs(d);
    const r = runModel(inputs);
    const lines = buildPriceLines(d, inputs, book);
    const oneTime = lines.filter((l) => l.billing === 'one_time').reduce((s, l) => s + lineTotal(l), 0);
    expect(oneTime).toBeCloseTo(r.cashFlow.communities.reduce((s, c) => s + c.installCost, 0), 6);
    r.cashFlow.communities.forEach((cc, i) => {
      const monthly = lines.filter((l) => l.communityPosition === i && l.billing === 'monthly').reduce((s, l) => s + lineTotal(l), 0);
      const billed = cc.fees.slice(cc.goLiveMonth - 1, cc.firstPostPilotMonth - 1 + 36).reduce((s, x) => s + x, 0);
      expect(monthly, `community ${i}`).toBeCloseTo(billed, 6);
    });
  });

  it('itemizes pilot, intro rate, e-call, install and the clawback credit', () => {
    const d = draft();
    const lines = buildPriceLines(d, toModelInputs(d), book).filter((l) => l.communityPosition === 0);
    expect(lines.map((l) => l.description)).toEqual([
      'Teton subscription — pilot',
      'E-Call — pilot',
      'Teton subscription — introductory rate',
      'Teton subscription',
      'E-Call (Bluetooth)',
      'Installation & implementation',
      'Install credit (100%) — repayable if the pilot does not convert',
      'Additional sensors',
    ]);
    const credit = lines.find((l) => l.concessionCode === 'INSTALL_CREDIT_CLAWBACK')!;
    expect(credit.qty).toBe(60);
    expect(credit.unitNet).toBe(-400);
    expect(lines.find((l) => l.description === 'E-Call — pilot')!.unitNet).toBe(0);
  });

  it('applies the full-facility multiplier to subscription and install', () => {
    const d = draft();
    const full = buildPriceLines(d, toModelInputs(d), book).filter((l) => l.communityPosition === 1);
    expect(full.find((l) => l.description.startsWith('Teton subscription,'))!.unitNet).toBeCloseTo(99 * 1.3, 10);
    expect(full.find((l) => l.description.startsWith('Installation'))!.unitNet).toBeCloseTo(520, 10);
  });
});

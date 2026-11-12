import { describe, expect, it } from 'vitest';
import { runModel } from '@/lib/model';
import { priceBook } from '@/lib/pricing/catalog';
import { defaultDraft, newCommunity, type QuoteDraft } from './draft';
import { monthIndex, toModelInputs } from './toModelInputs';

function draft(): QuoteDraft {
  const d = defaultDraft('Test SL', priceBook(), new Date(Date.UTC(2026, 10, 12)));
  d.implementation.desiredGoLive = '2027-03-15';
  d.communities = [
    { ...newCommunity(0), name: 'Pilot site', beds: 100, pilot: true },
    { ...newCommunity(1), name: 'Full facility', beds: 80, snfBeds: 20, coverage: 'full_facility', goLiveMonth: '2027-06' },
    { ...newCommunity(2), name: 'No e-call', beds: 50, ecall: false, goLiveMonth: '2027-06' },
  ];
  return d;
}

describe('toModelInputs', () => {
  it('cash flow starts the month of the desired go-live', () => {
    expect(toModelInputs(draft()).schedule.startDate).toBe('2027-03-01');
    expect(monthIndex('2027-03-01', '2027-06')).toBe(4);
    expect(monthIndex('2027-03-01', '2028-01')).toBe(11);
  });
  it('per-community rates: platform × coverage + e-call', () => {
    const m = toModelInputs(draft());
    const [pilot, full, noEcall] = m.communities.map((c) => c.rates!);
    expect(pilot).toMatchObject({ pilotFeePerBedMonth: 75, postPilotFeePerBedMonth: 109, pilotInstallPerBed: 400, postPilotInstallPerBed: 400 });
    expect(full.postPilotFeePerBedMonth).toBeCloseTo(99 * 1.3 + 10, 10);
    expect(full.postPilotInstallPerBed).toBeCloseTo(520, 10);
    expect(noEcall.postPilotFeePerBedMonth).toBe(99);
  });
  it('SNF beds count as units for price and ROI', () => {
    expect(toModelInputs(draft()).communities[1].units).toBe(100);
  });
  it('install credit applies to pilot communities only', () => {
    const d = draft();
    d.commercial.installCreditPct = 1;
    const m = toModelInputs(d);
    expect(m.communities[0].rates!.pilotInstallPerBed).toBe(0);
    expect(m.communities[2].rates!.postPilotInstallPerBed).toBe(400);
  });
  it('portfolio units default to the deal’s units; average revenue to rent + care', () => {
    const m = toModelInputs(draft());
    expect(m.cfo.portfolioUnits).toBe(250);
    expect(m.client.avgRevenuePerResident).toBe(6500);
  });
  it('uniform metrics mode derives staffing from night ratios', () => {
    const d = draft();
    d.customizeCaseMetrics = false;
    expect(toModelInputs(d).caseMetrics.stretch.staffingAlignment).toBeCloseTo(0.1, 12);
  });
  it('runs end to end: $75 pilot (e-call free) for 3 months, then $109 ($99 + $10 e-call)', () => {
    const r = runModel(toModelInputs(draft()));
    expect(r.cashFlow.communities[0].fees.slice(0, 4)).toEqual([7500, 7500, 7500, 10900]);
    expect(r.cashFlow.communities[2].fees[3]).toBe(4950);
    expect(r.cashFlow.months).toHaveLength(36);
  });
});

/**
 * QuoteDraft → engine ModelInputs. The only place commercial terms become
 * per-bed rates, so "what did we charge this community?" has one answer.
 */
import { addMonths, firstOfMonth } from '@/lib/model/excel';
import { uniformCaseMetrics, type CommunityRates, type ModelInputs } from '@/lib/model';
import type { DraftCommunity, QuoteDraft } from './draft';

/** Month index (1 = cash-flow start month) of a 'yyyy-mm' go-live. */
export function monthIndex(startDate: string, yyyymm: string): number {
  const [sy, sm] = startDate.split('-').map(Number);
  const [y, m] = yyyymm.split('-').map(Number);
  return (y - sy) * 12 + (m - sm) + 1;
}

/** Inverse of monthIndex, for display. */
export function monthLabel(startDate: string, index: number): string {
  return addMonths(firstOfMonth(startDate), index - 1).slice(0, 7);
}

export function communityRates(d: QuoteDraft, c: DraftCommunity): CommunityRates {
  const k = d.commercial;
  const mult = c.coverage === 'full_facility' ? k.fullFacilityMultiplier : 1;
  const ecall = d.commercial.ecall !== 'none' && c.ecall;
  return {
    pilotFeePerBedMonth: k.pilotRate * mult + (ecall ? k.ecallPilotRate : 0),
    postPilotFeePerBedMonth: k.platformRate * mult + (ecall ? k.ecallRate : 0),
    specialFeePerBedMonth: k.specialRate != null && k.specialTermMonths > 0 ? k.specialRate * mult + (ecall ? k.ecallRate : 0) : null,
    // Install credits apply to pilot communities (the workbook's pilot install discount).
    pilotInstallPerBed: k.installRate * mult * (1 - k.installCreditPct),
    postPilotInstallPerBed: k.installRate * mult,
  };
}

/**
 * Month 1 of the cash flow: the deal's desired go-live month, or an earlier
 * community go-live if one is set. (A community dated before the deal start
 * used to fall back to its default month without saying so.)
 */
export function cashFlowStart(d: QuoteDraft): string {
  const desired = firstOfMonth(d.implementation.desiredGoLive);
  const earliest = d.communities
    .map((c) => c.goLiveMonth)
    .filter((m): m is string => !!m && /^\d{4}-\d{2}$/.test(m))
    .map((m) => `${m}-01`)
    .sort()[0];
  return earliest && earliest < desired ? earliest : desired;
}

export const communityUnits = (c: DraftCommunity) => (Number(c.beds) || 0) + (Number(c.snfBeds) || 0);

export function toModelInputs(d: QuoteDraft): ModelInputs {
  const startDate = cashFlowStart(d);
  const { avgRevenuePerResidentOverride, ...client } = d.client;
  const fullClient = { ...client, avgRevenuePerResident: avgRevenuePerResidentOverride ?? client.avgRent + client.careRevenuePerResident };
  const units = d.communities.reduce((s, c) => s + communityUnits(c), 0);

  return {
    roiCase: d.roiCase,
    components: d.components,
    caseMetrics: d.customizeCaseMetrics ? d.caseMetrics : uniformCaseMetrics(fullClient, d.caseMetrics),
    valuation: d.valuation,
    monthsUntilCocNoticed: d.monthsUntilCocNoticed,
    client: fullClient,
    cfo: {
      annualDiscountRate: d.cfo.annualDiscountRate,
      portfolioUnits: d.cfo.portfolioUnitsOverride ?? units,
      reimbursementPerOccupiedUnitMonth: d.cfo.reimbursementPerOccupiedUnitMonth,
    },
    pricing: {
      // Deal-wide rates for a rooms-only community with the deal's e-call; every community also carries its own.
      ...(() => {
        const r = communityRates(d, { coverage: 'rooms_only', ecall: true } as DraftCommunity);
        return {
          pilotFeePerBedMonth: r.pilotFeePerBedMonth,
          postPilotFeePerBedMonth: r.postPilotFeePerBedMonth,
          specialFeePerBedMonth: r.specialFeePerBedMonth,
          pilotInstallPerBed: r.pilotInstallPerBed,
          postPilotInstallPerBed: r.postPilotInstallPerBed,
        };
      })(),
      pilotSensorPrice: d.commercial.sensorPrice,
      postPilotSensorPrice: d.commercial.sensorPrice,
      specialTermMonths: d.commercial.specialRate != null ? d.commercial.specialTermMonths : 0,
    },
    schedule: { ...d.schedule, startDate },
    implementation: d.implementation,
    communities: d.communities.map((c) => ({
      name: c.name || 'Unnamed community',
      market: c.market,
      units: communityUnits(c),
      pilot: c.pilot,
      pilotUnits: c.pilot ? c.pilotUnits : null,
      occupancy: c.occupancy,
      goLiveMonth: c.goLiveMonth ? monthIndex(startDate, c.goLiveMonth) : null,
      roiDelayMonths: c.roiDelayMonths,
      additionalSensors: Number(c.additionalSensors) || 0,
      rates: communityRates(d, c),
    })),
  };
}

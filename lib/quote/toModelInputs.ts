/**
 * QuoteDraft → engine ModelInputs. The only place commercial terms become
 * per-bed rates, so "what did we charge this community?" has one answer.
 */
import { addMonths, firstOfMonth } from '@/lib/model/excel';
import { uniformCaseMetrics, type CommunityExtra, type CommunityRates, type ModelInputs } from '@/lib/model';
import { scopeOf, type BedProducts, type DraftCommunity, type QuoteDraft } from './draft';

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

/**
 * Per-bed rates for a community's beds with the given products (default: the products all its priced beds
 * share; where they differ by care type, these are the monitored beds' rates without E-Call, and
 * communityExtras() bills the E-Call).
 */
export function communityRates(d: QuoteDraft, c: DraftCommunity, products?: BedProducts): CommunityRates {
  const k = d.commercial;
  const mult = c.coverage === 'full_facility' ? k.fullFacilityMultiplier : 1;
  const p = products ?? scopeOf(c, k.ecall !== 'none').uniform ?? { monitoring: true, ecall: false };
  const ecall = d.commercial.ecall !== 'none' && p.ecall;
  // E-Call only (no resident monitoring): the E-Call fees, and its own installation price.
  if (!p.monitoring) {
    const install = Number(k.ecallInstallRate) || 0;
    return {
      pilotFeePerBedMonth: ecall ? k.ecallPilotRate : 0,
      postPilotFeePerBedMonth: ecall ? k.ecallRate : 0,
      specialFeePerBedMonth: null,
      pilotInstallPerBed: install * (1 - k.installCreditPct),
      postPilotInstallPerBed: install,
    };
  }
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

/** The beds the engine bills as a community's units: every priced bed, or only the monitored ones where products differ by care type. */
export function communityUnits(c: DraftCommunity, ecallOn = true): number {
  const s = scopeOf(c, ecallOn);
  return s.uniform ? s.priced : s.monitored;
}

/**
 * Where products differ by care type: E-Call billed on top of the monitored beds — the E-Call fee on every
 * E-Call bed, and the E-Call installation on beds with E-Call only. None otherwise.
 */
export function communityExtras(d: QuoteDraft, c: DraftCommunity): CommunityExtra[] {
  const k = d.commercial;
  const s = scopeOf(c, k.ecall !== 'none');
  if (s.uniform) return [];
  const install = Number(k.ecallInstallRate) || 0;
  const out: CommunityExtra[] = [];
  if (s.ecall > 0) out.push({ units: s.ecall, rates: { pilotFeePerBedMonth: k.ecallPilotRate, postPilotFeePerBedMonth: k.ecallRate, specialFeePerBedMonth: null, pilotInstallPerBed: 0, postPilotInstallPerBed: 0 } });
  if (s.ecallOnly > 0) out.push({ units: s.ecallOnly, rates: { pilotFeePerBedMonth: 0, postPilotFeePerBedMonth: 0, specialFeePerBedMonth: null, pilotInstallPerBed: install * (1 - k.installCreditPct), postPilotInstallPerBed: install } });
  return out;
}

/** Whether a community bills as monitored (all its monitored beds, where products differ by care type). */
const billsMonitoring = (d: QuoteDraft, c: DraftCommunity) => (scopeOf(c, d.commercial.ecall !== 'none').uniform?.monitoring ?? true);

export function toModelInputs(d: QuoteDraft): ModelInputs {
  const startDate = cashFlowStart(d);
  const { avgRevenuePerResidentOverride, ...client } = d.client;
  const fullClient = { ...client, avgRevenuePerResident: avgRevenuePerResidentOverride ?? client.avgRent + client.careRevenuePerResident };
  const ecallOn = d.commercial.ecall !== 'none';
  const units = d.communities.reduce((s, c) => s + communityUnits(c, ecallOn), 0);

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
        const r = communityRates(d, { coverage: 'rooms_only', ecall: true } as DraftCommunity, { monitoring: true, ecall: true });
        return {
          pilotFeePerBedMonth: r.pilotFeePerBedMonth,
          postPilotFeePerBedMonth: r.postPilotFeePerBedMonth,
          specialFeePerBedMonth: r.specialFeePerBedMonth,
          pilotInstallPerBed: r.pilotInstallPerBed,
          postPilotInstallPerBed: r.postPilotInstallPerBed,
        };
      })(),
      // With the sensor credit, pilot sites' additional sensors carry the install credit too (they keep it after converting).
      pilotSensorPrice: d.commercial.sensorPrice * (d.commercial.sensorCredit ? 1 - d.commercial.installCreditPct : 1),
      postPilotSensorPrice: d.commercial.sensorPrice,
      specialTermMonths: d.commercial.specialRate != null ? d.commercial.specialTermMonths : 0,
    },
    schedule: { ...d.schedule, startDate },
    implementation: d.implementation,
    communities: d.communities.map((c) => ({
      name: c.name || 'Unnamed community',
      market: c.market,
      units: communityUnits(c, ecallOn),
      pilot: c.pilot,
      pilotUnits: c.pilot ? c.pilotUnits : null,
      occupancy: c.occupancy,
      goLiveMonth: c.goLiveMonth ? monthIndex(startDate, c.goLiveMonth) : null,
      roiDelayMonths: c.roiDelayMonths,
      additionalSensors: billsMonitoring(d, c) ? Number(c.additionalSensors) || 0 : 0,
      monitoring: billsMonitoring(d, c),
      rates: communityRates(d, c),
      ...(() => {
        const extras = communityExtras(d, c);
        return extras.length ? { extras } : {};
      })(),
    })),
  };
}

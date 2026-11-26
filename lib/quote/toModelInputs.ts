/**
 * QuoteDraft → engine ModelInputs. The only place commercial terms become
 * per-bed rates, so "what did we charge this community?" has one answer.
 */
import { addMonths, firstOfMonth } from '@/lib/model/excel';
import { uniformCaseMetrics, type CommunityExtra, type CommunityRates, type ModelInputs } from '@/lib/model';
import { extraDevicePrice, scopeOf, type BedProducts, type DraftCommunity, type QuoteDraft } from './draft';
import { ecallBilled, pendantScope } from './roomTypes';

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
 * share). E-Call is not in them: it is billed per device (communityExtras).
 */
export function communityRates(d: QuoteDraft, c: DraftCommunity, products?: BedProducts): CommunityRates {
  const k = d.commercial;
  const mult = c.coverage === 'full_facility' ? k.fullFacilityMultiplier : 1;
  const p = products ?? scopeOf(c, k.ecall !== 'none').uniform ?? { monitoring: true, ecall: false };
  // E-Call only (no resident monitoring): no per-bed fees (E-Call is billed per device), and its own installation price.
  if (!p.monitoring) {
    const install = Number(k.ecallInstallRate) || 0;
    return {
      pilotFeePerBedMonth: 0,
      postPilotFeePerBedMonth: 0,
      specialFeePerBedMonth: null,
      pilotInstallPerBed: install * (1 - k.installCreditPct),
      postPilotInstallPerBed: install,
    };
  }
  return {
    pilotFeePerBedMonth: k.pilotRate * mult,
    postPilotFeePerBedMonth: k.platformRate * mult,
    specialFeePerBedMonth: k.specialRate != null && k.specialTermMonths > 0 ? k.specialRate * mult : null,
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
 * E-Call bed, and the E-Call installation on beds with E-Call only. Plus, for any community, its common areas'
 * E-Call fee (per area, per month).
 */
export function communityExtras(d: QuoteDraft, c: DraftCommunity): CommunityExtra[] {
  const k = d.commercial;
  const s = scopeOf(c, k.ecall !== 'none');
  const out: CommunityExtra[] = [];
  // E-Call monthly: per room (rooms with E-Call + common areas with devices) or per device (before the contingency).
  // Per room, devices beyond the rooms are one-time extras (the pilot install credit applies at pilot sites).
  const billed = ecallBilled(pendantScope(c, k.ecall !== 'none'), k.ecallBilling);
  if (billed.monthly > 0) out.push({ units: billed.monthly, rates: { pilotFeePerBedMonth: k.ecallPilotRate, postPilotFeePerBedMonth: k.ecallRate, specialFeePerBedMonth: null, pilotInstallPerBed: 0, postPilotInstallPerBed: 0 } });
  if (billed.extra > 0) {
    const each = extraDevicePrice(k);
    out.push({ units: billed.extra, rates: { pilotFeePerBedMonth: 0, postPilotFeePerBedMonth: 0, specialFeePerBedMonth: null, pilotInstallPerBed: each * (1 - k.installCreditPct), postPilotInstallPerBed: each } });
  }
  out.push(...pricingAdjustments(d, c).map((a) => ({ units: a.units, rates: a.rates })));
  if (s.uniform) return out;
  const install = Number(k.ecallInstallRate) || 0;
  if (s.ecallOnly > 0) out.push({ units: s.ecallOnly, rates: { pilotFeePerBedMonth: 0, postPilotFeePerBedMonth: 0, specialFeePerBedMonth: null, pilotInstallPerBed: install * (1 - k.installCreditPct), postPilotInstallPerBed: install } });
  return out;
}

/** A per-bed adjustment billed alongside a community's beds (the price lines show the same figures). */
export interface PricingAdjustment {
  kind: 'snf' | 'bundle' | 'commonArea';
  units: number;
  /** SNF: the beds in the pilot (of `units`); the pilot fee below already spreads them over every SNF bed. */
  pilotBeds?: number;
  rates: CommunityRates;
}

/**
 * Prices that differ from the community's per-bed rates, billed as adjustments so the per-bed rates stay as they are:
 *  - skilled nursing beds at their own rate (never above the platform rate; older deals without one: none),
 *  - the Teton One + E-Call bundle discount on beds with both (older deals: none; none during the pilot unless E-Call is billed then),
 *  - common-area sensors: a setup fee each (with the pilot install credit at pilot sites) and a monthly fee each after the pilot.
 */
export function pricingAdjustments(d: QuoteDraft, c: DraftCommunity): PricingAdjustment[] {
  const k = d.commercial;
  const ecallOn = k.ecall !== 'none';
  const s = scopeOf(c, ecallOn);
  const monitored = s.uniform ? s.uniform.monitoring : s.monitored > 0;
  if (!monitored) return [];
  const mult = c.coverage === 'full_facility' ? k.fullFacilityMultiplier : 1;
  const out: PricingAdjustment[] = [];
  const units = communityUnits(c, ecallOn);
  const inPilot = d.schedule.withPilot && c.pilot;
  const pilotUnits = inPilot ? ((c.pilotUnits ?? 0) > 0 ? Math.min(c.pilotUnits as number, units) : units) : 0;
  const zero = { pilotFeePerBedMonth: 0, postPilotFeePerBedMonth: 0, specialFeePerBedMonth: null, pilotInstallPerBed: 0, postPilotInstallPerBed: 0 };

  const snf = s.monitoredByCare.snf;
  if (k.snfRate != null && snf > 0) {
    const r = Math.max(0, k.snfRate);
    const delta = (rate: number) => (Math.min(r, rate) - rate) * mult;
    // Pilot sites: the pilot's share of the SNF beds (rounded), as if pilot beds were spread evenly over the care types.
    const pilotBeds = inPilot ? (pilotUnits >= units ? snf : Math.round((snf * pilotUnits) / Math.max(1, units))) : 0;
    const special = k.specialRate != null && k.specialTermMonths > 0 ? delta(k.specialRate) : null;
    if (delta(k.platformRate) !== 0 || (pilotBeds > 0 && delta(k.pilotRate) !== 0) || (special ?? 0) !== 0) {
      out.push({ kind: 'snf', units: snf, pilotBeds, rates: { ...zero, pilotFeePerBedMonth: pilotBeds > 0 ? (delta(k.pilotRate) * pilotBeds) / snf : 0, postPilotFeePerBedMonth: delta(k.platformRate), specialFeePerBedMonth: special } });
    }
  }

  const disc = ecallOn ? Math.max(0, Number(k.bundleDiscount?.[k.ecall === 'inovonics' ? 'inovonics' : 'ble']) || 0) : 0;
  const both = s.monitoredEcall;
  if (disc > 0 && both > 0) {
    const off = Math.min(disc, Math.max(0, k.ecallRate));
    const offPilot = Math.min(disc, Math.max(0, k.ecallPilotRate));
    if (off > 0 || offPilot > 0) out.push({ kind: 'bundle', units: both, rates: { ...zero, pilotFeePerBedMonth: -offPilot, postPilotFeePerBedMonth: -off } });
  }

  const ca = Math.max(0, Math.round(Number(c.commonAreaSensors) || 0));
  if (ca > 0 && c.coverage !== 'full_facility') {
    const setup = Math.max(0, Number(k.commonArea?.setup) || 0);
    const monthly = Math.max(0, Number(k.commonArea?.monthly) || 0);
    out.push({ kind: 'commonArea', units: ca, rates: { ...zero, postPilotFeePerBedMonth: monthly, pilotInstallPerBed: setup * (1 - k.installCreditPct), postPilotInstallPerBed: setup } });
  }
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
    schedule: { ...d.schedule, startDate, oneTimeAtPilotEnd: true },
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

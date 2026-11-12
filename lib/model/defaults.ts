/**
 * Default assumptions for a new deal. Values come from the workbook's
 * Assumptions tab and the US rate card; every one can be overridden per deal.
 */
import type { CaseMetrics, ClientAssumptions, ModelInputs, RoiCase } from './types';

/**
 * Per-case performance metrics. Move-in / staffing / tech are the "Teton
 * improvement metrics" (Assumptions E14:G17); fall reduction and LOC-gap
 * identification were hardcoded on the Teton ROI tab (row 17).
 */
export const STANDARD_CASE_METRICS: Record<RoiCase, CaseMetrics> = {
  stretch: { fallReduction: 0.75, locGapIdentifiedPerMonth: 0.15, moveInUplift: 0.15, staffingAlignment: 0.12, techReplacement: 1.0 },
  target: { fallReduction: 0.7, locGapIdentifiedPerMonth: 0.1, moveInUplift: 0.1, staffingAlignment: 0.1, techReplacement: 0.95 },
  base: { fallReduction: 0.42, locGapIdentifiedPerMonth: 0.075, moveInUplift: 0.07, staffingAlignment: 0.08, techReplacement: 0.9 },
  underperforming: { fallReduction: 0.34, locGapIdentifiedPerMonth: 0.05, moveInUplift: 0.03, staffingAlignment: 0, techReplacement: 0 },
};

/**
 * The workbook's "Customize Case Metrics? = NO" mode: one move-in uplift and
 * tech replacement for every case, and staffing alignment derived from the
 * night staffing ratios (Assumptions E13:G13).
 */
export function uniformCaseMetrics(client: ClientAssumptions, base = STANDARD_CASE_METRICS): Record<RoiCase, CaseMetrics> {
  const staffing = 1 - client.nightResidentToStaffRatio / client.newNightResidentToStaffRatio;
  const out = {} as Record<RoiCase, CaseMetrics>;
  for (const k of Object.keys(base) as RoiCase[]) {
    out[k] = { ...base[k], moveInUplift: 0.1, staffingAlignment: staffing, techReplacement: 1 };
  }
  return out;
}

export const DEFAULT_CLIENT: ClientAssumptions = {
  occupancy: 0.9,
  avgRent: 5000,
  careRevenuePerResident: 1500,
  locGapUpliftPerTierStep: 600,
  moveInRatePerMonth: 0.035,
  yr1RevenueMonthsPerMoveIn: 6,
  avgRevenuePerResident: 6500,
  fallsPerResidentYear: 1,
  pctFallsHospitalization: 0.08,
  costPerHospitalization: 4200,
  pctFallsDischarge: 0.08,
  losIncreaseMonths: 3,
  nightResidentToStaffRatio: 9,
  nightShiftHours: 12,
  nightHourlyWage: 22,
  newNightResidentToStaffRatio: 10,
  supportiveTechSpendPerResident: 600,
};

/** A blank deal: defaults everywhere, no communities yet. */
export function defaultInputs(startDate: string): ModelInputs {
  return {
    roiCase: 'target',
    components: {
      careRevenueRecapture: true,
      fallsHospitalization: true,
      fallsDischarge: true,
      staffingAlignment: true,
      moveInImpact: true,
      techReplacement: true,
    },
    caseMetrics: structuredClone(STANDARD_CASE_METRICS),
    valuation: { capRate: 0.09, operatingMargin: 0.35 },
    monthsUntilCocNoticed: 6,
    client: { ...DEFAULT_CLIENT },
    cfo: { annualDiscountRate: 0.08, portfolioUnits: 0, reimbursementPerOccupiedUnitMonth: 86 },
    pricing: {
      pilotFeePerBedMonth: 75,
      postPilotFeePerBedMonth: 99,
      pilotInstallPerBed: 400,
      postPilotInstallPerBed: 400,
      pilotSensorPrice: 300,
      postPilotSensorPrice: 300,
      specialFeePerBedMonth: null,
      specialTermMonths: 0,
    },
    schedule: {
      withPilot: true,
      pilotLengthMonths: 3,
      roiStartDelayMonths: 3,
      rampMonths: 3,
      startDate,
      horizonMonths: 36,
      includeReimbursement: false,
    },
    implementation: { desiredGoLive: startDate, communicationWeeks: 3, installationWeeks: 1, baselineWeeks: 4, onboardingDays: 3 },
    communities: [],
  };
}

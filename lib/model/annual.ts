/**
 * Annual (steady-state) ROI by community and by case.
 *
 * Mirrors three workbook tabs:
 *   - ROI Calculations: the per-community drivers (falls, LOC gaps, move-ins…)
 *   - Teton ROI: the eight benefit components and their totals
 *   - BREAKEVEN TABLE: return on cost and breakeven months by case
 *
 * Rounding happens exactly where the workbook rounds: occupied units, residents
 * realigned, costly falls prevented, and hospitalizations used for fall cost.
 */
import { excelRound } from './excel';
import type { Community, ModelInputs, RoiCase } from './types';
import { ROI_CASES } from './types';

export interface CommunityDrivers {
  totalFalls: number;
  fallsAvoided: number;
  fallsToHospitalization: number;
  fallsToDischarge: number;
  locGapsIdentifiedPerMonth: number;
  residentsRealigned: number;
  nightShiftCostBase: number;
  availableBeds: number;
  baseMoveInsPerMonth: number;
  incrementalMoveInsUncapped: number;
  incrementalMoveIns: number;
}

export interface CommunityAnnualRoi {
  residentsRealigned: number;
  costlyFallsPrevented: number;
  fallCostAvoidance: number;
  recapturedCareRevenue: number;
  revenueFromLosIncrease: number;
  nightShiftSavings: number;
  moveInImpact: number;
  techReplacement: number;
  /** Monthly total of the six dollar components. Teton ROI "Total Rev/M". */
  totalRevenuePerMonth: number;
  annualRoi: number;
}

export interface AnnualTotals extends CommunityAnnualRoi {
  /** Install (all units at post-pilot install price) + one year of post-pilot recurring fees. Breakeven C9. */
  totalCostBasis: number;
  /** One year of post-pilot recurring fees for every unit. Assumptions R20 + R21. */
  annualRecurringCost: number;
  returnOnCost: number;
  breakevenMonths: number;
  /** (Annual ROI − annual recurring cost) ÷ occupied units. */
  netRevpor: number;
  annualNetNoiImpact: number;
  valuationImpact: number;
}

export interface AnnualCaseResult {
  drivers: CommunityDrivers[];
  communities: CommunityAnnualRoi[];
  totals: AnnualTotals;
}

/** Occupied units, rounded per community as the workbook does (Teton ROI col H). */
export function occupiedUnits(inputs: ModelInputs, c: Community): number {
  const occ = c.occupancy ?? inputs.client.occupancy;
  return excelRound(c.units * occ, 0);
}

export function communityDrivers(inputs: ModelInputs, c: Community, roiCase: RoiCase): CommunityDrivers {
  const { client } = inputs;
  const m = inputs.caseMetrics[roiCase];
  const occ = occupiedUnits(inputs, c);
  const totalFalls = occ * client.fallsPerResidentYear;
  const fallsAvoided = totalFalls * m.fallReduction;
  const locGapsIdentifiedPerMonth = occ * m.locGapIdentifiedPerMonth;
  const availableBeds = c.units - occ;
  const baseMoveInsPerMonth = occ * client.moveInRatePerMonth;
  const incrementalMoveInsUncapped = baseMoveInsPerMonth * m.moveInUplift * 12;
  return {
    totalFalls,
    fallsAvoided,
    fallsToHospitalization: fallsAvoided * client.pctFallsHospitalization,
    fallsToDischarge: fallsAvoided * client.pctFallsDischarge,
    locGapsIdentifiedPerMonth,
    residentsRealigned: excelRound(locGapsIdentifiedPerMonth * inputs.monthsUntilCocNoticed, 0),
    // Staffing cost is sized on total units, not occupied units (ROI Calculations col L).
    nightShiftCostBase: (c.units / client.nightResidentToStaffRatio) * client.nightHourlyWage * client.nightShiftHours * 365,
    availableBeds,
    baseMoveInsPerMonth,
    incrementalMoveInsUncapped,
    incrementalMoveIns: Math.min(incrementalMoveInsUncapped, availableBeds),
  };
}

export function communityAnnualRoi(inputs: ModelInputs, c: Community, roiCase: RoiCase, d: CommunityDrivers): CommunityAnnualRoi {
  const { client, components: on } = inputs;
  const m = inputs.caseMetrics[roiCase];
  const occ = occupiedUnits(inputs, c);

  const residentsRealigned = on.careRevenueRecapture ? d.residentsRealigned : 0;
  const costlyFallsPrevented = excelRound(
    (on.fallsHospitalization ? d.fallsToHospitalization : 0) + (on.fallsDischarge ? d.fallsToDischarge : 0),
    0,
  );
  const fallCostAvoidance = on.fallsHospitalization ? excelRound(d.fallsToHospitalization, 0) * client.costPerHospitalization : 0;
  const recapturedCareRevenue = on.careRevenueRecapture ? residentsRealigned * client.locGapUpliftPerTierStep * 12 : 0;
  const revenueFromLosIncrease = on.fallsDischarge ? d.fallsToDischarge * client.losIncreaseMonths * client.avgRent : 0;
  const nightShiftSavings = on.staffingAlignment ? d.nightShiftCostBase * m.staffingAlignment : 0;
  const moveInImpact = on.moveInImpact ? d.incrementalMoveIns * client.avgRevenuePerResident * client.yr1RevenueMonthsPerMoveIn : 0;
  const techReplacement = on.techReplacement ? occ * client.supportiveTechSpendPerResident * m.techReplacement : 0;

  // Summed as monthly figures then ×12, matching Teton ROI cols R and S.
  const totalRevenuePerMonth =
    recapturedCareRevenue / 12 +
    fallCostAvoidance / 12 +
    revenueFromLosIncrease / 12 +
    nightShiftSavings / 12 +
    moveInImpact / 12 +
    techReplacement / 12;

  return {
    residentsRealigned,
    costlyFallsPrevented,
    fallCostAvoidance,
    recapturedCareRevenue,
    revenueFromLosIncrease,
    nightShiftSavings,
    moveInImpact,
    techReplacement,
    totalRevenuePerMonth,
    annualRoi: totalRevenuePerMonth * 12,
  };
}

const SUM_KEYS = [
  'residentsRealigned',
  'costlyFallsPrevented',
  'fallCostAvoidance',
  'recapturedCareRevenue',
  'revenueFromLosIncrease',
  'nightShiftSavings',
  'moveInImpact',
  'techReplacement',
  'totalRevenuePerMonth',
  'annualRoi',
] as const;

export function totalUnits(inputs: ModelInputs): number {
  return inputs.communities.reduce((s, c) => s + c.units, 0);
}

export function totalOccupiedUnits(inputs: ModelInputs): number {
  return inputs.communities.reduce((s, c) => s + occupiedUnits(inputs, c), 0);
}

export function annualForCase(inputs: ModelInputs, roiCase: RoiCase): AnnualCaseResult {
  const drivers = inputs.communities.map((c) => communityDrivers(inputs, c, roiCase));
  const communities = inputs.communities.map((c, i) => communityAnnualRoi(inputs, c, roiCase, drivers[i]));

  const sums = Object.fromEntries(SUM_KEYS.map((k) => [k, communities.reduce((s, r) => s + r[k], 0)])) as Record<
    (typeof SUM_KEYS)[number],
    number
  >;

  const units = totalUnits(inputs);
  const occ = totalOccupiedUnits(inputs);
  const { pricing, valuation } = inputs;
  // Assumptions R19 (install) + R20:R21 (platform + add-ons × 12) — every unit at post-pilot prices.
  const installCost = pricing.postPilotInstallPerBed * units;
  const annualRecurringCost = pricing.postPilotFeePerBedMonth * units * 12;
  const totalCostBasis = installCost + annualRecurringCost;

  const annualNetNoiImpact =
    (sums.recapturedCareRevenue + sums.revenueFromLosIncrease + sums.moveInImpact) * valuation.operatingMargin +
    sums.fallCostAvoidance +
    sums.nightShiftSavings -
    annualRecurringCost;

  return {
    drivers,
    communities,
    totals: {
      ...sums,
      totalCostBasis,
      annualRecurringCost,
      returnOnCost: totalCostBasis === 0 ? 0 : sums.annualRoi / totalCostBasis,
      breakevenMonths: sums.annualRoi === 0 ? 0 : totalCostBasis / (sums.annualRoi / 12),
      netRevpor: occ === 0 ? 0 : (sums.annualRoi - annualRecurringCost) / occ,
      annualNetNoiImpact,
      valuationImpact: valuation.capRate === 0 ? 0 : annualNetNoiImpact / valuation.capRate,
    },
  };
}

export function annualAllCases(inputs: ModelInputs): Record<RoiCase, AnnualCaseResult> {
  return Object.fromEntries(ROI_CASES.map((rc) => [rc, annualForCase(inputs, rc)])) as Record<RoiCase, AnnualCaseResult>;
}

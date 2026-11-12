/**
 * The KPI cards (workbook "KPI Card Guide"). Labels are kept verbatim — they
 * were written for a CFO audience.
 *
 * "— 12 Mo" cards always cover months 1–12. Discounted payback, run-rate and
 * per-unit figures use the full horizon (the workbook's horizon is 12 months,
 * the CPQ's is 36), so the "final month" is the last month of the horizon.
 */
import { stayPaidMonth, type CashFlow } from './cashflow';
import type { AnnualCaseResult } from './annual';
import type { ModelInputs } from './types';

export interface Kpis {
  /** Total Investment — 12 Mo: install + subscription (net of reimbursement) in months 1–12. */
  totalInvestment12: number;
  /** Net Benefit — 12 Mo: gross benefit − total investment. */
  netBenefit12: number;
  /** Gross Return per $1 Invested (months 1–12). */
  grossReturnPerDollar12: number;
  /** Net return multiple: (gross − cost) ÷ cost. */
  netReturnMultiple12: number;
  /** Discounted Payback: first month the discounted running total stays above zero. null = not within horizon. */
  discountedPaybackMonth: number | null;
  undiscountedPaybackMonth: number | null;
  firstBillingMonth: number | null;
  /** Run-Rate Annual Net Benefit: final month's net × 12. */
  runRateAnnualNetBenefit: number;
  /** Net Benefit per Unit per Month — per occupied unit. */
  netBenefitPerOccupiedUnitMonth: number;
  /** Net Benefit per Unit per Month — per total portfolio unit. */
  netBenefitPerUnitMonth: number;
  stabilizedNetPerOccupiedUnitMonth: number;
  stabilizedNetPerUnitMonth: number;
  stabilizedGrossReturn: number;
  totalOccupiedUnits: number;
  kpiWindowMonths: number;
  horizonMonths: number;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function computeKpis(inputs: ModelInputs, annual: AnnualCaseResult, cf: CashFlow, totalOccupiedUnits: number): Kpis {
  const horizon = cf.months.length;
  const w = Math.min(12, horizon);
  const cost12 = sum(cf.totalCost.slice(0, w));
  const gross12 = sum(cf.grossBenefit.slice(0, w));
  const finalNet = cf.netBenefit[horizon - 1] ?? 0;
  const firstBill = cf.recurringFees.findIndex((f) => f > 0);

  const units = inputs.communities.reduce((s, c) => s + c.units, 0);
  const fullMonthlyRoi = annual.totals.annualRoi / 12;
  const monthlyReimb = cf.communities.reduce((s, c) => s + c.monthlyReimbursement, 0);
  const monthlyFees = inputs.communities.every((c) => !c.rates)
    ? units * inputs.pricing.postPilotFeePerBedMonth
    : cf.communities.reduce((s, c, i) => s + inputs.communities[i].units * c.rates.postPilotFeePerBedMonth, 0);
  const stabilizedNet = fullMonthlyRoi + monthlyReimb - monthlyFees;
  const stabilizedCost = monthlyFees - monthlyReimb;
  const portfolioUnits = inputs.cfo.portfolioUnits;

  return {
    totalInvestment12: cost12,
    netBenefit12: gross12 - cost12,
    grossReturnPerDollar12: cost12 === 0 ? 0 : gross12 / cost12,
    netReturnMultiple12: cost12 === 0 ? 0 : (gross12 - cost12) / cost12,
    discountedPaybackMonth: stayPaidMonth(cf.cumulativeDiscountedNet),
    undiscountedPaybackMonth: stayPaidMonth(cf.cumulativeNet),
    firstBillingMonth: firstBill === -1 ? null : firstBill + 1,
    runRateAnnualNetBenefit: finalNet * 12,
    netBenefitPerOccupiedUnitMonth: totalOccupiedUnits === 0 ? 0 : finalNet / totalOccupiedUnits,
    netBenefitPerUnitMonth: portfolioUnits === 0 ? 0 : finalNet / portfolioUnits,
    stabilizedNetPerOccupiedUnitMonth: totalOccupiedUnits === 0 ? 0 : stabilizedNet / totalOccupiedUnits,
    stabilizedNetPerUnitMonth: portfolioUnits === 0 ? 0 : stabilizedNet / portfolioUnits,
    stabilizedGrossReturn: stabilizedCost === 0 ? 0 : fullMonthlyRoi / stabilizedCost,
    totalOccupiedUnits,
    kpiWindowMonths: w,
    horizonMonths: horizon,
  };
}

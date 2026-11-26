/**
 * The Year 1 headline figures a deal shows: from the equipment purchase when
 * the proposal shows it (presentation isn't subscription-only), otherwise from
 * the subscription. Shared so the results page, version comparison and both
 * proposal formats agree.
 */
import type { StoredOutputs } from '@/lib/data/quotes';
import { capexCashFlow } from '@/lib/pricing/capexCashFlow';
import type { QuoteDraft } from './draft';
import { capexFor } from './outputs';
import { toModelInputs } from './toModelInputs';

export interface Year1Figures {
  capex: boolean;
  investment: number;
  net: number;
  gross: number;
  payback: number | null;
  runRate: number;
  /** Run-rate net benefit per month, per occupied unit and per portfolio unit. */
  perOccupiedUnitMonth: number;
  perUnitMonth: number;
  horizon: number;
}

export function year1Figures(draft: QuoteDraft, outputs: Omit<StoredOutputs, 'capex'> & { capex?: StoredOutputs['capex'] }): Year1Figures {
  const kp = outputs.kpis;
  if (draft.presentation === 'opex') {
    return { capex: false, investment: kp.totalInvestment12, net: kp.netBenefit12, gross: kp.grossReturnPerDollar12, payback: kp.discountedPaybackMonth, runRate: kp.runRateAnnualNetBenefit, perOccupiedUnitMonth: kp.netBenefitPerOccupiedUnitMonth, perUnitMonth: kp.netBenefitPerUnitMonth, horizon: kp.horizonMonths };
  }
  const capex = capexFor(outputs as StoredOutputs, draft);
  const c = capexCashFlow(outputs.cashFlow, capex);
  const annualCost = capex.ownershipMonths > 0 ? capex.ownershipTotal / (capex.ownershipMonths / 12) : 0;
  const runRate = outputs.annual[outputs.roiCase].totals.annualRoi - annualCost;
  const portfolioUnits = toModelInputs(draft).cfo.portfolioUnits;
  return {
    capex: true,
    investment: c.investment12,
    net: c.net12,
    gross: c.grossReturn12,
    payback: c.discountedPaybackMonth,
    runRate,
    perOccupiedUnitMonth: kp.totalOccupiedUnits ? runRate / 12 / kp.totalOccupiedUnits : 0,
    perUnitMonth: portfolioUnits ? runRate / 12 / portfolioUnits : 0,
    horizon: kp.horizonMonths,
  };
}

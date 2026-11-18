/**
 * The cash flow of an equipment purchase (CapEx), month by month, from the
 * same benefits as the subscription cash flow:
 *
 *   equipment   paid when each community installs (its go-live month)
 *   software    beds × software rate, every month from the first post-pilot month
 *   renewals    E-Call renewals, each time a term ends inside the window
 *
 * No subscription fees, no installation charge, and no reimbursement offset
 * (the annual cost of Teton on an equipment purchase is the cost of
 * ownership ÷ its years, as on the returns page).
 */
import { running, stayPaidMonth, type CashFlow } from '@/lib/model/cashflow';
import { derived, input, type Trace } from '@/lib/model/trace';
import { POLICY } from './catalog';
import type { CapexResult } from './capex';

export interface CapexCashFlow {
  equipment: number[];
  software: number[];
  renewals: number[];
  totalCost: number[];
  grossBenefit: number[];
  netBenefit: number[];
  cumulativeNet: number[];
  discountedNet: number[];
  cumulativeDiscountedNet: number[];
  /** Equipment paid in months 1–12 (the Year 1 investment). */
  equipment12: number;
  /** Software and renewals paid in months 1–12. */
  running12: number;
  gross12: number;
  /** Gross benefit − everything paid in months 1–12. */
  net12: number;
  /** Gross benefit per $1 paid in months 1–12. */
  grossReturn12: number;
  discountedPaybackMonth: number | null;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function capexCashFlow(cf: CashFlow, capex: Pick<CapexResult, 'communities' | 'pricing'>): CapexCashFlow {
  const n = cf.months.length;
  const equipment = new Array(n).fill(0);
  const software = new Array(n).fill(0);
  const renewals = new Array(n).fill(0);
  cf.communities.forEach((s, i) => {
    const c = capex.communities[i];
    if (!c) return;
    if (s.goLiveMonth >= 1 && s.goLiveMonth <= n) equipment[s.goLiveMonth - 1] += c.equipment;
    for (let m = Math.max(1, s.firstPostPilotMonth); m <= n; m++) software[m - 1] += c.softwareMonthly;
    const years = c.ecall === 'ble' ? POLICY.capexBleRenewalYears : c.ecall === 'inovonics' ? POLICY.capexInovonicsRenewalYears : 0;
    const each = c.beds * (c.ecall === 'ble' ? capex.pricing.bleRenewal : c.ecall === 'inovonics' ? capex.pricing.inovonicsRenewal : 0);
    if (years && each) for (let m = s.goLiveMonth + years * 12; m <= n; m += years * 12) renewals[m - 1] += each;
  });
  const totalCost = cf.months.map((_, i) => equipment[i] + software[i] + renewals[i]);
  const netBenefit = cf.months.map((_, i) => cf.grossBenefit[i] - totalCost[i]);
  const discountedNet = netBenefit.map((v, i) => v / (1 + cf.monthlyDiscountRate) ** (i + 1));
  const cumulativeDiscountedNet = running(discountedNet);
  const w = Math.min(12, n);
  const equipment12 = sum(equipment.slice(0, w));
  const running12 = sum(software.slice(0, w)) + sum(renewals.slice(0, w));
  const gross12 = sum(cf.grossBenefit.slice(0, w));
  const paid12 = equipment12 + running12;
  return {
    equipment,
    software,
    renewals,
    totalCost,
    grossBenefit: cf.grossBenefit,
    netBenefit,
    cumulativeNet: running(netBenefit),
    discountedNet,
    cumulativeDiscountedNet,
    equipment12,
    running12,
    gross12,
    net12: gross12 - paid12,
    grossReturn12: paid12 > 0 ? gross12 / paid12 : 0,
    discountedPaybackMonth: stayPaidMonth(cumulativeDiscountedNet),
  };
}

/** "How is this calculated?" for the Year 1 figures of an equipment purchase. */
export function capexYear1Traces(c: CapexCashFlow, gross12Label: string): Record<string, Trace> {
  const equipment = input('capex.y1.equipment', 'One-time equipment paid in months 1–12 (at each go-live)', c.equipment12, 'usd');
  const running12 = input('capex.y1.running', 'Software & services and E-Call renewals in months 1–12', c.running12, 'usd');
  const gross = input('capex.y1.gross12', gross12Label, c.gross12, 'usd');
  const paid = derived('capex.y1.paid', 'Everything paid to Teton in months 1–12', c.equipment12 + c.running12, 'usd', 'Equipment + software & services + renewals', [equipment, running12]);
  return {
    'capex.kpi.investment': derived('capex.kpi.investment', 'Total Investment — Year 1', c.equipment12, 'usd', 'One-time equipment cost, paid in each community’s go-live month', [equipment]),
    'capex.kpi.net': derived('capex.kpi.net', 'Net Benefit — Year 1', c.net12, 'usd', 'Gross benefit − everything paid to Teton in months 1–12', [gross, paid]),
    'capex.kpi.gross': derived('capex.kpi.gross', 'Gross Return per $1 Invested (Year 1)', c.grossReturn12, 'multiple', 'Gross benefit ÷ everything paid to Teton in months 1–12', [gross, paid]),
    'capex.kpi.payback': derived('capex.kpi.payback', 'Discounted Payback', c.discountedPaybackMonth, 'months', 'First month the running total of discounted net benefit (gross − equipment − software & services − renewals) stays above zero', [paid]),
  };
}

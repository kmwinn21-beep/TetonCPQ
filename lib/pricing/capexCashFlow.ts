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
import { POLICY } from './catalog';
import type { CapexResult } from './capex';

export interface CapexCashFlow {
  equipment: number[];
  software: number[];
  renewals: number[];
  totalCost: number[];
  grossBenefit: number[];
  netBenefit: number[];
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

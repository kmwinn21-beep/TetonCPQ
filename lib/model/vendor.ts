/**
 * Teton's own view of the deal over 36 months: revenue, cost to serve, margin
 * and payback. INTERNAL ONLY — never shown on a proposal.
 *
 * Mirrors "12 Mo Cash Flow" rows 120–210. The cost assumptions are the
 * workbook's placeholders until finance supplies actuals.
 */
import { buildCashFlow, type CashFlow } from './cashflow';
import type { AnnualCaseResult } from './annual';
import type { ModelInputs, VendorCostAssumptions } from './types';

export const VENDOR_VIEW_MONTHS = 36;

export const DEFAULT_VENDOR_COSTS: VendorCostAssumptions = {
  hardwarePerBed: 300,
  installLaborPerBed: 50,
  sensorCost: 150,
  cacPerBed: 50,
  cloudPerBilledBedMonth: 3,
  supportPerBilledBedMonth: 5,
  maintenancePerBilledBedMonth: 2,
};

export interface VendorView {
  billedUnits: number[];
  pilotFees: number[];
  postPilotFees: number[];
  oneTimeFees: number[];
  revenue: number[];
  hardware: number[];
  installLabor: number[];
  sensors: number[];
  cloudHosting: number[];
  support: number[];
  maintenanceReserve: number[];
  costToServe: number[];
  grossMargin: number[];
  cac: number[];
  netCashFlow: number[];
  discountedNetCashFlow: number[];
  cumulativeNetCashFlow: number[];
  cumulativeDiscountedNetCashFlow: number[];
  summary: {
    totalRevenue36: number;
    grossMarginPct36: number;
    netMarginPct36: number;
    peakCashOutlay: number;
    npv36: number;
    /** Month after the last month the running total is negative; 0 = never negative ("Immediate"); null = beyond 36. */
    paybackMonth: number | null;
    discountedPaybackMonth: number | null;
  };
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

function lastNegativePayback(cum: number[]): number | null {
  let last = 0;
  cum.forEach((v, i) => {
    if (v < 0) last = i + 1;
  });
  if (last === 0) return 0;
  return last >= cum.length ? null : last + 1;
}

export function vendorView(
  inputs: ModelInputs,
  annual: AnnualCaseResult,
  costs: VendorCostAssumptions = DEFAULT_VENDOR_COSTS,
): VendorView {
  const cf: CashFlow = buildCashFlow(inputs, annual, VENDOR_VIEW_MONTHS);
  const n = VENDOR_VIEW_MONTHS;
  const { pricing } = inputs;
  const special = pricing.specialFeePerBedMonth ?? pricing.postPilotFeePerBedMonth;
  const per = (f: (m: number) => number) => Array.from({ length: n }, (_, i) => f(i + 1));
  const atGoLive = (m: number, value: (i: number) => number) =>
    cf.communities.reduce((s, c, i) => s + (c.goLiveMonth === m ? value(i) : 0), 0);

  const pilotUnits = per((m) => sum(cf.communities.map((c) => c.pilotBilledUnits[m - 1])));
  const postUnits = per((m) => sum(cf.communities.map((c) => c.postPilotBilledUnits[m - 1])));
  const specialUnits = per((m) => sum(cf.communities.map((c) => c.specialPricedUnits[m - 1])));
  const billedUnits = per((m) => pilotUnits[m - 1] + postUnits[m - 1]);

  const uniform = inputs.communities.every((c) => !c.rates);
  // Uniform pricing keeps the workbook's arithmetic (rate × total billed units); otherwise sum per community.
  const pilotFees = uniform
    ? per((m) => pricing.pilotFeePerBedMonth * pilotUnits[m - 1])
    : per((m) => sum(cf.communities.map((c) => c.rates.pilotFeePerBedMonth * c.pilotBilledUnits[m - 1])));
  const postPilotFees = uniform
    ? per((m) => pricing.postPilotFeePerBedMonth * postUnits[m - 1] - (pricing.postPilotFeePerBedMonth - special) * specialUnits[m - 1])
    : per((m) =>
        sum(
          cf.communities.map(
            (c) =>
              c.rates.postPilotFeePerBedMonth * c.postPilotBilledUnits[m - 1] -
              (c.rates.postPilotFeePerBedMonth - (c.rates.specialFeePerBedMonth ?? c.rates.postPilotFeePerBedMonth)) * c.specialPricedUnits[m - 1],
          ),
        ),
      );
  const oneTimeFees = cf.install;
  const revenue = per((m) => pilotFees[m - 1] + postPilotFees[m - 1] + oneTimeFees[m - 1]);

  const unitsLive = per((m) => atGoLive(m, (i) => inputs.communities[i].units));
  const hardware = unitsLive.map((u) => costs.hardwarePerBed * u);
  const installLabor = unitsLive.map((u) => costs.installLaborPerBed * u);
  const sensors = per((m) => costs.sensorCost * atGoLive(m, (i) => inputs.communities[i].additionalSensors));
  const cloudHosting = billedUnits.map((u) => costs.cloudPerBilledBedMonth * u);
  const support = billedUnits.map((u) => costs.supportPerBilledBedMonth * u);
  const maintenanceReserve = billedUnits.map((u) => costs.maintenancePerBilledBedMonth * u);
  const costToServe = per(
    (m) =>
      hardware[m - 1] + installLabor[m - 1] + sensors[m - 1] + cloudHosting[m - 1] + support[m - 1] + maintenanceReserve[m - 1],
  );
  const grossMargin = per((m) => revenue[m - 1] - costToServe[m - 1]);
  const cac = unitsLive.map((u) => costs.cacPerBed * u);
  const netCashFlow = per((m) => grossMargin[m - 1] - cac[m - 1]);
  const r = inputs.cfo.annualDiscountRate;
  const discountedNetCashFlow = netCashFlow.map((v, i) => v / (1 + r) ** ((i + 1) / 12));
  let a = 0;
  const cumulativeNetCashFlow = netCashFlow.map((v) => (a += v));
  let b = 0;
  const cumulativeDiscountedNetCashFlow = discountedNetCashFlow.map((v) => (b += v));

  const totalRevenue36 = sum(revenue);
  return {
    billedUnits,
    pilotFees,
    postPilotFees,
    oneTimeFees,
    revenue,
    hardware,
    installLabor,
    sensors,
    cloudHosting,
    support,
    maintenanceReserve,
    costToServe,
    grossMargin,
    cac,
    netCashFlow,
    discountedNetCashFlow,
    cumulativeNetCashFlow,
    cumulativeDiscountedNetCashFlow,
    summary: {
      totalRevenue36,
      grossMarginPct36: totalRevenue36 === 0 ? 0 : sum(grossMargin) / totalRevenue36,
      netMarginPct36: totalRevenue36 === 0 ? 0 : sum(netCashFlow) / totalRevenue36,
      peakCashOutlay: -Math.min(0, ...cumulativeNetCashFlow),
      npv36: sum(discountedNetCashFlow),
      paybackMonth: lastNegativePayback(cumulativeNetCashFlow),
      discountedPaybackMonth: lastNegativePayback(cumulativeDiscountedNetCashFlow),
    },
  };
}

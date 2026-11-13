/**
 * Drill-down traces for every headline figure. Built from the same numbers
 * the engine computed — a trace never recomputes, it explains.
 */
import { occupiedUnits, type AnnualCaseResult } from './annual';
import type { CashFlow } from './cashflow';
import type { Kpis } from './kpis';
import { derived, input, type Trace } from './trace';
import type { ModelInputs } from './types';

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

const ANNUAL_COMPONENTS = [
  'recapturedCareRevenue',
  'fallCostAvoidance',
  'revenueFromLosIncrease',
  'nightShiftSavings',
  'moveInImpact',
  'techReplacement',
] as const;
type Component = (typeof ANNUAL_COMPONENTS)[number];

const COMPONENT_LABELS: Record<Component | 'residentsRealigned' | 'costlyFallsPrevented', string> = {
  recapturedCareRevenue: 'Recaptured Care Revenue',
  fallCostAvoidance: 'Fall Cost Avoidance',
  revenueFromLosIncrease: 'Rev from LOS Increase',
  nightShiftSavings: 'Savings from Night Shift',
  moveInImpact: 'Move-in Impact',
  techReplacement: 'Tech Replacement',
  residentsRealigned: '# of Res. Realigned',
  costlyFallsPrevented: 'Costly Falls Prevented',
};

export function buildTraces(inputs: ModelInputs, annual: AnnualCaseResult, cf: CashFlow, kpis: Kpis): Record<string, Trace> {
  const { client, roiCase } = inputs;
  const m = inputs.caseMetrics[roiCase];
  const caseName = roiCase.charAt(0).toUpperCase() + roiCase.slice(1);
  const a = (id: string, label: string, v: number, unit: Trace['unit'], ref?: string) => input(id, label, v, unit, ref);

  // ---- leaves shared across traces ----
  const occRate = a('in.occupancy', 'Occupancy', client.occupancy, 'percent', 'Assumptions!C29');
  const fallsPerRes = a('in.fallsPerResidentYear', 'Falls per resident per year', client.fallsPerResidentYear, 'count', 'Assumptions!E29');
  const fallReduction = a(`in.case.${roiCase}.fallReduction`, `Fall reduction (${caseName})`, m.fallReduction, 'percent');
  const pctHosp = a('in.pctFallsHospitalization', '% of falls → hospitalization', client.pctFallsHospitalization, 'percent', 'Assumptions!E31');
  const pctDisch = a('in.pctFallsDischarge', '% of falls → discharge', client.pctFallsDischarge, 'percent', 'Assumptions!E34');
  const costHosp = a('in.costPerHospitalization', 'Cost per hospitalization', client.costPerHospitalization, 'usd', 'Assumptions!E33');

  const occTrace = (i: number): Trace => {
    const c = inputs.communities[i];
    return derived(
      `c${i}.occupiedUnits`,
      `Occupied units — ${c.name}`,
      occupiedUnits(inputs, c),
      'count',
      'ROUND(Units × Occupancy)',
      [
        a(`c${i}.units`, `Units — ${c.name}`, c.units, 'count'),
        c.occupancy != null ? a(`c${i}.occupancy`, `Occupancy — ${c.name}`, c.occupancy, 'percent') : occRate,
      ],
      'Teton ROI!H',
    );
  };

  const fallsAvoidedTrace = (i: number): Trace => {
    const d = annual.drivers[i];
    return derived(`c${i}.fallsAvoided`, 'Falls avoided', d.fallsAvoided, 'count', 'Occupied units × Falls per resident per year × Fall reduction', [
      occTrace(i),
      fallsPerRes,
      fallReduction,
    ]);
  };

  const componentForCommunity = (k: Component | 'residentsRealigned' | 'costlyFallsPrevented', i: number): Trace => {
    const c = inputs.communities[i];
    const d = annual.drivers[i];
    const v = annual.communities[i][k];
    const id = `annual.${k}.c${i}`;
    const label = `${COMPONENT_LABELS[k]} — ${c.name}`;
    switch (k) {
      case 'residentsRealigned':
        return derived(id, label, v, 'count', 'ROUND(Occupied units × LOC gaps identified per month × Months until change of condition noticed)', [
          occTrace(i),
          a(`in.case.${roiCase}.locGap`, `LOC gaps identified / mo (${caseName})`, m.locGapIdentifiedPerMonth, 'percent'),
          a('in.monthsUntilCocNoticed', 'Months until change of condition noticed', inputs.monthsUntilCocNoticed, 'months', 'Assumptions!C21'),
        ]);
      case 'recapturedCareRevenue':
        return derived(id, label, v, 'usd', 'Residents realigned × LOC gap uplift per tier step × 12', [
          componentForCommunity('residentsRealigned', i),
          a('in.locGapUplift', 'LOC gap uplift per tier step ($/res/mo)', client.locGapUpliftPerTierStep, 'usd', 'Assumptions!C32'),
        ]);
      case 'costlyFallsPrevented':
        return derived(id, label, v, 'count', 'ROUND(Falls → hospitalization + Falls → discharge)', [
          derived(`c${i}.fallsToHosp`, 'Falls → hospitalization', d.fallsToHospitalization, 'count', 'Falls avoided × % to hospitalization', [fallsAvoidedTrace(i), pctHosp]),
          derived(`c${i}.fallsToDisch`, 'Falls → discharge', d.fallsToDischarge, 'count', 'Falls avoided × % to discharge', [fallsAvoidedTrace(i), pctDisch]),
        ]);
      case 'fallCostAvoidance':
        return derived(id, label, v, 'usd', 'ROUND(Falls → hospitalization) × Cost per hospitalization', [
          derived(`c${i}.fallsToHosp`, 'Falls → hospitalization', d.fallsToHospitalization, 'count', 'Falls avoided × % to hospitalization', [fallsAvoidedTrace(i), pctHosp]),
          costHosp,
        ]);
      case 'revenueFromLosIncrease':
        return derived(id, label, v, 'usd', 'Falls → discharge × LOS increase (months) × Avg rent', [
          derived(`c${i}.fallsToDisch`, 'Falls → discharge', d.fallsToDischarge, 'count', 'Falls avoided × % to discharge', [fallsAvoidedTrace(i), pctDisch]),
          a('in.losIncreaseMonths', 'LOS increase (months)', client.losIncreaseMonths, 'months', 'Assumptions!E35'),
          a('in.avgRent', 'Avg rent', client.avgRent, 'usd', 'Assumptions!C30'),
        ]);
      case 'nightShiftSavings':
        return derived(id, label, v, 'usd', 'Night shift cost base × Staffing alignment', [
          derived(`c${i}.nightBase`, 'Night shift cost base ($/yr)', d.nightShiftCostBase, 'usd', 'Units ÷ Residents per night staff × Hourly wage × Shift hours × 365', [
            a(`c${i}.units`, `Units — ${c.name}`, c.units, 'count'),
            a('in.nightRatio', 'Residents per night staff', client.nightResidentToStaffRatio, 'count', 'Assumptions!G29'),
            a('in.nightWage', 'Hourly wage, night staff', client.nightHourlyWage, 'usd', 'Assumptions!G31'),
            a('in.nightHours', 'Night shift hours', client.nightShiftHours, 'count', 'Assumptions!G30'),
          ]),
          a(`in.case.${roiCase}.staffing`, `Staffing alignment (${caseName})`, m.staffingAlignment, 'percent'),
        ]);
      case 'moveInImpact':
        return derived(id, label, v, 'usd', 'Incremental move-ins (capped at available beds) × Avg revenue per resident × Yr-1 revenue months', [
          derived(`c${i}.moveIns`, 'Incremental move-ins / yr', d.incrementalMoveIns, 'count', 'MIN(Occupied units × Move-in rate × Move-in uplift × 12, Units − Occupied units)', [
            occTrace(i),
            a('in.moveInRate', 'Move-ins per month (% of occupied)', client.moveInRatePerMonth, 'percent', 'Assumptions!C34'),
            a(`in.case.${roiCase}.moveIn`, `Move-in uplift (${caseName})`, m.moveInUplift, 'percent'),
          ]),
          a('in.avgRevPerRes', 'Avg revenue per resident / mo', client.avgRevenuePerResident, 'usd', 'Assumptions!C36'),
          a('in.yr1Months', 'Yr-1 revenue months per move-in', client.yr1RevenueMonthsPerMoveIn, 'months', 'Assumptions!C35'),
        ]);
      case 'techReplacement':
        return derived(id, label, v, 'usd', 'Occupied units × Supportive tech spend per resident × Tech replacement', [
          occTrace(i),
          a('in.techSpend', 'Avg spend on supportive tech per resident', client.supportiveTechSpendPerResident, 'usd', 'Assumptions!G33'),
          a(`in.case.${roiCase}.tech`, `Tech replacement (${caseName})`, m.techReplacement, 'percent'),
        ]);
    }
  };

  const traces: Record<string, Trace> = {};
  const n = inputs.communities.length;
  for (const k of [...ANNUAL_COMPONENTS, 'residentsRealigned', 'costlyFallsPrevented'] as const) {
    traces[`annual.${k}`] = derived(
      `annual.${k}`,
      `${COMPONENT_LABELS[k]} (${caseName}, annual)`,
      annual.totals[k],
      k === 'residentsRealigned' || k === 'costlyFallsPrevented' ? 'count' : 'usd',
      'Sum over communities',
      Array.from({ length: n }, (_, i) => componentForCommunity(k, i)),
      'Teton ROI row 76',
    );
  }
  traces['annual.annualRoi'] = derived(
    'annual.annualRoi',
    `Annual ROI (${caseName})`,
    annual.totals.annualRoi,
    'usd',
    'Recaptured care revenue + Fall cost avoidance + Rev from LOS increase + Night shift savings + Move-in impact + Tech replacement',
    ANNUAL_COMPONENTS.map((k) => traces[`annual.${k}`]),
  );
  traces['annual.totalRevenuePerMonth'] = derived('annual.totalRevenuePerMonth', 'Total Rev/M', annual.totals.totalRevenuePerMonth, 'usd_per_month', 'Annual ROI ÷ 12', [traces['annual.annualRoi']]);

  // ---- cash flow building blocks (months 1–12) ----
  const w = kpis.kpiWindowMonths;
  const months = `months 1–${w}`;
  const feeRate = (label: string, v: number) => a(`in.price.${label}`, label, v, 'usd');
  const recurring = derived(`cf.recurring12`, `Subscription fees (${months})`, sum(cf.recurringFees.slice(0, w)), 'usd', 'Sum over communities', cf.communities.map((cc, i) => {
    const c = inputs.communities[i];
    return derived(`cf.recurring12.c${i}`, `Subscription fees — ${c.name}`, sum(cc.fees.slice(0, w)), 'usd',
      cc.inPilot
        ? `Pilot units × Pilot fee for months ${cc.goLiveMonth}–${cc.firstPostPilotMonth - 1}, then Units × Post-pilot fee from month ${cc.firstPostPilotMonth}`
        : `Units × Post-pilot fee from go-live month ${cc.goLiveMonth}`,
      [
        a(`c${i}.units`, `Units — ${c.name}`, c.units, 'count'),
        ...(cc.inPilot ? [a(`c${i}.pilotUnits`, 'Pilot units', cc.pilotUnits, 'count'), feeRate('Pilot fee / bed / mo', inputs.pricing.pilotFeePerBedMonth)] : []),
        feeRate('Post-pilot fee / bed / mo', inputs.pricing.postPilotFeePerBedMonth),
        ...(inputs.pricing.specialTermMonths > 0 && inputs.pricing.specialFeePerBedMonth != null
          ? [feeRate('Special fee / bed / mo', inputs.pricing.specialFeePerBedMonth), a('in.price.specialTerm', 'Special pricing term', inputs.pricing.specialTermMonths, 'months')]
          : []),
      ]);
  }), '12 Mo Cash Flow row 75');
  const installT = derived(`cf.install12`, `One-time install (${months})`, sum(cf.install.slice(0, w)), 'usd', 'Install billed in each community’s go-live month', cf.communities.map((cc, i) => {
    const c = inputs.communities[i];
    return derived(`cf.install.c${i}`, `Install — ${c.name} (month ${cc.goLiveMonth})`, cc.goLiveMonth <= w ? cc.installCost : 0, 'usd',
      cc.inPilot ? 'Pilot units × Pilot install + Other units × Install + Sensors × Sensor price' : 'Units × Install per bed + Sensors × Sensor price',
      [a(`c${i}.units`, `Units — ${c.name}`, c.units, 'count'), feeRate('Install / bed', cc.inPilot ? inputs.pricing.pilotInstallPerBed : inputs.pricing.postPilotInstallPerBed)]);
  }), '12 Mo Cash Flow row 76');
  const reimb = derived(`cf.reimbursement12`, `Reimbursement (${months})`, sum(cf.reimbursement.slice(0, w)), 'usd',
    'For each post-pilot month: −MIN(Units × Post-pilot fee, Occupied units × Reimbursement per occupied unit)',
    [a('in.reimbursement', 'Reimbursement per occupied unit / mo', inputs.cfo.reimbursementPerOccupiedUnitMonth, 'usd', 'Assumptions!C42')], '12 Mo Cash Flow row 77');

  const gross12 = derived(`cf.gross12`, `Gross benefit (${months})`, sum(cf.grossBenefit.slice(0, w)), 'usd', 'Sum over communities of monthly benefit after ROI start delay and ramp',
    cf.communities.map((cc, i) => {
      const c = inputs.communities[i];
      return derived(`cf.gross12.c${i}`, `Gross benefit — ${c.name}`, sum(cc.gross.slice(0, w)), 'usd',
        `Full monthly benefit from month ${cc.roiStartMonth}, ramping linearly to 100% by month ${cc.fullRoiMonth}${cc.inPilot ? ' (no benefit counted during the pilot)' : ''}`,
        [
          derived(`c${i}.fullMonthly`, 'Full monthly benefit', cc.fullMonthlyBenefit, 'usd_per_month', 'Annual ROI ÷ 12', [
            derived(`c${i}.annualRoi`, `Annual ROI — ${c.name}`, annual.communities[i].annualRoi, 'usd', 'Sum of the six benefit components', ANNUAL_COMPONENTS.map((k) => componentForCommunity(k, i))),
          ]),
          a(`c${i}.goLive`, 'Go-live month', cc.goLiveMonth, 'months'),
          a(`c${i}.roiDelay`, 'ROI start delay', cc.roiDelayMonths, 'months'),
          a('in.ramp', 'Ramp to full ROI', inputs.schedule.rampMonths, 'months'),
        ]);
    }), '12 Mo Cash Flow row 79');

  const investment = derived('kpi.totalInvestment12', 'Total Investment — Year 1', kpis.totalInvestment12, 'usd', 'Subscription fees + One-time install + Reimbursement', [recurring, installT, reimb], '12 Mo Cash Flow!B12');
  traces['kpi.totalInvestment12'] = investment;
  traces['kpi.grossBenefit12'] = gross12;
  traces['kpi.netBenefit12'] = derived('kpi.netBenefit12', 'Net Benefit — Year 1', kpis.netBenefit12, 'usd', 'Gross benefit − Total Investment', [gross12, investment], '12 Mo Cash Flow!E12');
  traces['kpi.grossReturnPerDollar12'] = derived('kpi.grossReturnPerDollar12', 'Gross Return per $1 Invested (Year 1)', kpis.grossReturnPerDollar12, 'multiple', 'Gross benefit ÷ Total Investment', [gross12, investment], '12 Mo Cash Flow!H12');

  const H = kpis.horizonMonths;
  const rate = a('in.discountRate', 'Annual discount rate', inputs.cfo.annualDiscountRate, 'percent', 'Assumptions!C40');
  traces['kpi.discountedPaybackMonth'] = derived('kpi.discountedPaybackMonth', 'Discounted Payback', kpis.discountedPaybackMonth, 'months',
    `First month after which the running total of discounted net benefit stays above zero through month ${H}. Each month’s net ÷ (1 + monthly rate)^month; monthly rate = (1 + annual rate)^(1/12) − 1`,
    [rate, derived('cf.monthlyRate', 'Monthly discount rate', cf.monthlyDiscountRate, 'percent', '(1 + Annual rate)^(1/12) − 1', [rate]),
      ...cf.cumulativeDiscountedNet.map((v, i) => a(`cf.cumDisc.m${i + 1}`, `Cumulative discounted net — month ${i + 1}`, v, 'usd'))], '12 Mo Cash Flow!K12');

  const finalNet = derived('cf.finalNet', `Net benefit — month ${H}`, cf.netBenefit[H - 1], 'usd_per_month', `Gross benefit − Total cost in month ${H}`, [
    a('cf.finalGross', `Gross benefit — month ${H}`, cf.grossBenefit[H - 1], 'usd_per_month'),
    a('cf.finalCost', `Total cost — month ${H}`, cf.totalCost[H - 1], 'usd_per_month'),
  ]);
  traces['kpi.runRateAnnualNetBenefit'] = derived('kpi.runRateAnnualNetBenefit', 'Run-Rate Annual Net Benefit', kpis.runRateAnnualNetBenefit, 'usd', 'Final month’s net benefit × 12', [finalNet], '12 Mo Cash Flow!N12');
  const occTotal = derived('cf.occupiedTotal', 'Occupied units (all communities)', kpis.totalOccupiedUnits, 'count', 'Sum of ROUND(Units × Occupancy) per community', inputs.communities.map((_, i) => occTrace(i)));
  traces['kpi.netBenefitPerOccupiedUnitMonth'] = derived('kpi.netBenefitPerOccupiedUnitMonth', 'Net Benefit per Unit per Month (occupied)', kpis.netBenefitPerOccupiedUnitMonth, 'usd_per_month', 'Final month’s net benefit ÷ Occupied units', [finalNet, occTotal], '12 Mo Cash Flow!S12');
  traces['kpi.netBenefitPerUnitMonth'] = derived('kpi.netBenefitPerUnitMonth', 'Net Benefit per Unit per Month (all units)', kpis.netBenefitPerUnitMonth, 'usd_per_month', 'Final month’s net benefit ÷ Total portfolio units', [finalNet, a('in.portfolioUnits', 'Total portfolio units', inputs.cfo.portfolioUnits, 'count', 'Assumptions!C41')], '12 Mo Cash Flow!S13');
  // ---- steady-state comparison figures (selected case) ----
  const t = annual.totals;
  const roi = traces['annual.annualRoi'];
  const annualSub = derived('annual.recurringCost', 'Annual subscription, every unit post-pilot', t.annualRecurringCost, 'usd', 'Σ units × post-pilot rate × 12', []);
  const basis = derived('annual.totalCostBasis', 'Total cost basis', t.totalCostBasis, 'usd', 'Install for every unit + one year of post-pilot subscription', [annualSub], 'BREAKEVEN TABLE!C9');
  traces['annual.returnOnCost'] = derived('annual.returnOnCost', 'Return on cost', t.returnOnCost, 'multiple', 'Annual ROI ÷ Total cost basis', [roi, basis], 'Teton ROI row 82');
  traces['annual.breakevenMonths'] = derived('annual.breakevenMonths', 'Breakeven', t.breakevenMonths, 'months', 'Total cost basis ÷ (Annual ROI ÷ 12)', [basis, roi], 'BREAKEVEN TABLE col H');
  traces['annual.netRevpor'] = derived('annual.netRevpor', 'Net RevPOR (annual)', t.netRevpor, 'usd', '(Annual ROI − Annual subscription) ÷ Occupied units', [roi, annualSub, occTotal], 'Teton ROI row 84');
  const margin = a('in.operatingMargin', 'Operating margin', inputs.valuation.operatingMargin, 'percent', 'Assumptions!G9');
  traces['annual.annualNetNoiImpact'] = derived('annual.annualNetNoiImpact', 'Annual net NOI impact', t.annualNetNoiImpact, 'usd',
    '(Recaptured care revenue + Rev from LOS increase + Move-in impact) × Operating margin + Fall cost avoidance + Night shift savings − Annual subscription',
    [traces['annual.recapturedCareRevenue'], traces['annual.revenueFromLosIncrease'], traces['annual.moveInImpact'], margin, traces['annual.fallCostAvoidance'], traces['annual.nightShiftSavings'], annualSub], 'Teton ROI row 85');
  traces['annual.valuationImpact'] = derived('annual.valuationImpact', 'Valuation impact', t.valuationImpact, 'usd', 'Annual net NOI impact ÷ Cap rate',
    [traces['annual.annualNetNoiImpact'], a('in.capRate', 'Cap rate', inputs.valuation.capRate, 'percent', 'Assumptions!E9')], 'Teton ROI row 86');
  return traces;
}

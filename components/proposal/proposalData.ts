/**
 * Everything a proposal shows, worked out once from a saved version (inputs,
 * stored outputs, price lines), so every proposal format shows the same figures.
 */
import type { StoredOutputs } from '@/lib/data/quotes';
import type { RoiCase } from '@/lib/model';
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { POLICY } from '@/lib/pricing/catalog';
import { capexFor } from '@/lib/quote/outputs';
import type { QuoteDraft } from '@/lib/quote/draft';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { count, monthName, multiple, pct, usd } from '@/lib/format';
import { longDate } from '@/components/implementation/ImplementationGantt';
import { pilotPlan } from '@/lib/quote/pilotGoLives';
import { allocationTable } from '@/lib/quote/resources';

export const CASE_LABEL: Record<RoiCase, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export function buildProposalData(draft: QuoteDraft, outputs: StoredOutputs, lines: PriceLine[]) {
  const inputs = toModelInputs(draft);
  const start = inputs.schedule.startDate;
  const kp = outputs.kpis;
  const cf = outputs.cashFlow;
  const rc = outputs.roiCase;
  const sel = outputs.annual[rc].totals;
  const capex = capexFor(outputs, draft);
  const showOpex = draft.presentation !== 'capex';
  const showCapex = draft.presentation === 'capex' || draft.presentation === 'both';
  const units = inputs.communities.reduce((s, c) => s + c.units, 0);
  const anyPilot = cf.communities.some((c) => c.inPilot);
  // The pilot phase ends when the last pilot site converts to the service term.
  const pilotEndMonth = anyPilot ? Math.max(...cf.communities.filter((c) => c.inPilot).map((c) => c.firstPostPilotMonth - 1)) : null;
  const term = POLICY.serviceTermMonths;
  const credit = draft.commercial.installCreditPct;

  const oneTime = sum(lines.filter((l) => l.billing === 'one_time').map(lineTotal));
  const pilotMonthly = sum(lines.filter((l) => l.billing === 'monthly' && l.description.includes('pilot')).map((l) => l.qty * l.unitNet));
  const serviceMonthly = sum(
    lines.filter((l) => l.billing === 'monthly' && !l.description.includes('pilot') && !l.description.includes('introductory')).map((l) => l.qty * l.unitNet),
  );
  const termTotal = sum(lines.map(lineTotal));

  // One row per community: monthly once in service, pilot / intro monthly, one-time net of credits.
  const isPilotLine = (l: PriceLine) => l.billing === 'monthly' && l.description.includes('— pilot');
  const isIntroLine = (l: PriceLine) => l.billing === 'monthly' && l.description.includes('introductory');
  const perCommunity = draft.communities.map((dc, i) => {
    const ls = lines.filter((l) => l.communityPosition === i);
    const cc = cf.communities[i];
    const pilotLines = ls.filter(isPilotLine);
    const introLines = ls.filter(isIntroLine);
    // During the intro term, the intro platform line replaces the regular one; other monthly lines (e-call) still apply.
    const introMonthly = introLines.length
      ? sum(introLines.map((l) => l.qty * l.unitNet)) + sum(ls.filter((l) => l.billing === 'monthly' && !isPilotLine(l) && !isIntroLine(l) && !l.description.startsWith('Teton subscription')).map((l) => l.qty * l.unitNet))
      : null;
    const coverage = dc.coverage === 'full_facility' ? 'Full facility' : 'Resident rooms';
    const hasEcall = draft.commercial.ecall !== 'none' && dc.ecall;
    return {
      key: dc.id,
      name: inputs.communities[i].name,
      pilot: cc.inPilot,
      detail: [dc.market, coverage, hasEcall ? 'E-Call' : null].filter(Boolean).join(' · '),
      units: inputs.communities[i].units,
      // Care-type mix under the total, e.g. "AL 10 · MC 19" (zeros left out).
      mix: (
        [
          ['IL', dc.ilBeds],
          ['AL', dc.alBeds],
          ['MC', dc.mcBeds],
          ['SNF', dc.snfBeds],
        ] as const
      )
        .filter(([, n]) => (Number(n) || 0) > 0)
        .map(([t, n]) => `${t} ${count(Number(n))}`)
        .join(' · '),
      goLive: monthName(start, cc.goLiveMonth),
      pilotUntil: cc.inPilot ? monthName(start, cc.firstPostPilotMonth - 1) : null,
      monthly: sum(ls.filter((l) => l.billing === 'monthly' && !isPilotLine(l) && !isIntroLine(l)).map((l) => l.qty * l.unitNet)),
      pilotMonthly: pilotLines.length ? sum(pilotLines.map((l) => l.qty * l.unitNet)) : null,
      introMonthly,
      introMonths: introLines[0]?.termMonths ?? 0,
      oneTime: sum(ls.filter((l) => l.billing === 'one_time').map(lineTotal)),
      credit: -sum(ls.filter((l) => l.concessionCode?.startsWith('INSTALL_CREDIT')).map(lineTotal)),
    };
  });

  // Per-bed rates, stated once. List price shown only where the rate is discounted.
  const k = draft.commercial;
  const firstLine = (pred: (l: PriceLine) => boolean) => lines.find(pred);
  const listOf = (pred: (l: PriceLine) => boolean, mult = 1) => {
    const l = firstLine(pred);
    return l ? l.unitList / mult : null;
  };
  const anyFull = draft.communities.some((dc) => dc.coverage === 'full_facility');
  const platformList =
    listOf((l) => l.description === 'Teton subscription') ?? listOf((l) => l.description === 'Teton subscription, full-facility coverage', k.fullFacilityMultiplier);
  const installList =
    listOf((l) => l.description === 'Installation & implementation') ?? listOf((l) => l.description === 'Installation & implementation, full-facility coverage', k.fullFacilityMultiplier);
  const ecallList = listOf((l) => l.description.startsWith('E-Call (') );
  const money = (n: number) => usd(n, { cents: !Number.isInteger(n) });
  const rateSummary: Array<{ key: string; label: string; value: string; list?: string }> = [
    { key: 'rate.subscription', label: 'Teton subscription', value: `${money(k.platformRate)}/bed/mo`, list: platformList != null && platformList > k.platformRate ? money(platformList) : undefined },
    ...(k.ecall !== 'none' && draft.communities.some((dc) => dc.ecall)
      ? [{ key: 'rate.ecall', label: `E-Call (${k.ecall === 'ble' ? 'Bluetooth' : 'Inovonics'})`, value: `${money(k.ecallRate)}/bed/mo`, list: ecallList != null && ecallList > k.ecallRate ? money(ecallList) : undefined }]
      : []),
    { key: 'rate.install', label: 'Installation', value: `${money(k.installRate)}/bed one-time`, list: installList != null && installList > k.installRate ? money(installList) : undefined },
    ...(anyFull ? [{ key: 'rate.fullFacility', label: 'Full-facility coverage', value: `${k.fullFacilityMultiplier}× subscription and install` }] : []),
  ];

  // Values that can appear inside editable sentences. They render from the stored version and can't be retyped.
  const capRate = pct(inputs.valuation.capRate, 1);
  const costOfMoney = pct(inputs.cfo.annualDiscountRate, 1);
  const caseName = CASE_LABEL[rc];
  const pilotLength = `${inputs.schedule.pilotLengthMonths}-month`;
  const termLength = `${term}-month`;

  const outcomes: Array<{ key: string; value: string; label: string; v?: Record<string, string> }> = [
    { key: 'roi.outcome.realigned', value: count(sel.residentsRealigned), label: 'residents realigned to the right level of care' },
    { key: 'roi.outcome.falls', value: count(sel.costlyFallsPrevented), label: 'costly falls prevented' },
    { key: 'roi.outcome.noi', value: usd(sel.annualNetNoiImpact, { compact: true }), label: 'annual net operating income impact' },
    { key: 'roi.outcome.valuation', value: usd(sel.valuationImpact, { compact: true }), label: 'Asset Value Impact (one year @ {capRate} Cap)', v: { capRate } },
  ];

  const cards: Array<{ key: string; label: string; value: string; note: string; v?: Record<string, string> }> = [
    { key: 'card.investment', label: 'Total Investment — Year 1', value: usd(kp.totalInvestment12), note: 'Everything paid to Teton in the first 12 months: installation plus monthly subscription.' },
    { key: 'card.net', label: 'Net Benefit — Year 1', value: usd(kp.netBenefit12), note: 'How much better off your communities are in year one after paying for everything.' },
    {
      key: 'card.gross',
      label: 'Gross Return per $1 Invested (Year 1)',
      value: multiple(kp.grossReturnPerDollar12),
      note: 'Stabilized return per $1 invested: {stabilized}, once every community is live and fully ramped.',
      v: { stabilized: multiple(sel.returnOnCost, 1) },
    },
    {
      key: 'card.payback',
      label: 'Discounted Payback',
      value: kp.discountedPaybackMonth ? `Month ${kp.discountedPaybackMonth}` : `Beyond month ${kp.horizonMonths}`,
      note: 'When the program has paid for itself and stays paid for, using your {costOfMoney} cost of money.',
      v: { costOfMoney },
    },
    { key: 'card.runRate', label: 'Run-Rate Annual Net Benefit', value: usd(kp.runRateAnnualNetBenefit), note: 'The yearly value once every community is live and fully ramped, after subscription fees.' },
    {
      key: 'card.perUnit',
      label: 'Net Benefit per Unit per Month',
      value: usd(kp.netBenefitPerOccupiedUnitMonth),
      note: 'Per occupied apartment at run rate ({perUnit} per unit across all {units}).',
      v: { perUnit: usd(kp.netBenefitPerUnitMonth), units: `${count(inputs.cfo.portfolioUnits)} units` },
    },
  ];

  const benefits: Array<[string, string, string]> = [
    ['roi.benefit.care', 'Recaptured care revenue', usd(sel.recapturedCareRevenue)],
    ['roi.benefit.falls', 'Fall cost avoidance', usd(sel.fallCostAvoidance)],
    ['roi.benefit.los', 'Revenue from longer length of stay', usd(sel.revenueFromLosIncrease)],
    ['roi.benefit.staffing', 'Night shift savings', usd(sel.nightShiftSavings)],
    ['roi.benefit.moveIn', 'Move-in impact', usd(sel.moveInImpact)],
    ['roi.benefit.tech', 'Tech replacement', usd(sel.techReplacement)],
  ];

  const c = inputs.client;
  const assumptions: Array<[string, string, string]> = [
    ['assume.occupancy', 'Occupancy', pct(c.occupancy)],
    ['assume.rent', 'Average rent / resident / month', usd(c.avgRent)],
    ['assume.care', 'Care revenue / resident / month', usd(c.careRevenuePerResident)],
    ['assume.locUplift', 'Care revenue uplift per level-of-care step', `${usd(c.locGapUpliftPerTierStep)} / month`],
    ['assume.falls', 'Falls per resident per year', String(c.fallsPerResidentYear)],
    ['assume.hospitalization', 'Falls leading to hospitalization', pct(c.pctFallsHospitalization)],
    ['assume.hospitalCost', 'Cost per hospitalization', usd(c.costPerHospitalization)],
    ['assume.discharge', 'Falls leading to discharge', pct(c.pctFallsDischarge)],
    ['assume.los', 'Length-of-stay protected per avoided discharge', `${c.losIncreaseMonths} months`],
    ['assume.moveIns', 'Move-ins per month (share of occupied)', pct(c.moveInRatePerMonth)],
    ['assume.nightRatio', 'Night staffing ratio (residents per staff)', String(c.nightResidentToStaffRatio)],
    ['assume.wage', 'Night staff hourly wage', usd(c.nightHourlyWage, { cents: true })],
    ['assume.discountRate', 'Your discount rate', pct(inputs.cfo.annualDiscountRate)],
    ['assume.benefitStart', 'Benefits start after go-live', `${inputs.schedule.roiStartDelayMonths} months, ramping over ${inputs.schedule.rampMonths}`],
  ];

  const ecallFreeInPilot = draft.commercial.ecall !== 'none' && draft.commercial.ecallPilotRate === 0;
  const nCommunities = inputs.communities.length;

  // Implementation plan for pilot sites (only shown when the deal has pilot communities).
  const pilots = pilotPlan(draft, start, cf.communities.map((c) => c.goLiveMonth));
  // The customer's estimated resource allocation (its own section, shown once a role is named).
  const hasResources = allocationTable(draft.resources ?? [], draft.implementationPlan).rows.length > 0;
  const pilotDates = pilots.map((g) => longDate(g.goLive));
  const pilotDatesText = pilotDates.length <= 1 ? pilotDates.join('') : `${pilotDates.slice(0, -1).join(', ')} and ${pilotDates[pilotDates.length - 1]}`;
  // "a Mar 1, 2027" / "an Apr 1, 2027" for one date; "Feb 1, 2027 and Mar 1, 2027" for several.
  const goLivePhrase = pilotDates.length === 1 ? `${/^(Apr|Aug|Oct)/.test(pilotDatesText) ? 'an' : 'a'} ${pilotDatesText}` : pilotDatesText;

  return { inputs, start, kp, cf, rc, sel, capex, showOpex, showCapex, units, anyPilot, pilotEndMonth, term, credit, oneTime, pilotMonthly, serviceMonthly, termTotal, perCommunity, k, anyFull, money, rateSummary, capRate, costOfMoney, caseName, pilotLength, termLength, outcomes, cards, benefits, assumptions, ecallFreeInPilot, nCommunities, pilots, hasResources, pilotDates, pilotDatesText, goLivePhrase };
}

export type ProposalData = ReturnType<typeof buildProposalData>;

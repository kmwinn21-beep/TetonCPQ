/**
 * Monthly cash flow: what the customer pays Teton and what they get back,
 * community by community, month by month.
 *
 * Mirrors the "12 Mo Cash Flow" tab and its "Cash Flow Helpers" tab, extended
 * from 12 months to `schedule.horizonMonths`. Month 1 is the month of
 * `schedule.startDate`.
 *
 * Billing, per community:
 *   - nothing before go-live;
 *   - pilot communities (when the deal is modeled with a pilot) pay the pilot
 *     fee on their pilot units for `pilotLengthMonths`;
 *   - after that every unit pays the post-pilot fee, or the special fee during
 *     the special pricing term;
 *   - the one-time install is billed in the go-live month.
 *
 * Benefits, per community:
 *   - start at go-live + ROI start delay; pilot communities never accrue
 *     benefits during the pilot, so they start no earlier than the first
 *     post-pilot month;
 *   - ramp linearly to the full monthly ROI over `rampMonths`;
 *   - full monthly ROI = the community's annual ROI for the selected case ÷ 12.
 */
import { occupiedUnits, type AnnualCaseResult } from './annual';
import type { Community, ModelInputs } from './types';

export interface CommunitySchedule {
  /** Pilot billing applies (pilot community in a with-pilot deal). */
  inPilot: boolean;
  pilotUnits: number;
  goLiveMonth: number;
  /** First month billed at the post-pilot (or special) rate. */
  firstPostPilotMonth: number;
  roiDelayMonths: number;
  roiStartMonth: number;
  fullRoiMonth: number;
  installCost: number;
  /** Monthly reimbursement offset once post-pilot (0 when reimbursement is off). */
  monthlyReimbursement: number;
  /** Full monthly benefit once ramped (annual ROI ÷ 12). */
  fullMonthlyBenefit: number;
}

export interface CommunityCashFlow extends CommunitySchedule {
  fees: number[];
  gross: number[];
  pilotBilledUnits: number[];
  postPilotBilledUnits: number[];
  specialPricedUnits: number[];
}

export interface CashFlow {
  months: number[];
  monthDates: string[];
  communities: CommunityCashFlow[];
  recurringFees: number[];
  install: number[];
  /** Negative: reduces the customer's cost. */
  reimbursement: number[];
  totalCost: number[];
  grossBenefit: number[];
  netBenefit: number[];
  cumulativeNet: number[];
  monthlyDiscountRate: number;
  discountedNet: number[];
  cumulativeDiscountedNet: number[];
}

export function communitySchedule(inputs: ModelInputs, c: Community, annualRoi: number): CommunitySchedule {
  const { schedule, pricing } = inputs;
  const L = schedule.pilotLengthMonths;
  const inPilot = schedule.withPilot && c.pilot;
  const pilotUnits = c.pilot ? ((c.pilotUnits ?? 0) > 0 ? Math.min(c.pilotUnits as number, c.units) : c.units) : 0;
  const goLiveMonth =
    (c.goLiveMonth ?? 0) > 0 ? (c.goLiveMonth as number) : schedule.withPilot && !c.pilot ? L + 1 : 1;
  const firstPostPilotMonth = goLiveMonth + (inPilot ? L : 0);
  const roiDelayMonths = c.roiDelayMonths ?? schedule.roiStartDelayMonths;
  // The workbook has a separate branch for a zero default delay on pilots (start at the
  // first billed month), but that month is never earlier than the first post-pilot month,
  // so both branches reduce to max(first post-pilot month, go-live + delay).
  const roiStartMonth = inPilot ? Math.max(firstPostPilotMonth, goLiveMonth + roiDelayMonths) : goLiveMonth + roiDelayMonths;
  const fullRoiMonth = roiStartMonth + Math.max(schedule.rampMonths || 0, 1) - 1;

  const installCost = inPilot
    ? pilotUnits * pricing.pilotInstallPerBed +
      (c.units - pilotUnits) * pricing.postPilotInstallPerBed +
      c.additionalSensors * pricing.pilotSensorPrice
    : c.units * pricing.postPilotInstallPerBed + c.additionalSensors * pricing.postPilotSensorPrice;

  const monthlyReimbursement = schedule.includeReimbursement
    ? Math.min(c.units * pricing.postPilotFeePerBedMonth, occupiedUnits(inputs, c) * inputs.cfo.reimbursementPerOccupiedUnitMonth)
    : 0;

  return {
    inPilot,
    pilotUnits,
    goLiveMonth,
    firstPostPilotMonth,
    roiDelayMonths,
    roiStartMonth,
    fullRoiMonth,
    installCost,
    monthlyReimbursement,
    fullMonthlyBenefit: annualRoi / 12,
  };
}

/** Fee billed to one community in month m (1-based). */
export function monthlyFee(inputs: ModelInputs, c: Community, s: CommunitySchedule, m: number): number {
  const { pricing } = inputs;
  if (m < s.goLiveMonth) return 0;
  if (s.inPilot && m < s.firstPostPilotMonth) return s.pilotUnits * pricing.pilotFeePerBedMonth;
  const special = pricing.specialFeePerBedMonth ?? pricing.postPilotFeePerBedMonth;
  return c.units * (m < s.firstPostPilotMonth + pricing.specialTermMonths ? special : pricing.postPilotFeePerBedMonth);
}

/** Benefit accrued by one community in month m, after delay and ramp. */
export function monthlyBenefit(s: CommunitySchedule, m: number): number {
  if (m < s.roiStartMonth) return 0;
  const ramp = Math.min(1, (m - s.roiStartMonth + 1) / (s.fullRoiMonth - s.roiStartMonth + 1));
  return s.fullMonthlyBenefit * ramp;
}

const zeros = (n: number) => Array.from({ length: n }, () => 0);

export function buildCashFlow(inputs: ModelInputs, annual: AnnualCaseResult, horizonMonths = inputs.schedule.horizonMonths): CashFlow {
  const n = horizonMonths;
  const months = Array.from({ length: n }, (_, i) => i + 1);
  const start = inputs.schedule.startDate;
  const monthDates = months.map((m) => {
    const [y, mo] = start.split('-').map(Number);
    const d = new Date(Date.UTC(y, mo - 1 + (m - 1), 1));
    return d.toISOString().slice(0, 10);
  });
  const { pricing } = inputs;

  const communities: CommunityCashFlow[] = inputs.communities.map((c, i) => {
    const s = communitySchedule(inputs, c, annual.communities[i].annualRoi);
    return {
      ...s,
      fees: months.map((m) => monthlyFee(inputs, c, s, m)),
      gross: months.map((m) => monthlyBenefit(s, m)),
      pilotBilledUnits: months.map((m) => (s.inPilot && m >= s.goLiveMonth && m < s.firstPostPilotMonth ? s.pilotUnits : 0)),
      postPilotBilledUnits: months.map((m) => (m < s.goLiveMonth || (s.inPilot && m < s.firstPostPilotMonth) ? 0 : c.units)),
      specialPricedUnits: months.map((m) =>
        m >= s.firstPostPilotMonth && m < s.firstPostPilotMonth + pricing.specialTermMonths ? c.units : 0,
      ),
    };
  });

  const recurringFees = zeros(n);
  const install = zeros(n);
  const reimbursement = zeros(n);
  const grossBenefit = zeros(n);
  for (const cc of communities) {
    for (let i = 0; i < n; i++) {
      recurringFees[i] += cc.fees[i];
      grossBenefit[i] += cc.gross[i];
      if (cc.firstPostPilotMonth <= i + 1) reimbursement[i] -= cc.monthlyReimbursement;
    }
    if (cc.goLiveMonth >= 1 && cc.goLiveMonth <= n) install[cc.goLiveMonth - 1] += cc.installCost;
  }
  const totalCost = months.map((_, i) => recurringFees[i] + install[i] + reimbursement[i]);
  const netBenefit = months.map((_, i) => grossBenefit[i] - totalCost[i]);
  const cumulativeNet = running(netBenefit);
  const monthlyDiscountRate = (1 + inputs.cfo.annualDiscountRate) ** (1 / 12) - 1;
  const discountedNet = netBenefit.map((v, i) => v / (1 + monthlyDiscountRate) ** (i + 1));

  return {
    months,
    monthDates,
    communities,
    recurringFees,
    install,
    reimbursement,
    totalCost,
    grossBenefit,
    netBenefit,
    cumulativeNet,
    monthlyDiscountRate,
    discountedNet,
    cumulativeDiscountedNet: running(discountedNet),
  };
}

export function running(xs: number[]): number[] {
  let acc = 0;
  return xs.map((x) => (acc += x));
}

/**
 * "Pays for itself and stays paid": the first month after which the running
 * total never drops back to zero or below within the window. null if never.
 */
export function stayPaidMonth(cumulative: number[]): number | null {
  for (let i = 0; i < cumulative.length; i++) {
    if (Math.min(...cumulative.slice(i)) > 0) return i + 1;
  }
  return null;
}

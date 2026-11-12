/**
 * Capex presentation: some buyers (especially REIT-owned) book Teton as a
 * capital purchase. Instead of paying the subscription monthly, they pay the
 * service term upfront, priced as its present value.
 *
 * Per community:
 *   upfront subscription = Σ over the service term of monthly fee ÷ (1 + r_m)^k
 *     k = 0 … term − 1 months from the start of the service term (paid in
 *     advance, so the first month isn't discounted);
 *     r_m = (1 + annual rate)^(1/12) − 1
 *   capex price = upfront subscription + install
 * Pilot-month fees stay operating spend; they're reported separately.
 *
 * Not in the workbook — this is the CPQ's own formula, kept in one place so it
 * can change without touching anything else.
 */
import { annualForCase } from './annual';
import { communitySchedule, monthlyFee } from './cashflow';
import { derived, input, type Trace } from './trace';
import type { ModelInputs } from './types';

export interface CapexCommunity {
  name: string;
  serviceStartMonth: number;
  nominalSubscription: number;
  upfrontSubscription: number;
  install: number;
  pilotFees: number;
}

export interface CapexResult {
  annualDiscountRate: number;
  termMonths: number;
  communities: CapexCommunity[];
  /** Subscription for the full service term, paid monthly (undiscounted). */
  nominalSubscription: number;
  /** The same subscription paid upfront at present value. */
  upfrontSubscription: number;
  install: number;
  pilotFees: number;
  /** Upfront subscription + install. */
  capexTotal: number;
  /** Install + pilot fees + nominal subscription. */
  opexTotal: number;
  /** What paying upfront saves in nominal dollars. */
  upfrontDiscount: number;
  trace: Trace;
}

export function computeCapex(inputs: ModelInputs, annualDiscountRate = 0.04, termMonths = 36): CapexResult {
  const annual = annualForCase(inputs, inputs.roiCase);
  const mr = (1 + annualDiscountRate) ** (1 / 12) - 1;
  const communities = inputs.communities.map((c, i) => {
    const s = communitySchedule(inputs, c, annual.communities[i].annualRoi);
    let nominal = 0;
    let pv = 0;
    for (let k = 0; k < termMonths; k++) {
      const fee = monthlyFee(inputs, c, s, s.firstPostPilotMonth + k);
      nominal += fee;
      pv += fee / (1 + mr) ** k;
    }
    let pilotFees = 0;
    for (let m = s.goLiveMonth; m < s.firstPostPilotMonth; m++) pilotFees += monthlyFee(inputs, c, s, m);
    return { name: c.name, serviceStartMonth: s.firstPostPilotMonth, nominalSubscription: nominal, upfrontSubscription: pv, install: s.installCost, pilotFees };
  });
  const sum = (k: keyof Omit<CapexCommunity, 'name' | 'serviceStartMonth'>) => communities.reduce((s, c) => s + c[k], 0);
  const nominalSubscription = sum('nominalSubscription');
  const upfrontSubscription = sum('upfrontSubscription');
  const install = sum('install');
  const pilotFees = sum('pilotFees');

  const rate = input('in.capexRate', 'Capex discount rate (annual)', annualDiscountRate, 'percent');
  const term = input('in.capexTerm', 'Service term', termMonths, 'months');
  const trace = derived(
    'capex.total',
    'Upfront capex price',
    upfrontSubscription + install,
    'usd',
    'Upfront subscription + Install',
    [
      derived('capex.subscription', 'Upfront subscription (present value)', upfrontSubscription, 'usd', 'Sum over communities', communities.map((c, i) =>
        derived(`capex.subscription.c${i}`, `Upfront subscription — ${c.name}`, c.upfrontSubscription, 'usd',
          `Σ monthly fee ÷ (1 + monthly rate)^k over ${termMonths} months from month ${c.serviceStartMonth}; monthly rate = (1 + annual rate)^(1/12) − 1`,
          [input(`capex.nominal.c${i}`, `Monthly fees over the term, undiscounted — ${c.name}`, c.nominalSubscription, 'usd'), rate, term]),
      )),
      derived('capex.install', 'Install', install, 'usd', 'Sum over communities', communities.map((c, i) => input(`capex.install.c${i}`, `Install — ${c.name}`, c.install, 'usd'))),
    ],
  );

  return {
    annualDiscountRate,
    termMonths,
    communities,
    nominalSubscription,
    upfrontSubscription,
    install,
    pilotFees,
    capexTotal: upfrontSubscription + install,
    opexTotal: install + pilotFees + nominalSubscription,
    upfrontDiscount: nominalSubscription - upfrontSubscription,
    trace,
  };
}

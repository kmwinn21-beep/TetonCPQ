/**
 * Subscription spend over a period, for comparing with an equipment purchase:
 * install, pilot fees and the monthly subscription for `months` from each
 * community's service start (after its pilot). Nominal dollars, no discounting.
 */
import { annualForCase } from './annual';
import { communitySchedule, monthlyFee } from './cashflow';
import type { ModelInputs } from './types';

export interface SubscriptionTotals {
  months: number;
  install: number;
  pilotFees: number;
  subscription: number;
  total: number;
}

export function subscriptionTotals(inputs: ModelInputs, months = 48): SubscriptionTotals {
  const annual = annualForCase(inputs, inputs.roiCase);
  let install = 0;
  let pilotFees = 0;
  let subscription = 0;
  inputs.communities.forEach((c, i) => {
    const s = communitySchedule(inputs, c, annual.communities[i].annualRoi);
    for (let k = 0; k < months; k++) subscription += monthlyFee(inputs, c, s, s.firstPostPilotMonth + k);
    for (let m = s.goLiveMonth; m < s.firstPostPilotMonth; m++) pilotFees += monthlyFee(inputs, c, s, m);
    install += s.installCost;
  });
  return { months, install, pilotFees, subscription, total: install + pilotFees + subscription };
}

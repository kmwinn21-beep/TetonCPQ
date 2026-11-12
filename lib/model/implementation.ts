/** Implementation timeline (Assumptions H29:I35). */
import { workday } from './excel';
import type { ImplementationInputs } from './types';

export interface ImplementationTimeline {
  /** Communication + installation + baseline weeks + onboarding days ÷ 5. Assumptions I30. */
  totalImplementationWeeks: number;
  /** Desired go-live minus the implementation time in working days. Assumptions I35. */
  latestKickoffDate: string;
}

export function implementationTimeline(i: ImplementationInputs): ImplementationTimeline {
  const weeks = i.communicationWeeks + i.installationWeeks + i.baselineWeeks;
  return {
    totalImplementationWeeks: weeks + i.onboardingDays / 5,
    latestKickoffDate: workday(i.desiredGoLive, -(weeks * 5 + i.onboardingDays)),
  };
}

/**
 * Go-live dates of a deal's pilot communities, for the implementation plan.
 * A community set to go live in the desired go-live month uses the desired
 * go-live date; other months use the 1st. Blank go-lives use the month the
 * model assigns (month 1 for pilot sites).
 */
import type { QuoteDraft } from './draft';
import { monthLabel } from './toModelInputs';
import { pilotGroups, type PilotGroup } from './implementationPlan';

export function pilotGoLives(draft: QuoteDraft, startDate: string | null, modelGoLiveMonths: Array<number | undefined>): Array<{ name: string; goLive: string }> {
  if (!draft.schedule?.withPilot) return [];
  const desired = draft.implementation?.desiredGoLive?.slice(0, 10) ?? '';
  const desiredYm = desired.slice(0, 7);
  return (draft.communities ?? [])
    .map((c, i) => {
      if (!c?.pilot) return null;
      let ym = c.goLiveMonth ?? null;
      if (!ym && startDate && modelGoLiveMonths[i]) ym = monthLabel(startDate, modelGoLiveMonths[i]!);
      if (!ym) ym = desiredYm;
      if (!ym) return null;
      return { name: c.name, goLive: ym === desiredYm && desired ? desired : `${ym}-01` };
    })
    .filter((x): x is { name: string; goLive: string } => !!x);
}

/** Pilot communities grouped by go-live, each with its back-scheduled plan. */
export function pilotPlan(draft: QuoteDraft, startDate: string | null, modelGoLiveMonths: Array<number | undefined>): PilotGroup[] {
  return pilotGroups(pilotGoLives(draft, startDate, modelGoLiveMonths), draft.implementationPlan);
}

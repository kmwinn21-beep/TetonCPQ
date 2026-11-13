'use client';

/**
 * Proposal-only controls on the Implementation section's stage cards: remove
 * a stage, or add one. These change the deal's implementation plan, so they
 * go through the proposal's unsaved-changes flow (Save all changes).
 */
import { addCustomStage, MAX_STAGES, normalizePlan, removeStage, type ImplementationPlan } from '@/lib/quote/implementationPlan';
import { useWhatIf } from './WhatIf';

export function RemoveStageButton({ plan, id, name }: { plan: ImplementationPlan; id: string; name: string }) {
  const w = useWhatIf();
  if (!w?.enabled || normalizePlan(plan).order.length <= 1) return null;
  return (
    <button
      type="button"
      data-edit-ui
      className="no-print absolute -top-2 -right-2 hidden group-hover/stage:flex w-5 h-5 items-center justify-center rounded-full bg-teton-near-black text-white text-[11px] shadow"
      title={`Remove ${name} from the timeline (an unsaved change until you save)`}
      aria-label={`Remove stage ${name}`}
      onClick={() => w.setChange('implementationPlan', removeStage(plan, id))}
    >
      ✕
    </button>
  );
}

export function AddStageCard({ plan }: { plan: ImplementationPlan }) {
  const w = useWhatIf();
  if (!w?.enabled || normalizePlan(plan).order.length >= MAX_STAGES) return null;
  return (
    <button
      type="button"
      data-edit-ui
      className="no-print rounded-lg border border-dashed border-teton-pale-gray p-2.5 text-left text-[12px] text-teton-dark-gray hover:border-teton-blue hover:text-teton-ink min-h-[5rem]"
      onClick={() => {
        w.setChange('implementationPlan', addCustomStage(plan).plan);
        w.select('impl.plan', 'Implementation timeline');
      }}
    >
      <span className="font-semibold">+ Add a stage</span>
      <span className="block text-[11px] text-teton-ui-gray mt-0.5">Name it and set its length in the panel. Removed stages can be added back there too.</span>
    </button>
  );
}

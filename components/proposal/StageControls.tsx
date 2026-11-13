'use client';

/**
 * Proposal-only controls on the Implementation section's stage cards: rename
 * or remove a stage, or add one. These change the deal's implementation plan, so they
 * go through the proposal's unsaved-changes flow (Save all changes).
 */
import { addCustomStage, MAX_STAGES, normalizePlan, removeStage, updateStage, type ImplementationPlan } from '@/lib/quote/implementationPlan';
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

/**
 * A stage's name on its card. On the proposal page it's click-to-rename:
 * the rename changes the stage itself (so the chart's label follows) and is
 * an unsaved input change until "Save all changes". Elsewhere it's plain text.
 */
export function StageName({ plan, id, name }: { plan: ImplementationPlan; id: string; name: string }) {
  const w = useWhatIf();
  if (!w?.enabled) return <>{name}</>;
  return (
    <span
      // Remount when the name changes so the edited text and React never disagree.
      key={name}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Rename stage ${name}`}
      title="Click to rename this stage (an unsaved change until you save)"
      className="rounded-sm outline-none hover:bg-teton-pale-yellow/60 focus:bg-teton-pale-yellow/60 focus:ring-2 focus:ring-brand-accent/60"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
        if (e.key === 'Escape') {
          (e.currentTarget as HTMLElement).textContent = name;
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\s+/g, ' '));
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (!next) {
          e.currentTarget.textContent = name;
          return;
        }
        if (next !== name) w.setChange('implementationPlan', updateStage(plan, id, { name: next }));
      }}
    >
      {name}
    </span>
  );
}

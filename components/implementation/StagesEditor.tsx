'use client';

/**
 * Edit an implementation plan's stages: length, overlap with the stage
 * before, order, removal, and custom stages (name and proposal description).
 * Removed standard stages can be added back. Used on the deal page and in the
 * proposal's inputs panel.
 */
import { useEffect, useRef, useState } from 'react';
import {
  addCustomStage,
  MAX_STAGES,
  moveStage,
  normalizePlan,
  removedStandardStages,
  removeStage,
  restoreStage,
  scheduleFor,
  STAGE_BY_KEY,
  updateStage,
  weekLabel,
  type ImplementationPlan,
  type StageKey,
} from '@/lib/quote/implementationPlan';
import { NumInput } from '@/components/form/NumInput';
import { stageColor } from './ImplementationGantt';

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink disabled:opacity-30 disabled:hover:bg-transparent';

export function StagesEditor({ plan: rawPlan, onChange, compact = false }: { plan: ImplementationPlan; onChange: (p: ImplementationPlan) => void; compact?: boolean }) {
  const plan = normalizePlan(rawPlan);
  const sched = scheduleFor('2027-01-04', plan); // for week labels only; independent of the date
  const removed = removedStandardStages(plan);
  const [focusId, setFocusId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // A stage that just appeared (added here, or from the proposal's "Add a stage" card): put the cursor in its name.
  const prevIds = useRef<string[] | null>(null);
  const ids = plan.order.join(',');
  useEffect(() => {
    const now = ids.split(',');
    const isCustom = (id: string) => !(id in STAGE_BY_KEY);
    const fresh =
      prevIds.current === null
        ? now.find((id) => isCustom(id) && plan.stages[id]?.name === 'New stage')
        : now.find((id) => isCustom(id) && !prevIds.current!.includes(id));
    prevIds.current = now;
    if (fresh) setFocusId(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  useEffect(() => {
    if (!focusId) return;
    const el = rootRef.current?.querySelector<HTMLInputElement>(`[data-stage="${focusId}"] input`);
    if (el) {
      el.focus();
      el.select();
      el.scrollIntoView({ block: 'nearest' });
    }
    setFocusId(null);
  }, [focusId]);

  return (
    <div ref={rootRef}>
      <ol className="divide-y divide-teton-off-white border-y border-teton-off-white">
        {plan.order.map((id, i) => {
          const s = plan.stages[id];
          const std = id in STAGE_BY_KEY ? STAGE_BY_KEY[id as StageKey] : null;
          const custom = !std;
          const changed = std && (std.weeks !== s.weeks || std.overlapWeeks !== s.overlapWeeks);
          const prev = i > 0 ? plan.stages[plan.order[i - 1]] : null;
          const label = s.name || 'Unnamed stage';
          // Text as typed (not tidied), so spaces survive while typing; tidied on blur.
          const typed = rawPlan.stages?.[id] ?? s;
          return (
            <li key={id} className={`py-2 ${compact ? 'space-y-1.5' : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5'}`} data-stage={id}>
              <div className="flex items-start gap-2 min-w-0">
                <span className="mt-[7px] inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: stageColor(id, plan.order) }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  {/* Every stage can be renamed; custom stages also get a description for the proposal. */}
                  <input
                    className="input-field py-1 px-2 text-sm font-medium"
                    value={typed.name}
                    placeholder={std ? std.name : 'Stage name'}
                    aria-label={`Stage ${i + 1} name`}
                    onChange={(e) => onChange({ ...plan, stages: { ...plan.stages, [id]: { ...s, description: typed.description, name: e.target.value } } })}
                    onBlur={() => onChange(updateStage(plan, id, {}))}
                  />
                  {custom && (
                    <input
                      className="input-field py-1 px-2 text-xs mt-1"
                      value={typed.description}
                      placeholder="What happens in this stage (shown on the proposal)"
                      aria-label={`${label} description`}
                      onChange={(e) => onChange({ ...plan, stages: { ...plan.stages, [id]: { ...s, name: typed.name, description: e.target.value } } })}
                      onBlur={() => onChange(updateStage(plan, id, {}))}
                    />
                  )}
                  {std && std.name !== s.name && <p className="hint mt-0.5">Standard name: {std.name}</p>}
                  {changed && <p className="hint mt-0">Standard: {std!.weeks} wk{std!.overlapWeeks ? `, ${std!.overlapWeeks} wk overlap` : ''}</p>}
                </div>
              </div>
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${compact ? 'pl-[18px]' : ''}`}>
                <label className="flex items-center gap-1.5 text-xs text-teton-ui-gray">
                  <NumInput className="w-14 text-right [&_input]:py-1 [&_input]:px-2" value={s.weeks} onChange={(v) => onChange(updateStage(plan, id, { weeks: v ?? 0 }))} min={0} max={52} aria-label={`${label} length in weeks`} />
                  wk
                </label>
                {i > 0 ? (
                  <label className="flex items-center gap-1.5 text-xs text-teton-ui-gray" title={`Starts this many weeks before ${prev!.name} ends`}>
                    <NumInput
                      className="w-12 text-right [&_input]:py-1 [&_input]:px-2"
                      value={s.overlapWeeks}
                      onChange={(v) => onChange(updateStage(plan, id, { overlapWeeks: v ?? 0 }))}
                      min={0}
                      max={prev!.weeks}
                      aria-label={`${label} overlap with ${prev!.name} in weeks`}
                    />
                    wk overlap
                  </label>
                ) : (
                  <span className="text-xs text-teton-light-gray w-[5.5rem]">first stage</span>
                )}
                <span className="text-xs text-teton-dark-gray whitespace-nowrap min-w-[9.5rem]">{weekLabel(sched.stages[i])}</span>
                <span className="flex items-center">
                  <button type="button" className={iconBtn} disabled={i === 0} onClick={() => onChange(moveStage(plan, id, -1))} aria-label={`Move ${label} earlier`} title="Move earlier">
                    ↑
                  </button>
                  <button type="button" className={iconBtn} disabled={i === plan.order.length - 1} onClick={() => onChange(moveStage(plan, id, 1))} aria-label={`Move ${label} later`} title="Move later">
                    ↓
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    disabled={plan.order.length <= 1}
                    onClick={() => onChange(removeStage(plan, id))}
                    aria-label={`Remove ${label}`}
                    title={custom ? 'Remove this stage' : 'Remove this stage (you can add it back)'}
                  >
                    ✕
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <button
          type="button"
          className="btn-secondary py-1 text-xs"
          disabled={plan.order.length >= MAX_STAGES}
          onClick={() => {
            onChange(addCustomStage(plan).plan);
          }}
        >
          + Add custom stage
        </button>
        {removed.length > 0 && <span className="text-xs text-teton-ui-gray">Add back:</span>}
        {removed.map((s) => (
          <button key={s.key} type="button" className="badge-gray hover:bg-teton-pale-gray" onClick={() => onChange(restoreStage(plan, s.key))} title="Add this stage back in its standard place">
            + {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

'use client';

/**
 * The implementation plan on phones: the answer first (weeks to go-live, start-by date, one timeline bar, the
 * warning), then one plain row per stage. Tapping a stage opens it in a bottom sheet (name, length and overlap
 * steppers, description, earlier / later / remove); moving and removing many stages lives in Reorder mode.
 */
import { useState } from 'react';
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
import { Collapse } from '@/components/form/fields';
import { SwipeSheet } from '@/components/form/SwipeSheet';
import { NumInput } from '@/components/form/NumInput';
import { stageColor } from './ImplementationGantt';

export interface PlanStatus {
  total: number;
  /** "Sep 28, 2026" / "Feb 1, 2027", when there's a pilot go-live. */
  startBy: string | null;
  goLive: string | null;
  /** The start-by date has passed: the warning text and where to fix it. */
  late: null | { text: React.ReactNode; onGoToCommunities: () => void };
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function StagesMobile({ plan: rawPlan, onChange, status }: { plan: ImplementationPlan; onChange: (p: ImplementationPlan) => void; status: PlanStatus }) {
  const plan = normalizePlan(rawPlan);
  const sched = scheduleFor('2027-01-04', plan);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [reorder, setReorder] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const removed = removedStandardStages(plan);
  const lo = Math.min(...sched.stages.map((s) => s.fromWeek));
  const hi = Math.max(...sched.stages.map((s) => s.toWeek));
  const span = Math.max(1, hi - lo + 1);
  const open = (id: string) => (setOpenId(id), setLastId(id));
  const shownId = openId ?? lastId;
  const i = shownId ? plan.order.indexOf(shownId) : -1;

  return (
    <div className="-mx-4 -my-4">
      {/* The answer first */}
      <div className="px-4 pt-3.5 pb-3">
        <p className="flex items-baseline gap-1.5">
          <b className="text-[22px] font-bold tabular-nums">{plural(status.total, 'week')}</b>
          <span className="text-[12.5px] text-[#6B7380]">contract to go-live</span>
        </p>
        {status.startBy && (
          <p className="text-[12px] text-[#6B7380] mt-0.5">
            Start by <b className="text-teton-ink">{status.startBy}</b>
            {status.goLive && <> for a {status.goLive} pilot go-live</>}
          </p>
        )}
        <div className="relative h-[30px] mt-3 rounded-[7px] bg-[#F3F0EA] overflow-hidden" aria-hidden="true">
          {sched.stages.map((s) => (
            <i key={s.id} className="absolute top-[5px] h-5 rounded-[5px]" style={{ left: `${((s.fromWeek - lo) / span) * 100}%`, width: `${Math.max(2, (s.weeks / span) * 100)}%`, background: stageColor(s.id, plan.order) }} />
          ))}
        </div>
        <div className="flex justify-between text-[10.5px] text-[#8A919C] mt-1">
          <span>Contract</span>
          <span>Kick-off · wk 1</span>
          <span>Go-live</span>
        </div>
      </div>
      {status.late && (
        <div className="mx-4 rounded-[10px] bg-[#FBF0D9] text-[#7A4F0E] text-[12px] leading-snug">
          <button type="button" onClick={() => setFixOpen(!fixOpen)} aria-expanded={fixOpen} className="w-full flex items-center gap-2 px-3 py-2.5 text-left min-h-[44px]">
            <span aria-hidden="true">⚠</span>
            <span className="flex-1">Too tight: the start date has passed.</span>
            <b className="whitespace-nowrap">Fix <span className={`inline-block transition-transform duration-300 motion-reduce:transition-none ${fixOpen ? 'rotate-90' : ''}`}>›</span></b>
          </button>
          <Collapse open={fixOpen}>
            <div className="px-3 pb-3">
              <p>{status.late.text}</p>
              <button type="button" onClick={status.late.onGoToCommunities} className="mt-2 h-9 rounded-[9px] bg-white border border-[#E4D6B5] px-3 font-semibold text-teton-ink">
                Change the go-live in Communities
              </button>
            </div>
          </Collapse>
        </div>
      )}

      {/* The stages */}
      <div className="flex items-center justify-between px-4 pt-4 pb-1.5">
        <p className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C]">{reorder ? 'Reorder stages' : plural(plan.order.length, 'stage')}</p>
        <button type="button" onClick={() => setReorder(!reorder)} className="h-9 -mr-2 px-2 text-[13px] font-semibold text-[#2F78C8]">
          {reorder ? 'Done' : 'Reorder'}
        </button>
      </div>
      <ol>
        {plan.order.map((id, k) => {
          const s = plan.stages[id];
          const std = id in STAGE_BY_KEY ? STAGE_BY_KEY[id as StageKey] : null;
          const changed = std && (std.weeks !== s.weeks || std.overlapWeeks !== s.overlapWeeks);
          const label = s.name || 'Unnamed stage';
          const dot = <span className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: stageColor(id, plan.order) }} aria-hidden="true" />;
          if (reorder)
            return (
              <li key={id} className="flex items-center gap-2.5 px-4 min-h-[60px] border-t border-[#F1EEE7]">
                {dot}
                <b className="flex-1 min-w-0 text-[14px] font-semibold leading-snug">{label}</b>
                <button type="button" disabled={k === 0} onClick={() => onChange(moveStage(plan, id, -1))} aria-label={`Move ${label} earlier`} className="w-10 h-10 rounded-[10px] border border-[#E4E0D6] grid place-items-center disabled:opacity-30">↑</button>
                <button type="button" disabled={k === plan.order.length - 1} onClick={() => onChange(moveStage(plan, id, 1))} aria-label={`Move ${label} later`} className="w-10 h-10 rounded-[10px] border border-[#E4E0D6] grid place-items-center disabled:opacity-30">↓</button>
                <button type="button" disabled={plan.order.length <= 1} onClick={() => onChange(removeStage(plan, id))} aria-label={`Remove ${label}`} className="w-10 h-10 rounded-[10px] grid place-items-center text-[#B4442C] disabled:opacity-30">✕</button>
              </li>
            );
          return (
            <li key={id}>
              <button type="button" onClick={() => open(id)} className="w-full flex items-center gap-3 px-4 min-h-[60px] py-2 border-t border-[#F1EEE7] text-left active:bg-[#FBFAF7]">
                {dot}
                <span className="flex-1 min-w-0">
                  <b className="block text-[14px] font-semibold leading-snug">
                    {label}
                    {changed && <span className="ml-1.5 align-[1px] rounded-[5px] bg-[#FBF0D9] px-1.5 py-px text-[10px] font-bold text-[#9A6512]">CHANGED</span>}
                  </b>
                  <small className="block text-[12px] text-[#8A919C] mt-0.5">
                    {weekLabel(sched.stages[k])}
                    {k > 0 && s.overlapWeeks > 0 && ` · ${s.overlapWeeks} wk overlap`}
                    {changed && ` · standard ${std!.weeks}`}
                  </small>
                </span>
                <span className="text-[13px] font-semibold tabular-nums text-[#3F4753]">{s.weeks} wk</span>
                <span className="text-[18px] text-[#B4AFA6]" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ol>
      {!reorder && (
        <button type="button" disabled={plan.order.length >= MAX_STAGES && !removed.length} onClick={() => setAdding(true)} className="w-full h-12 border-t border-[#F1EEE7] text-[14px] font-semibold text-[#2F78C8] disabled:opacity-40">
          ＋ Add a stage
        </button>
      )}

      {/* One stage, in a bottom sheet */}
      <SwipeSheet open={!!openId} onClose={() => setOpenId(null)} eyebrow={i >= 0 ? `Stage ${i + 1} of ${plan.order.length} · ${weekLabel(sched.stages[i])}` : ''} title={i >= 0 ? plan.stages[shownId!].name || 'Unnamed stage' : ''}>
        {i >= 0 && <StageForm plan={plan} rawPlan={rawPlan} id={shownId!} index={i} onChange={onChange} onClose={() => setOpenId(null)} />}
      </SwipeSheet>

      {/* Add a stage: a custom one, or a standard one back */}
      <SwipeSheet open={adding} onClose={() => setAdding(false)} title="Add a stage">
        <div className="space-y-2 pb-2">
          <button
            type="button"
            disabled={plan.order.length >= MAX_STAGES}
            onClick={() => {
              const r = addCustomStage(plan);
              onChange(r.plan);
              setAdding(false);
              open(r.id);
            }}
            className="w-full flex items-center gap-3 rounded-[12px] border border-[#E4E0D6] px-3.5 min-h-[52px] text-left disabled:opacity-40"
          >
            <span className="text-[18px]" aria-hidden="true">＋</span>
            <span><b className="block text-[14px]">Custom stage</b><small className="text-[12px] text-[#8A919C]">Your own name, length and description</small></span>
          </button>
          {removed.map((s) => (
            <button key={s.key} type="button" onClick={() => (onChange(restoreStage(plan, s.key)), setAdding(false))} className="w-full flex items-center gap-3 rounded-[12px] border border-[#E4E0D6] px-3.5 min-h-[52px] text-left">
              <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: stageColor(s.key, plan.order) }} aria-hidden="true" />
              <span><b className="block text-[14px]">{s.name}</b><small className="text-[12px] text-[#8A919C]">Standard stage · back in its usual place</small></span>
            </button>
          ))}
        </div>
      </SwipeSheet>
    </div>
  );
}

/** − [ n ] + for weeks. */
function Stepper({ value, onChange, min, max, label, unit }: { value: number; onChange: (n: number) => void; min: number; max: number; label: string; unit: string }) {
  const btn = 'w-11 h-full grid place-items-center text-[20px] text-[#3F4753] disabled:opacity-30';
  return (
    <div className="h-[46px] rounded-[11px] border border-[#DAD6CE] grid grid-cols-[44px_1fr_44px] items-center">
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Fewer ${label}`}>−</button>
      <div className="text-center leading-none">
        <NumInput value={value} onChange={(v) => onChange(Math.min(max, Math.max(min, v ?? 0)))} min={min} max={max} aria-label={label} className="[&_input]:border-0 [&_input]:bg-transparent [&_input]:text-center [&_input]:font-semibold [&_input]:py-0 [&_input]:h-6 [&_input]:shadow-none [&_input]:ring-0" />
        <small className="block text-[11px] text-[#8A919C]">{unit}</small>
      </div>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} aria-label={`More ${label}`}>＋</button>
    </div>
  );
}

function StageForm({ plan, rawPlan, id, index, onChange, onClose }: { plan: ImplementationPlan; rawPlan: ImplementationPlan; id: string; index: number; onChange: (p: ImplementationPlan) => void; onClose: () => void }) {
  const s = plan.stages[id];
  const typed = rawPlan.stages?.[id] ?? s;
  const std = id in STAGE_BY_KEY ? STAGE_BY_KEY[id as StageKey] : null;
  const prev = index > 0 ? plan.stages[plan.order[index - 1]] : null;
  const label = 'text-[12px] font-medium text-[#6B7380] mb-1.5 block';
  const btn = 'flex-1 h-[46px] rounded-[12px] border border-[#DAD6CE] bg-white text-[14px] font-semibold disabled:opacity-30';
  return (
    <div className="space-y-3.5 pb-1">
      <div>
        <label className={label} htmlFor={`m-stage-${id}`}>Name</label>
        <input
          id={`m-stage-${id}`}
          className="input-field h-[46px] text-[15px]"
          value={typed.name}
          placeholder={std ? std.name : 'Stage name'}
          onChange={(e) => onChange({ ...plan, stages: { ...plan.stages, [id]: { ...s, description: typed.description, name: e.target.value } } })}
          onBlur={() => onChange(updateStage(plan, id, {}))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className={label}>Length</span>
          <Stepper value={s.weeks} min={0} max={52} label="weeks" unit={s.weeks === 1 ? 'week' : 'weeks'} onChange={(n) => onChange(updateStage(plan, id, { weeks: n }))} />
        </div>
        {prev ? (
          <div>
            <span className={`${label} truncate`}>Overlap with {prev.name}</span>
            <Stepper value={s.overlapWeeks} min={0} max={prev.weeks} label="overlap weeks" unit={s.overlapWeeks === 1 ? 'week' : 'weeks'} onChange={(n) => onChange(updateStage(plan, id, { overlapWeeks: n }))} />
          </div>
        ) : (
          <p className="self-end pb-3 text-[12px] text-[#8A919C]">The first stage: the plan starts here.</p>
        )}
      </div>
      {std && <p className="-mt-2 text-[11.5px] text-[#8A919C]">Standard: {plural(std.weeks, 'week')}{std.overlapWeeks ? `, ${plural(std.overlapWeeks, 'week')} overlap` : ''}</p>}
      <div>
        <label className={label} htmlFor={`m-stage-${id}-d`}>Description on the proposal</label>
        <textarea
          id={`m-stage-${id}-d`}
          rows={3}
          className="input-field text-[14px] leading-snug resize-y"
          value={typed.description}
          placeholder="What happens in this stage"
          onChange={(e) => onChange({ ...plan, stages: { ...plan.stages, [id]: { ...s, name: typed.name, description: e.target.value } } })}
          onBlur={() => onChange(updateStage(plan, id, {}))}
        />
      </div>
      <div className="flex gap-2.5">
        <button type="button" className={btn} disabled={index === 0} onClick={() => onChange(moveStage(plan, id, -1))}>↑ Earlier</button>
        <button type="button" className={btn} disabled={index === plan.order.length - 1} onClick={() => onChange(moveStage(plan, id, 1))}>↓ Later</button>
        <button
          type="button"
          className={`${btn} text-[#B4442C]`}
          disabled={plan.order.length <= 1}
          onClick={() => {
            onClose();
            onChange(removeStage(plan, id));
          }}
        >
          Remove
        </button>
      </div>
      <button type="button" onClick={onClose} className="w-full h-[46px] rounded-[12px] bg-teton-ink text-white text-[14px] font-semibold">Done</button>
    </div>
  );
}

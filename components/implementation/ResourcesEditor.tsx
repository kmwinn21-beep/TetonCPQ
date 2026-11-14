'use client';

/**
 * Edit the customer's estimated resource allocation: one card per role
 * (chosen from the defaults or typed in, never twice), the implementation
 * stages it works in, and hours plus a short note per stage. Used on the deal
 * page and in the proposal's inputs panel.
 */
import { useEffect, useRef, useState } from 'react';
import { normalizePlan, type ImplementationPlan } from '@/lib/quote/implementationPlan';
import {
  addRole,
  allocationTable,
  availableRoles,
  fmtHours,
  moveRole,
  normalizeResources,
  removeRole,
  roleTaken,
  setEffort,
  toggleStage,
  updateRole,
  type Resources,
} from '@/lib/quote/resources';
import { NumInput } from '@/components/form/NumInput';
import { stageColor } from './ImplementationGantt';

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink disabled:opacity-30 disabled:hover:bg-transparent';
const CUSTOM = '__custom__';

export function ResourcesEditor({
  resources: raw,
  plan: planInput,
  onChange,
  compact = false,
}: {
  resources: Resources;
  plan: ImplementationPlan;
  onChange: (r: Resources) => void;
  compact?: boolean;
}) {
  const rs = normalizeResources(raw);
  const plan = normalizePlan(planInput);
  const totals = allocationTable(rs, plan);
  const [typing, setTyping] = useState<Record<string, string>>({}); // custom role names being typed, by card
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    rootRef.current?.querySelector<HTMLElement>(`[data-role-card="${focus}"] select, [data-role-card="${focus}"] input`)?.focus();
    setFocus(null);
  }, [focus]);

  const safe = (fn: () => Resources, id: string) => {
    try {
      onChange(fn());
      setError(null);
    } catch (e) {
      setError({ id, msg: e instanceof Error ? e.message : 'Not allowed' });
    }
  };

  return (
    <div ref={rootRef}>
      <ol className="space-y-2.5">
        {rs.map((r, i) => {
          const hours = totals.rows.find((x) => x.id === r.id)?.total ?? 0;
          const options = availableRoles(rs, r.id);
          const isTyping = r.id in typing;
          return (
            <li key={r.id} data-role-card={r.id} className="rounded-lg border border-teton-off-white px-3 py-2.5">
              <div className="flex flex-wrap items-end gap-2">
                <div className={compact ? 'flex-1 min-w-[12rem]' : 'w-72'}>
                  <span className="eyebrow">Title / department{r.custom ? ' · custom' : ''}</span>
                  {isTyping || (r.custom && r.role) ? (
                    <input
                      className="input-field py-1.5"
                      value={isTyping ? typing[r.id] : r.role}
                      placeholder="Type a role or department"
                      aria-label={`Role ${i + 1} name`}
                      autoFocus={isTyping}
                      onChange={(e) => setTyping((t) => ({ ...t, [r.id]: e.target.value }))}
                      onFocus={() => !isTyping && setTyping((t) => ({ ...t, [r.id]: r.role }))}
                      onBlur={() => {
                        const name = (typing[r.id] ?? '').replace(/\s+/g, ' ').trim();
                        // A duplicate keeps the box open with the typing, so it can be fixed.
                        if (name && roleTaken(rs, name, r.id)) {
                          setError({ id: r.id, msg: `${name} is already listed. Each role appears once; add stages to it instead.` });
                          return;
                        }
                        setTyping(({ [r.id]: _drop, ...rest }) => rest);
                        if (name) safe(() => updateRole(rs, r.id, { role: name, custom: true }), r.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        if (e.key === 'Escape') setTyping(({ [r.id]: _drop, ...rest }) => rest);
                      }}
                    />
                  ) : (
                    <select
                      className="input-field py-1.5"
                      value={r.role}
                      aria-label={`Role ${i + 1}`}
                      onChange={(e) => {
                        if (e.target.value === CUSTOM) setTyping((t) => ({ ...t, [r.id]: '' }));
                        else safe(() => updateRole(rs, r.id, { role: e.target.value, custom: false }), r.id);
                      }}
                    >
                      <option value="" disabled>
                        Choose a role…
                      </option>
                      {r.role && !options.includes(r.role as (typeof options)[number]) && <option value={r.role}>{r.role}</option>}
                      {options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                      <option value={CUSTOM}>+ Add custom role…</option>
                    </select>
                  )}
                </div>
                {r.custom && r.role && !isTyping && (
                  <button type="button" className="btn-ghost text-xs mb-1" onClick={() => safe(() => updateRole(rs, r.id, { role: '', custom: false }), r.id)}>
                    Pick from list
                  </button>
                )}
                <span className="ml-auto mb-1.5 text-sm font-semibold tabular-nums">{fmtHours(hours)}</span>
                <span className="flex items-center mb-0.5">
                  <button type="button" className={iconBtn} disabled={i === 0} onClick={() => onChange(moveRole(rs, r.id, -1))} aria-label={`Move ${r.role || 'role'} up`} title="Move up">
                    ↑
                  </button>
                  <button type="button" className={iconBtn} disabled={i === rs.length - 1} onClick={() => onChange(moveRole(rs, r.id, 1))} aria-label={`Move ${r.role || 'role'} down`} title="Move down">
                    ↓
                  </button>
                  <button type="button" className={iconBtn} onClick={() => onChange(removeRole(rs, r.id))} aria-label={`Remove ${r.role || 'role'}`} title="Remove this role">
                    ✕
                  </button>
                </span>
              </div>
              {error?.id === r.id && <p className="text-xs mt-1 rounded bg-teton-red/30 px-2 py-0.5">{error.msg}</p>}

              <div className="mt-2">
                <span className="eyebrow">Stages involved</span>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Stages for ${r.role || `role ${i + 1}`}`}>
                  {plan.order.map((sid) => {
                    const on = sid in r.stages;
                    return (
                      <button
                        key={sid}
                        type="button"
                        aria-pressed={on}
                        onClick={() => onChange(toggleStage(rs, r.id, sid))}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                          on ? 'border-teton-near-black bg-teton-near-black text-white' : 'border-teton-pale-gray bg-white text-teton-dark-gray hover:border-teton-light-gray'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-sm" style={{ background: stageColor(sid, plan.order) }} aria-hidden="true" />
                        {plan.stages[sid].name}
                        {on && <span aria-hidden="true">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {plan.order.some((sid) => sid in r.stages) && (
                <div className="mt-2 divide-y divide-teton-off-white border-t border-teton-off-white">
                  {plan.order
                    .filter((sid) => sid in r.stages)
                    .map((sid, k) => {
                      const e = r.stages[sid];
                      return (
                        <div key={sid} className={`py-2 grid gap-2 items-start ${compact ? 'grid-cols-[minmax(0,1fr)_5rem]' : 'grid-cols-[12rem_6rem_minmax(0,1fr)]'}`}>
                          <span className="flex items-center gap-2 pt-2 text-sm font-medium">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: stageColor(sid, plan.order) }} aria-hidden="true" />
                            {plan.stages[sid].name}
                          </span>
                          <div>
                            {k === 0 && !compact && <span className="eyebrow">Hours</span>}
                            <NumInput value={e.hours} onChange={(v) => onChange(setEffort(rs, r.id, sid, { hours: v ?? 0 }))} min={0} max={999} suffix="hrs" aria-label={`${r.role || 'Role'} hours in ${plan.stages[sid].name}`} />
                          </div>
                          <div className={compact ? 'col-span-2' : ''}>
                            {k === 0 && !compact && <span className="eyebrow">What they’ll do</span>}
                            <input
                              className="input-field py-1.5"
                              value={e.note}
                              placeholder="What this role does in this stage"
                              aria-label={`${r.role || 'Role'} note for ${plan.stages[sid].name}`}
                              onChange={(ev) => onChange(rs.map((x) => (x.id === r.id ? { ...x, stages: { ...x.stages, [sid]: { ...x.stages[sid], note: ev.target.value } } } : x)))}
                              onBlur={() => onChange(normalizeResources(rs))}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {rs.length === 0 && <p className="hint">No roles yet. Add the customer’s roles that take part in implementation, with their hours per stage.</p>}
      <div className="flex flex-wrap items-center gap-3 mt-2.5">
        <button
          type="button"
          className="btn-secondary py-1 text-xs"
          onClick={() => {
            const r = addRole(rs);
            setFocus(r.id);
            onChange(r.resources);
          }}
        >
          + Add role
        </button>
        {rs.length > 0 && (
          <span className="text-xs text-teton-ui-gray">
            {totals.rows.length} {totals.rows.length === 1 ? 'role' : 'roles'} · <b className="text-teton-ink">{fmtHours(totals.total)}</b> total
          </span>
        )}
      </div>
    </div>
  );
}

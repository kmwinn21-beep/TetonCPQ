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
import { canAutoFocus } from '@/lib/client/focus';
import { SwipeSheet, usePhone } from '@/components/form/SwipeSheet';

const iconBtn = 'w-7 h-7 flex items-center justify-center rounded-md text-teton-ui-gray hover:bg-teton-off-white hover:text-teton-ink disabled:opacity-30 disabled:hover:bg-transparent';
const CUSTOM = '__custom__';

export function ResourcesEditor({
  resources: raw,
  plan: planInput,
  onChange,
  compact = false,
  drawer = false,
}: {
  resources: Resources;
  plan: ImplementationPlan;
  onChange: (r: Resources) => void;
  compact?: boolean;
  /** Deal page: roles as table rows; a role opens in a drawer to edit. */
  drawer?: boolean;
}) {
  const rs = normalizeResources(raw);
  const plan = normalizePlan(planInput);
  const totals = allocationTable(rs, plan);
  const [typing, setTyping] = useState<Record<string, string>>({}); // custom role names being typed, by card
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    if (canAutoFocus()) rootRef.current?.querySelector<HTMLElement>(`[data-role-card="${focus}"] select, [data-role-card="${focus}"] input`)?.focus();
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

  const card = (r: (typeof rs)[number], i: number, inDrawer = false) => {
          const hours = totals.rows.find((x) => x.id === r.id)?.total ?? 0;
          const options = availableRoles(rs, r.id);
          const isTyping = r.id in typing;
          return (
            <li key={r.id} data-role-card={r.id} className={inDrawer ? "" : "rounded-lg border border-teton-off-white px-3 py-2.5"}>
              <div className="flex flex-wrap items-end gap-2">
                <div className={compact || inDrawer ? 'flex-1 min-w-[12rem]' : 'w-72'}>
                  <span className="eyebrow">Title / department{r.custom ? ' · custom' : ''}</span>
                  {isTyping || (r.custom && r.role) ? (
                    <input
                      className="input-field py-1.5"
                      value={isTyping ? typing[r.id] : r.role}
                      placeholder="Type a role or department"
                      aria-label={`Role ${i + 1} name`}
                      autoFocus={isTyping && canAutoFocus()}
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
                        <div key={sid} className={`py-2 grid gap-2 items-start ${compact || inDrawer ? 'grid-cols-[minmax(0,1fr)_5rem]' : 'grid-cols-[12rem_6rem_minmax(0,1fr)]'}`}>
                          <span className="flex items-center gap-2 pt-2 text-sm font-medium">
                            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: stageColor(sid, plan.order) }} aria-hidden="true" />
                            {plan.stages[sid].name}
                          </span>
                          <div>
                            {k === 0 && !compact && !inDrawer && <span className="eyebrow">Hours</span>}
                            <NumInput value={e.hours} onChange={(v) => onChange(setEffort(rs, r.id, sid, { hours: v ?? 0 }))} min={0} max={999} suffix="hrs" aria-label={`${r.role || 'Role'} hours in ${plan.stages[sid].name}`} />
                          </div>
                          <div className={compact || inDrawer ? 'col-span-2' : ''}>
                            {k === 0 && !compact && !inDrawer && <span className="eyebrow">What they’ll do</span>}
                            <input
                              className="input-field py-1.5"
                              // Show the note as typed (normalizing on each keystroke would eat the space before the next word).
                              value={(Array.isArray(raw) ? raw.find((x) => x.id === r.id)?.stages?.[sid]?.note : undefined) ?? e.note}
                              placeholder="What this role does in this stage"
                              aria-label={`${r.role || 'Role'} note for ${plan.stages[sid].name}`}
                              onChange={(ev) =>
                                onChange(
                                  (Array.isArray(raw) && raw.length ? raw : rs).map((x) =>
                                    x.id === r.id ? { ...x, stages: { ...x.stages, [sid]: { ...(x.stages?.[sid] ?? e), note: ev.target.value } } } : x,
                                  ),
                                )
                              }
                              onBlur={() => onChange(normalizeResources(raw))}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </li>
          );
          };

  return (
    <div ref={rootRef}>
      {drawer ? (
        <RoleTable rs={rs} plan={plan} totals={totals} onOpen={setOpenId} />
      ) : (
        <ol className="space-y-2.5">{rs.map((r, i) => card(r, i))}</ol>
      )}
      {drawer && (
        <RoleDrawer open={!!openId && rs.some((r) => r.id === openId)} onClose={() => setOpenId(null)} title={rs.find((r) => r.id === openId)?.role || 'New role'}>
          {(() => {
            const i = rs.findIndex((r) => r.id === openId);
            return i >= 0 ? <ol>{card(rs[i], i, true)}</ol> : null;
          })()}
        </RoleDrawer>
      )}
      {rs.length === 0 && <p className="hint">No roles yet. Add the customer’s roles that take part in implementation, with their hours per stage.</p>}
      <div className="flex flex-wrap items-center gap-3 mt-2.5">
        <button
          type="button"
          className="btn-secondary py-1 text-xs"
          onClick={() => {
            const r = addRole(rs);
            setFocus(r.id);
            onChange(r.resources);
            if (drawer) setOpenId(r.id);
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

/** Deal page: one row per role (hours, the stages it works in, its busiest stage); click to edit in the drawer. */
function RoleTable({ rs, plan, totals, onOpen }: { rs: Resources; plan: ReturnType<typeof normalizePlan>; totals: ReturnType<typeof allocationTable>; onOpen: (id: string) => void }) {
  if (!rs.length) return null;
  return (
    <div className="rounded-[14px] border border-[#ECE8DF] bg-white overflow-hidden">
      <div className="hidden sm:grid grid-cols-[30px_minmax(0,1.5fr)_64px_minmax(120px,1fr)_minmax(120px,1fr)] gap-3 items-center px-4 h-9 border-b border-[#ECE8DF] text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#8A919C]">
        <span /><span>Role</span><span className="text-right">Hours</span><span>Stages ({plan.order.length})</span><span>Busiest stage</span>
      </div>
      {rs.map((r) => {
        const row = totals.rows.find((x) => x.id === r.id);
        const busiest = row ? Object.entries(row.hours).sort((a, b) => b[1] - a[1])[0] : undefined;
        const initials = (r.role || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
        return (
          <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="w-full grid grid-cols-[30px_minmax(0,1fr)_56px] sm:grid-cols-[30px_minmax(0,1.5fr)_64px_minmax(120px,1fr)_minmax(120px,1fr)] gap-3 items-center px-4 py-2.5 border-b border-[#F1EEE7] last:border-b-0 text-left hover:bg-[#FBFAF7]">
            <span className="w-[28px] h-[28px] rounded-[8px] bg-[#E0F3F2] text-[#23847E] grid place-items-center text-[10px] font-bold" aria-hidden="true">{initials}</span>
            <span className="min-w-0">
              <b className="block truncate text-[13px] font-semibold">{r.role || 'Choose a role…'}</b>
              <small className="block truncate text-[11.5px] text-[#8A919C]">{row?.notes.find((n) => n.note)?.note || `${Object.keys(r.stages).length} stages`}</small>
            </span>
            <span className="text-right text-[13px] font-semibold tabular-nums">{row?.total ?? 0}</span>
            <span className="max-sm:hidden flex gap-[3px]" aria-label={`${Object.keys(r.stages).length} of ${plan.order.length} stages`}>
              {plan.order.map((sid) => (
                <i key={sid} title={plan.stages[sid].name} className="w-[10px] h-[10px] rounded-[3px]" style={{ background: sid in r.stages ? stageColor(sid, plan.order) : '#ECE8DF' }} />
              ))}
            </span>
            <span className="max-sm:hidden truncate text-[12px] text-[#6B7380]">{busiest ? plan.stages[busiest[0]]?.name : '—'}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The role editor drawer (a bottom sheet on phones); keeps its content while it slides out. */
function RoleDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const phone = usePhone();
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const last = useRef<React.ReactNode>(children);
  if (open) last.current = children;
  useEffect(() => {
    if (open) return setShown(true), setLeaving(false);
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => (setShown(false), setLeaving(false)), 200);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose]);
  if (phone)
    return (
      <SwipeSheet open={open} onClose={onClose} eyebrow="Resource allocation" title={title}>
        {last.current}
      </SwipeSheet>
    );
  if (!shown) return null;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`absolute inset-0 bg-[#1C1F24]/20 transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`} onClick={onClose} />
      <div className={`absolute right-0 top-0 h-full w-[440px] max-w-full bg-white border-l border-[#ECE8DF] shadow-xl flex flex-col ${leaving ? 'drawer-out' : 'drawer-in'}`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-[#F1EEE7]">
          <div>
            <span className="font-mono text-[11px] text-[#5A6270]">RESOURCE ALLOCATION</span>
            <p className="text-[17px] font-bold">{title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full bg-[#F1EEE8] text-[#5A6270] grid place-items-center hover:bg-[#E9E4DB]">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{last.current}</div>
        <div className="border-t border-[#ECE8DF] px-5 py-3 flex justify-end">
          <button type="button" onClick={onClose} className="h-9 rounded-[10px] bg-teton-ink px-4 text-[12.5px] font-semibold text-white">Done</button>
        </div>
      </div>
    </div>
  );
}

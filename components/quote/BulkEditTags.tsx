'use client';

/**
 * Edit many tagged rooms at once: one row per tag (room type, room number, notes), an "Apply to all" row for
 * the ticked rows, numbering in order, numbers from the plan, and removing tags. Nothing changes until Save.
 * Without Edit Scope only the notes can be changed (notes follow the usual rules: you edit your own).
 */
import { useMemo, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { badgeOf, type RoomMark, type RoomType } from '@/lib/quote/roomTypes';
import type { NumberMatch } from '@/lib/quote/roomNumbers';
import { AuthorPill } from './PlanNotes';
import { Badge } from './ScopeViewer';
import type { TagNotesApi } from './TagNotes';

export interface BulkRow {
  mark: RoomMark;
  typeId: string;
}
export interface BulkResult {
  /** Room type and number for each kept tag that changed. */
  marks: Array<{ id: string; from: string; typeId: string; label: string }>;
  remove: Array<{ id: string; typeId: string }>;
}

interface Row {
  id: string;
  mark: RoomMark;
  from: string;
  typeId: string;
  label: string;
  note: string;
  only: boolean;
  checked: boolean;
  /** A number from the plan to check (not filled in). */
  suggest?: string;
}

export function BulkEditTags({
  rows: input,
  types,
  notes,
  canScope,
  busy,
  onFromPlan,
  onHover,
  onSave,
  onClose,
}: {
  rows: BulkRow[];
  types: RoomType[];
  notes: TagNotesApi;
  canScope: boolean;
  /** Reading the plan (a message), or null. */
  busy: string | null;
  /** Numbers from the plan for these tags (reads the plan the first time). */
  onFromPlan: (ids: string[]) => Promise<Map<string, NumberMatch> | null>;
  onHover: (id: string | null) => void;
  onSave: (r: BulkResult) => Promise<void> | void;
  onClose: () => void;
}) {
  const mineOf = (id: string) => notes.of(id).find((n) => n.mine);
  const initial = useMemo(
    () =>
      input.map<Row>(({ mark, typeId }) => ({ id: mark.id, mark, from: typeId, typeId, label: mark.label ?? '', note: mineOf(mark.id)?.body ?? '', only: false, checked: true })),
    // Rows are fixed for the life of the panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [rows, setRows] = useState<Row[]>(initial);
  const [allType, setAllType] = useState('');
  const [from, setFrom] = useState('');
  const [step, setStep] = useState('1');
  const [allNote, setAllNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (id: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const ticked = rows.filter((r) => r.checked);
  const changed = (r: Row) => {
    const o = initial.find((x) => x.id === r.id)!;
    return r.typeId !== o.typeId || r.label.trim() !== o.label || r.note.trim() !== o.note.trim();
  };
  const changes = rows.filter(changed).length;
  const typeIndex = (id: string) => types.findIndex((t) => t.id === id);

  const fillNumbers = () => {
    const start = Number(from);
    const inc = Number(step) || 1;
    if (!Number.isFinite(start) || !from.trim()) return;
    const targets = ticked;
    if (targets.some((r) => r.label.trim()) && !window.confirm('Some ticked rooms already have a number. Replace them?')) return;
    const ids = new Map(targets.map((r, i) => [r.id, String(start + i * inc)]));
    setRows((rs) => rs.map((r) => (ids.has(r.id) ? { ...r, label: ids.get(r.id)!, suggest: undefined } : r)));
  };
  const fromPlan = async () => {
    setMsg(null);
    const want = ticked.filter((r) => !r.label.trim());
    if (!want.length) return setMsg('Every ticked room already has a number.');
    const m = await onFromPlan(want.map((r) => r.id));
    if (!m) return;
    let filled = 0;
    let check = 0;
    setRows((rs) =>
      rs.map((r) => {
        const x = m.get(r.id);
        if (!x || r.label.trim() || !r.checked) return r;
        if (x.sure) {
          filled++;
          return { ...r, label: x.t, suggest: undefined };
        }
        check++;
        return { ...r, suggest: x.t };
      }),
    );
    const none = want.length - m.size;
    setMsg(`${filled} filled from the plan${check ? ` · ${check} to check` : ''}${none ? ` · ${none} not found` : ''}`);
  };
  const save = async () => {
    setSaving(true);
    try {
      // Notes: changes to your own notes (for all the rooms on a note, or one room), then new notes, one per text.
      const done = new Set<number>();
      const fresh = new Map<string, string[]>();
      for (const r of rows) {
        const o = initial.find((x) => x.id === r.id)!;
        const body = r.note.trim();
        if (body === o.note.trim()) continue;
        const mine = mineOf(r.id);
        if (mine) {
          const only = r.only && mine.markIds.length > 1;
          if (!only && done.has(mine.id)) continue;
          if (!only) done.add(mine.id);
          await notes.update(mine.id, body, only ? r.id : undefined);
        } else if (body) fresh.set(body, [...(fresh.get(body) ?? []), r.id]);
      }
      for (const [body, ids] of fresh) await notes.create(ids, body);
      await onSave({
        marks: rows.filter((r) => r.typeId !== r.from || r.label.trim() !== (r.mark.label ?? '')).map((r) => ({ id: r.id, from: r.from, typeId: r.typeId, label: r.label.trim() })),
        remove: [],
      });
      onClose();
    } catch {
      setMsg(notes.error ?? 'Couldn’t save every change');
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${ticked.length} tagged room${ticked.length === 1 ? '' : 's'} from the plan?`)) return;
    await onSave({ marks: [], remove: ticked.map((r) => ({ id: r.id, typeId: r.from })) });
    onClose();
  };

  const cell = 'input-field py-1 text-xs disabled:opacity-60';
  return (
    <div className="fixed sm:absolute inset-x-0 bottom-0 z-[70] sm:z-30 flex max-h-[85dvh] sm:max-h-[68%] flex-col rounded-t-xl border-t border-teton-off-white bg-white shadow-[0_-12px_36px_rgba(0,0,0,.18)] drawer-in" role="dialog" aria-label="Edit tags" data-plan-ui onPointerDown={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 border-b border-teton-off-white">
        <p className="font-semibold text-sm">Edit {rows.length} tag{rows.length === 1 ? '' : 's'}</p>
        {!canScope && <span className="text-[11px] text-teton-ui-gray">🔒 Notes only: room types and numbers need Edit Scope</span>}
        <button type="button" className="ml-auto text-teton-ui-gray hover:text-teton-ink" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="overflow-y-auto">
        {/* Apply to the ticked rows */}
        <div className="grid gap-2 px-3 sm:px-4 py-2.5 bg-[#F3F7FD] border-b border-[#D6E4F7] text-xs sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.4fr)] items-center">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#1F5FB5]">Apply to {ticked.length}</span>
          <div className="flex gap-1.5">
            <select className={cell} value={allType} disabled={!canScope} onChange={(e) => setAllType(e.target.value)} aria-label="Room type for all ticked rooms">
              <option value="">Room type…</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'}</option>)}
            </select>
            <button type="button" className="btn-secondary py-1 text-xs disabled:opacity-40" disabled={!allType || !canScope} onClick={() => setRows((rs) => rs.map((r) => (r.checked ? { ...r, typeId: allType } : r)))}>Set</button>
          </div>
          <div className="flex gap-1.5 items-center">
            <input className={`${cell} w-16`} inputMode="numeric" placeholder="From" value={from} disabled={!canScope} onChange={(e) => setFrom(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-label="Number from" />
            <span className="text-teton-ui-gray">step</span>
            <input className={`${cell} w-12`} inputMode="numeric" value={step} disabled={!canScope} onChange={(e) => setStep(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Step" />
            <button type="button" className="btn-secondary py-1 text-xs disabled:opacity-40" disabled={!from || !canScope} onClick={fillNumbers}>Number</button>
          </div>
          <div className="flex gap-1.5">
            <input className={cell} placeholder="Note for every ticked room…" value={allNote} maxLength={2000} onChange={(e) => setAllNote(e.target.value)} aria-label="Note for all ticked rooms" />
            <button
              type="button"
              className="btn-secondary py-1 text-xs disabled:opacity-40"
              disabled={!allNote.trim()}
              onClick={() => {
                setRows((rs) => rs.map((r) => (r.checked && !r.note.trim() ? { ...r, note: allNote.trim() } : r)));
                setAllNote('');
              }}
              title="Adds it to ticked rooms without a note of yours"
            >
              Add
            </button>
          </div>
          <div className="sm:col-span-4 flex flex-wrap items-center gap-2">
            <button type="button" className="rounded-md bg-[#3F8CEA] px-2.5 py-1 font-medium text-white hover:brightness-110 disabled:opacity-50" disabled={!canScope || !!busy} onClick={() => void fromPlan()}>
              {busy ?? 'Fill numbers from plan'}
            </button>
            {msg && <span className="text-[11.5px] text-teton-dark-gray drawer-in">{msg}</span>}
          </div>
        </div>

        <div className="hidden sm:grid grid-cols-[1.25rem_1.75rem_11rem_8.5rem_minmax(0,1fr)] gap-2.5 px-4 py-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-teton-ui-gray border-b border-teton-off-white">
          <span /> <span>Tag</span> <span>Room type</span> <span>Room number</span> <span>Notes</span>
        </div>
        <ul>
          {rows.map((r) => {
            const k = typeIndex(r.typeId);
            const b = badgeOf(types[k] ?? { name: '' }, Math.max(0, k));
            const ob = badgeOf(types[typeIndex(r.from)] ?? { name: '' }, Math.max(0, typeIndex(r.from)));
            const o = initial.find((x) => x.id === r.id)!;
            const mine = mineOf(r.id);
            const theirs = notes.of(r.id).filter((n) => !n.mine);
            const noteChanged = r.note.trim() !== o.note.trim();
            return (
              <li
                key={r.id}
                className={`grid grid-cols-[1.25rem_1.75rem_minmax(0,1fr)_6.5rem] sm:grid-cols-[1.25rem_1.75rem_11rem_8.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 items-start px-3 sm:px-4 py-2 border-b border-teton-off-white transition-opacity duration-200 hover:bg-teton-almost-white ${r.checked ? '' : 'opacity-45'}`}
                onPointerEnter={() => onHover(r.id)}
                onPointerLeave={() => onHover(null)}
              >
                <input type="checkbox" className="mt-2 accent-teton-near-black" checked={r.checked} onChange={(e) => set(r.id, { checked: e.target.checked })} aria-label={`Include ${r.mark.label ? `room ${r.mark.label}` : 'this room'}`} />
                <span className="mt-1"><Badge color={ob.color} text={ob.initials} size={22} /></span>
                <select className={`${cell} ${r.typeId !== o.typeId ? 'border-[#3F8CEA] bg-[#F5F9FF]' : ''}`} value={r.typeId} disabled={!canScope} onChange={(e) => set(r.id, { typeId: e.target.value })} aria-label="Room type">
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'}</option>)}
                </select>
                <div>
                  <span className="flex items-center gap-1">
                    {r.typeId !== o.typeId && <Badge color={b.color} text={b.initials} size={16} />}
                    <input className={`${cell} ${r.label.trim() !== o.label ? 'border-[#3F8CEA] bg-[#F5F9FF]' : ''}`} value={r.label} placeholder="e.g. 143" maxLength={16} disabled={!canScope} onChange={(e) => set(r.id, { label: e.target.value, suggest: undefined })} aria-label="Room number" />
                  </span>
                  {r.suggest && !r.label.trim() && (
                    <button type="button" className="mt-1 rounded-full bg-[#FFF1DC] px-2 py-px text-[10.5px] font-semibold text-[#8A5A00] drawer-in" onClick={() => set(r.id, { label: r.suggest!, suggest: undefined })} title="Read from the plan, but not certain: click to use it">
                      Check · {r.suggest}?
                    </button>
                  )}
                </div>
                <div className="col-span-4 sm:col-span-1 space-y-1">
                  {theirs.map((n) => (
                    <p key={n.id} className="flex items-start gap-1.5 text-[11.5px] text-teton-dark-gray">
                      <AuthorPill person={n.author} />
                      <span className="min-w-0 break-words">{n.body}</span>
                    </p>
                  ))}
                  <span className="flex items-center gap-1.5">
                    <input className={`${cell} ${noteChanged ? 'border-[#3F8CEA] bg-[#F5F9FF]' : ''}`} value={r.note} placeholder={theirs.length ? 'Add your note…' : 'Add a note…'} maxLength={2000} onChange={(e) => set(r.id, { note: e.target.value })} aria-label="Your note" />
                    {mine && mine.markIds.length > 1 && <span className="shrink-0 rounded-full bg-[#FFF1CC] px-1.5 text-[10px] font-bold text-[#8A6A12]">Shared · {mine.markIds.length}</span>}
                  </span>
                  {mine && mine.markIds.length > 1 && noteChanged && (
                    <SegGroup label="Apply the note change to" thumbClass="bg-white" className="grid grid-cols-2 rounded-lg bg-teton-off-white p-0.5 text-[11px] max-w-[18rem] drawer-in">
                      <button type="button" role="radio" aria-checked={!r.only} className={`py-0.5 ${!r.only ? 'font-semibold text-teton-ink' : 'text-teton-ui-gray'}`} onClick={() => set(r.id, { only: false })}>All {mine.markIds.length}</button>
                      <button type="button" role="radio" aria-checked={r.only} className={`py-0.5 ${r.only ? 'font-semibold text-teton-ink' : 'text-teton-ui-gray'}`} onClick={() => set(r.id, { only: true })}>Only this room</button>
                    </SegGroup>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2 px-3 sm:px-4 py-2.5 border-t border-teton-off-white bg-teton-almost-white">
        <span className="text-xs text-teton-ui-gray mr-auto w-full sm:w-auto">{ticked.length} of {rows.length} ticked · {changes} change{changes === 1 ? '' : 's'}</span>
        {canScope && (
          <button type="button" className="btn-secondary py-1 text-xs text-[#B23A26] disabled:opacity-40" disabled={!ticked.length || saving} onClick={() => void remove()}>
            Remove {ticked.length} tag{ticked.length === 1 ? '' : 's'}
          </button>
        )}
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary py-1 text-xs disabled:opacity-40" disabled={!changes || saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  );
}

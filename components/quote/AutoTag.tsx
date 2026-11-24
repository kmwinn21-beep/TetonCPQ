'use client';

/**
 * Auto-tag's review: the numbers found in the box, drawn on the plan as draft tags (click one to leave it out),
 * and a panel that says what each group (by fill color) becomes: a new room type (named from the legend when the
 * plan has one), an existing one, or nothing. Nothing is saved until "Place tags".
 */
import type { AutoFound, RGB } from '@/lib/quote/autoTag';
import { CARE_LABEL, type CareType, type RoomType } from '@/lib/quote/roomTypes';
import { count } from '@/lib/format';

export interface AutoGroupPick {
  key: string;
  color: RGB | null;
  name: string | null;
  /** A room type's id, 'new' or 'skip'. */
  target: string;
  newName: string;
  care: CareType;
}
export interface AutoState {
  page: number;
  busy: string | null;
  items: Array<AutoFound & { off?: boolean }>;
  groups: AutoGroupPick[];
  skipped: string[];
  /** The numbers came from the PDF's text (exact) rather than reading the picture. */
  exact: boolean;
}

const rgb = (c: RGB | null) => (c ? `rgb(${c[0]},${c[1]},${c[2]})` : 'transparent');
const CARES: CareType[] = ['al', 'mc', 'il', 'snf'];

/** A number found, on the plan, before placing. */
export function AutoDraftMarker({ item, color, onToggle }: { item: AutoState['items'][number]; color: RGB | null; onToggle: () => void }) {
  return (
    <button
      type="button"
      data-plan-ui
      onClick={onToggle}
      title={item.off ? `Room ${item.t}: left out (click to include)` : `Room ${item.t}${item.sure ? '' : ' (check the number)'}: click to leave it out`}
      aria-pressed={!item.off}
      className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-0.5 rounded-md border-[1.5px] px-1 text-[10px] font-bold leading-[15px] shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-opacity duration-200 motion-reduce:transition-none drawer-in ${item.off ? 'opacity-35 line-through' : ''} ${item.sure ? 'bg-white text-teton-ink' : 'bg-[#FFF4DB] text-[#7A4E00] border-[#D9902A]'}`}
      style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, ...(item.sure ? { borderColor: color ? rgb(color) : '#3F8CEA' } : {}) }}
    >
      {!item.sure && <span aria-hidden="true">?</span>}
      {item.t}
    </button>
  );
}

export function AutoTagPanel({ state, types, onChange, onPlace, onCancel }: { state: AutoState; types: RoomType[]; onChange: (s: AutoState) => void; onPlace: () => void; onCancel: () => void }) {
  const live = state.items.filter((i) => !i.off);
  const sure = live.filter((i) => i.sure).length;
  const countOf = (key: string) => live.filter((i) => i.group === key).length;
  const placing = state.groups.filter((g) => g.target !== 'skip').reduce((n, g) => n + countOf(g.key), 0);
  const missingName = state.groups.some((g) => g.target === 'new' && countOf(g.key) > 0 && !g.newName.trim());
  const set = (key: string, patch: Partial<AutoGroupPick>) => onChange({ ...state, groups: state.groups.map((g) => (g.key === key ? { ...g, ...patch } : g)) });
  const multi = state.groups.length > 1;

  return (
    <div className="w-[min(380px,calc(100vw-1.5rem))] max-h-[min(70vh,560px)] overflow-auto rounded-xl bg-white text-teton-ink shadow-2xl border border-teton-off-white p-3.5 text-xs drawer-in" role="dialog" aria-label="Auto-tag">
      <p className="text-[9.5px] font-bold uppercase tracking-[.14em] text-teton-ui-gray">Auto-tag · selected area</p>
      {state.busy ? (
        <p className="mt-2 flex items-center gap-2 text-sm"><span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-[#3F8CEA] border-t-transparent animate-spin motion-reduce:animate-none" aria-hidden="true" />{state.busy}</p>
      ) : !state.items.length ? (
        <>
          <p className="mt-1.5 text-sm font-semibold">No untagged room numbers in that area</p>
          <p className="mt-1 text-teton-ui-gray">Try a bigger box, or click rooms to tag them. Rooms already tagged are left alone.</p>
          <div className="mt-3 flex justify-end"><button type="button" className="btn-secondary py-1 text-xs" onClick={onCancel}>Close</button></div>
        </>
      ) : (
        <>
          <p className="mt-1 text-lg font-bold">{count(live.length)} room{live.length === 1 ? '' : 's'} found</p>
          <p className="text-teton-ui-gray">{state.exact ? 'Read from the PDF’s own text: every number exact.' : 'Read from the picture of the plan.'} Click a number on the plan to leave it out.</p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-teton-almost-white px-2.5 py-2">
            <span className="rounded-full bg-[#E6F5EC] px-2 font-bold text-[#2E8F5A]">{count(sure)}</span> read clearly
            {live.length - sure > 0 && (
              <>
                <span className="ml-1.5 rounded-full bg-[#FFF4DB] px-2 font-bold text-[#8A5A00]">{count(live.length - sure)}</span> to check: placed without a number (amber “?”)
              </>
            )}
          </p>

          <p className="mt-3 mb-1 text-[9.5px] font-bold uppercase tracking-[.12em] text-teton-ui-gray">{multi ? 'Colors on the plan → room types' : 'Tag them as'}</p>
          <div className="space-y-2">
            {state.groups.map((g) => {
              const n = countOf(g.key);
              return (
                <div key={g.key} className={`rounded-lg border border-teton-off-white p-2 ${n ? '' : 'opacity-50'}`}>
                  <div className="flex items-center gap-2">
                    {multi && <span className={`w-3.5 h-3.5 flex-shrink-0 rounded ${g.color ? '' : 'border border-dashed border-teton-ui-gray'}`} style={{ background: rgb(g.color) }} aria-hidden="true" />}
                    <span className="flex-1 min-w-0 truncate font-medium">{multi ? g.name ?? (g.color ? 'Unnamed color' : 'No color read') : 'Every room found'}</span>
                    <span className="font-bold tabular-nums">{count(n)}</span>
                  </div>
                  <select
                    className="input-field mt-1.5 py-1 text-xs w-full"
                    aria-label={`Tag ${g.name ?? 'these rooms'} as`}
                    value={g.target}
                    onChange={(e) => set(g.key, { target: e.target.value })}
                  >
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'} · {CARE_LABEL[t.care] ?? ''}</option>)}
                    <option value="new">New room type…</option>
                    <option value="skip">Don’t tag these</option>
                  </select>
                  {g.target === 'new' && (
                    <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1.5">
                      <input className="input-field py-1 text-xs" placeholder="Room type name" aria-label="New room type name" value={g.newName} maxLength={60} onChange={(e) => set(g.key, { newName: e.target.value })} />
                      <select className="input-field py-1 text-xs" aria-label="Care setting" value={g.care} onChange={(e) => set(g.key, { care: e.target.value as CareType })}>
                        {CARES.map((c) => <option key={c} value={c}>{CARE_LABEL[c]}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {state.skipped.length > 0 && (
            <>
              <p className="mt-3 mb-1 text-[9.5px] font-bold uppercase tracking-[.12em] text-teton-ui-gray">Skipped (not rooms)</p>
              <div className="flex flex-wrap gap-1">{state.skipped.map((s) => <span key={s} className="rounded-full bg-teton-almost-white px-2 py-0.5 text-[10.5px] text-teton-dark-gray">{s}</span>)}</div>
            </>
          )}
          <p className="mt-3 text-[11px] text-teton-ui-gray">Rooms without a readable number aren’t found: click them with Scope Mode to tag them.</p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button type="button" className="btn-secondary py-1 text-xs" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn-primary py-1 text-xs" disabled={!placing || missingName} title={missingName ? 'Name the new room type' : undefined} onClick={onPlace}>
              Place {count(placing)} tag{placing === 1 ? '' : 's'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

/**
 * Scope Mode's common areas layer: a square marker for each space tagged on the plan (one marker per space, with
 * its common area sensors and E-Call devices), and the form that adds or edits one. No defaults: both counts start
 * at 0, and a space needs at least one of them.
 */
import { useRef, useState } from 'react';
import { Counter } from '@/components/form/Counter';
import { AREA_ABBR, AREA_KINDS, devicesLabel, type AreaKind, type CommonArea } from '@/lib/quote/roomTypes';
import type { EcallOption } from '@/lib/quote/draft';

export const AREA_COLOR = '#0F7C80';

/** A tagged common area on the plan: its kind's letters and its sensors; drag to move it. */
export function AreaMarker({ area, x, y, size, faded, selected, onClick, onMove }: { area: CommonArea; x: number; y: number; size: number; faded?: boolean; selected?: boolean; onClick: () => void; onMove?: (x: number, y: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const d = useRef<{ sx: number; sy: number; moved: boolean; id: number } | null>(null);
  const at = live ?? { x, y };
  const posFrom = (e: React.PointerEvent) => {
    const box = ref.current!.parentElement!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)), y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)) };
  };
  const s = Math.round(size * 1.05);
  const dev = area.pendants;
  const label = `${area.name || AREA_KINDS[area.kind]} · common area · ${area.sensors ?? 0} sensor${(area.sensors ?? 0) === 1 ? '' : 's'}${dev ? ` · ${dev} E-Call device${dev === 1 ? '' : 's'}` : ''}`;
  return (
    <button
      ref={ref}
      type="button"
      data-plan-ui
      title={label}
      aria-label={label}
      className={`absolute -translate-x-1/2 -translate-y-1/2 z-10 flex items-center touch-none transition-opacity duration-200 motion-reduce:transition-none ${faded ? 'opacity-35' : ''}`}
      style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }}
      onPointerDown={(e) => {
        e.stopPropagation();
        ref.current!.setPointerCapture(e.pointerId);
        d.current = { sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        const g = d.current;
        if (!g || g.id !== e.pointerId || !onMove) return;
        if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
        g.moved = true;
        setLive(posFrom(e));
      }}
      onPointerUp={(e) => {
        const g = d.current;
        d.current = null;
        if (!g) return;
        if (g.moved && onMove) {
          const p = posFrom(e);
          setLive(null);
          onMove(p.x, p.y);
        } else onClick();
      }}
      onPointerCancel={() => {
        d.current = null;
        setLive(null);
      }}
    >
      <span
        className={`grid place-items-center rounded-[5px] text-white font-extrabold shadow-[0_0_0_2px_#fff,0_1px_4px_rgba(0,0,0,.3)] ${selected ? 'ring-[3px] ring-teton-near-black/85 ring-offset-2' : ''}`}
        style={{ width: s, height: s, fontSize: Math.max(7, Math.round(s * 0.34)), background: AREA_COLOR }}
      >
        {AREA_ABBR[area.kind]}
      </span>
      {(area.sensors ?? 0) > 0 && (
        <span className="ml-0.5 rounded-full border border-[#CFE7E7] bg-white px-1 font-extrabold leading-tight text-[#0F7C80] shadow-[0_1px_2px_rgba(0,0,0,.12)]" style={{ fontSize: Math.max(8, Math.round(s * 0.4)) }}>
          ×{area.sensors}
        </span>
      )}
    </button>
  );
}

export interface AreaFormValue {
  name: string;
  kind: AreaKind;
  sensors: number;
  pendants: number;
  note: string;
}

/** Add or edit a tagged common area. */
export function AreaForm({
  initial,
  ecall,
  ecallHere,
  readOnly,
  onSave,
  onRemove,
  onCancel,
}: {
  initial?: CommonArea;
  /** The deal's E-Call system: names the device counter; none disables it. */
  ecall: EcallOption;
  /** The community has E-Call somewhere (its common areas can have devices). */
  ecallHere: boolean;
  readOnly?: boolean;
  onSave: (v: AreaFormValue) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [kind, setKind] = useState<AreaKind>(initial?.kind ?? 'dining');
  const [sensors, setSensors] = useState(initial?.sensors ?? 0);
  const [pendants, setPendants] = useState(initial ? initial.pendants : 0);
  const [note, setNote] = useState(initial?.note ?? '');
  const devOff = ecall === 'none' || !ecallHere;
  const devices = devOff ? 0 : pendants;
  const ok = !readOnly && (sensors > 0 || devices > 0);
  const eb = 'block mt-2.5 mb-1 text-[10px] font-extrabold uppercase tracking-[1.1px] text-[#8A919C]';
  const chip = (on: boolean) => `h-7 px-2.5 rounded-full text-[11.5px] font-semibold transition-colors duration-150 motion-reduce:transition-none ${on ? 'bg-teton-near-black text-white' : 'bg-[#F1EEE8] text-[#4E5562] hover:bg-[#E9E4DB]'}`;
  return (
    <form
      className="w-[19rem] max-w-full rounded-xl bg-white p-3.5 text-xs shadow-xl border border-teton-off-white [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none]"
      role="dialog"
      aria-label={initial ? `Edit ${initial.name || 'common area'}` : 'New common area'}
      data-plan-ui
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSave({ name: name.trim().replace(/\s+/g, ' ').slice(0, 80), kind, sensors, pendants: devices, note: note.trim().slice(0, 400) });
      }}
    >
      <p className="font-semibold text-[13px]">{initial ? 'Common area' : 'New common area'}</p>
      <p className="text-[11px] text-teton-ui-gray">One marker per space · its sensors and E-Call devices</p>
      <label className={eb} htmlFor="ca-name">Name</label>
      <input id="ca-name" className="input-field py-1.5 text-xs" value={name} disabled={readOnly} placeholder={`e.g. Main ${AREA_KINDS[kind].toLowerCase()}`} maxLength={80} onChange={(e) => setName(e.target.value)} />
      <span className={eb}>Type</span>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Type of common area">
        {(Object.keys(AREA_KINDS) as AreaKind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={readOnly} onClick={() => setKind(k)} className={chip(kind === k)}>
            {AREA_KINDS[k]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={eb} htmlFor="ca-sen">Common area sensors</label>
          <Counter id="ca-sen" size="sm" value={sensors} onChange={setSensors} min={0} max={50} disabled={readOnly} aria-label="Common area sensors" />
        </div>
        <div>
          <label className={`${eb} ${devOff ? '!text-[#B4AFA6]' : ''}`} htmlFor="ca-dev">E-Call {devicesLabel(ecall).toLowerCase()}</label>
          <Counter
            id="ca-dev"
            size="sm"
            value={devices}
            onChange={setPendants}
            min={0}
            max={20}
            disabled={devOff || readOnly}
            reason={ecall === 'none' ? 'E-Call isn’t part of this deal' : !ecallHere ? 'No E-Call at this community' : undefined}
            aria-label={`E-Call ${devicesLabel(ecall).toLowerCase()}`}
          />
        </div>
      </div>
      <label className={eb} htmlFor="ca-note">Note (optional)</label>
      <textarea id="ca-note" className="input-field py-1.5 text-xs min-h-[2.5rem] resize-y" value={note} disabled={readOnly} maxLength={400} placeholder="e.g. ceiling mount, 14 ft" onChange={(e) => setNote(e.target.value)} />
      {!readOnly && !ok && <p className="mt-2 text-[11px] text-[#9A6512]">Add at least one sensor or E-Call device.</p>}
      <div className="flex items-center gap-2 mt-3">
        {onRemove && !readOnly && (
          <button type="button" className="text-[11.5px] font-semibold text-[#B4442C] hover:underline" onClick={onRemove}>
            Remove
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>{readOnly ? 'Close' : 'Cancel'}</button>
        {!readOnly && <button type="submit" className="btn-primary py-1 text-xs disabled:opacity-40" disabled={!ok}>{initial ? 'Save' : 'Save common area'}</button>}
      </div>
    </form>
  );
}

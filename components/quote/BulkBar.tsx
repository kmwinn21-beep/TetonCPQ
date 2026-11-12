'use client';

/**
 * The bar that replaces the list header while communities are ticked: set
 * go-live, coverage, e-call, pilot or the per-site overrides on all of them
 * at once. Each action opens a small menu; nothing changes until a choice in
 * it is clicked.
 */
import { useEffect, useRef, useState } from 'react';
import type { DraftCommunity } from '@/lib/quote/draft';
import { NumInput } from '@/components/form/NumInput';

type Menu = 'golive' | 'coverage' | 'ecall' | 'pilot' | 'more' | 'remove' | null;
export type BulkPatch = Partial<Pick<DraftCommunity, 'goLiveMonth' | 'coverage' | 'ecall' | 'pilot' | 'occupancy' | 'roiDelayMonths' | 'additionalSensors'>>;

export function BulkBar({
  selected,
  allChecked,
  someChecked,
  onToggleAll,
  onApply,
  onStagger,
  onRemove,
  onClear,
  ecallOn,
  withPilot,
  defaultMonth,
}: {
  selected: number;
  allChecked: boolean;
  someChecked: boolean;
  onToggleAll: () => void;
  onApply: (patch: BulkPatch) => void;
  onStagger: () => void;
  onRemove: () => void;
  onClear: () => void;
  ecallOn: boolean;
  withPilot: boolean;
  /** 'yyyy-mm' to offer first in "Set go-live". */
  defaultMonth: string;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const [month, setMonth] = useState(defaultMonth);
  const [occ, setOcc] = useState<number | null>(null);
  const [delay, setDelay] = useState<number | null>(null);
  const [sensors, setSensors] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null);
    document.addEventListener('mousedown', down);
    window.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', down);
      window.removeEventListener('keydown', esc);
    };
  }, [menu]);

  const apply = (p: BulkPatch) => {
    onApply(p);
    setMenu(null);
  };
  const n = `${selected} ${selected === 1 ? 'community' : 'communities'}`;

  const Trigger = ({ id, label, disabled, title }: { id: Exclude<Menu, null>; label: string; disabled?: boolean; title?: string }) => (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-haspopup="menu"
      aria-expanded={menu === id}
      onClick={() => setMenu(menu === id ? null : id)}
      className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        menu === id ? 'bg-white text-teton-ink border-white' : 'border-white/35 hover:bg-white/10'
      }`}
    >
      {label} ▾
    </button>
  );
  const Item = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button type="button" role="menuitem" className="block w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-teton-off-white" onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div ref={ref} className="relative bg-teton-near-black text-white px-4 py-2.5 flex flex-wrap items-center gap-2 min-h-[48px]" role="toolbar" aria-label="Bulk edit selected communities">
      <input
        type="checkbox"
        className="h-4 w-4 accent-white"
        checked={allChecked}
        ref={(el) => {
          if (el) el.indeterminate = someChecked && !allChecked;
        }}
        onChange={onToggleAll}
        aria-label={allChecked ? 'Unselect all communities' : 'Select all communities'}
      />
      <span className="text-sm font-semibold mr-1">{selected} selected</span>
      <Trigger id="golive" label="Set go-live" />
      <Trigger id="coverage" label="Coverage" />
      <Trigger id="ecall" label="E-Call" disabled={!ecallOn} title={ecallOn ? undefined : 'The deal has no E-Call add-on'} />
      <Trigger id="pilot" label="Pilot" disabled={!withPilot} title={withPilot ? undefined : 'The deal has no pilot phase'} />
      <Trigger id="more" label="More" />
      <Trigger id="remove" label="Remove" />
      <button type="button" className="ml-auto text-xs text-white/80 hover:text-white px-1" onClick={onClear}>Clear</button>

      {menu && (
        <div role="menu" className="absolute left-4 right-4 sm:right-auto top-full mt-1 sm:w-80 z-20 rounded-xl border border-teton-pale-gray bg-white text-teton-ink shadow-xl p-3">
          {menu === 'golive' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Set go-live for {n}</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="eyebrow" htmlFor="bulk-month">Same month for all</label>
                  <input id="bulk-month" type="month" className="input-field px-2" value={month} onChange={(e) => setMonth(e.target.value)} />
                </div>
                <button type="button" className="btn-primary" disabled={!/^\d{4}-\d{2}$/.test(month)} onClick={() => apply({ goLiveMonth: month })}>Apply</button>
              </div>
              <div className="border-t border-teton-off-white pt-2 space-y-0.5">
                <Item onClick={() => { setMenu(null); onStagger(); }}>
                  Stagger these {selected}…
                  <span className="block text-xs text-teton-ui-gray">Opens the stagger tool with only the selected communities</span>
                </Item>
                <Item onClick={() => apply({ goLiveMonth: null })}>
                  Clear go-live
                  <span className="block text-xs text-teton-ui-gray">Back to the default (month 1, or right after the pilot)</span>
                </Item>
              </div>
            </div>
          )}
          {menu === 'coverage' && (
            <>
              <p className="text-sm font-semibold px-3 pb-1">Coverage for {n}</p>
              <Item onClick={() => apply({ coverage: 'rooms_only' })}>Rooms only</Item>
              <Item onClick={() => apply({ coverage: 'full_facility' })}>Full facility</Item>
            </>
          )}
          {menu === 'ecall' && (
            <>
              <p className="text-sm font-semibold px-3 pb-1">E-Call for {n}</p>
              <Item onClick={() => apply({ ecall: true })}>Include E-Call</Item>
              <Item onClick={() => apply({ ecall: false })}>No E-Call</Item>
            </>
          )}
          {menu === 'pilot' && (
            <>
              <p className="text-sm font-semibold px-3 pb-1">Pilot for {n}</p>
              <Item onClick={() => apply({ pilot: true })}>Mark as pilot sites</Item>
              <Item onClick={() => apply({ pilot: false })}>Not pilot sites</Item>
            </>
          )}
          {menu === 'more' && (
            <div className="space-y-3">
              <p className="text-sm font-semibold">Overrides for {n}</p>
              {(
                [
                  ['Occupancy', occ, setOcc, { scale: 100, suffix: '%', max: 1 }, (v: number | null) => apply({ occupancy: v })],
                  ['ROI delay (mo)', delay, setDelay, {}, (v: number | null) => apply({ roiDelayMonths: v })],
                ] as const
              ).map(([label, value, set, opts, go]) => (
                <div key={label} className="flex items-end gap-2">
                  <div className="flex-1">
                    <span className="eyebrow">{label}</span>
                    <NumInput value={value} onChange={set} nullable min={0} placeholder="Deal value" aria-label={`Bulk ${label}`} {...opts} />
                  </div>
                  <button type="button" className="btn-secondary px-3" disabled={value == null} onClick={() => go(value)}>Set</button>
                  <button type="button" className="btn-ghost py-2 text-xs" onClick={() => go(null)} title="Use the deal value">Use deal</button>
                </div>
              ))}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <span className="eyebrow">Extra sensors</span>
                  <NumInput value={sensors} onChange={setSensors} nullable min={0} aria-label="Bulk extra sensors" />
                </div>
                <button type="button" className="btn-secondary px-3" disabled={sensors == null} onClick={() => apply({ additionalSensors: sensors ?? 0 })}>Set</button>
              </div>
              <p className="hint">Each Set changes only that field, on all {n}.</p>
            </div>
          )}
          {menu === 'remove' && (
            <div className="space-y-3">
              <p className="text-sm">Remove {n} from this deal?</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-ghost py-2" onClick={() => setMenu(null)}>Cancel</button>
                <button type="button" className="btn-primary" onClick={() => { setMenu(null); onRemove(); }}>Remove {selected}</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

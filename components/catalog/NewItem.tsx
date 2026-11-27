'use client';

/**
 * Price book → New item (admins): an item priced from its details. Name and SKU are checked for duplicates as you
 * type (lower case, spaces ignored); the next free SKU in the category's series is suggested; it can go straight into
 * a core product.
 */
import { useEffect, useMemo, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { SwipeSheet, usePhone } from '@/components/form/SwipeSheet';
import { FoldStrip, useFold } from '@/components/form/useFold';
import { ItemIconPicker } from './ItemIcon';
import { CATEGORIES, placeFor } from '@/lib/pricing/markets';
import { OFFER_LOCKED, SIDE_LABEL, SIDES, type Side } from '@/lib/pricing/lineup';
import type { LineupInfo } from '@/lib/data/lineup';
import type { PriceBookRow } from '@/lib/data/priceBook';
import { DetailFields, type DetailsForm } from './ItemDetails';

const norm = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
const PREFIX: Record<string, string> = { Platform: 'TT-PLT', 'Add-ons': 'TT-ADD', 'Capital purchase': 'TT-CAP', 'Installation finish': 'TT-FIN' };
const input = 'h-9 w-full rounded-[10px] border bg-white px-3 text-[13px] outline-none focus:border-[#3F8CEA]';
const label = 'block mb-1 text-[11.5px] font-semibold text-[#4E5562]';
const btn = 'h-9 px-3 rounded-[10px] text-[12.5px] font-semibold whitespace-nowrap';

export function NewItem({ open, onClose, rows, lineup, coresDirty, onCreated, onFolded, wake = 0 }: { open: boolean; onClose: () => void; rows: PriceBookRow[]; lineup: LineupInfo | null; coresDirty: boolean; onCreated: (row: PriceBookRow, lineup: LineupInfo | null) => void; onFolded?: (folded: boolean) => void; wake?: number }) {
  // Clicking outside folds the drawer to a strip on the right, keeping what's typed; Cancel / ✕ / Esc discard it.
  const fold = useFold();
  useEffect(() => onFolded?.(open && fold.folded), [open, fold.folded]); // eslint-disable-line react-hooks/exhaustive-deps
  // "New item" pressed again while folded: open the same draft.
  useEffect(() => fold.unfold(), [wake]); // eslint-disable-line react-hooks/exhaustive-deps
  const phone = usePhone('(max-width: 1023px)');
  const blank = (): DetailsForm & { name: string; code: string; list: string; addTo: string; icon: string | null; iconTint: string | null } => ({ name: '', code: '', list: '', addTo: '', billing: 'once', everyYears: 1, per: 'sensor', counted: 'commonAreaSensors', pilotRule: 'credited', category: 'Add-ons', sub: '', description: '', icon: null, iconTint: null });
  const [f, setF] = useState(blank);
  const [suggest, setSuggest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      setF(blank());
      setErr(null);
      fold.unfold();
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => (setShown(false), setLeaving(false)), 200);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || fold.folded) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, onClose, fold.folded]);
  // The next free SKU in the category's series.
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetch(`/api/catalog/next-code?prefix=${encodeURIComponent(PREFIX[f.category] ?? 'TT-ITM')}`)
      .then((x) => (x.ok ? x.json() : null))
      .then((j) => live && setSuggest(j?.code ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [open, f.category]);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const nameTaken = f.name.trim() ? rows.find((r) => norm(r.name) === norm(f.name)) : null;
  const codeTaken = f.code.trim() ? rows.find((r) => r.itemCode && norm(r.itemCode) === norm(f.code)) : null;
  const pilotWord = /pilot|introductory/i.test(f.name);
  const subs = useMemo(() => Array.from(new Set(rows.filter((r) => placeFor(r).category === f.category).map((r) => placeFor(r).sub))), [rows, f.category]);
  const cores = lineup?.lineup.cores ?? [];
  const [addCore, addSide] = f.addTo ? (f.addTo.split('|') as [string, Side]) : [null, null];
  const target = addCore ? cores.find((c) => c.id === addCore) : null;
  const turnsOn = !!target && !!addSide && !target.sides[addSide].offered && !OFFER_LOCKED.has(target.id);
  const list = Number(f.list);
  const ready = f.name.trim().length >= 2 && !nameTaken && !pilotWord && /^[A-Za-z0-9][A-Za-z0-9-]{1,31}$/.test(f.code.trim()) && !codeTaken && f.sub.trim().length >= 2 && f.list.trim() !== '' && Number.isFinite(list) && list >= 0;

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/catalog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: f.name,
          itemCode: f.code,
          category: f.category,
          sub: f.sub,
          billing: f.billing,
          everyYears: f.billing === 'years' ? f.everyYears : undefined,
          per: f.per,
          counted: f.counted,
          pilotRule: f.pilotRule,
          list,
          description: f.description,
          icon: f.icon,
          iconTint: f.iconTint,
          addTo: addCore && addSide ? { core: addCore, side: addSide } : null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Could not add the item');
      onCreated(j.item as PriceBookRow, (j.lineup as LineupInfo | null) ?? null);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not add the item');
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <div className="space-y-3">
      <ItemIconPicker item={{ sku: '', category: f.category, sub: f.sub }} value={{ icon: f.icon, tint: f.iconTint }} onChange={(v) => set({ icon: v.icon, iconTint: v.tint })} disabled={busy} />
      <label className="block">
        <span className={label}>Name</span>
        <input value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} className={`${input} ${nameTaken || pilotWord ? 'border-[#E0806B] bg-[#FFF7F5]' : 'border-[#E4E0D6]'}`} placeholder="e.g. Common area sensor (purchase)" />
        {nameTaken && <small className="mt-1 block text-[11.5px] text-[#B4442C]">“{nameTaken.name}” already exists.</small>}
        {pilotWord && <small className="mt-1 block text-[11.5px] text-[#B4442C]">Leave “pilot” and “introductory” out: proposals use them to mark pilot and intro-rate lines.</small>}
      </label>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Category</span>
          <select value={f.category} onChange={(e) => set({ category: e.target.value, sub: '' })} className={`${input} border-[#E4E0D6]`}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Group</span>
          <input value={f.sub} onChange={(e) => set({ sub: e.target.value })} list="new-item-subs" maxLength={40} className={`${input} border-[#E4E0D6]`} placeholder={subs[0] ?? 'Components'} />
          <datalist id="new-item-subs">
            {subs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="block">
        <span className={label}>SKU</span>
        <input value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} maxLength={32} className={`${input} font-mono ${codeTaken ? 'border-[#E0806B] bg-[#FFF7F5]' : 'border-[#E4E0D6]'}`} placeholder={suggest ?? 'TT-ADD-010'} />
        {codeTaken && <small className="mt-1 block text-[11.5px] text-[#B4442C]">Already used by {codeTaken.name}.</small>}
        {suggest && f.code !== suggest && (
          <button type="button" onClick={() => set({ code: suggest })} className="mt-1 text-[11.5px] font-semibold text-[#2F78C8] hover:underline">
            Use the next free SKU: {suggest}
          </button>
        )}
      </label>
      <DetailFields f={f} set={(p) => set(p)} pricing />
      <label className="block">
        <span className={label}>List price</span>
        <div className="relative w-[160px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-[#8A919C]">$</span>
          <input inputMode="decimal" value={f.list} onChange={(e) => set({ list: e.target.value.replace(/[^0-9.]/g, '') })} className={`${input} border-[#E4E0D6] pl-6`} placeholder="0" />
        </div>
      </label>
      <label className="block">
        <span className={label}>Description (shown in proposals)</span>
        <textarea value={f.description} onChange={(e) => set({ description: e.target.value })} rows={2} maxLength={400} className="w-full rounded-[10px] border border-[#E4E0D6] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#3F8CEA]" />
      </label>
      <label className="block">
        <span className={label}>Add to a core product</span>
        <select value={f.addTo} disabled={coresDirty} onChange={(e) => set({ addTo: e.target.value })} className={`${input} border-[#E4E0D6] disabled:opacity-50`}>
          <option value="">Not yet (add it on the Core products tab later)</option>
          {cores.flatMap((c) =>
            SIDES.map((s) => (
              <option key={`${c.id}|${s}`} value={`${c.id}|${s}`}>
                {c.name} → {SIDE_LABEL[s]}
                {!c.sides[s].offered && !OFFER_LOCKED.has(c.id) ? ' (not offered yet)' : ''}
              </option>
            )),
          )}
        </select>
        {coresDirty && <small className="mt-1 block text-[11.5px] text-[#9A6512]">Save or discard your core product changes first.</small>}
      </label>
      <Collapse open={turnsOn}>
        <p className="rounded-[10px] border border-[#F0D58A] bg-[#FFF6DD] px-3 py-2 text-[12px] leading-relaxed">
          {target?.name} isn’t offered with {addSide === 'capex' ? 'equipment purchase' : 'the subscription'} yet. Adding this item turns that on, so the card becomes available on those deals.
        </p>
      </Collapse>
      <Collapse open={!!err}>
        <p role="alert" className="rounded-[10px] bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#B4442C]">{err}</p>
      </Collapse>
    </div>
  );
  const footer = (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} className={`${btn} border border-[#E4E0D6] bg-white`}>
        Cancel
      </button>
      <button type="button" disabled={!ready || busy} onClick={() => void create()} className={`${btn} bg-teton-ink text-white disabled:opacity-40`}>
        {busy ? 'Adding…' : 'Add item'}
      </button>
    </div>
  );
  if (phone)
    return (
      <SwipeSheet open={open} onClose={onClose} eyebrow="Price book · United States" title="New item">
        <div className="max-h-[72dvh] overflow-y-auto pb-3">{body}</div>
        <div className="pt-3 border-t border-[#ECE8DF]">{footer}</div>
      </SwipeSheet>
    );
  if (!shown) return null;
  if (fold.folded && !leaving)
    return (
      <div className="fixed right-0 top-0 h-full z-[60] flex shadow-[-4px_0_12px_rgba(0,0,0,.06)]" data-fold-ignore>
        <FoldStrip label={f.name.trim() ? `New item · ${f.name.trim()}` : 'New item'} dot={!!(f.name.trim() || f.code.trim() || f.list.trim() || f.sub.trim() || f.description.trim())} onExpand={fold.unfold} />
      </div>
    );
  const out = leaving || fold.leaving;
  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="New item">
      <div className={`absolute inset-0 bg-[#1C1F24]/20 transition-opacity duration-200 ${out ? 'opacity-0' : 'opacity-100'}`} onClick={fold.fold} title="Fold the drawer away (what you typed is kept)" />
      <div className={`absolute right-0 top-0 h-full w-[470px] max-w-full bg-white border-l border-[#ECE8DF] shadow-xl flex flex-col ${out ? 'drawer-out' : 'drawer-in'}`}>
        <div className="px-5 pt-4 pb-3 border-b border-[#F1EEE7] flex items-start">
          <span>
            <span className="font-mono text-[11px] text-[#5A6270]">PRICE BOOK · UNITED STATES</span>
            <b className="block text-[17px]">New item</b>
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 rounded-full bg-[#F1EEE8] text-[#5A6270] grid place-items-center hover:bg-[#E9E4DB]">
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{body}</div>
        <div className="border-t border-[#ECE8DF] px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

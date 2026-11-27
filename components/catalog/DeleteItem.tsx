'use client';

/**
 * Deleting a price book item (admins): it's archived, not erased — saved versions keep it and it can be restored.
 * Built-in items can't be deleted. If the core products use it, it comes out of them in the same step; open deals
 * keep their copy until someone updates them. The name is typed to confirm.
 */
import { useEffect, useState } from 'react';
import { deletableItem } from '@/lib/pricing/catalog';
import { SIDE_LABEL, type Side } from '@/lib/pricing/lineup';
import type { PriceBookRow } from '@/lib/data/priceBook';
import type { LineupInfo } from '@/lib/data/lineup';

interface Info {
  deletable: boolean;
  usedIn: Array<{ kind: 'core' | 'combo'; id: string; name: string; side?: Side }>;
  openDeals: number;
  savedVersions: number;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
const box = 'rounded-[14px] border border-[#E8E4DC] px-3.5 py-3 mb-3';
const h4 = 'mb-2 text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#8A919C]';

/** The bottom of an item's Details tab: delete it, or (built-in) why it can't be. */
export function DeleteItemBox({ r, onDeleted }: { r: PriceBookRow; onDeleted: (lineup: LineupInfo | null) => void }) {
  const [open, setOpen] = useState(false);
  if (!deletableItem(r.sku))
    return (
      <div className={box}>
        <p className={h4}>Delete</p>
        <p className="text-[12.5px] leading-relaxed text-[#4E5562]">
          <b>Built-in item.</b> The pricing rules depend on it, so it can’t be deleted. To stop pricing it on new deals, take it out of the core products.
        </p>
      </div>
    );
  return (
    <div className={`${box} border-[#F3D9D3]`}>
      <p className={h4}>Delete</p>
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-[#4E5562]">Removes it from the price book and the core products. Saved versions keep it, and it can be restored from Deleted items.</p>
        <button type="button" onClick={() => setOpen(true)} className="h-9 px-3 rounded-[10px] border border-[#F0C9C0] bg-white text-[12.5px] font-semibold text-[#B4442C] hover:bg-[#FDF0EE]">
          Delete item…
        </button>
      </div>
      <DeleteItemDialog r={r} open={open} onClose={() => setOpen(false)} onDeleted={onDeleted} />
    </div>
  );
}

function DeleteItemDialog({ r, open, onClose, onDeleted }: { r: PriceBookRow; open: boolean; onClose: () => void; onDeleted: (lineup: LineupInfo | null) => void }) {
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [info, setInfo] = useState<Info | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      setTyped('');
      setErr(null);
      setInfo(null);
      fetch(`/api/catalog/${encodeURIComponent(r.sku)}/archive`)
        .then(async (x) => {
          const j = await x.json();
          if (!x.ok) throw new Error(j.error ?? 'Could not check where it’s used');
          setInfo(j as Info);
        })
        .catch((e) => setErr(e instanceof Error ? e.message : 'Could not check where it’s used'));
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => (setShown(false), setLeaving(false)), 200);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open, busy, onClose]);
  if (!shown) return null;

  const used = info?.usedIn ?? [];
  const ok = !!info && norm(typed) === norm(r.name) && !busy;
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(r.sku)}/archive`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: typed, removeFromCores: used.length > 0 }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Could not delete the item');
      onClose();
      onDeleted((j.lineup as LineupInfo | null) ?? null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete the item');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Delete ${r.name}`} data-fold-ignore>
      <div className={`absolute inset-0 bg-[#1C1F24]/30 transition-opacity duration-200 motion-reduce:transition-none ${leaving ? 'opacity-0' : 'opacity-100'}`} onClick={() => !busy && onClose()} />
      <div className={`relative w-full max-w-[460px] max-h-[90dvh] overflow-y-auto rounded-[16px] bg-white shadow-xl transition-[opacity,transform] duration-200 motion-reduce:transition-none ${leaving ? 'opacity-0 scale-[.97]' : 'opacity-100 scale-100 animate-[fadeIn_.2s_ease-out]'}`}>
        <div className="px-5 pt-4 pb-3 border-b border-[#F1EEE7]">
          <span className="font-mono text-[11px] text-[#5A6270]">{r.itemCode ?? r.sku}</span>
          <b className="block text-[17px]">Delete {r.name}?</b>
        </div>
        <div className="px-5 py-4 space-y-3 text-[12.5px] leading-snug text-[#3F4753]">
          {!info && !err && <p className="text-[#8A919C]">Checking where it’s used…</p>}
          {info && (
            <>
              {used.length > 0 ? (
                <div className="rounded-[10px] bg-[#FFF6E5] px-3 py-2.5 text-[#6B4A00]">
                  <b className="block">It comes out of the core products too</b>
                  <ul className="mt-1 list-disc pl-4">
                    {used.map((u) => (
                      <li key={`${u.kind}-${u.id}-${u.side ?? ''}`}>{u.kind === 'core' ? `${u.name} → ${SIDE_LABEL[u.side!]}` : `The ${u.name} combination (${SIDE_LABEL[u.side!].toLowerCase()})`}</li>
                    ))}
                  </ul>
                  <span className="mt-1 block">That saves a new core products version: new deals won’t include it.</span>
                </div>
              ) : (
                <p>It isn’t in any core product.</p>
              )}
              {info.openDeals > 0 && (
                <p>
                  <b>{info.openDeals} open {info.openDeals === 1 ? 'deal prices' : 'deals price'} this item.</b> They keep pricing it until someone clicks <i>Update this deal</i>.
                </p>
              )}
              <p className="text-[#6B7380]">
                {info.savedVersions ? `On ${info.savedVersions} saved ${info.savedVersions === 1 ? 'version' : 'versions'}; they don’t change.` : 'Not on any saved version.'} You can restore it from Deleted items; its name and SKU stay reserved meanwhile.
              </p>
              <label className="block pt-1">
                <span className="block mb-1 text-[11.5px] font-semibold text-[#4E5562]">
                  Type <b className="text-teton-ink">{r.name}</b> to confirm
                </span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus disabled={busy} aria-label="Type the item’s name to confirm" className="w-full h-10 rounded-[10px] border border-[#E4E0D6] bg-white px-3 text-[13px] outline-none focus:border-[#C2412D] focus:ring-[3px] focus:ring-[#C2412D]/15" onKeyDown={(e) => e.key === 'Enter' && ok && void go()} />
              </label>
            </>
          )}
          {err && <p role="alert" className="rounded-lg bg-[#FDF0EE] px-3 py-2 text-[#B4442C]">{err}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-[#ECE8DF] px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="h-10 px-3.5 rounded-[10px] border border-[#E4E0D6] bg-white text-[12.5px] font-semibold">
            Cancel
          </button>
          <button type="button" disabled={!ok} onClick={() => void go()} className="h-10 px-3.5 rounded-[10px] bg-[#C2412D] text-white text-[12.5px] font-semibold disabled:opacity-40">
            {busy ? 'Deleting…' : used.length ? 'Remove from core products and delete' : 'Delete item'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A deleted item's drawer: what it was, and Restore. */
export function RestoreBanner({ r, onRestored }: { r: PriceBookRow; onRestored: (row: PriceBookRow) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const restore = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(r.sku)}/archive`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ restore: true }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Could not restore it');
      onRestored(j.item as PriceBookRow);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not restore it');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-3 rounded-[12px] bg-[#FDF0EE] px-3.5 py-2.5 text-[12.5px] text-[#8E3524]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          <b>Deleted.</b> Not in the price book or any core product. Restoring brings it back to the price book (add it to core products again yourself).
        </span>
        <button type="button" disabled={busy} onClick={() => void restore()} className="h-9 px-3 rounded-[10px] bg-teton-ink text-white text-[12.5px] font-semibold disabled:opacity-50">
          {busy ? 'Restoring…' : 'Restore'}
        </button>
      </div>
      {err && <p role="alert" className="mt-1.5">{err}</p>}
    </div>
  );
}

'use client';

/**
 * The ⋮ menu beside Save version: Archive deal (coming soon) and Delete deal. Deleting asks first, in a pop-up where
 * the deal's name is typed to confirm; only the deal's owner and admins can delete.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAccess } from './AccessContext';

export function DealMenu({ quoteId, dealName }: { quoteId: number; dealName: string }) {
  const access = useAccess();
  const canDelete = access.isOwner || access.isAdmin;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    const away = (e: MouseEvent) => !menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    document.querySelector('main')?.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', esc);
      window.removeEventListener('resize', close);
      document.querySelector('main')?.removeEventListener('scroll', close);
    };
  }, [open]);
  const item = 'w-full flex items-start gap-2.5 px-3 py-2.5 rounded-[9px] text-left text-[13px] min-h-[44px]';
  return (
    <>
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More deal actions"
        className="btn-secondary px-2.5 flex items-center justify-center"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" /></svg>
      </button>
      {open && pos &&
        createPortal(
          <div ref={menu} role="menu" style={{ top: pos.top, right: pos.right }} className="fixed z-[80] w-[250px] rounded-[12px] border border-[#ECE8DF] bg-white p-1.5 shadow-xl [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none] origin-top-right">
            <button type="button" role="menuitem" disabled aria-disabled="true" className={`${item} text-[#A3A9B2] cursor-not-allowed`} title="Coming soon">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9M10 13h4" /></svg>
              <span>
                <b className="block font-semibold">Archive deal</b>
                <small className="text-[11.5px]">Coming soon</small>
              </span>
            </button>
            <div className="my-1 border-t border-[#F1EEE7]" />
            <button
              type="button"
              role="menuitem"
              disabled={!canDelete}
              onClick={() => (setOpen(false), setConfirm(true))}
              className={`${item} ${canDelete ? 'text-[#B4442C] hover:bg-[#FDF0EE]' : 'text-[#A3A9B2] cursor-not-allowed'}`}
              title={canDelete ? 'Delete this deal for good' : 'Only the deal’s owner or an admin can delete it'}
            >
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
              <span>
                <b className="block font-semibold">Delete deal</b>
                <small className="text-[11.5px] text-[#8A919C]">{canDelete ? 'Permanently, with everything in it' : 'Owner or admin only'}</small>
              </span>
            </button>
          </div>,
          document.body,
        )}
      {confirm && <ConfirmDelete quoteId={quoteId} dealName={dealName} onClose={() => setConfirm(false)} />}
    </>
  );
}

function ConfirmDelete({ quoteId, dealName, onClose }: { quoteId: number; dealName: string; onClose: () => void }) {
  const router = useRouter();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const name = dealName.trim() || 'this deal';
  const ok = typed.trim().toLowerCase() === name.toLowerCase();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [busy, onClose]);
  async function del() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? 'Could not delete the deal');
      router.replace('/deals');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete the deal');
      setBusy(false);
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/40 p-3 [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]" role="dialog" aria-modal="true" aria-label="Delete deal" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl [animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-full bg-[#FDF0EE] text-[#B4442C] grid place-items-center flex-shrink-0" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
          </span>
          <div>
            <p className="text-[16px] font-semibold">Delete {name}?</p>
            <p className="mt-1 text-[13px] leading-relaxed text-teton-dark-gray">
              This permanently deletes the deal and everything in it: every version and proposal, floor plans and notes, comments, tasks, the deal room and its files. Shared proposal links stop working. <b className="text-teton-ink">This can’t be undone.</b>
            </p>
          </div>
        </div>
        <label className="block mt-4 text-[12.5px] text-teton-dark-gray" htmlFor="confirm-delete">
          Type <b className="text-teton-ink">{name}</b> to confirm
        </label>
        <input id="confirm-delete" autoFocus className="input-field mt-1.5" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok && !busy && void del()} autoComplete="off" />
        {err && <p role="alert" className="mt-2 rounded-lg bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C]">{err}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost py-2" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" disabled={!ok || busy} onClick={() => void del()} className="py-2 px-3.5 rounded-md bg-[#C2412D] text-white text-sm font-semibold disabled:opacity-40">
            {busy ? 'Deleting…' : 'Delete deal'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

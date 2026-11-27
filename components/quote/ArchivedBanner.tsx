'use client';

/** On an archived deal: when, who and why, and (owner or admin) Unarchive. */
import { useState } from 'react';
import type { ArchiveInfo } from '@/lib/data/archive';
import { REASON_TONE, reasonLabel } from './archiveReasons';

export function ArchivedBanner({ quoteId, info, canUnarchive }: { quoteId: number; info: ArchiveInfo; canUnarchive: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const when = new Date(`${info.at.replace(' ', 'T')}Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  async function unarchive() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/quotes/${quoteId}/archive`, { method: 'DELETE' });
    if (res.ok) return window.location.reload();
    setErr((await res.json().catch(() => ({}))).error ?? 'Could not unarchive');
    setBusy(false);
  }
  return (
    <div role="status" className="w-full flex flex-wrap items-center gap-3 rounded-xl border border-[#E2DED6] bg-[#F1EFEA] px-3.5 py-2.5 text-sm drawer-in">
      <span className="w-8 h-8 rounded-lg bg-[#E2DED6] text-[#5A6270] grid place-items-center flex-shrink-0" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9M10 13h4" /></svg>
      </span>
      <span className="flex-1 min-w-[14rem]">
        <b className="font-semibold">Archived {when}{info.by ? ` by ${info.by}` : ''}</b>
        <span className={`ml-2 inline-flex h-5 items-center rounded-[6px] px-1.5 text-[11.5px] font-semibold ${REASON_TONE[info.reason] ?? REASON_TONE.other}`}>{reasonLabel(info.reason)}</span>
        {info.note && <span className="text-teton-dark-gray"> · {info.note}</span>}
        <span className="block text-[12px] text-teton-ui-gray mt-0.5">Read-only. Shared links are off{canUnarchive ? '; unarchiving turns them back on.' : '.'}</span>
      </span>
      {canUnarchive && (
        <button type="button" className="btn-primary py-1.5" disabled={busy} onClick={() => void unarchive()}>
          {busy ? 'Unarchiving…' : 'Unarchive'}
        </button>
      )}
      {err && <p className="w-full text-[12.5px] text-[#B4442C]">{err}</p>}
    </div>
  );
}

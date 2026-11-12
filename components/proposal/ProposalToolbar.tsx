'use client';

/**
 * Screen-only controls above the proposal: print / save as PDF, and record
 * that it was sent — which keeps a standalone HTML copy of exactly what was on
 * screen, so "what did we send them in October?" has a literal answer.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dateLabel } from '@/lib/format';

export interface SentRecord {
  id: number;
  createdAt: string;
}

/** A self-contained copy of the proposal: its HTML plus the page's CSS inlined. */
function snapshot(): string {
  const doc = document.getElementById('proposal');
  if (!doc) return '';
  const css: string[] = [];
  const links: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      css.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'));
    } catch {
      if (sheet.href) links.push(`<link rel="stylesheet" href="${sheet.href}">`);
    }
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${document.title}</title>${links.join('')}<style>${css.join('\n')}</style></head><body class="proposal-page">${doc.outerHTML}</body></html>`;
}

export function ProposalToolbar({ versionId, quoteId, versionNo, status, sentTo, sentAt, history }: { versionId: number; quoteId: number; versionNo: number; status: string; sentTo: string | null; sentAt: string | null; history: SentRecord[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/versions/${versionId}/sent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sentTo: to, html: snapshot() }) });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(body.error ?? 'Could not record it');
      return;
    }
    setOpen(false);
    setTo('');
    router.refresh();
  }

  return (
    <div className="no-print sticky top-0 z-10 bg-teton-ink text-sidebar-font">
      <div className="max-w-[8.5in] mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <Link href={`/quotes/${quoteId}/results?v=${versionId}`} className="text-sm text-sidebar-font/80 hover:text-sidebar-font">← Results</Link>
        <span className="text-sm text-sidebar-font/70">
          Proposal v{versionNo}
          {status === 'sent' && sentAt ? ` · last sent ${dateLabel(sentAt)} to ${sentTo}` : ' · not sent yet'}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {open ? (
            <>
              <input autoFocus className="input-field w-64" placeholder="Sent to (name or email)" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sent to" />
              <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-teton-ink disabled:opacity-50" disabled={busy || !to.trim()} onClick={record}>
                {busy ? 'Saving…' : 'Record'}
              </button>
              <button type="button" className="text-sm text-sidebar-font/80 px-2" onClick={() => setOpen(false)}>Cancel</button>
            </>
          ) : (
            <>
              <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10" onClick={() => setOpen(true)}>Record as sent</button>
              <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-teton-ink" onClick={() => window.print()}>Print / Save as PDF</button>
            </>
          )}
        </div>
        {error && <p className="w-full text-sm bg-teton-red text-teton-ink rounded px-2 py-1">{error}</p>}
        {history.length > 0 && (
          <p className="w-full text-xs text-sidebar-font/70">
            Sent copies:{' '}
            {history.map((h, i) => (
              <span key={h.id}>
                {i > 0 && ' · '}
                <a className="underline hover:text-sidebar-font" href={`/api/exports/${h.id}`} target="_blank" rel="noreferrer">{dateLabel(h.createdAt)}</a>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

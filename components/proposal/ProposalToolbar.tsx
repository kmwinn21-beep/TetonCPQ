'use client';

/**
 * Screen-only controls above the proposal: print / save as PDF, and record
 * that it was sent — which keeps a standalone HTML copy of exactly what was on
 * screen, so "what did we send them in October?" has a literal answer.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { dateLabel } from '@/lib/format';
import { useProposalText } from './EditableText';
import { useWhatIf } from './WhatIf';
import { layoutChanges } from '@/lib/proposal/layout';

export interface SentRecord {
  id: number;
  createdAt: string;
  createdByName: string | null;
}

/** A self-contained copy of the proposal: its HTML plus the page's CSS inlined. */
function snapshot(): string {
  const live = document.getElementById('proposal');
  if (!live) return '';
  // The sent copy is a static document: drop the click-to-edit hooks.
  const doc = live.cloneNode(true) as HTMLElement;
  doc.querySelectorAll('[data-edit-ui]').forEach((el) => el.remove());
  doc.querySelectorAll('[draggable]').forEach((el) => el.removeAttribute('draggable'));
  doc.querySelectorAll('[data-fig-value]').forEach((el) => ['role', 'tabindex', 'title', 'class'].forEach((x) => el.removeAttribute(x)));
  doc.querySelectorAll('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
    el.removeAttribute('data-placeholder');
    el.removeAttribute('class');
  });
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

export function ProposalToolbar({ versionId, quoteId, versionNo, status, sentTo, sentAt, sentBy, history, pendingChanges = 0, newerVersions = 0, banner }: { versionId: number; quoteId: number; versionNo: number; status: string; sentTo: string | null; sentAt: string | null; sentBy: string | null; history: SentRecord[]; pendingChanges?: number; newerVersions?: number; /** Shown under the toolbar, inside its sticky area (the unsaved-changes bar). */ banner?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = useProposalText();
  const whatIf = useWhatIf();
  const locked = !!whatIf?.dirty;
  const lockedWhy = 'Save or discard the input changes first, so what you print or send matches a saved version';
  // Panels below the toolbar start where it ends.
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--proposal-chrome-h', `${Math.round(el.getBoundingClientRect().bottom)}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const editCount = Object.keys(text.edits).length + layoutChanges(text.layout);

  async function record() {
    if (text.state !== 'saved') {
      setError('Wait for the wording changes to finish saving, then record it.');
      return;
    }
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
    <div ref={rootRef} className="no-print sticky top-0 z-30">
    <div className="bg-teton-ink text-sidebar-font">
      <div className="max-w-[8.5in] mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
        <Link href={`/quotes/${quoteId}/results?v=${versionId}`} className="text-sm text-sidebar-font/80 hover:text-sidebar-font">← Results</Link>
        <span className="text-sm text-sidebar-font/70">
          Proposal v{versionNo}
          {status === 'sent' && sentAt ? ` · last sent ${dateLabel(sentAt)} to ${sentTo}${sentBy ? ` by ${sentBy}` : ''}` : ' · not sent yet'}
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
              <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" disabled={locked} title={locked ? lockedWhy : undefined} onClick={() => setOpen(true)}>Record as sent</button>
              <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-teton-ink disabled:opacity-40 disabled:cursor-not-allowed" disabled={locked} title={locked ? lockedWhy : undefined} onClick={() => window.print()}>Print / Save as PDF</button>
            </>
          )}
        </div>
        <p className="w-full text-xs text-sidebar-font/70 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Click text to reword it · click a figure to see and change its inputs · hover a section to remove or drag it · hover between sections to add one.</span>
          {editCount > 0 && (
            <span>
              {editCount} {editCount === 1 ? 'change' : 'changes'} to this proposal ·{' '}
              <button type="button" className="underline hover:text-sidebar-font" onClick={() => window.confirm('Put this proposal back to the standard wording and layout? Added sections will be deleted.') && text.resetAll()}>
                Reset to standard
              </button>
            </span>
          )}
          <span className="ml-auto flex items-center gap-2" aria-live="polite">
            <span>{text.state === 'saving' ? 'Saving…' : text.state === 'error' ? 'Not saved' : 'All changes saved'}</span>
            <button type="button" className="px-2 py-0.5 rounded border border-white/30 hover:bg-white/10 disabled:opacity-40" disabled={text.state === 'saved'} onClick={text.saveNow}>
              Save
            </button>
          </span>
        </p>
        {text.error && <p className="w-full text-sm bg-teton-red text-teton-ink rounded px-2 py-1">{text.error}</p>}
        {error && <p className="w-full text-sm bg-teton-red text-teton-ink rounded px-2 py-1">{error}</p>}
        {pendingChanges > 0 && (
          <p className="w-full text-sm bg-teton-pale-yellow text-teton-ink rounded px-2 py-1">
            This is saved version v{versionNo}. The deal has {pendingChanges} {pendingChanges === 1 ? 'change' : 'changes'} since
            {newerVersions > 0 ? ` (and ${newerVersions} newer saved ${newerVersions === 1 ? 'version' : 'versions'})` : ''} that {pendingChanges === 1 ? 'isn’t' : 'aren’t'} in this proposal.{' '}
            <Link href={`/quotes/${quoteId}`} className="underline font-medium">Go to the deal and save a version</Link> to include {pendingChanges === 1 ? 'it' : 'them'}.
          </p>
        )}
        {history.length > 0 && (
          <p className="w-full text-xs text-sidebar-font/70">
            Sent copies:{' '}
            {history.map((h, i) => (
              <span key={h.id}>
                {i > 0 && ' · '}
                <a className="underline hover:text-sidebar-font" href={`/api/exports/${h.id}`} target="_blank" rel="noreferrer">{dateLabel(h.createdAt)}{h.createdByName ? ` (${h.createdByName})` : ''}</a>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
    {banner}
    </div>
  );
}

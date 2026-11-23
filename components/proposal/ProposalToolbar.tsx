'use client';

/**
 * Screen-only controls above the proposal: print / save as PDF, and record
 * that it was sent — which keeps a standalone HTML copy of exactly what was on
 * screen, so "what did we send them in October?" has a literal answer.
 */
import { SegGroup } from '@/components/form/SegGroup';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PagePlanner } from './PagePlanner';
import { dateLabel } from '@/lib/format';
import { useProposalText } from './EditableText';
import { RemovedSheetButton } from './ProposalSections';
import { CommentsButton } from './Comments';
import { TemplateMenu } from './TemplateMenu';
import { useWhatIf } from './WhatIf';
import { layoutChanges } from '@/lib/proposal/layout';
import { canAutoFocus } from '@/lib/client/focus';

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

export function ProposalToolbar({ versionId, quoteId, versionNo, status, sentTo, sentAt, sentBy, history, pendingChanges = 0, newerVersions = 0, banner, bothPricing = false }: { versionId: number; quoteId: number; versionNo: number; status: string; sentTo: string | null; sentAt: string | null; sentBy: string | null; history: SentRecord[]; pendingChanges?: number; newerVersions?: number; /** Shown under the toolbar, inside its sticky area (the unsaved-changes bar). */ banner?: React.ReactNode; /** Both pricing options shown (for the Removed list). */ bothPricing?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(false);
  // Phones: the bar's buttons are folded away until opened.
  // Expanded to start on desktop, collapsed on phones (set before the first paint, without animating).
  const [barOpen, setBarOpen] = useState(false);
  const [barReady, setBarReady] = useState(false);
  useLayoutEffect(() => {
    if (window.matchMedia('(min-width: 640px)').matches) setBarOpen(true);
    const t = requestAnimationFrame(() => setBarReady(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = useProposalText();
  const whatIf = useWhatIf();
  const locked = !!whatIf?.dirty;
  const lockedWhy = 'Save or discard the input changes first, so what you print or send matches a saved version';
  // A real PDF file made on the server (no browser print margins or headers): shared on phones, downloaded elsewhere.
  const [pdfBusy, setPdfBusy] = useState(false);
  const textState = useRef(text.state);
  textState.current = text.state;
  async function downloadPdf() {
    setPdfBusy(true);
    setError(null);
    try {
      // Wording and layout edits still being saved go first, so the file matches the screen.
      if (textState.current !== 'saved') {
        text.saveNow();
        for (let i = 0; i < 40 && (textState.current as string) !== 'saved'; i++) await new Promise((r) => setTimeout(r, 100));
      }
      const res = await fetch(`/api/proposals/${versionId}/pdf`, { cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Couldn’t make the PDF');
      const blob = await res.blob();
      const m = /filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '');
      const name = m ? decodeURIComponent(m[1]) : `Teton proposal v${versionNo}.pdf`;
      const file = new File([blob], name, { type: 'application/pdf' });
      // Phones and tablets: the share sheet (Print, AirDrop, Mail, Save to Files).
      const touch = window.matchMedia('(pointer: coarse)').matches;
      if (touch && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name });
          return;
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t make the PDF');
    } finally {
      setPdfBusy(false);
    }
  }
  // Panels below the toolbar start where it ends.
  // --proposal-chrome-h: bottom of the whole sticky area (bar + banner); --proposal-header-h: bottom of the black bar.
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current;
    const bar = barRef.current;
    if (!el || !bar || typeof ResizeObserver === 'undefined') return;
    const set = () => {
      const root = document.documentElement.style;
      root.setProperty('--proposal-chrome-h', `${Math.round(el.getBoundingClientRect().bottom)}px`);
      root.setProperty('--proposal-header-h', `${Math.round(bar.getBoundingClientRect().bottom)}px`);
    };
    const ro = new ResizeObserver(set);
    ro.observe(el);
    ro.observe(bar);
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
    <div ref={barRef} className="proposal-bar bg-teton-ink text-sidebar-font">
      <div className="max-w-[8.5in] xl:max-w-[1120px] mx-auto px-4 py-2.5 sm:py-3 pt-[max(0.625rem,env(safe-area-inset-top))] flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* This line folds the buttons away: expanded to start on desktop, collapsed on phones. */}
        <button type="button" className="flex min-w-0 flex-1 sm:flex-none items-center gap-2 text-left text-sm text-sidebar-font/70 hover:text-sidebar-font" aria-expanded={barOpen} aria-controls="proposal-bar-tools" onClick={() => setBarOpen((o) => !o)}>
          <span className="min-w-0 truncate sm:whitespace-normal">
            Proposal v{versionNo}
            {status === 'sent' && sentAt ? ` · last sent ${dateLabel(sentAt)} to ${sentTo}${sentBy ? ` by ${sentBy}` : ''}` : ' · not sent yet'}
          </span>
          {text.state !== 'saved' && !barOpen && <span className="text-[11px] text-sidebar-font/60">· {text.state === 'saving' ? 'Saving…' : 'Not saved'}</span>}
          <svg className={`ml-auto sm:ml-1 w-4 h-4 flex-shrink-0 transition-transform duration-300 motion-reduce:transition-none ${barOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </button>
        <div
          id="proposal-bar-tools"
          className={`w-full grid ${barReady ? 'transition-[grid-template-rows,opacity,visibility] duration-300 ease-out motion-reduce:transition-none' : ''} ${barOpen || open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 invisible -mt-2'}`}
        >
        <div className="min-h-0 overflow-hidden">
        <div className="space-y-2">
        <div className="w-full flex flex-wrap items-center gap-2">
          {open ? (
            <>
              <input autoFocus={canAutoFocus()} className="input-field flex-1 min-w-0 sm:flex-none sm:w-64" placeholder="Sent to (name or email)" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sent to" />
              <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium bg-white text-teton-ink disabled:opacity-50" disabled={busy || !to.trim()} onClick={record}>
                {busy ? 'Saving…' : 'Record'}
              </button>
              <button type="button" className="text-sm text-sidebar-font/80 px-2" onClick={() => setOpen(false)}>Cancel</button>
            </>
          ) : (
            <>
              {/* Back to the deal: its inputs, or the results of this version. */}
              <Link href={`/quotes/${quoteId}`} className="px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10">Inputs</Link>
              <Link href={`/quotes/${quoteId}/results?v=${versionId}`} className="px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10">Results</Link>
              {text.editable && (
                <SegGroup role="group" label="Proposal format" thumbClass="bg-white" className="flex flex-1 sm:flex-none rounded-lg border border-white/30 p-0.5 text-sm">
                  {(
                    [
                      ['standard', 'Standard'],
                      ['businessCase', 'Business case'],
                    ] as const
                  ).map(([f, label]) => {
                    const on = (text.layout.format ?? 'standard') === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        aria-pressed={on}
                        className={`flex-1 sm:flex-none px-2.5 py-1.5 rounded-md font-medium whitespace-nowrap transition-colors duration-200 ${on ? 'text-teton-ink' : 'text-sidebar-font/80 hover:text-sidebar-font'}`}
                        onClick={() => {
                          if (f === 'businessCase') setPagesOpen(false);
                          text.setLayout((l) => ({ ...l, format: f }));
                        }}
                        title={f === 'businessCase' ? 'A cover page and full-page sections, like a business case' : 'The standard proposal'}
                      >
                        {label}
                      </button>
                    );
                  })}
                </SegGroup>
              )}
              {text.editable && text.layout.format === 'businessCase' && <TemplateMenu versionId={versionId} />}
              {text.editable && text.layout.format !== 'businessCase' && (
                <button
                  type="button"
                  aria-expanded={pagesOpen}
                  className={`px-3 py-2 rounded-lg text-sm font-medium border ${pagesOpen ? 'bg-white text-teton-ink border-white' : 'border-white/30 hover:bg-white/10'}`}
                  onClick={() => setPagesOpen((o) => !o)}
                  title="Choose which sections print on which page"
                >
                  ▤ Pages{text.layout.pageStarts ? ' · custom' : ''}
                </button>
              )}
              <RemovedSheetButton bothPricing={bothPricing} />
              <CommentsButton />
              {text.editable ? (
                <button type="button" className="px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" disabled={locked} title={locked ? lockedWhy : undefined} onClick={() => setOpen(true)}><span className="sm:hidden">Sent</span><span className="hidden sm:inline">Record as sent</span></button>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[#FFE08A]" title="Ask the deal's owner for Edit Deliverables to change this proposal">🔒 View only</span>
              )}
              {/* Desktop keeps the browser's print; the PDF file works everywhere (and is the main button on phones). */}
              <button type="button" className="hidden sm:inline-flex px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed" disabled={locked} title={locked ? lockedWhy : undefined} onClick={() => window.print()} aria-label="Print / Save as PDF">Print / Save as PDF</button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white text-teton-ink disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={locked || pdfBusy}
                title={locked ? lockedWhy : 'A PDF file with no print margins: download it, or share and print it from a phone'}
                onClick={() => void downloadPdf()}
                aria-label="Download PDF"
              >
                {pdfBusy ? (
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-teton-ink/30 border-t-teton-ink animate-spin motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M5 20h14" /></svg>
                )}
                {pdfBusy ? 'Making PDF…' : 'Download PDF'}
              </button>
            </>
          )}
        </div>
        {text.editable && (
        <p className="w-full text-xs text-sidebar-font/70 flex flex-wrap items-center gap-x-3 gap-y-1">
          {/* Touch screens have no hover: a shorter hint, and the move / remove controls are always shown there. */}
          <span className="sm:hidden">Tap text to reword it, or a figure to change its inputs.</span>
          <span className="hidden sm:inline">{text.layout.format === 'businessCase' ? 'Click text to reword it · click a figure to see and change its inputs · hover a page to move or remove it · hover between pages to add one.' : 'Click text to reword it · click a figure to see and change its inputs · hover a section to remove or drag it · hover between sections to add one.'}</span>
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
        )}
        </div>
        </div>
        </div>
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
    {pagesOpen && text.editable && text.layout.format !== 'businessCase' && <PagePlanner onClose={() => setPagesOpen(false)} />}
    {banner}
    </div>
  );
}

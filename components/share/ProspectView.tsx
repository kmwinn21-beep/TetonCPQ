'use client';

/**
 * A proposal shared with a prospect: read-only, no app chrome. A slim bar on top: who it's from, Comment (then click a
 * page or a section to comment on it), Comments (theirs and the team's replies, and a general comment), and PDF when
 * the rep allows it. A warning when the link expires within a week.
 */
import { useEffect, useState } from 'react';
import type { PriceLine } from '@/lib/pricing/lines';
import type { QuoteDraft } from '@/lib/quote/draft';
import type { StoredOutputs } from '@/lib/data/quotes';
import type { ProposalLayout } from '@/lib/proposal/layout';
import { ProposalTextProvider } from '@/components/proposal/EditableText';
import { ValueLabelsProvider } from '@/components/proposal/ProposalSections';
import { CommentsProvider, useComments, BubbleIcon } from '@/components/proposal/Comments';
import { DocumentInFormat } from '@/components/proposal/ProposalView';
import { ContentsButton, ContentsPanel, useContents } from './ProspectContents';
import { PageQuestionBadges, QuestionsButton, QuestionsPanel, useQuestions } from './ProspectQuestions';

const longDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

interface Props {
  token: string;
  versionId: number;
  quoteId: number;
  versionNo: number;
  savedAt: string | null;
  draft: QuoteDraft;
  outputs: StoredOutputs;
  lines: PriceLine[];
  edits: Record<string, string>;
  layout: ProposalLayout;
  dealName: string;
  ownerName: string;
  email: string;
  allowComments: boolean;
  allowPdf: boolean;
  expiresOn: string;
  /** Days left when it's 7 or fewer (0 = today is the last day), else null. */
  expiryWarning: number | null;
}

export function ProspectView(p: Props) {
  return (
    <div className="proposal-page min-h-screen bg-teton-almost-white print:bg-white" data-prospect>
      <ProposalTextProvider versionId={p.versionId} initial={p.edits} initialLayout={p.layout} editable={false}>
        <ValueLabelsProvider>
          <CommentsProvider versionId={p.versionId} versionNo={p.versionNo} quoteId={p.quoteId} prospect={{ token: p.token, allowComments: p.allowComments }}>
            <Body {...p} />
          </CommentsProvider>
        </ValueLabelsProvider>
      </ProposalTextProvider>
    </div>
  );
}

function Body(p: Props) {
  const comments = useComments();
  const [commenting, setCommenting] = useState(false);
  const contents = useContents();
  const questions = useQuestions(p.token);
  const pageTitles = Object.fromEntries(contents.pages.map((x) => [x.id, x.title]));
  // Comment mode: click a page or a section to comment on it. Esc leaves it.
  useEffect(() => {
    if (!commenting) return;
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('article#proposal') || t.closest('button, a, [data-edit-ui]')) return;
      e.preventDefault();
      const page = t.closest<HTMLElement>('[data-bc-page]');
      const block = t.closest<HTMLElement>('[data-bc-block]');
      setCommenting(false);
      if (!page) return comments.open({ target: { page: null, block: null, label: 'Whole proposal' } });
      const title = page.dataset.bcTitle ?? 'Page';
      comments.open({ target: { page: page.dataset.bcPage ?? null, block: block?.dataset.bcBlock ?? null, label: block ? `${title} · ${block.dataset.bcLabel ?? 'Section'}` : title } });
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setCommenting(false);
    document.addEventListener('click', click, true);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', click, true);
      window.removeEventListener('keydown', key);
    };
  }, [commenting, comments]);
  const n = comments.threads.filter((t) => !t.resolvedAt).length;
  const btn = 'inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-[10px] border text-[13px] font-semibold transition-colors duration-200 whitespace-nowrap';
  const initials = p.email.replace(/@.*/, '').split(/[._-]+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <>
      {!p.allowPdf && <style>{'@media print { [data-prospect] .proposal-doc { display: none !important; } [data-prospect]::after { content: "Printing is turned off for this proposal."; display: block; padding: 40px; font: 14px Inter, sans-serif; } }'}</style>}
      <header className="no-print sticky top-0 z-30 bg-white border-b border-[#ECE8DF]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div className="flex items-center gap-1.5 sm:gap-3 px-3 sm:px-6 h-[60px]">
          <span className="flex items-center gap-2 text-[17px] font-bold text-teton-ink flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/teton-logo.png" alt="Teton" className="w-[22px] h-[22px] object-contain" />
            <span className="hidden sm:inline">Teton</span>
          </span>
          <ContentsButton c={contents} />
          <span className="hidden md:block min-w-0 truncate border-l border-[#E6E8EB] pl-3 text-[13px] text-[#6B7380]">
            Proposal for <b className="text-teton-ink">{p.dealName}</b> · from {p.ownerName}
          </span>
          <span className="flex-1" />
          <QuestionsButton q={questions} />
          {p.allowComments && (
            <>
              <button type="button" aria-pressed={commenting} className={`${btn} ${commenting ? 'bg-teton-ink border-teton-ink text-white' : 'bg-white border-[#D5D9DE] text-teton-ink hover:bg-teton-almost-white'}`} onClick={() => setCommenting((c) => !c)} title="Click a page or a section to comment on it">
                <BubbleIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{commenting ? 'Click a page or section' : 'Comment'}</span>
              </button>
              <button type="button" className={`${btn} bg-white border-[#D5D9DE] text-teton-ink hover:bg-teton-almost-white`} onClick={() => comments.open()}>
                <span className="hidden sm:inline">Comments</span>
                <span className="sm:hidden">All</span>
                {n > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#3F8CEA] text-white text-[10.5px] font-bold grid place-items-center">{n}</span>}
              </button>
            </>
          )}
          {p.allowPdf && (
            <button type="button" className={`${btn} bg-white border-[#D5D9DE] text-teton-ink hover:bg-teton-almost-white`} onClick={() => window.print()} title="Print, or save as a PDF">
              ⤓ <span className="hidden sm:inline">PDF</span>
            </button>
          )}
          <span className="hidden lg:flex items-center gap-2 text-[12px] text-[#6B7380] min-w-0" title={p.email}>
            <span className="w-7 h-7 rounded-full bg-[#E7E2FB] text-[#6A5BC7] grid place-items-center text-[11px] font-bold flex-shrink-0">{initials}</span>
            <span className="truncate max-w-[200px]">{p.email}</span>
          </span>
        </div>
        {commenting && (
          <p className="border-t border-[#D6E6FB] bg-[#EEF5FE] px-4 py-1.5 text-center text-[12.5px] text-[#1F4F96] [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
            Click a page or a section to comment on it ·{' '}
            <button type="button" className="font-semibold underline" onClick={() => (setCommenting(false), comments.open({ target: { page: null, block: null, label: 'Whole proposal' } }))}>
              or leave a general comment
            </button>{' '}
            · Esc to stop
          </p>
        )}
        {p.expiryWarning != null && (
          <p role="status" className="border-t border-[#F5D9A8] bg-[#FFF6E5] px-4 py-1.5 text-center text-[12.5px] text-[#7A4B00]">
            {p.expiryWarning <= 0 ? 'This link expires at the end of today.' : `This link expires on ${longDay(p.expiresOn)} (in ${p.expiryWarning} day${p.expiryWarning === 1 ? '' : 's'}).`} Ask {p.ownerName} for more time if you need it.
          </p>
        )}
      </header>
      <ContentsPanel c={contents} />
      <QuestionsPanel q={questions} ownerName={p.ownerName} email={p.email} pageTitles={pageTitles} />
      <PageQuestionBadges q={questions} />
      <div className={`transition-[padding] duration-200 motion-reduce:transition-none ${contents.open && contents.mode === 'push' ? 'pl-[264px] print:pl-0' : ''}`}>
      <div className={`proposal-doc relative max-w-[8.5in] mx-auto pt-4 ${commenting ? 'prospect-commenting' : ''}`}>
        <DocumentInFormat draft={p.draft} outputs={p.outputs} lines={p.lines} versionNo={p.versionNo} savedAt={p.savedAt} />
      </div>
      </div>
    </>
  );
}

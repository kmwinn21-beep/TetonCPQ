'use client';

/**
 * The team's questions, on the shared link: a "Questions" button (with how many are left), a panel to answer them,
 * and a badge on each page that has an unanswered question. Buttons answer in one click; a text box answers with
 * "Send answer"; buttons-plus-text takes a button and, if they like, a few words. Answered questions stay in the panel,
 * marked answered (who and when), with "Change answer" when the team allows it. Every answer goes to the team as a
 * comment.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useComments } from '@/components/proposal/Comments';
import type { Question } from '@/lib/data/questions';
import type { CommentThread } from '@/lib/data/proposalComments';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const when = (iso: string) => new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const headerH = () => document.querySelector<HTMLElement>('[data-prospect] header')?.offsetHeight ?? 60;

export function useQuestions(token: string) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [open, setOpen] = useState(false);
  /** A question to bring into view when the panel opens (from a page badge). */
  const [focusId, setFocusId] = useState<number | null>(null);
  useEffect(() => {
    void fetch(`/api/share/${token}/questions`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { questions: Question[] } | null) => j && setQuestions(j.questions));
  }, [token]);
  const show = useCallback((id: number | null = null) => (setFocusId(id), setOpen(true)), []);
  return { token, questions, setQuestions, open, setOpen, focusId, show };
}
type Q = ReturnType<typeof useQuestions>;

export function QuestionsButton({ q }: { q: Q }) {
  if (!q.questions.length) return null;
  const left = q.questions.filter((x) => !x.answer).length;
  return (
    <button
      type="button"
      aria-expanded={q.open}
      aria-label={`Questions${left ? ` (${left} to answer)` : ''}`}
      onClick={() => (q.open ? q.setOpen(false) : q.show())}
      className={`inline-flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-[10px] border text-[13px] font-semibold transition-colors duration-200 whitespace-nowrap ${q.open ? 'bg-teton-ink border-teton-ink text-white' : 'bg-white border-[#D5D9DE] text-teton-ink hover:bg-teton-almost-white'}`}
      title={left ? `${left} question${left === 1 ? '' : 's'} to answer` : 'Questions'}
    >
      <span className="w-4 h-4 rounded-full border-[1.7px] border-current grid place-items-center text-[10px] font-bold leading-none" aria-hidden="true">?</span>
      <span className="hidden sm:inline">Questions</span>
      {left > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#D9553F] text-white text-[10.5px] font-bold grid place-items-center">{left}</span>}
    </button>
  );
}

/** "? 1 question on this page" on each page with unanswered questions (on the page's top edge). */
export function PageQuestionBadges({ q }: { q: Q }) {
  const [slots, setSlots] = useState<Array<{ el: HTMLElement; page: string; ids: number[] }>>([]);
  useEffect(() => {
    const byPage = new Map<string, number[]>();
    for (const x of q.questions) if (!x.answer && x.page) byPage.set(x.page, [...(byPage.get(x.page) ?? []), x.id]);
    const made: HTMLElement[] = [];
    const list: typeof slots = [];
    byPage.forEach((ids, page) => {
      const pg = document.querySelector<HTMLElement>(`article#proposal [data-bc-page="${CSS.escape(page)}"]`);
      if (!pg) return;
      if (getComputedStyle(pg).position === 'static') pg.style.position = 'relative';
      const el = document.createElement('div');
      el.className = 'no-print';
      el.dataset.qBadge = page;
      pg.appendChild(el);
      made.push(el);
      list.push({ el, page, ids });
    });
    setSlots(list);
    return () => made.forEach((el) => el.remove());
  }, [q.questions]);
  return (
    <>
      {slots.map((s) =>
        createPortal(
          <button
            type="button"
            onClick={() => q.show(s.ids[0])}
            className="absolute left-1/2 -translate-x-1/2 -top-3.5 z-[6] whitespace-nowrap inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[#D9553F] text-white text-[12px] font-semibold shadow-[0_4px_12px_rgba(217,85,63,.35)] hover:bg-[#C4472F] [animation:fadeIn_.25s_ease-out] motion-reduce:[animation:none]"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            ? {s.ids.length} question{s.ids.length === 1 ? '' : 's'} on this page
          </button>,
          s.el,
          s.page,
        ),
      )}
    </>
  );
}

export function QuestionsPanel({ q, ownerName, email, pageTitles }: { q: Q; ownerName: string; email: string; pageTitles: Record<string, string> }) {
  const comments = useComments();
  const { open, setOpen, questions } = q;
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [top, setTop] = useState(60);
  const [sheet, setSheet] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSheet(!window.matchMedia('(min-width: 640px)').matches);
    if (open) {
      setShown(true);
      setLeaving(false);
      setTop(headerH());
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = window.setTimeout(() => (setShown(false), setLeaving(false)), reduced() ? 0 : 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, setOpen]);
  // Opened from a page badge: bring that question into view and flash it.
  useEffect(() => {
    if (!open || q.focusId == null) return;
    const t = window.setTimeout(() => {
      const el = body.current?.querySelector<HTMLElement>(`[data-question="${q.focusId}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      el?.classList.add('q-flash');
      window.setTimeout(() => el?.classList.remove('q-flash'), 1200);
    }, 260);
    return () => window.clearTimeout(t);
  }, [open, q.focusId]);

  const answer = useCallback(
    async (questionId: number, choice: string | null, text: string | null): Promise<string | null> => {
      const r = await fetch(`/api/share/${q.token}/questions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ questionId, choice, text }) });
      const j = (await r.json().catch(() => ({}))) as { questions?: Question[]; threads?: CommentThread[]; error?: string };
      if (j.questions) q.setQuestions(j.questions);
      if (!r.ok) return j.error ?? 'Couldn’t send your answer. Try again.';
      if (j.threads) comments.setThreads?.(j.threads);
      return null;
    },
    [q, comments],
  );

  if (!shown) return null;
  const done = questions.filter((x) => x.answer).length;
  const ordered = [...questions.filter((x) => !x.answer), ...questions.filter((x) => x.answer)];
  const first = ownerName.trim().split(/\s+/)[0] || 'the team';
  return (
    <div className="no-print fixed inset-0 z-[70] pointer-events-none" style={{ top: sheet ? 0 : top, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {sheet && <div className={`absolute inset-0 bg-black/40 pointer-events-auto transition-opacity duration-200 ${leaving ? 'opacity-0' : '[animation:fadeIn_.2s_ease-out]'} motion-reduce:[animation:none]`} onClick={() => setOpen(false)} />}
      <aside
        role="dialog"
        aria-label="Questions"
        className={`pointer-events-auto absolute bg-white text-teton-ink flex flex-col ${sheet ? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[18px] shadow-[0_-10px_30px_rgba(0,0,0,.2)]' : 'right-0 top-0 bottom-0 w-[420px] border-l border-[#ECE8DF] shadow-[-12px_0_30px_rgba(0,0,0,.08)]'} ${
          leaving ? (sheet ? 'translate-y-full transition-transform duration-200' : '[animation:drawerOut_.2s_ease-in_forwards]') : sheet ? '[animation:sheetUp_.25s_ease-out]' : '[animation:drawerIn_.25s_ease-out]'
        } motion-reduce:[animation:none] motion-reduce:transition-none`}
      >
        <div className="relative px-5 pt-4 pb-3.5 border-b border-[#F1EEE7]">
          {sheet && <div className="w-10 h-1 rounded bg-[#D5D9DE] mx-auto mb-3" aria-hidden="true" />}
          <p className="text-[16px] font-bold pr-10">Questions from {first}</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-[#6B7380]">Answer here; your answers go to {first} as comments on the proposal.</p>
          <div className="mt-2.5 h-[5px] rounded bg-[#EFECE6] overflow-hidden">
            <div className="h-full rounded bg-[#2E9E5B] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${questions.length ? (done / questions.length) * 100 : 0}%` }} />
          </div>
          <p className="mt-1.5 text-[12px] font-bold text-[#256B41]">
            {done} of {questions.length} answered
          </p>
          <button type="button" className="absolute right-4 top-4 w-8 h-8 rounded-lg border border-[#E3E6EA] text-[#6B7380] hover:bg-teton-almost-white text-xs" onClick={() => setOpen(false)} aria-label="Close questions">
            ✕
          </button>
        </div>
        <div ref={body} className="flex-1 overflow-y-auto overscroll-contain bg-[#FBF9F6] px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3">
          {ordered.map((x) => (
            <QuestionCard key={x.id} x={x} me={email} pageLabel={x.page ? pageTitles[x.page] ?? null : null} onAnswer={answer} />
          ))}
        </div>
      </aside>
    </div>
  );
}

function QuestionCard({ x, me, pageLabel, onAnswer }: { x: Question; me: string; pageLabel: string | null; onAnswer: (id: number, choice: string | null, text: string | null) => Promise<string | null> }) {
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<string | null>(x.answer?.choice ?? null);
  const [text, setText] = useState(x.answer?.text ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const answered = !!x.answer && !editing;
  const send = async (c: string | null, t: string | null) => {
    setBusy(c ?? 'text');
    setError(null);
    const err = await onAnswer(x.id, c, t);
    setBusy(null);
    if (err) return setError(err);
    setEditing(false);
  };
  const startChange = () => (setChoice(x.answer?.choice ?? null), setText(x.answer?.text ?? ''), setEditing(true), setError(null));
  const chip = 'inline-flex items-center gap-1 h-5 px-2 rounded-full text-[11px] font-semibold';
  const btn = 'h-[38px] px-4 rounded-[10px] border text-[13px] font-semibold inline-flex items-center gap-1.5 transition-colors duration-200 motion-reduce:transition-none disabled:cursor-default';
  const who = x.answer ? (x.answer.email === me.toLowerCase() ? 'you' : x.answer.name || x.answer.email) : '';
  return (
    <div data-question={x.id} className={`rounded-[14px] border px-[15px] py-3.5 transition-colors duration-300 motion-reduce:transition-none [animation:fadeIn_.25s_ease-out] motion-reduce:[animation:none] ${answered ? 'bg-[#F6FBF7] border-[#CFE7D7]' : 'bg-white border-[#E8E4DC] shadow-[0_1px_2px_rgba(0,0,0,.03)]'}`}>
      <p className="flex flex-wrap items-center gap-1.5 mb-2">
        {answered ? <span className={`${chip} bg-[#E2F3E8] text-[#256B41]`}>✓ Answered</span> : <span className={`${chip} bg-[#FDF0EE] text-[#B4442C]`}>{editing ? 'Changing your answer' : 'To answer'}</span>}
        <span className={`${chip} bg-[#F1EEE8] text-[#5A6270] max-w-full truncate`}>{pageLabel ?? 'Whole proposal'}</span>
      </p>
      <p className="text-[14px] font-semibold leading-snug break-words">{x.body}</p>
      {x.kind !== 'text' && (
        <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="Answers">
          {x.options.map((o) => {
            const picked = answered ? x.answer!.choice === o : x.kind === 'both' && choice === o;
            return (
              <button
                key={o}
                type="button"
                disabled={answered || busy != null}
                aria-pressed={picked}
                onClick={() => (x.kind === 'buttons' ? void send(o, null) : setChoice(o))}
                className={`${btn} ${picked ? 'bg-teton-ink border-teton-ink text-white' : answered ? 'bg-white border-[#D5D9DE] text-teton-ink opacity-40' : 'bg-white border-[#D5D9DE] text-teton-ink hover:border-teton-ink'}`}
              >
                {picked && answered && '✓ '}
                {busy === o ? 'Sending…' : o}
              </button>
            );
          })}
        </div>
      )}
      {answered && x.answer!.text && <p className="mt-2.5 rounded-[10px] border border-[#CFE7D7] bg-white px-3 py-2 text-[13px] leading-snug whitespace-pre-wrap break-words">{x.answer!.text}</p>}
      {!answered && x.kind !== 'buttons' && (
        <>
          <textarea
            className="mt-2.5 w-full min-h-[70px] rounded-[10px] border border-[#D5D9DE] px-3 py-2 text-[13px] leading-snug outline-none resize-y focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15"
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={x.kind === 'both' ? 'Anything to add? (optional)' : 'Your answer'}
            aria-label={`Your answer to: ${x.body}`}
          />
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <button type="button" className="h-[34px] px-3.5 rounded-[9px] bg-teton-ink text-white text-[12.5px] font-semibold hover:bg-black disabled:opacity-50" disabled={busy != null || (x.kind === 'text' ? !text.trim() : !choice)} onClick={() => void send(x.kind === 'both' ? choice : null, text.trim() || null)}>
              {busy ? 'Sending…' : 'Send answer'}
            </button>
            {x.kind === 'both' && !choice && <span className="text-[11.5px] text-[#8A919C]">Pick an answer first</span>}
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded-[9px] bg-[#FDF0EE] px-3 py-1.5 text-[12px] text-[#B4442C]">
          {error}
        </p>
      )}
      {answered && (
        <p className="mt-2.5 text-[11.5px] text-[#6B7380] flex flex-wrap gap-x-1.5">
          <span>
            Answered by {who} · {when(x.answer!.at)}
          </span>
          {x.allowChange && (
            <button type="button" className="font-semibold text-[#1F5FB5] hover:underline" onClick={startChange}>
              Change answer
            </button>
          )}
        </p>
      )}
      {editing && (
        <button type="button" className="mt-2 text-[11.5px] font-semibold text-[#1F5FB5] hover:underline" onClick={() => setEditing(false)}>
          Keep the current answer
        </button>
      )}
    </div>
  );
}

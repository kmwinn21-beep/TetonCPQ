'use client';

/**
 * The team's questions for the prospect (per deal), shown in a Questions panel on the shared link. Here: the list (drag
 * to reorder, click to edit, who answered and what), and the form to add or change one: the question, how they answer
 * (buttons, a text box, or buttons plus a text box), the buttons, which page it's shown on, and whether they can change
 * their answer. Answers arrive as comments.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SegGroup } from '@/components/form/SegGroup';
import { useComments } from './Comments';
import type { Question, QuestionKind } from '@/lib/data/questions';

const MAX_OPTIONS = 8;
const KINDS: Array<[QuestionKind, string]> = [
  ['buttons', 'Buttons'],
  ['text', 'Text box'],
  ['both', 'Buttons + text'],
];
const QUICK: string[][] = [
  ['Yes', 'No'],
  ['Yes', 'No', 'Not sure'],
];
const day = (iso: string) => new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Draft {
  id: number | null;
  body: string;
  kind: QuestionKind;
  options: string[];
  page: string;
  allowChange: boolean;
}
const blank = (): Draft => ({ id: null, body: '', kind: 'buttons', options: ['Yes', 'No'], page: '', allowChange: true });

/** The business case's pages as rendered (id and title), for "Show it on". */
function usePages(open: boolean) {
  const [pages, setPages] = useState<Array<{ id: string; title: string }>>([]);
  useEffect(() => {
    if (!open) return;
    setPages([...document.querySelectorAll<HTMLElement>('article#proposal [data-bc-page][data-bc-title]')].map((el) => ({ id: el.dataset.bcPage!, title: el.dataset.bcTitle! })));
  }, [open]);
  return pages;
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative w-[34px] h-5 flex-shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${on ? 'bg-[#3F8CEA]' : 'bg-[#D5D9DE]'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-[14px]' : ''}`} />
    </button>
  );
}

export function QuestionsButton({ quoteId, className }: { quoteId: number; className: string }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<{ total: number; answered: number } | null>(null);
  useEffect(() => {
    void fetch(`/api/quotes/${quoteId}/questions`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { questions: Question[] } | null) => j && setCount({ total: j.questions.length, answered: j.questions.filter((q) => q.answer).length }));
  }, [quoteId, open]);
  return (
    <>
      <button type="button" className={className} aria-haspopup="dialog" aria-label="Questions for the prospect" onClick={() => setOpen(true)} title="Questions for the prospect, answered on the shared link">
        <span className="w-4 h-4 rounded-full border-[1.7px] border-current grid place-items-center text-[10px] font-bold leading-none" aria-hidden="true">?</span>
        <span className="hidden min-[1600px]:inline">Questions</span>
        {count && count.total > 0 && <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-white/20 text-[10.5px] font-bold">{count.answered}/{count.total}</span>}
      </button>
      <QuestionsDrawer quoteId={quoteId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function QuestionsDrawer({ quoteId, open, onClose }: { quoteId: number; open: boolean; onClose: () => void }) {
  const comments = useComments();
  const [shown, setShown] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const pages = usePages(open);

  useEffect(() => {
    if (open) {
      setShown(true);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = window.setTimeout(() => (setShown(false), setLeaving(false), setDraft(null), setError(null)), reduced() ? 0 : 200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    void fetch(`/api/quotes/${quoteId}/questions`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { questions: Question[]; canEdit: boolean }) => {
        setQuestions(j.questions);
        setCanEdit(j.canEdit);
        if (j.canEdit && !j.questions.length) setDraft(blank());
      });
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, quoteId, onClose]);

  const call = useCallback(
    async (url: string, method: string, body?: unknown) => {
      setBusy(true);
      setError(null);
      const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { questions?: Question[]; error?: string };
      setBusy(false);
      if (!r.ok || !j.questions) {
        setError(j.error ?? 'Couldn’t save. Try again.');
        return false;
      }
      setQuestions(j.questions);
      return true;
    },
    [],
  );
  const save = async () => {
    if (!draft) return;
    const page = pages.find((p) => p.id === draft.page);
    const body = { body: draft.body, kind: draft.kind, options: draft.options, page: page?.id ?? null, pageLabel: page?.title ?? null, allowChange: draft.allowChange };
    if (await call(draft.id == null ? `/api/quotes/${quoteId}/questions` : `/api/quotes/${quoteId}/questions/${draft.id}`, draft.id == null ? 'POST' : 'PUT', body)) setDraft(null);
  };
  const remove = async (q: Draft) => {
    if (q.id == null || !window.confirm('Remove this question? Its answer stays in the comments.')) return;
    if (await call(`/api/quotes/${quoteId}/questions/${q.id}`, 'DELETE')) setDraft(null);
  };
  const drop = async (over: number) => {
    if (dragId == null || !questions || dragId === over) return setDragId(null);
    const ids = questions.map((q) => q.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(over) + (questions.findIndex((q) => q.id === dragId) < questions.findIndex((q) => q.id === over) ? 1 : 0), 0, dragId);
    setQuestions(ids.map((id) => questions.find((q) => q.id === id)!));
    setDragId(null);
    await call(`/api/quotes/${quoteId}/questions`, 'PUT', { order: ids });
  };

  if (!shown || typeof document === 'undefined') return null;
  const answered = questions?.filter((q) => q.answer).length ?? 0;
  const chip = 'inline-flex items-center gap-1 h-5 px-2 rounded-full bg-[#F1EEE8] text-[11px] font-semibold text-[#5A6270] max-w-full truncate';
  return createPortal(
    <div className="no-print fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Questions for the prospect" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className={`absolute inset-0 bg-black/25 transition-opacity duration-200 ${leaving ? 'opacity-0' : '[animation:fadeIn_.2s_ease-out]'} motion-reduce:[animation:none]`} onClick={onClose} />
      <div className={`absolute inset-x-0 bottom-0 max-h-[92dvh] sm:max-h-none sm:inset-x-auto sm:right-0 sm:top-0 sm:w-[440px] flex flex-col rounded-t-2xl sm:rounded-none bg-white text-teton-ink shadow-[-12px_0_30px_rgba(0,0,0,.1)] ${leaving ? 'max-sm:translate-y-full max-sm:transition-transform max-sm:duration-200 sm:[animation:drawerOut_.2s_ease-in_forwards]' : 'max-sm:[animation:sheetUp_.25s_ease-out] sm:[animation:drawerIn_.25s_ease-out]'} motion-reduce:[animation:none] motion-reduce:transition-none`}>
        <div className="relative px-5 pt-[18px] pb-3.5 border-b border-[#F1EEE7]">
          <p className="text-[16px] font-bold pr-10">Questions for the prospect</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-teton-ui-gray pr-6">
            Shown in a Questions panel on the shared link. Answers arrive as comments{questions?.length ? ` · ${answered} of ${questions.length} answered` : ''}.
          </p>
          <button type="button" className="absolute right-4 top-4 w-8 h-8 rounded-lg border border-teton-pale-gray text-teton-ui-gray hover:bg-teton-almost-white text-xs" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain bg-[#FBF9F6] px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {!questions ? (
            <p className="py-10 text-center text-sm text-teton-ui-gray">Loading…</p>
          ) : (
            <>
              {!questions.length && !draft && <p className="py-6 text-center text-[13px] text-teton-ui-gray">No questions yet.</p>}
              <ul className="space-y-2">
                {questions.map((q) =>
                  draft?.id === q.id ? (
                    <li key={q.id}>
                      <Editor draft={draft} setDraft={setDraft} pages={pages} busy={busy} onSave={save} onCancel={() => (setDraft(null), setError(null))} onDelete={() => void remove(draft)} />
                    </li>
                  ) : (
                    <li
                      key={q.id}
                      draggable={canEdit}
                      onDragStart={() => setDragId(q.id)}
                      onDragOver={(e) => dragId != null && e.preventDefault()}
                      onDrop={() => void drop(q.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`flex gap-2.5 items-start rounded-xl border bg-white px-3 py-2.5 transition-opacity duration-150 [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none] ${q.answer ? 'border-[#CFE7D7]' : 'border-[#E8E4DC]'} ${dragId === q.id ? 'opacity-50' : ''}`}
                    >
                      {canEdit && (
                        <span className="mt-0.5 cursor-grab text-[#B9BFC7] select-none" title="Drag to reorder" aria-hidden="true">
                          ⋮⋮
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold leading-snug break-words">{q.body}</p>
                        <p className="mt-1.5 flex flex-wrap gap-1.5">
                          <span className={chip}>{q.kind === 'text' ? 'Text box' : `${q.kind === 'both' ? 'Buttons + text' : 'Buttons'}: ${q.options.join(' · ')}`}</span>
                          <span className={chip}>{q.page ? q.pageLabel ?? 'Page' : 'Whole proposal'}</span>
                          {!q.allowChange && <span className={chip}>Can’t change</span>}
                          {!q.answer && <span className={`${chip} !bg-[#FDF0EE] !text-[#B4442C]`}>Waiting</span>}
                        </p>
                        {q.answer && (
                          <p className="mt-1.5 text-[11.5px] text-[#256B41] break-words">
                            <b>
                              ✓ {q.answer.name || q.answer.email}
                              {q.answer.choice ? `: ${q.answer.choice}` : ' answered'}
                            </b>{' '}
                            · {day(q.answer.at)}
                            {q.answer.commentId != null && comments.enabled && (
                              <>
                                {' '}
                                ·{' '}
                                <button type="button" className="font-semibold text-[#1F5FB5] hover:underline" onClick={() => (onClose(), comments.open({ threadId: q.answer!.commentId! }))}>
                                  See the comment
                                </button>
                              </>
                            )}
                          </p>
                        )}
                      </div>
                      {canEdit && (
                        <button type="button" className="w-7 h-7 flex-shrink-0 rounded-md text-teton-ui-gray hover:bg-teton-almost-white" aria-label={`Edit “${q.body}”`} onClick={() => (setError(null), setDraft({ id: q.id, body: q.body, kind: q.kind, options: q.options.length ? q.options : ['Yes', 'No'], page: q.page ?? '', allowChange: q.allowChange }))}>
                          ✎
                        </button>
                      )}
                    </li>
                  ),
                )}
              </ul>
              {draft && draft.id == null && (
                <div className="mt-3">
                  <Editor draft={draft} setDraft={setDraft} pages={pages} busy={busy} onSave={save} onCancel={() => (setDraft(null), setError(null))} />
                </div>
              )}
              {error && (
                <p role="alert" className="mt-3 rounded-[9px] bg-[#FDF0EE] px-3 py-2 text-[12.5px] text-[#B4442C]">
                  {error}
                </p>
              )}
              {canEdit && !draft && (
                <button type="button" className="mt-3 w-full h-10 rounded-[10px] border border-dashed border-[#B9BFC7] text-[13px] font-semibold text-[#5A6270] hover:bg-white" onClick={() => setDraft(blank())}>
                  + Add a question
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Editor({ draft, setDraft, pages, busy, onSave, onCancel, onDelete }: { draft: Draft; setDraft: (d: Draft) => void; pages: Array<{ id: string; title: string }>; busy: boolean; onSave: () => void; onCancel: () => void; onDelete?: () => void }) {
  const set = (p: Partial<Draft>) => setDraft({ ...draft, ...p });
  const label = 'mt-3.5 mb-1.5 block text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray';
  const field = 'w-full rounded-[10px] border border-[#D5D9DE] px-3 text-[13px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15';
  const lastOpt = useRef<HTMLInputElement>(null);
  const [focusNew, setFocusNew] = useState(false);
  useEffect(() => {
    if (focusNew) (lastOpt.current?.focus(), setFocusNew(false));
  }, [focusNew]);
  const ok = draft.body.trim() && (draft.kind === 'text' || draft.options.some((o) => o.trim()));
  return (
    <div className="rounded-xl border border-[#3F8CEA] bg-white p-3.5 shadow-[0_0_0_3px_rgba(63,140,234,.12)] [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
      <p className="text-[13.5px] font-bold">{draft.id == null ? 'New question' : 'Edit question'}</p>
      <label className={label} htmlFor="q-body">
        Question
      </label>
      <textarea id="q-body" className={`${field} py-2 min-h-[44px] resize-y`} rows={2} maxLength={500} value={draft.body} autoFocus={draft.id == null} onChange={(e) => set({ body: e.target.value })} placeholder="Do you want the pilot to start in January?" />
      <span className={label}>How they answer</span>
      <SegGroup className="relative flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="How they answer">
        {KINDS.map(([k, name]) => (
          <button key={k} type="button" role="radio" aria-checked={draft.kind === k} onClick={() => set({ kind: k })} className={`relative z-[1] flex-1 h-8 rounded-[8px] text-[12.5px] font-semibold transition-colors duration-200 ${draft.kind === k ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>
            {name}
          </button>
        ))}
      </SegGroup>
      {draft.kind !== 'text' && (
        <>
          <span className={label}>Buttons</span>
          <div className="flex flex-wrap gap-1.5">
            {draft.options.map((o, i) => (
              <span key={i} className="inline-flex items-center h-8 rounded-[9px] border border-[#D5D9DE] bg-white pl-2 pr-0.5 focus-within:border-[#3F8CEA] [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]">
                <input
                  ref={i === draft.options.length - 1 ? lastOpt : undefined}
                  className="h-full bg-transparent text-[12.5px] font-semibold outline-none"
                  style={{ width: `${Math.max(3, o.length + 1)}ch` }}
                  maxLength={60}
                  value={o}
                  aria-label={`Button ${i + 1}`}
                  onChange={(e) => set({ options: draft.options.map((x, k) => (k === i ? e.target.value : x)) })}
                  onBlur={() => !o.trim() && draft.options.length > 1 && set({ options: draft.options.filter((_, k) => k !== i) })}
                />
                <button type="button" className="w-6 h-6 rounded-md text-[11px] text-teton-ui-gray hover:bg-teton-almost-white" aria-label={`Remove ${o || 'button'}`} onClick={() => set({ options: draft.options.filter((_, k) => k !== i) })}>
                  ✕
                </button>
              </span>
            ))}
            {draft.options.length < MAX_OPTIONS && (
              <button type="button" className="h-8 px-3 rounded-[9px] border border-dashed border-[#B9BFC7] text-[12.5px] font-semibold text-[#5A6270] hover:bg-teton-almost-white" onClick={() => (set({ options: [...draft.options, ''] }), setFocusNew(true))}>
                + Add button
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11.5px] text-teton-ui-gray">
            Quick sets:{' '}
            {QUICK.map((qs, i) => (
              <span key={i}>
                {i > 0 && ' · '}
                <button type="button" className="font-semibold text-[#1F5FB5] hover:underline" onClick={() => set({ options: qs })}>
                  {qs.join(' / ')}
                </button>
              </span>
            ))}
          </p>
          {draft.kind === 'both' && <p className="mt-1 text-[11.5px] text-teton-ui-gray">They pick a button, and can add a few words in a text box under it.</p>}
        </>
      )}
      <label className={label} htmlFor="q-page">
        Show it on
      </label>
      <select id="q-page" className={`${field} h-9 bg-white`} value={draft.page} onChange={(e) => set({ page: e.target.value })}>
        <option value="">Whole proposal</option>
        {pages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.title}
          </option>
        ))}
        {draft.page && !pages.some((p) => p.id === draft.page) && <option value={draft.page}>A page not in this version</option>}
      </select>
      <div className="mt-3.5 pt-3 border-t border-[#F1EEE7] flex items-center justify-between gap-3">
        <span className="text-[13px]">
          <span className="font-semibold">They can change their answer</span>
          <small className="block text-[11.5px] text-teton-ui-gray">Each change is added as a reply to their answer</small>
        </span>
        <Switch on={draft.allowChange} onChange={(v) => set({ allowChange: v })} label="They can change their answer" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        {onDelete && (
          <button type="button" className="h-9 px-3 rounded-[10px] text-[13px] font-semibold text-[#C2412D] hover:bg-[#FDF0EE]" disabled={busy} onClick={onDelete}>
            Remove
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className="h-9 px-3.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold hover:bg-teton-almost-white" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="h-9 px-3.5 rounded-[10px] bg-teton-ink text-white text-[13px] font-semibold hover:bg-black disabled:opacity-50" disabled={busy || !ok} onClick={onSave}>
          {busy ? 'Saving…' : draft.id == null ? 'Add question' : 'Save'}
        </button>
      </div>
    </div>
  );
}

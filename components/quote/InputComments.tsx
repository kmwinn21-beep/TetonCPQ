'use client';

/**
 * Comments on the deal page. Every input section has a 💬 button in its title row (collapsed or expanded) with its
 * open count; it opens the drawer with a box for that section. The drawer's toggle shows Inputs comments (default),
 * the business case's (Deliverable: read-only here, each linking to it) or All. A comment made on unsaved changes is
 * tagged "draft"; otherwise it notes the active version. Same rules and @mentions as the business case.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Collapse, SectionExtraContext } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import type { CommentThread } from '@/lib/data/proposalComments';
import type { Person } from '@/lib/data/planNotes';
import { BubbleIcon, CommentHoverCard, Composer, mentionsIn, Thread, type CommentTarget, type ThreadOps } from '@/components/proposal/Comments';

type View = 'inputs' | 'deliverable' | 'all';
type Filter = 'open' | 'resolved' | 'all';
interface OpenOpts {
  section?: { id: string; title: string };
  threadId?: number;
}
interface Ctx {
  threads: CommentThread[];
  open: (o?: OpenOpts) => void;
  /** The section whose new-comment box is open. */
  composing: string | null;
}
const InputCommentsContext = createContext<Ctx | null>(null);
export const useInputComments = () => useContext(InputCommentsContext);

/** Mentions read here or elsewhere on the page (the Notifications panel listens). */
export const MENTIONS_READ = 'teton:mentions-read';

function showSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  el.classList.remove('bc-flash');
  void el.offsetWidth;
  el.classList.add('bc-flash');
  setTimeout(() => el.classList.remove('bc-flash'), 1600);
}

export function InputCommentsProvider({ quoteId, activeVersionId, activeVersionNo, draft, children }: { quoteId: number; activeVersionId: number | null; activeVersionNo: number | null; draft: boolean; children: React.ReactNode }) {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<OpenOpts | null>(null);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      setError(null);
      const r = await fetch(`/api/quotes/${quoteId}/comments${path}`, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json' } });
      const j = (await r.json().catch(() => ({}))) as { threads?: CommentThread[]; people?: Person[]; me?: number; error?: string; id?: number };
      if (!r.ok) {
        setError(j.error ?? 'Something went wrong. Try again.');
        return null;
      }
      if (j.threads) setThreads(j.threads);
      if (j.people) setPeople(j.people);
      if (j.me != null) setMe(j.me);
      return j;
    },
    [quoteId],
  );
  useEffect(() => {
    void call('').then(() => {
      const id = Number(new URLSearchParams(window.location.search).get('comment'));
      if (id) setState({ threadId: id });
    });
  }, [call]);

  const open = useCallback((o: OpenOpts = {}) => {
    setState(o);
    // Refresh when opening (someone may have commented since).
    if (!o.section) void call('');
  }, [call]);
  const value = useMemo(() => ({ threads, open, composing: state?.section?.id ?? null }), [threads, open, state]);
  const sectionButton = useCallback((id: string, title: string) => <SectionCommentButton id={id} title={title} />, []);
  return (
    <InputCommentsContext.Provider value={value}>
      <SectionExtraContext.Provider value={sectionButton}>{children}</SectionExtraContext.Provider>
      <InputCommentsDrawer
        state={state}
        onClose={() => setState(null)}
        clearTarget={() => setState((s) => (s ? { threadId: s.threadId } : s))}
        threads={threads}
        error={error}
        quoteId={quoteId}
        activeVersionId={activeVersionId}
        ops={{
          people,
          me,
          versionNo: activeVersionNo,
          onAdd: async (body, target, parentId) => {
            const j = await call('', { method: 'POST', body: JSON.stringify({ body, mentions: mentionsIn(body, people), parentId, page: target?.page ?? null, label: target?.label, draft }) });
            return j?.id ?? null;
          },
          onEdit: async (id, body) => !!(await call(`/${id}`, { method: 'PATCH', body: JSON.stringify({ body, mentions: mentionsIn(body, people) }) })),
          onResolve: async (id, resolved) => void (await call(`/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved }) })),
          onDelete: async (id) => void (await call(`/${id}`, { method: 'DELETE' })),
        }}
      />
    </InputCommentsContext.Provider>
  );
}

/** The header's Comments button: open inputs comments. */
export function InputCommentsButton() {
  const c = useInputComments();
  if (!c) return null;
  const n = c.threads.filter((t) => t.area === 'inputs' && !t.resolvedAt).length;
  return (
    <button type="button" className="btn-secondary !flex-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap" aria-haspopup="dialog" aria-label={`Comments${n ? ` (${n} open)` : ''}`} title="Comments on this deal" onClick={() => c.open()}>
      <BubbleIcon />
      <span className="hidden sm:inline">Comments</span>
      {n > 0 && <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-[#3F8CEA] text-white text-[10.5px] font-bold leading-none">{n}</span>}
    </button>
  );
}

/** 💬 in a section's title row: its open count; opens the drawer with a box for this section. */
function SectionCommentButton({ id, title }: { id: string; title: string }) {
  const c = useInputComments();
  if (!c) return null;
  const here = c.threads.filter((t) => t.area === 'inputs' && t.page === id && !t.resolvedAt);
  const n = here.length;
  const active = c.composing === id;
  return (
    <CommentHoverCard threads={active ? [] : here}>
    <button
      type="button"
      // The same size as the header's ⋮ menu button (Communities).
      className={`flex-shrink-0 self-start inline-flex items-center justify-center gap-1 h-[2.375rem] min-w-[2.375rem] px-2.5 rounded-lg border text-xs font-bold transition-colors duration-200 ${active ? 'bg-[#3F8CEA] border-[#3F8CEA] text-white' : n ? 'border-[#9cc0f0] bg-[#F5F9FF] text-[#1F5FB5] hover:bg-[#E9F2FE]' : 'border-teton-pale-gray bg-white text-teton-dark-gray hover:bg-teton-off-white'}`}
      onClick={() => c.open({ section: { id, title } })}
      aria-label={n ? `${n} open comment${n === 1 ? '' : 's'} on ${title}; add a comment` : `Comment on ${title}`}
      title={n ? undefined : `Comment on ${title}`}
    >
      <BubbleIcon className="w-4 h-4" />
      {n > 0 && <span className="tabular-nums">{n}</span>}
    </button>
    </CommentHoverCard>
  );
}

function InputCommentsDrawer({ state, onClose, clearTarget, threads, error, ops, quoteId, activeVersionId }: { state: OpenOpts | null; onClose: () => void; clearTarget: () => void; threads: CommentThread[]; error: string | null; ops: ThreadOps; quoteId: number; activeVersionId: number | null }) {
  const [shown, setShown] = useState(state);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<View>('inputs');
  const [filter, setFilter] = useState<Filter>('open');
  const [focus, setFocus] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  // Keep showing the last content while the drawer leaves.
  useEffect(() => {
    if (state) {
      setShown(state);
      setClosing(false);
      if (state.section) setView('inputs');
    } else if (shown) {
      setClosing(true);
      const t = setTimeout(() => {
        setShown(null);
        setClosing(false);
        setView('inputs');
      }, 220);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  // Opened at a thread (a notification or a link): show it.
  useEffect(() => {
    const id = state?.threadId;
    const t = id ? threads.find((x) => x.id === id) : null;
    if (!t) return;
    setView(t.area === 'inputs' ? 'inputs' : 'deliverable');
    if (t.resolvedAt) setFilter('all');
    setFocus(t.id);
    setTimeout(() => list.current?.querySelector(`[data-thread="${t.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.threadId, threads.length]);
  useEffect(() => {
    if (!state) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('textarea') && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [state, onClose]);

  const inView = (t: CommentThread) => view === 'all' || t.area === view;
  // Reading the drawer reads your mentions in what it shows.
  const sent = useRef(new Set<number>());
  useEffect(() => {
    if (!state || ops.me == null) return;
    const me = ops.me;
    const ids = threads.filter(inView).flatMap((t) => [t, ...t.replies]).filter((c) => c.mentions.includes(me) && !c.mine && !sent.current.has(c.id)).map((c) => c.id);
    if (!ids.length) return;
    ids.forEach((id) => sent.current.add(id));
    void fetch(`/api/quotes/${quoteId}/mentions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) }).then(() => window.dispatchEvent(new CustomEvent(MENTIONS_READ, { detail: ids })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, threads, ops.me, view, quoteId]);

  if (!shown) return null;
  const target = (state ?? shown).section;
  const matches = (t: CommentThread) => (filter === 'all' ? true : filter === 'open' ? !t.resolvedAt : !!t.resolvedAt);
  const count = (v: View) => threads.filter((t) => (v === 'all' || t.area === v) && matches(t)).length;
  const visible = threads.filter((t) => inView(t) && matches(t));
  const statusCounts = { open: threads.filter((t) => inView(t) && !t.resolvedAt).length, resolved: threads.filter((t) => inView(t) && t.resolvedAt).length, all: threads.filter(inView).length };

  // Inputs: grouped by section in page order (the whole deal first). Deliverable: by business case page. All: newest first.
  const sectionOrder = Array.from(document.querySelectorAll<HTMLElement>('form section[id]')).map((el) => el.id);
  const groups: Array<{ key: string; title: string; items: CommentThread[] }> = [];
  if (view === 'all') groups.push({ key: 'all', title: '', items: visible });
  else {
    const by = new Map<string, CommentThread[]>();
    for (const t of visible) by.set(t.page ?? '', [...(by.get(t.page ?? '') ?? []), t]);
    const keys = [...by.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : view === 'inputs' ? (sectionOrder.indexOf(a) + 1 || 999) - (sectionOrder.indexOf(b) + 1 || 999) : 0));
    for (const k of keys) {
      const first = by.get(k)![0];
      const title = k === '' ? (view === 'inputs' ? 'Whole deal' : 'Whole proposal') : view === 'inputs' ? first.label : first.label.split(' · ')[0];
      groups.push({ key: k || 'general', title, items: by.get(k)! });
    }
  }
  const proposalHref = (t: CommentThread) => `/proposal/${t.versionId ?? activeVersionId ?? ''}?comment=${t.id}`;
  const deliverableOps: ThreadOps = {
    ...ops,
    readOnly: { href: proposalHref, label: 'Open in business case ↗' },
    spot: (t) => (t.page == null ? null : view === 'all' ? t.label : t.label.split(' · ').slice(1).join(' · ') || null),
    onShow: (t) => (window.location.href = proposalHref(t)),
    tag: view === 'all' ? () => <span className="flex-shrink-0 rounded px-1.5 py-px text-[9.5px] font-bold bg-[#F1E9FB] text-[#6A3FB0]">Business case</span> : undefined,
  };
  const inputOps: ThreadOps = {
    ...ops,
    spot: (t) => (t.page == null ? (view === 'all' ? 'Whole deal' : null) : t.label),
    onShow: (t) => t.page && showSection(t.page),
    tag: view === 'all' ? () => <span className="flex-shrink-0 rounded px-1.5 py-px text-[9.5px] font-bold bg-teton-pale-green text-[#256B41]">Inputs</span> : undefined,
  };
  const addOn = async (body: string, t: CommentTarget) => {
    const id = await ops.onAdd(body, t);
    if (id == null) return false;
    if (filter === 'resolved') setFilter('open');
    if (view === 'deliverable') setView('inputs');
    setFocus(id);
    setTimeout(() => list.current?.querySelector(`[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80);
    return true;
  };

  return (
    <div className="no-print fixed z-[75] inset-x-0 bottom-0 sm:inset-x-auto sm:right-0 sm:top-0 sm:w-[380px]" role="dialog" aria-label="Comments">
      <div className={`sm:hidden fixed inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={onClose} />
      <div
        className={`relative flex flex-col bg-white text-teton-ink max-h-[85dvh] rounded-t-2xl shadow-[0_-12px_36px_rgba(0,0,0,.25)] sm:h-full sm:max-h-none sm:rounded-none sm:shadow-[-12px_0_36px_rgba(0,0,0,.18)] transition-transform duration-200 ease-in motion-reduce:transition-none max-sm:[animation:sheetUp_.25s_ease-out] sm:[animation:panelIn_.25s_ease-out] motion-reduce:[animation:none] ${closing ? 'max-sm:translate-y-full sm:translate-x-full' : ''}`}
      >
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-teton-pale-gray" aria-hidden="true" />
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <BubbleIcon />
          <h2 className="font-semibold">Comments</h2>
          <button type="button" className="ml-auto w-8 h-8 rounded-md text-teton-ui-gray hover:bg-teton-almost-white" aria-label="Close comments" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="px-4">
          <SegGroup role="group" label="Comments on" thumbClass="bg-teton-ink" className="flex rounded-lg bg-teton-almost-white p-0.5 text-[12.5px]">
            {(
              [
                ['inputs', 'Inputs'],
                ['deliverable', 'Deliverable'],
                ['all', 'All'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" aria-pressed={view === v} className={`flex-1 px-2 py-1.5 rounded-md font-semibold transition-colors duration-200 ${view === v ? 'text-white' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => setView(v)}>
                {label} <span className="tabular-nums opacity-75">{count(v)}</span>
              </button>
            ))}
          </SegGroup>
        </div>
        <div className="px-4 pt-2 pb-2.5 border-b border-teton-off-white">
          <SegGroup role="group" label="Show" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-xs">
            {(['open', 'resolved', 'all'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} className={`flex-1 px-2 py-1 rounded-md font-medium capitalize transition-colors duration-200 ${filter === f ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => setFilter(f)}>
                {f} <span className="tabular-nums opacity-70">{statusCounts[f]}</span>
              </button>
            ))}
          </SegGroup>
        </div>
        {error && <p className="mx-4 mt-2 rounded-md bg-teton-red/30 px-2.5 py-1.5 text-xs text-[#9A2E1C]" role="alert">{error}</p>}
        <Collapse open={!!target}>
          {target && (
            <div className="px-4 py-3 border-b border-teton-off-white bg-[#F5F9FF]">
              <p className="text-[11px] text-teton-ui-gray mb-1.5">
                New comment on <b className="text-teton-ink font-semibold">{target.title}</b>
              </p>
              <Composer
                key={target.id}
                people={ops.people}
                me={ops.me}
                autoFocus
                placeholder="Add a comment… type @ to tag someone"
                submitLabel="Comment"
                onCancel={clearTarget}
                onSubmit={async (body) => {
                  const ok = await addOn(body, { page: target.id, block: null, label: target.title });
                  if (ok) clearTarget();
                  return ok;
                }}
              />
            </div>
          )}
        </Collapse>
        <div ref={list} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {!visible.length && (
            <p className="px-4 py-8 text-center text-sm text-teton-ui-gray">
              {filter === 'resolved' ? 'Nothing resolved yet.' : view === 'deliverable' ? 'No open comments on the business case.' : threads.some((t) => inView(t)) ? 'No open comments.' : 'No comments yet. Click 💬 on a section, or comment on the whole deal below.'}
            </p>
          )}
          {groups.map((g) => (
            <section key={g.key} className="pt-2">
              {g.title && <h3 className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[.7px] text-teton-ui-gray">{g.title}</h3>}
              <ul>
                {g.items.map((t) => (
                  <Thread key={t.id} t={t} p={t.area === 'inputs' ? inputOps : deliverableOps} focused={focus === t.id} onFocus={() => setFocus(t.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="border-t border-teton-off-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-teton-almost-white">
          {view === 'deliverable' ? (
            <p className="text-xs text-teton-ui-gray">
              Business case comments are added and answered in the business case.{' '}
              {activeVersionId && (
                <a href={`/proposal/${activeVersionId}`} className="font-semibold text-[#1F5FB5] hover:underline">
                  Open it ↗
                </a>
              )}
            </p>
          ) : (
            <Composer people={ops.people} me={ops.me} compact placeholder="Comment on the whole deal…" submitLabel="Comment" onSubmit={(body) => addOn(body, { page: null, block: null, label: 'Whole deal' })} />
          )}
        </div>
      </div>
    </div>
  );
}

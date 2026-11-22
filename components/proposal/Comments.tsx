'use client';

/**
 * Comments on the business case: on a page, a section of a page, or the whole proposal. Threads stay with the deal
 * (every version shows them) and note the version each was made on. Anyone who can open the proposal comments;
 * @mentions reach the person's Notifications panel on the deal page. Screen only: nothing here prints.
 *
 * 💬 in a page's or section's hover controls opens the drawer with a box for that spot; pins on the page show
 * open threads. The toolbar's Comments button opens the drawer (a bottom sheet on phones).
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Collapse } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import type { CommentThread, ProposalComment } from '@/lib/data/proposalComments';
import type { Person } from '@/lib/data/planNotes';
import { AuthorPill } from '@/components/quote/PlanNotes';
import { useProposalText } from './EditableText';

export interface CommentTarget {
  page: string | null;
  block: string | null;
  label: string;
  /** Deal page: an inputs section (default) or a task's thread. */
  area?: 'inputs' | 'task';
}
type Filter = 'open' | 'resolved' | 'all';
interface Ctx {
  enabled: boolean;
  threads: CommentThread[];
  /** Opens the drawer: with a box for a new comment on a spot, or at one thread. */
  open: (o?: { target?: CommentTarget; threadId?: number }) => void;
}
const CommentsContext = createContext<Ctx>({ enabled: false, threads: [], open: () => {} });
export const useComments = () => useContext(CommentsContext);

/** The page a section belongs to (set by the business case's page slot), for comment targets and pins. */
export const CommentPageContext = createContext<{ id: string; title: string } | null>(null);

export const ago = (iso: string) => {
  const t = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(t)) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const mentionsIn = (text: string, people: Person[]) => people.filter((p) => text.includes(`@${p.name}`)).map((p) => p.id);
const sameSpot = (t: { page: string | null; block: string | null }, page: string | null, block: string | null) => t.page === page && (t.block ?? null) === block;

/** Scrolls the document to what a thread is on and flashes it. */
function showTarget(page: string | null, block: string | null) {
  if (!page) return;
  const slot = document.querySelector<HTMLElement>(`[data-bc-page="${CSS.escape(page)}"]`);
  const el = (block && slot?.querySelector<HTMLElement>(`[data-bc-block="${CSS.escape(block)}"]`)) || slot;
  if (!el) return;
  el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
  el.classList.remove('bc-flash');
  void el.offsetWidth;
  el.classList.add('bc-flash');
  setTimeout(() => el.classList.remove('bc-flash'), 1600);
}

export function CommentsProvider({ versionId, versionNo, quoteId, children }: { versionId: number; versionNo: number; quoteId: number; children: React.ReactNode }) {
  const { layout } = useProposalText();
  const enabled = layout.format === 'businessCase';
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<number | null>(null);
  const [drawer, setDrawer] = useState<{ target?: CommentTarget; threadId?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      setError(null);
      const r = await fetch(`/api/versions/${versionId}/comments${path}`, { ...init, headers: { 'content-type': 'application/json' } });
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
    [versionId],
  );

  useEffect(() => {
    if (!enabled || loaded.current) return;
    loaded.current = true;
    void call('').then(() => {
      // A link to one comment (from a notification): open the drawer at it.
      const id = Number(new URLSearchParams(window.location.search).get('comment'));
      if (id) setDrawer({ threadId: id });
    });
  }, [enabled, call]);

  // Reading the drawer reads your mentions.
  const sent = useRef(new Set<number>());
  useEffect(() => {
    if (!drawer || me == null) return;
    const ids = threads.flatMap((t) => [t, ...t.replies]).filter((c) => c.mentions.includes(me) && !c.mine && !sent.current.has(c.id)).map((c) => c.id);
    if (!ids.length) return;
    ids.forEach((id) => sent.current.add(id));
    void fetch(`/api/quotes/${quoteId}/mentions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) });
  }, [drawer, threads, me, quoteId]);

  const open = useCallback((o: { target?: CommentTarget; threadId?: number } = {}) => setDrawer(o), []);
  const value = useMemo(() => ({ enabled, threads, open }), [enabled, threads, open]);
  return (
    <CommentsContext.Provider value={value}>
      {children}
      {enabled && (
        <CommentsDrawer
          state={drawer}
          onClose={() => setDrawer(null)}
          threads={threads}
          people={people}
          me={me}
          versionNo={versionNo}
          error={error}
          onAdd={async (body, target, parentId) => {
            const j = await call('', { method: 'POST', body: JSON.stringify({ body, mentions: mentionsIn(body, people), parentId, page: target?.page ?? null, block: target?.block ?? null, label: target?.label }) });
            return j?.id ?? null;
          }}
          onEdit={async (id, body) => !!(await call(`/${id}`, { method: 'PATCH', body: JSON.stringify({ body, mentions: mentionsIn(body, people) }) }))}
          onResolve={async (id, resolved) => void (await call(`/${id}`, { method: 'PATCH', body: JSON.stringify({ resolved }) }))}
          onDelete={async (id) => void (await call(`/${id}`, { method: 'DELETE' }))}
          clearTarget={() => setDrawer((d) => (d ? { threadId: d.threadId } : d))}
        />
      )}
    </CommentsContext.Provider>
  );
}

// ---------------------------------------------------------------- toolbar button, 💬 buttons and pins

export const BubbleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

/** The toolbar's Comments button (business case only), with the number of open threads. */
export function CommentsButton() {
  const { enabled, threads, open } = useComments();
  if (!enabled) return null;
  const n = threads.filter((t) => !t.resolvedAt).length;
  return (
    <button type="button" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10" aria-haspopup="dialog" aria-label={`Comments${n ? ` (${n} open)` : ''}`} onClick={() => open()} title="Comments on this business case">
      <BubbleIcon />
      <span className="hidden sm:inline">Comments</span>
      {n > 0 && <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-[#3F8CEA] text-white text-[10.5px] font-bold">{n}</span>}
    </button>
  );
}

/** 💬 for a page's or section's hover controls: comment on it. */
export function CommentHere({ target, className }: { target: CommentTarget; className: string }) {
  const { enabled, open } = useComments();
  if (!enabled) return null;
  return (
    <button type="button" className={className} onClick={() => open({ target })} aria-label={`Comment on ${target.label}`} title={`Comment on ${target.label}`}>
      <BubbleIcon className="w-3.5 h-3.5" />
    </button>
  );
}

/** A pin on a page or section with open threads: who started the first one, and how many. */
export function CommentPin({ page, block, kind }: { page: string; block: string | null; kind: 'page' | 'block' }) {
  const { enabled, threads, open } = useComments();
  if (!enabled) return null;
  const here = threads.filter((t) => !t.resolvedAt && sameSpot(t, page, block));
  if (!here.length) return null;
  const first = here[here.length - 1];
  return (
    <CommentHoverCard threads={here}>
      <button
        type="button"
        data-edit-ui
        className={`no-print bc-pin bc-pin-${kind} [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]`}
        onClick={() => open({ threadId: first.id })}
        aria-label={`${here.length} comment${here.length === 1 ? '' : 's'} on this ${kind === 'page' ? 'page' : 'section'}`}
      >
        <AuthorPill person={first.author} />
        {here.length > 1 && <span>{here.length}</span>}
      </button>
    </CommentHoverCard>
  );
}

// ---------------------------------------------------------------- the drawer

/** What a thread needs to show and change itself (shared by the business case and the inputs drawer). */
export interface ThreadOps {
  people: Person[];
  me: number | null;
  /** The version being viewed (or the active one): comments on another are tagged amber. */
  versionNo: number | null;
  onAdd: (body: string, target: CommentTarget | undefined, parentId?: number) => Promise<number | null>;
  onEdit: (id: number, body: string) => Promise<boolean>;
  onResolve: (id: number, resolved: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  /** Read-only: no reply, resolve, edit or delete; a link instead. */
  readOnly?: { href: (t: CommentThread) => string; label: string };
  /** What the thread is on, as a link that shows it (null: nothing to show). */
  spot?: (t: CommentThread) => string | null;
  onShow?: (t: CommentThread) => void;
  /** A small tag at the start of the thread (e.g. "Inputs"). */
  tag?: (t: CommentThread) => React.ReactNode;
}
interface DrawerProps {
  state: { target?: CommentTarget; threadId?: number } | null;
  onClose: () => void;
  threads: CommentThread[];
  people: Person[];
  me: number | null;
  versionNo: number;
  error: string | null;
  onAdd: (body: string, target: CommentTarget | undefined, parentId?: number) => Promise<number | null>;
  onEdit: (id: number, body: string) => Promise<boolean>;
  onResolve: (id: number, resolved: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  clearTarget: () => void;
}

function CommentsDrawer(p: DrawerProps) {
  const [shown, setShown] = useState(p.state);
  const [closing, setClosing] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [focus, setFocus] = useState<number | null>(null);
  // Pages picked in the filter: kept while on this page (closing the drawer keeps it; leaving or reloading resets it).
  const [picked, setPicked] = useState<string[]>([]);
  const list = useRef<HTMLDivElement>(null);
  // Commenting on a page that's filtered out adds it to the filter, so the new comment shows.
  const tKey = p.state?.target ? p.state.target.page ?? '' : null;
  useEffect(() => {
    if (tKey != null) setPicked((k) => (k.length && !k.includes(tKey) ? [...k, tKey] : k));
  }, [tKey]);
  // Keep showing the last content while the drawer leaves.
  useEffect(() => {
    if (p.state) {
      setShown(p.state);
      setClosing(false);
    } else if (shown) {
      setClosing(true);
      const t = setTimeout(() => {
        setShown(null);
        setClosing(false);
      }, 220);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.state]);
  // Opened at a thread: show it (even if resolved) and scroll to it.
  useEffect(() => {
    const id = p.state?.threadId;
    if (!id) return;
    const t = p.threads.find((x) => x.id === id);
    if (!t) return;
    if (t.resolvedAt && filter === 'open') setFilter('all');
    setFocus(id);
    setTimeout(() => {
      list.current?.querySelector(`[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      showTarget(t.page, t.block);
    }, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.state?.threadId, p.threads.length]);
  const { state, onClose } = p;
  // Wide screens: the document moves left to make room for the drawer.
  useEffect(() => {
    document.body.classList.toggle('comments-open', !!state);
    return () => document.body.classList.remove('comments-open');
  }, [state]);
  useEffect(() => {
    if (!state) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && !(e.target as HTMLElement)?.closest?.('textarea') && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [state, onClose]);
  if (!shown) return null;

  const target = (p.state ?? shown).target;
  const matches = (t: CommentThread) => (filter === 'all' ? true : filter === 'open' ? !t.resolvedAt : !!t.resolvedAt);
  const visible = p.threads.filter((t) => matches(t) && (!picked.length || picked.includes(t.page ?? '')));
  // Grouped by page in document order; general comments first.
  const slots = Array.from(document.querySelectorAll<HTMLElement>('[data-bc-page]'));
  const pageOrder = slots.map((el) => el.dataset.bcPage!);
  const inStatus = p.threads.filter(matches);
  const pageOptions: FilterOption[] = [
    { key: '', label: 'Whole proposal', count: inStatus.filter((t) => t.page == null).length },
    ...slots.map((el) => ({ key: el.dataset.bcPage!, label: el.dataset.bcTitle || el.dataset.bcPage!, count: inStatus.filter((t) => t.page === el.dataset.bcPage).length })),
  ];
  // Pages no longer in the document (removed) that still have comments.
  for (const t of p.threads) if (t.page && !pageOptions.some((o) => o.key === t.page)) pageOptions.push({ key: t.page, label: t.label.split(' · ')[0], count: inStatus.filter((x) => x.page === t.page).length });
  const groups = new Map<string, CommentThread[]>();
  for (const t of visible) {
    const k = t.page ?? '';
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const keys = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : (pageOrder.indexOf(a) + 1 || 999) - (pageOrder.indexOf(b) + 1 || 999)));
  const counts = { open: p.threads.filter((t) => !t.resolvedAt).length, resolved: p.threads.filter((t) => t.resolvedAt).length, all: p.threads.length };

  return (
    <div className="no-print fixed z-[75] inset-x-0 bottom-0 sm:inset-x-auto sm:right-0 sm:top-0 sm:w-[380px]" role="dialog" aria-label="Comments">
      {/* Phones: a dimmed backdrop behind the bottom sheet. */}
      <div className={`sm:hidden fixed inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={p.onClose} />
      <div
        className={`relative flex flex-col bg-white text-teton-ink max-h-[85dvh] rounded-t-2xl shadow-[0_-12px_36px_rgba(0,0,0,.25)] sm:h-full sm:max-h-none sm:rounded-none sm:shadow-[-12px_0_36px_rgba(0,0,0,.18)] transition-transform duration-200 ease-in motion-reduce:transition-none max-sm:[animation:sheetUp_.25s_ease-out] sm:[animation:panelIn_.25s_ease-out] motion-reduce:[animation:none] ${closing ? 'max-sm:translate-y-full sm:translate-x-full' : ''}`}
      >
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-teton-pale-gray" aria-hidden="true" />
        <div className="flex items-center gap-2 px-4 pt-3 pb-2">
          <BubbleIcon />
          <h2 className="font-semibold">Comments</h2>
          <span className="text-xs text-teton-ui-gray">on this deal’s business case</span>
          <button type="button" className="ml-auto w-8 h-8 rounded-md text-teton-ui-gray hover:bg-teton-almost-white" aria-label="Close comments" onClick={p.onClose}>
            ✕
          </button>
        </div>
        <div className="px-4 pb-2.5 border-b border-teton-off-white">
          <SegGroup role="group" label="Show" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-xs">
            {(['open', 'resolved', 'all'] as const).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} className={`flex-1 px-2 py-1.5 rounded-md font-medium capitalize transition-colors duration-200 ${filter === f ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => setFilter(f)}>
                {f} <span className="tabular-nums opacity-70">{counts[f]}</span>
              </button>
            ))}
          </SegGroup>
          <SectionFilter title="Filter by page" allLabel="All pages" options={pageOptions} picked={picked} onChange={setPicked} />
        </div>
        {p.error && <p className="mx-4 mt-2 rounded-md bg-teton-red/30 px-2.5 py-1.5 text-xs text-[#9A2E1C]" role="alert">{p.error}</p>}
        <Collapse open={!!target}>
          {target && (
            <div className="px-4 py-3 border-b border-teton-off-white bg-[#F5F9FF]">
              <p className="text-[11px] text-teton-ui-gray mb-1.5">
                New comment on <b className="text-teton-ink font-semibold">{target.label}</b>
              </p>
              <Composer
                key={`${target.page}-${target.block}`}
                people={p.people}
                me={p.me}
                autoFocus
                placeholder="Add a comment… type @ to tag someone"
                submitLabel="Comment"
                onCancel={p.clearTarget}
                onSubmit={async (body) => {
                  const id = await p.onAdd(body, target);
                  if (id == null) return false;
                  p.clearTarget();
                  if (filter === 'resolved') setFilter('open');
                  setFocus(id);
                  return true;
                }}
              />
            </div>
          )}
        </Collapse>
        <div ref={list} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {!visible.length && (
            <p className="px-4 py-8 text-center text-sm text-teton-ui-gray">
              {picked.length ? 'No comments on the picked pages.' : filter === 'resolved' ? 'Nothing resolved yet.' : p.threads.length ? 'No open comments.' : 'No comments yet. Hover a page or section and click 💬, or comment on the whole proposal below.'}
            </p>
          )}
          {keys.map((k) => (
            <section key={k || 'general'} className="pt-2">
              <h3 className="px-4 pb-1 text-[10px] font-bold uppercase tracking-[.7px] text-teton-ui-gray">{k ? groups.get(k)![0].label.split(' · ')[0] : 'Whole proposal'}</h3>
              <ul>
                {groups.get(k)!.map((t) => (
                  <Thread key={t.id} t={t} p={p} focused={focus === t.id} onFocus={() => setFocus(t.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="border-t border-teton-off-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-teton-almost-white">
          <Composer
            people={p.people}
            me={p.me}
            compact
            placeholder="Comment on the whole proposal…"
            submitLabel="Comment"
            onSubmit={async (body) => {
              const id = await p.onAdd(body, { page: null, block: null, label: 'Whole proposal' });
              if (id == null) return false;
              if (filter === 'resolved') setFilter('open');
              setFocus(id);
              setTimeout(() => list.current?.querySelector(`[data-thread="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 60);
              return true;
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function Thread({ t, p, focused, onFocus }: { t: CommentThread; p: ThreadOps; focused: boolean; onFocus: () => void }) {
  const [replying, setReplying] = useState(false);
  const spot = p.spot ? p.spot(t) : t.label.includes(' · ') ? t.label.split(' · ').slice(1).join(' · ') : t.page ? 'Whole page' : null;
  const ro = p.readOnly;
  return (
    <li data-thread={t.id} className={`mx-2 mb-2 rounded-xl border px-3 py-2.5 transition-colors duration-300 ${focused ? 'border-[#9cc0f0] bg-[#F5F9FF]' : 'border-teton-off-white bg-white'} ${t.resolvedAt ? 'opacity-75' : ''}`} onClick={onFocus}>
      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
        {p.tag?.(t)}
        {spot && (
          <button type="button" className="min-w-0 truncate text-[11px] font-semibold text-[#1F5FB5] hover:underline" onClick={() => (p.onShow ? p.onShow(t) : showTarget(t.page, t.block))} title="Show where it is">
            {spot}
          </button>
        )}
        {t.resolvedAt && <span className="flex-shrink-0 rounded-full bg-teton-pale-green px-1.5 py-px text-[10px] font-semibold text-[#256B41]">✓ Resolved{t.resolvedBy ? ` by ${t.resolvedBy.name.split(' ')[0]}` : ''}</span>}
        <span className="ml-auto" />
        {ro && (
          <a href={ro.href(t)} className="flex-shrink-0 text-[11px] font-semibold text-[#1F5FB5] hover:underline whitespace-nowrap">
            {ro.label}
          </a>
        )}
        {!ro && t.canResolve && (
          <button type="button" className="flex-shrink-0 rounded-md border border-teton-pale-gray px-2 py-0.5 text-[11px] font-medium text-teton-dark-gray hover:bg-teton-almost-white" onClick={() => void p.onResolve(t.id, !t.resolvedAt)}>
            {t.resolvedAt ? 'Reopen' : '✓ Resolve'}
          </button>
        )}
      </div>
      <CommentBody c={t} p={p} />
      {t.replies.length > 0 && (
        <ul className="mt-2 ml-3 pl-3 border-l-2 border-teton-off-white space-y-2">
          {t.replies.map((r) => (
            <li key={r.id}>
              <CommentBody c={r} p={p} />
            </li>
          ))}
        </ul>
      )}
      <Collapse open={replying}>
        <div className="mt-2">
          {replying && (
            <Composer
              people={p.people}
              me={p.me}
              autoFocus
              compact
              placeholder="Reply… type @ to tag someone"
              submitLabel="Reply"
              onCancel={() => setReplying(false)}
              onSubmit={async (body) => {
                const ok = (await p.onAdd(body, undefined, t.id)) != null;
                if (ok) setReplying(false);
                return ok;
              }}
            />
          )}
        </div>
      </Collapse>
      {!replying && !ro && (
        <button type="button" className="mt-1.5 text-[11.5px] font-medium text-teton-ui-gray hover:text-teton-ink" onClick={() => setReplying(true)}>
          Reply
        </button>
      )}
    </li>
  );
}

function CommentBody({ c, p }: { c: ProposalComment; p: ThreadOps }) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const other = c.versionNo != null && c.versionNo !== p.versionNo;
  return (
    <div className="group/cm">
      <div className="flex items-center gap-1.5 text-[11px] text-teton-ui-gray">
        <AuthorPill person={c.author} />
        <b className="font-semibold text-teton-ink truncate">{c.author.name}</b>
        <span className="flex-shrink-0">{ago(c.createdAt)}</span>
        {c.versionNo != null && (
          <span className={`flex-shrink-0 rounded px-1 py-px text-[9.5px] font-semibold ${other ? 'bg-[#FFF1DC] text-[#8A5A00]' : 'bg-teton-almost-white text-teton-ui-gray'}`} title={other ? `Made on version ${c.versionNo}; you’re viewing v${p.versionNo}` : `Made on this version (v${c.versionNo})`}>
            on v{c.versionNo}
          </span>
        )}
        {c.draft && (
          <span className="flex-shrink-0 rounded px-1 py-px text-[9.5px] font-semibold bg-teton-almost-white text-teton-ui-gray" title="Made on unsaved changes">
            draft
          </span>
        )}
        {c.updatedAt !== c.createdAt && <span className="flex-shrink-0 italic">edited</span>}
        {!p.readOnly && (c.mine || c.canDelete) && (
          <span className="relative ml-auto">
            <button type="button" className="w-6 h-6 rounded-md text-teton-ui-gray hover:bg-teton-almost-white sm:opacity-0 sm:group-hover/cm:opacity-100 focus:opacity-100 transition-opacity" aria-label="Comment options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              ⋯
            </button>
            {menu && (
              <span className="absolute right-0 top-full z-10 mt-1 w-28 rounded-lg border border-teton-off-white bg-white py-1 shadow-lg [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]" onMouseLeave={() => setMenu(false)}>
                {c.mine && (
                  <button type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-teton-almost-white" onClick={() => (setEditing(true), setMenu(false))}>
                    Edit
                  </button>
                )}
                {c.canDelete && (
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-xs text-[#B23A26] hover:bg-teton-almost-white"
                    onClick={() => {
                      setMenu(false);
                      if (window.confirm('Delete this comment? Replies to it are deleted too.')) void p.onDelete(c.id);
                    }}
                  >
                    Delete
                  </button>
                )}
              </span>
            )}
          </span>
        )}
      </div>
      {editing ? (
        <div className="mt-1.5">
          <Composer
            people={p.people}
            me={p.me}
            autoFocus
            compact
            initial={c.body}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (body) => {
              const ok = await p.onEdit(c.id, body);
              if (ok) setEditing(false);
              return ok;
            }}
          />
        </div>
      ) : (
        <p className="mt-1 text-[13px] leading-snug whitespace-pre-wrap break-words">
          <WithMentions text={c.body} people={p.people} me={p.me} />
        </p>
      )}
    </div>
  );
}

export function WithMentions({ text, people, me }: { text: string; people: Person[]; me: number | null }) {
  const names = [...people].sort((a, b) => b.name.length - a.name.length);
  if (!names.length) return <>{text}</>;
  const re = new RegExp(`@(${names.map((n) => esc(n.name)).join('|')})`, 'g');
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index));
    const who = names.find((n) => n.name === m[1]);
    out.push(
      <span key={m.index} className={`rounded px-0.5 font-semibold ${who?.id === me ? 'bg-[#FFF1DC] text-[#8A5A00]' : 'bg-[#E5EEFC] text-[#1F5FB5]'}`}>
        @{m[1]}
      </span>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(text.slice(last));
  return <>{out}</>;
}

/** A comment box: type @ for a list of people to tag. Ctrl/⌘+Enter sends; Esc cancels. */
export function Composer({ people, me, initial = '', placeholder, submitLabel, autoFocus, compact, onSubmit, onCancel }: { people: Person[]; me: number | null; initial?: string; placeholder?: string; submitLabel: string; autoFocus?: boolean; compact?: boolean; onSubmit: (body: string) => Promise<boolean>; onCancel?: () => void }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState<{ q: string; at: number } | null>(null);
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(initial.length, initial.length);
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Grow with the text.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(180, el.scrollHeight)}px`;
  }, [text]);
  const matches = query ? people.filter((x) => x.id !== me && x.name.toLowerCase().includes(query.q.toLowerCase())).slice(0, 6) : [];
  const watch = (value: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret));
    setQuery(m ? { q: m[2], at: caret - m[2].length - 1 } : null);
    setHi(0);
  };
  const pick = (x: Person) => {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? text.length;
    const next = `${text.slice(0, query.at)}@${x.name} ${text.slice(caret)}`;
    setText(next);
    setQuery(null);
    const at = query.at + x.name.length + 2;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(at, at);
    });
  };
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const ok = await onSubmit(text.trim());
    setBusy(false);
    if (ok) setText('');
  };
  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={text}
        rows={compact ? 1 : 2}
        placeholder={placeholder}
        aria-label={placeholder ?? 'Comment'}
        className="block w-full resize-none rounded-lg border border-teton-pale-gray bg-white px-2.5 py-2 text-[13px] leading-snug focus:border-[#3F8CEA] focus:outline-none focus:ring-2 focus:ring-[#3F8CEA]/20"
        onChange={(e) => {
          setText(e.target.value);
          watch(e.target.value, e.target.selectionStart);
        }}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setHi((h) => (h + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(matches[hi]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          } else if (e.key === 'Escape' && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
      />
      {matches.length > 0 && (
        <ul className="absolute left-0 right-0 bottom-full mb-1 z-20 max-h-56 overflow-y-auto rounded-lg border border-teton-off-white bg-white py-1 shadow-lg [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]" role="listbox" aria-label="Tag someone">
          {matches.map((x, i) => (
            <li key={x.id} role="option" aria-selected={i === hi}>
              <button type="button" className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] ${i === hi ? 'bg-[#F3F7FD]' : 'hover:bg-teton-almost-white'}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(x)}>
                <AuthorPill person={x} />
                {x.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {(text.trim() || !compact || onCancel) && (
        <div className="mt-1.5 flex items-center justify-end gap-2">
          <span className="mr-auto hidden sm:inline text-[10.5px] text-teton-ui-gray">@ to tag · Ctrl+Enter to send</span>
          {onCancel && (
            <button type="button" className="px-2 py-1 text-xs font-medium text-teton-ui-gray hover:text-teton-ink" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn-primary py-1 px-3 text-xs disabled:opacity-40" disabled={!text.trim() || busy} onClick={() => void send()}>
            {busy ? '…' : submitLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hover (or keyboard focus) on a comment bubble: a card with every open comment there, oldest first, with replies.
 * Clicking the bubble still opens the drawer. Mouse only: touch goes straight to the drawer.
 */
export function CommentHoverCard({ threads, children }: { threads: CommentThread[]; children: React.ReactElement }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; up: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const enter = (e: React.PointerEvent | React.FocusEvent) => {
    if ('pointerType' in e && e.pointerType === 'touch') return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(true), 180);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 160);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!show || !anchor.current) return setPos(null);
    // The wrapper is display: contents (no box of its own): measure the bubble inside it.
    const r = (anchor.current.firstElementChild ?? anchor.current).getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 16);
    const h = card.current?.offsetHeight ?? 200;
    const up = r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8, Math.max(r.left, 8)));
    setPos({ left, top: up ? r.top - 8 - h : r.bottom + 8, up });
  }, [show, threads.length]);
  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [show]);
  const ordered = [...threads].reverse();
  return (
    <>
      <span ref={anchor} className="contents" onPointerEnter={enter} onPointerLeave={leave} onFocus={enter} onBlur={leave} onClick={() => setShow(false)}>
        {children}
      </span>
      {show &&
        threads.length > 0 &&
        createPortal(
          <div
            ref={card}
            role="tooltip"
            className="no-print fixed z-[90] w-[min(320px,calc(100vw-16px))] max-h-[min(360px,60vh)] overflow-y-auto overscroll-contain rounded-xl border border-teton-off-white bg-white text-teton-ink shadow-[0_12px_32px_rgba(0,0,0,.18)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none] text-left font-sans"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={leave}
          >
            <p className="sticky top-0 bg-white/95 backdrop-blur px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-[.7px] text-teton-ui-gray border-b border-teton-off-white">
              {threads.length} open comment{threads.length === 1 ? '' : 's'} · click to open
            </p>
            <ul className="divide-y divide-teton-off-white">
              {ordered.map((t) => (
                <li key={t.id} className="px-3 py-2">
                  <HoverComment c={t} />
                  {t.replies.length > 0 && (
                    <ul className="mt-1.5 ml-2 pl-2.5 border-l-2 border-teton-off-white space-y-1.5">
                      {t.replies.map((r) => (
                        <li key={r.id}>
                          <HoverComment c={r} />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}

function HoverComment({ c }: { c: ProposalComment }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] text-teton-ui-gray">
        <AuthorPill person={c.author} />
        <b className="font-semibold text-teton-ink truncate">{c.author.name}</b>
        <span className="flex-shrink-0">{ago(c.createdAt)}</span>
        {c.draft ? <span className="flex-shrink-0 rounded bg-teton-almost-white px-1 text-[9px] font-semibold">draft</span> : c.versionNo != null && <span className="flex-shrink-0 rounded bg-teton-almost-white px-1 text-[9px] font-semibold">on v{c.versionNo}</span>}
      </div>
      <p className="mt-0.5 text-[12.5px] leading-snug whitespace-pre-wrap break-words line-clamp-6">{c.body}</p>
    </div>
  );
}

export interface FilterOption {
  key: string;
  label: string;
  count: number;
}
/**
 * "Filter by section" under the drawer's toggles: a row that opens a list of checkboxes (several can be picked),
 * with counts, Select all / With open comments and Clear. Closed with a filter on, chips name what's picked.
 */
export function SectionFilter({ title, allLabel, options, picked, onChange }: { title: string; allLabel: string; options: FilterOption[]; picked: string[]; onChange: (keys: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const has = options.filter((o) => o.count > 0);
  // Options with comments first (in their order), then the rest, greyed.
  const sorted = [...has, ...options.filter((o) => o.count === 0)];
  const label = (k: string) => options.find((o) => o.key === k)?.label ?? k;
  const toggle = (k: string) => onChange(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]);
  return (
    <div className="mt-2">
      <div className={`flex items-center gap-2 border border-teton-off-white bg-teton-almost-white px-2 py-1.5 text-xs font-semibold text-teton-dark-gray transition-[border-radius] duration-200 ${open ? 'rounded-t-lg' : 'rounded-lg'}`}>
        <button type="button" className="flex flex-1 min-w-0 items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <svg className={`w-3 h-3 flex-shrink-0 text-teton-ui-gray transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          {title}
          {picked.length > 0 ? (
            <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-[#3F8CEA] text-white text-[10px] font-bold leading-none">{picked.length}</span>
          ) : (
            <span className="ml-auto font-medium text-teton-ui-gray">{allLabel}</span>
          )}
        </button>
        {picked.length > 0 && (
          <button type="button" className="ml-auto text-[11px] font-semibold text-[#1F5FB5] hover:underline" onClick={() => onChange([])}>
            Clear
          </button>
        )}
      </div>
      <Collapse open={open}>
        <div className="rounded-b-lg border border-t-0 border-teton-off-white bg-teton-almost-white px-2.5 pb-2 pt-1">
          <div className="flex gap-3 border-b border-teton-off-white pb-1.5 mb-1 text-[11px] font-semibold text-[#1F5FB5]">
            <button type="button" className="hover:underline" onClick={() => onChange(options.map((o) => o.key))}>
              Select all
            </button>
            <button type="button" className="hover:underline disabled:opacity-40 disabled:no-underline" disabled={!has.length} onClick={() => onChange(has.map((o) => o.key))}>
              With comments
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto overscroll-contain">
            {sorted.map((o) => {
              const on = picked.includes(o.key);
              return (
                <li key={o.key || '_whole'}>
                  <label className={`flex items-center gap-2 py-1.5 px-0.5 text-[12.5px] cursor-pointer rounded hover:bg-white ${o.count ? 'text-teton-ink' : 'text-teton-light-gray'}`}>
                    <input type="checkbox" className="w-3.5 h-3.5 accent-teton-ink" checked={on} onChange={() => toggle(o.key)} />
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    <span className="tabular-nums text-[11px] text-teton-ui-gray">{o.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      </Collapse>
      {!open && picked.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {picked.map((k) => (
            <span key={k || '_whole'} className="inline-flex items-center gap-1 rounded-full bg-[#E5EEFC] pl-2 pr-1 py-0.5 text-[11px] font-semibold text-[#1F5FB5] [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]">
              <span className="max-w-[12rem] truncate">{label(k)}</span>
              <button type="button" className="w-4 h-4 rounded-full hover:bg-white/70 leading-none" aria-label={`Stop filtering by ${label(k)}`} onClick={() => toggle(k)}>
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

/**
 * The sidebar's Notifications and Open Tasks: count bubbles, and a drawer for each that slides out from the
 * sidebar's right edge (from the left edge on phones). Notifications: everything unread across your deals, grouped
 * by deal. Open Tasks: My Tasks / Assigned by Me / All My Deals, ticked off in place.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SegGroup } from '@/components/form/SegGroup';
import { Collapse } from '@/components/form/fields';
import type { DealNotifications } from '@/lib/data/notifications';
import type { ProspectNotification } from '@/lib/data/shareLinks';
import type { Task } from '@/lib/data/tasks';
import { AuthorPill } from '@/components/quote/PlanNotes';
import { DueChip, PriorityTag, TaskCheck, TASKS_CHANGED, Who } from '@/components/quote/TasksPanel';

export type InboxKind = 'notifications' | 'tasks';
interface Ctx {
  open: InboxKind | null;
  toggle: (k: InboxKind) => void;
  close: () => void;
  counts: { notifications: number; tasks: number; overdue: number };
}
const InboxContext = createContext<Ctx | null>(null);
export const useInbox = () => useContext(InboxContext);
/** Something was read or changed elsewhere: refresh the counts. */
export const NOTIFICATIONS_CHANGED = 'teton:notifications-changed';

export const BELL = 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0';
export const TASKS_ICON = 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11';

export function InboxProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<InboxKind | null>(null);
  const [counts, setCounts] = useState({ notifications: 0, tasks: 0, overdue: 0 });
  const refresh = useCallback(async () => {
    try {
      const [n, t] = await Promise.all([fetch('/api/me/notifications', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)), fetch('/api/me/tasks?counts=1', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))]);
      setCounts({ notifications: n?.total ?? 0, tasks: t?.counts?.open ?? 0, overdue: t?.counts?.overdue ?? 0 });
    } catch {}
  }, []);
  useEffect(() => {
    void refresh();
    const on = () => void refresh();
    const events = [TASKS_CHANGED, NOTIFICATIONS_CHANGED, 'teton:mentions-read', 'focus'];
    events.forEach((e) => window.addEventListener(e, on));
    const t = setInterval(on, 120000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, on));
      clearInterval(t);
    };
  }, [refresh]);
  const value = useMemo<Ctx>(() => ({ open, counts, toggle: (k) => setOpen((o) => (o === k ? null : k)), close: () => setOpen(null) }), [open, counts]);
  return (
    <InboxContext.Provider value={value}>
      {children}
      <InboxDrawer kind={open} onClose={() => setOpen(null)} onChanged={refresh} />
    </InboxContext.Provider>
  );
}

/** A count bubble: on the icon when the sidebar is collapsed, at the end of the row when it's open. */
export function CountBubble({ n, red, onIcon }: { n: number; red?: boolean; onIcon?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full text-white font-bold leading-none [animation:fadeScale_.2s_ease-out] motion-reduce:[animation:none] ${red ? 'bg-[#E5553B]' : 'bg-[#3F8CEA]'} ${onIcon ? 'absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 text-[9px] ring-2 ring-brand-primary' : 'ml-auto min-w-[18px] h-[18px] px-1.5 text-[10px]'}`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

const ago = (iso: string) => {
  const t = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(t)) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
};

function InboxDrawer({ kind, onClose, onChanged }: { kind: InboxKind | null; onClose: () => void; onChanged: () => void }) {
  // Keep showing the last content while the drawer leaves.
  const [shown, setShown] = useState<InboxKind | null>(kind);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (kind) {
      setShown(kind);
      setClosing(false);
    } else if (shown) {
      setClosing(true);
      const t = setTimeout(() => {
        setShown(null);
        setClosing(false);
      }, 200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);
  useEffect(() => {
    if (!kind) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [kind, onClose]);
  if (!shown) return null;
  return createPortal(
    <div className="no-print fixed inset-y-0 right-0 z-[70] left-0 lg:left-[var(--sidebar-w,68px)]" role="dialog" aria-label={shown === 'tasks' ? 'Open tasks' : 'Notifications'}>
      {/* The page behind: a click closes the drawer (dimmed on phones). */}
      <button type="button" tabIndex={-1} aria-label="Close" className={`absolute inset-0 bg-black/40 lg:bg-black/10 transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={onClose} />
      <div
        className={`relative h-full w-[min(400px,calc(100vw-2rem))] bg-white text-teton-ink shadow-[12px_0_32px_rgba(0,0,0,.18)] flex flex-col pt-[env(safe-area-inset-top)] transition-transform duration-200 ease-in motion-reduce:transition-none [animation:slideFromLeft_.25s_ease-out] motion-reduce:[animation:none] ${closing ? '-translate-x-full' : ''}`}
      >
        {shown === 'tasks' ? <TasksDrawer onClose={onClose} onChanged={onChanged} /> : <NotificationsDrawer onClose={onClose} onChanged={onChanged} />}
      </div>
    </div>,
    document.body,
  );
}

function DrawerHead({ title, onClose, children }: { title: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-2">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
      <button type="button" className="ml-auto w-8 h-8 rounded-md text-teton-ui-gray hover:bg-teton-almost-white" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

type Scope = 'mine' | 'byme' | 'all';
function TasksDrawer({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>('mine');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [leaving, setLeaving] = useState<number[]>([]);
  const load = useCallback(async (s: Scope) => {
    const r = await fetch(`/api/me/tasks?scope=${s}`, { cache: 'no-store' });
    const j = r.ok ? ((await r.json()) as { tasks: Task[] }) : { tasks: [] };
    setTasks(j.tasks);
  }, []);
  useEffect(() => {
    void load(scope);
  }, [scope, load]);
  const tick = async (t: Task) => {
    setLeaving((l) => [...l, t.id]);
    const r = await fetch(`/api/quotes/${t.quoteId}/tasks/${t.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ done: true }) });
    setTimeout(() => {
      setLeaving((l) => l.filter((x) => x !== t.id));
      if (r.ok) setTasks((list) => list?.filter((x) => x.id !== t.id) ?? list);
    }, 350);
    window.dispatchEvent(new Event(TASKS_CHANGED));
    onChanged();
  };
  const groups = new Map<number, Task[]>();
  for (const t of tasks ?? []) groups.set(t.quoteId, [...(groups.get(t.quoteId) ?? []), t]);
  const overdue = (tasks ?? []).filter((t) => t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10)).length;
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  return (
    <>
      <DrawerHead title="Open Tasks" onClose={onClose}>
        {tasks && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-teton-almost-white text-teton-dark-gray">{tasks.length}</span>}
        {overdue > 0 && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FCE3DD] text-[#B23A26]">{overdue} overdue</span>}
      </DrawerHead>
      <div className="px-4 pb-3 border-b border-teton-off-white">
        <SegGroup role="group" label="Show" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-xs">
          {(
            [
              ['mine', 'My Tasks'],
              ['byme', 'Assigned by Me'],
              ['all', 'All My Deals'],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={scope === k} className={`flex-1 px-1.5 py-1.5 rounded-md font-semibold whitespace-nowrap transition-colors duration-200 ${scope === k ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => setScope(k)}>
              {label}
            </button>
          ))}
        </SegGroup>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {tasks === null && <p className="px-4 py-8 text-center text-sm text-teton-ui-gray">Loading…</p>}
        {tasks?.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-teton-ui-gray">{scope === 'mine' ? 'Nothing assigned to you. 🎉' : scope === 'byme' ? 'No open tasks that you added.' : 'No open tasks on your deals.'}</p>
        )}
        {[...groups.entries()].map(([quoteId, list]) => (
          <section key={quoteId} className="pt-2">
            <div className="flex items-center px-4 pb-1 pt-1">
              <h3 className="text-[10px] font-extrabold uppercase tracking-[.7px] text-teton-ui-gray truncate">{list[0].dealName}</h3>
              <button type="button" className="ml-auto text-[11px] font-semibold text-[#1F5FB5] hover:underline whitespace-nowrap" onClick={() => go(`/quotes/${quoteId}`)}>
                Open deal →
              </button>
            </div>
            <ul>
              {list.map((t) => {
                const gone = leaving.includes(t.id);
                return (
                  <li key={t.id} className={`grid transition-[grid-template-rows,opacity] duration-300 motion-reduce:transition-none ${gone ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}>
                    <div className="overflow-hidden">
                      <div className="flex items-start gap-2.5 px-4 py-2 hover:bg-teton-almost-white">
                        <TaskCheck done={gone} title={t.title} onToggle={() => !gone && void tick(t)} />
                        <div className="min-w-0 flex-1">
                          <button type="button" className="text-left text-[13px] font-semibold leading-snug hover:underline underline-offset-2" onClick={() => go(`/quotes/${t.quoteId}?task=${t.id}`)}>
                            {t.title}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {t.priority && <PriorityTag p={t.priority} />}
                            <DueChip due={t.dueDate} />
                          </div>
                          {scope === 'mine' ? (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-teton-ui-gray">
                              <span className="text-[9.5px] font-extrabold uppercase tracking-[.6px] text-teton-light-gray">By</span>
                              <span title={t.createdBy.name}>
                                <AuthorPill person={t.createdBy} className="!px-1 !py-0" />
                              </span>
                            </div>
                          ) : (
                            <Who t={t} me={null} />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

function NotificationsDrawer({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<{ deals: DealNotifications[]; total: number } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch('/api/me/notifications', { cache: 'no-store' });
    setData(r.ok ? await r.json() : { deals: [], total: 0 });
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const busy = useRef(false);
  const read = async (body: Record<string, unknown>) => {
    if (busy.current) return;
    busy.current = true;
    await fetch('/api/me/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
    busy.current = false;
    await load();
    onChanged();
  };
  const go = (href: string, body: Record<string, unknown>) => {
    void read(body);
    onClose();
    router.push(href);
  };
  const row = (key: string, icon: React.ReactNode, text: React.ReactNode, sub: string, open: () => void, mark: () => void) => (
    <li key={key} className="flex items-start gap-2 px-4 py-2 bg-[#F5F9FF] hover:bg-[#EDF4FE] transition-colors">
      <button type="button" className="flex flex-1 min-w-0 items-start gap-2 text-left" onClick={open}>
        <span className="mt-0.5 w-[22px] h-[22px] flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold">{icon}</span>
        <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
          {text}
          <span className="block text-[11px] text-teton-ui-gray truncate">{sub}</span>
        </span>
      </button>
      <button type="button" className="flex-shrink-0 rounded-md border border-teton-pale-gray bg-white px-2 py-0.5 text-[11px] font-medium text-teton-dark-gray hover:bg-teton-almost-white" onClick={mark}>
        Read
      </button>
    </li>
  );
  return (
    <>
      <DrawerHead title="Notifications" onClose={onClose}>
        {data && data.total > 0 && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-teton-almost-white text-teton-dark-gray">{data.total} unread</span>}
      </DrawerHead>
      {data && data.total > 0 && (
        <div className="flex justify-end px-4 pb-2">
          <button type="button" className="btn-secondary py-0.5 px-2 text-[11px]" onClick={() => void read({ all: true })}>
            Mark all as read
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-t border-teton-off-white pb-[env(safe-area-inset-bottom)]">
        {data === null && <p className="px-4 py-8 text-center text-sm text-teton-ui-gray">Loading…</p>}
        {data?.total === 0 && <p className="px-4 py-10 text-center text-sm text-teton-ui-gray">You’re all caught up.</p>}
        {data?.deals.map((d) => (
          <section key={d.quoteId} className="pt-2">
            <div className="flex items-center px-4 pb-1 pt-1">
              <h3 className="text-[10px] font-extrabold uppercase tracking-[.7px] text-teton-ui-gray truncate">{d.dealName}</h3>
              <Link href={`/quotes/${d.quoteId}`} className="ml-auto text-[11px] font-semibold text-[#1F5FB5] hover:underline whitespace-nowrap" onClick={onClose}>
                Open deal →
              </Link>
            </div>
            <ul className="divide-y divide-white">
              {d.tasks.map((n) =>
                row(
                  `t${n.id}`,
                  <span className={`w-full h-full rounded-full flex items-center justify-center ${n.kind === 'task_overdue' ? 'bg-[#FCE3DD] text-[#B23A26]' : 'bg-[#E5EEFC] text-[#1F5FB5]'}`}>{n.kind === 'task_overdue' ? '!' : '✓'}</span>,
                  n.kind === 'task_overdue' ? (
                    <>
                      Task <b>{n.days} days overdue</b>
                    </>
                  ) : (
                    <>
                      <b>{n.actor?.name ?? 'Someone'}</b> assigned you a task
                    </>
                  ),
                  `${n.taskTitle} · ${ago(n.createdAt)}`,
                  () => go(`/quotes/${d.quoteId}?task=${n.taskId}`, { tasks: [n.id] }),
                  () => void read({ tasks: [n.id] }),
                ),
              )}
              {d.mentions.map((m) =>
                row(
                  `m${m.id}`,
                  <span className="w-full h-full rounded-full flex items-center justify-center bg-[#E5EEFC] text-[#1F5FB5] font-extrabold">@</span>,
                  <>
                    <b>{m.author.name}</b> mentioned you
                  </>,
                  `${m.area === 'deliverable' ? 'Business case' : m.area === 'task' ? 'Task' : 'Inputs'} · ${m.label} · ${ago(m.createdAt)}`,
                  () => go(m.area === 'deliverable' && m.versionId ? `/proposal/${m.versionId}?comment=${m.threadId}` : `/quotes/${d.quoteId}?comment=${m.threadId}`, { quoteId: d.quoteId, mentions: [m.id] }),
                  () => void read({ quoteId: d.quoteId, mentions: [m.id] }),
                ),
              )}
              {d.plan.map((u) =>
                row(
                  `p${u.kind}${u.id}`,
                  <span className="w-full h-full rounded-full flex items-center justify-center bg-[#FFF1DC] text-[#8A5A00]">▲</span>,
                  <>
                    <b>{u.author.name}</b> {u.kind === 'note' ? `added note ${u.noteNumber}` : u.noteId != null ? `commented on note ${u.noteNumber}` : 'left a comment'} on the floor plan
                  </>,
                  `${u.planName} · ${ago(u.createdAt)}`,
                  () => go(`/quotes/${d.quoteId}`, { quoteId: d.quoteId, plan: [{ kind: u.kind, id: u.id }] }),
                  () => void read({ quoteId: d.quoteId, plan: [{ kind: u.kind, id: u.id }] }),
                ),
              )}
              {d.prospect.map((n) =>
                n.kind === 'prospect_agreement' ? (
                  <AgreementRow key={`pr${n.id}`} n={n} dealName={d.dealName} open={() => go(`/quotes/${d.quoteId}`, { prospect: [n.id] })} read={() => void read({ prospect: [n.id] })} />
                ) : (
                <ProspectRow
                  key={`pr${n.id}`}
                  n={n}
                  open={() => go(n.versionId && n.threadId ? `/proposal/${n.versionId}?comment=${n.threadId}` : `/quotes/${d.quoteId}`, { prospect: [n.id] })}
                  read={() => void read({ prospect: [n.id] })}
                />
                ),
              )}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** A prospect asked for the agreement: what they confirmed or changed, and their note. */
function AgreementRow({ n, dealName, open, read }: { n: ProspectNotification; dealName: string; open: () => void; read: () => void }) {
  const a = n.agreement;
  const st = (s: string | undefined) =>
    s === 'confirmed' ? <span className="text-[#256B41]">✓ Confirmed</span> : s === 'updated' ? <span className="text-[#1F5FB5]">✎ Updated</span> : <span className="text-teton-ui-gray">Not confirmed</span>;
  const sig = a?.signatory.value;
  const was = a?.signatory.status === 'updated' ? a.signatory.was : null;
  const missing = a?.communities.list.filter((c) => !c.hasPlan).map((c) => c.name) ?? [];
  const lines: Array<[string, React.ReactNode, string | undefined]> = a
    ? [
        ['Legal entity', <>{a.entity.value || '—'}{a.entity.status === 'updated' && a.entity.was && <span className="block text-[11px] text-teton-ui-gray line-through">{a.entity.was}</span>}</>, a.entity.status],
        [
          'Signatory',
          <>
            {sig ? [`${sig.first} ${sig.last}`.trim(), sig.title].filter(Boolean).join(', ') : '—'}
            {was && <span className="block text-[11px] text-teton-ui-gray line-through">{[`${was.first} ${was.last}`.trim(), was.title, was.email !== sig?.email ? was.email : ''].filter(Boolean).join(', ')}</span>}
          </>,
          a.signatory.status,
        ],
        [
          a.communities.pilot ? 'Pilot communities' : 'Communities',
          <>
            {a.communities.list.length}
            {missing.length > 0 && <span className="text-[#9A2E1C]"> · {missing.join(', ')} {missing.length === 1 ? 'needs' : 'need'} floor plans</span>}
            {a.communities.change && <span className="block text-[11.5px] text-teton-dark-gray">“{a.communities.change}”</span>}
          </>,
          a.communities.status,
        ],
      ]
    : [];
  const tag = <span className="ml-1 rounded-full bg-[#FDF0EE] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[.4px] text-[#A63A22] align-middle">Prospect</span>;
  return (
    <li className="px-4 py-2.5 bg-[#F5F9FF]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-[22px] h-[22px] flex-shrink-0 rounded-full grid place-items-center text-[11px] bg-[#FDF0EE]" aria-hidden="true">✍</span>
        <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
          <b>{n.who}</b>
          {tag} requested the agreement for review on <b>{dealName}</b>
          <span className="block text-[11px] text-teton-ui-gray">{ago(n.createdAt)}</span>
          {lines.length > 0 && (
            <div className="mt-2 rounded-lg border border-teton-off-white border-l-[3px] border-l-[#2E9A5B] bg-white px-2.5 py-0.5">
              {lines.map(([k, v, s], i) => (
                <div key={k} className={`flex gap-2 py-1.5 text-[12px] text-teton-dark-gray ${i ? 'border-t border-teton-off-white' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <b className="font-semibold text-teton-ink">{k}</b> · {v}
                  </span>
                  <span className="flex-shrink-0 text-[11px] font-semibold">{st(s)}</span>
                </div>
              ))}
            </div>
          )}
          {n.body && <p className="mt-1.5 rounded-lg border border-teton-off-white border-l-[3px] border-l-[#D9553F] bg-white px-2.5 py-1.5 text-[12.5px] text-teton-dark-gray whitespace-pre-wrap break-words">{n.body}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button type="button" className="rounded-md bg-teton-ink px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90" onClick={open}>
              Open deal details ↗
            </button>
            <button type="button" className="rounded-md border border-teton-pale-gray bg-white px-2 py-0.5 text-[11px] font-medium text-teton-dark-gray hover:bg-teton-almost-white" onClick={read}>
              Read
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

/** A prospect's comment on the shared link (reply right here), or their first visit. */
function ProspectRow({ n, open, read }: { n: ProspectNotification; open: () => void; read: () => void }) {
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!reply.trim() || !n.versionId || !n.threadId) return;
    setSending(true);
    setError(null);
    const r = await fetch(`/api/versions/${n.versionId}/comments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parentId: n.threadId, body: reply }) });
    setSending(false);
    if (!r.ok) return setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'Couldn’t send. Try again.');
    setReply('');
    read();
  };
  const tag = <span className="ml-1 rounded-full bg-[#FDF0EE] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-[.4px] text-[#A63A22] align-middle">Prospect</span>;
  return (
    <li className="px-4 py-2.5 bg-[#F5F9FF]">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 w-[22px] h-[22px] flex-shrink-0 rounded-full grid place-items-center text-[11px] font-bold bg-[#FDF0EE] text-[#A63A22]">{n.kind === 'prospect_open' ? '👁' : '💬'}</span>
        <div className="min-w-0 flex-1 text-[12.5px] leading-snug">
          {n.kind === 'prospect_open' ? (
            <>
              <b>{n.who}</b>
              {tag} opened your shared proposal
            </>
          ) : (
            <>
              <b>{n.who}</b>
              {tag} {n.reply ? 'replied on' : 'commented on'} <b>{n.label}</b>
            </>
          )}
          <span className="block text-[11px] text-teton-ui-gray">{ago(n.createdAt)}</span>
          {n.body && <p className="mt-1.5 rounded-lg border border-teton-off-white border-l-[3px] border-l-[#D9553F] bg-white px-2.5 py-1.5 text-[12.5px] text-teton-dark-gray whitespace-pre-wrap break-words">{n.body}</p>}
          {n.kind === 'prospect_comment' && (
            <Collapse open={replying}>
              {replying && (
              <>
              <div className="mt-2 flex gap-1.5">
                <textarea
                  className="flex-1 min-w-0 min-h-[34px] max-h-28 rounded-lg border border-teton-pale-gray px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#3F8CEA] focus:ring-2 focus:ring-[#3F8CEA]/15 resize-y"
                  placeholder="Reply… the prospect sees this"
                  value={reply}
                  rows={2}
                  onChange={(e) => setReply(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send();
                  }}
                  aria-label={`Reply to ${n.who}`}
                />
                <button type="button" className="self-end h-[34px] px-3 rounded-lg bg-teton-ink text-white text-[12px] font-semibold disabled:opacity-50" disabled={sending || !reply.trim()} onClick={() => void send()}>
                  {sending ? '…' : 'Reply'}
                </button>
              </div>
              {error && <p className="mt-1 text-[11.5px] text-[#B23A26]">{error}</p>}
              </>
              )}
            </Collapse>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {n.kind === 'prospect_comment' && !replying && (
              <button type="button" className="rounded-md border border-teton-pale-gray bg-white px-2 py-0.5 text-[11px] font-semibold text-teton-ink hover:bg-teton-almost-white" onClick={() => setReplying(true)}>
                Reply
              </button>
            )}
            {n.kind === 'prospect_comment' && (
              <button type="button" className="rounded-md border border-teton-pale-gray bg-white px-2 py-0.5 text-[11px] font-medium text-teton-dark-gray hover:bg-teton-almost-white" onClick={open}>
                Open in proposal ↗
              </button>
            )}
            <button type="button" className="rounded-md border border-teton-pale-gray bg-white px-2 py-0.5 text-[11px] font-medium text-teton-dark-gray hover:bg-teton-almost-white" onClick={read}>
              Read
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}


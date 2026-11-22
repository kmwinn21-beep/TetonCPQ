'use client';

/**
 * Right panel: Tasks. Assign tasks to the deal's people (any number, or no one), with an optional due date (a number
 * of days from today, or a date) and priority, and tick them off. Open / Completed toggle; open tasks are sorted by
 * priority then due date. Each task has a comment thread in the comments drawer (its 💬 button, with the hover
 * preview). Anyone on the deal adds, assigns and completes; the creator or an admin edits and deletes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import type { Person } from '@/lib/data/planNotes';
import type { Priority, Task } from '@/lib/data/tasks';
import { AuthorPill } from './PlanNotes';
import { BubbleIcon, CommentHoverCard } from '@/components/proposal/Comments';
import { SHOW_TASK, useInputComments } from './InputComments';
import { canAutoFocus } from '@/lib/client/focus';

/** Local today, yyyy-mm-dd. */
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const daysFromToday = (iso: string) => Math.round((new Date(`${iso}T12:00:00`).getTime() - new Date(`${localToday()}T12:00:00`).getTime()) / 86400000);
const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const long = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const doneDate = (s: string) => new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const PRIORITY_TAG: Record<Priority, { label: string; cls: string; mark: string }> = {
  high: { label: 'HIGH', cls: 'bg-[#FCE3DD] text-[#B23A26]', mark: '▲' },
  medium: { label: 'MED', cls: 'bg-[#FFF1DC] text-[#8A5A00]', mark: '●' },
  low: { label: 'LOW', cls: 'bg-[#EEF1F4] text-teton-dark-gray', mark: '' },
};
export function PriorityTag({ p }: { p: Priority }) {
  const t = PRIORITY_TAG[p];
  return (
    <span className={`inline-flex items-center gap-0.5 h-[18px] rounded-[5px] px-1.5 text-[10px] font-extrabold tracking-[.3px] ${t.cls}`}>
      {t.mark && <span aria-hidden="true">{t.mark}</span>}
      {t.label}
    </span>
  );
}
const CalIcon = () => (
  <svg className="w-[11px] h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
/** Due date chip: red once overdue, amber within 3 days. */
export function DueChip({ due }: { due: string | null }) {
  if (!due) return <span className="text-[11px] text-teton-light-gray">No due date</span>;
  const n = daysFromToday(due);
  const tone = n < 0 ? 'bg-[#FCE3DD] text-[#B23A26]' : n <= 3 ? 'bg-[#FFF1DC] text-[#8A5A00]' : 'bg-teton-almost-white text-teton-dark-gray';
  const when = n < 0 ? `${-n} day${n === -1 ? '' : 's'} overdue` : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  return (
    <span className={`inline-flex items-center gap-1 h-[18px] rounded-full px-1.5 text-[10.5px] font-semibold whitespace-nowrap ${tone}`}>
      <CalIcon />
      {short(due)} · {when}
    </span>
  );
}

/** "Assigned to" pills (two, then +N) and "By" initials. */
export function Who({ t, me }: { t: Task; me: number | null }) {
  const shown = t.assignees.slice(0, 2);
  const more = t.assignees.slice(2);
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-teton-ui-gray">
      <span className="text-[9.5px] font-extrabold uppercase tracking-[.6px] text-teton-light-gray">Assigned to</span>
      {t.assignees.length === 0 && <span className="italic text-teton-light-gray">Unassigned</span>}
      {shown.map((p) => (
        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-teton-almost-white pl-0.5 pr-1.5 py-px text-teton-ink font-semibold">
          <AuthorPill person={p} className="!px-1 !py-0" />
          {p.name}
          {p.id === me ? ' (you)' : ''}
        </span>
      ))}
      {more.length > 0 && (
        <span className="rounded-full bg-teton-almost-white px-1.5 py-px font-semibold text-teton-ink" title={more.map((p) => p.name).join(', ')}>
          +{more.length}
        </span>
      )}
      <span className="text-teton-pale-gray">·</span>
      <span className="text-[9.5px] font-extrabold uppercase tracking-[.6px] text-teton-light-gray">By</span>
      <span title={t.createdBy.name}>
        <AuthorPill person={t.createdBy} className="!px-1 !py-0" />
      </span>
    </div>
  );
}

export function TaskCheck({ done, disabled, onToggle, title }: { done: boolean; disabled?: boolean; onToggle: () => void; title: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? `Reopen “${title}”` : `Mark “${title}” complete`}
      disabled={disabled}
      onClick={onToggle}
      className={`mt-0.5 w-[18px] h-[18px] flex-shrink-0 rounded-full border-[1.6px] flex items-center justify-center transition-colors duration-200 disabled:cursor-default ${done ? 'bg-[#2E9E6B] border-[#2E9E6B] text-white' : 'border-[#b8c0c6] hover:border-[#2E9E6B] hover:bg-[#E6F4EC]'}`}
    >
      <svg className={`w-2.5 h-2.5 transition-transform duration-200 motion-reduce:transition-none ${done ? 'scale-100' : 'scale-0'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </button>
  );
}

export function TasksPanel({ quoteId }: { quoteId: number }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [me, setMe] = useState<number | null>(null);
  const [canWork, setCanWork] = useState(false);
  const [form, setForm] = useState<{ edit: Task | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const comments = useInputComments();

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      setError(null);
      const r = await fetch(`/api/quotes/${quoteId}/tasks${path}`, { cache: 'no-store', ...init, headers: { 'content-type': 'application/json' } });
      const j = (await r.json().catch(() => ({}))) as { tasks?: Task[]; people?: Person[]; me?: number; canWork?: boolean; error?: string; id?: number };
      if (!r.ok) {
        setError(j.error ?? 'Something went wrong. Try again.');
        return null;
      }
      if (j.tasks) setTasks(j.tasks);
      if (j.people) setPeople(j.people);
      if (j.me != null) setMe(j.me);
      if (j.canWork != null) setCanWork(j.canWork);
      window.dispatchEvent(new Event(TASKS_CHANGED));
      return j;
    },
    [quoteId],
  );
  useEffect(() => {
    void call('').then((j) => {
      // A link to one task (from the sidebar or a notification): show it.
      const id = Number(new URLSearchParams(window.location.search).get('task'));
      if (id && j) setTimeout(() => window.dispatchEvent(new CustomEvent(SHOW_TASK, { detail: id })), 50);
    });
  }, [call]);
  // Elsewhere asked to show a task (a notification, the comments drawer): open the card at it.
  useEffect(() => {
    const show = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      const t = tasks?.find((x) => x.id === id);
      if (!t) return;
      setOpen(true);
      setTab(t.completedAt ? 'done' : 'open');
      setFlash(id);
      setTimeout(() => document.getElementById(`task-${id}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' }), 320);
      setTimeout(() => setFlash(null), 2000);
    };
    window.addEventListener(SHOW_TASK, show);
    return () => window.removeEventListener(SHOW_TASK, show);
  }, [tasks]);

  if (!tasks) return null;
  const openTasks = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  const overdue = openTasks.filter((t) => t.dueDate && daysFromToday(t.dueDate) < 0).length;
  const mine = openTasks.filter((t) => t.assignees.some((p) => p.id === me)).length;
  const list = tab === 'open' ? openTasks : done;
  const startNew = () => {
    setOpen(true);
    setTab('open');
    setForm({ edit: null });
  };
  return (
    <section className="card" aria-label="Tasks" id="deal-tasks">
      <div className="flex items-center gap-2">
        <button type="button" className="flex flex-1 min-w-0 items-center gap-2 text-left" aria-expanded={open} aria-controls="tasks-body" onClick={() => setOpen((o) => !o)}>
          <svg className={`w-4 h-4 flex-shrink-0 text-teton-ui-gray transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
          </svg>
          <h2 className="text-sm font-semibold">Tasks</h2>
          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-teton-almost-white text-teton-dark-gray whitespace-nowrap">{openTasks.length} open</span>
          {overdue > 0 && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FCE3DD] text-[#B23A26] whitespace-nowrap">{overdue} overdue</span>}
          {!open && mine > 0 && <span className="ml-auto text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#FFF1DC] text-[#8A5A00] whitespace-nowrap">{mine} yours</span>}
        </button>
        {open && canWork && !form && (
          <button type="button" className="btn-primary py-1 px-2.5 text-xs whitespace-nowrap [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]" onClick={startNew}>
            + Task
          </button>
        )}
      </div>
      <Collapse open={open} id="tasks-body">
        <div className="pt-3">
          <Collapse open={!!form}>
            {form && (
              <TaskForm
                key={form.edit?.id ?? 'new'}
                task={form.edit}
                people={people}
                me={me}
                onCancel={() => setForm(null)}
                onDelete={
                  form.edit?.canEdit
                    ? async () => {
                        if (!window.confirm('Delete this task and its comments?')) return;
                        if (await call(`/${form.edit!.id}`, { method: 'DELETE' })) setForm(null);
                      }
                    : undefined
                }
                onSave={async (v) => {
                  const j = form.edit ? await call(`/${form.edit.id}`, { method: 'PATCH', body: JSON.stringify(v) }) : await call('', { method: 'POST', body: JSON.stringify(v) });
                  if (j) setForm(null);
                }}
              />
            )}
          </Collapse>
          {error && <p className="mb-2 rounded-md bg-teton-red/30 px-2.5 py-1.5 text-xs text-[#9A2E1C]" role="alert">{error}</p>}
          <SegGroup role="group" label="Show" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-xs">
            {(
              [
                ['open', `Open ${openTasks.length}`],
                ['done', `Completed ${done.length}`],
              ] as const
            ).map(([k, label]) => (
              <button key={k} type="button" aria-pressed={tab === k} className={`flex-1 px-2 py-1.5 rounded-md font-semibold transition-colors duration-200 ${tab === k ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </SegGroup>
          <ul className="mt-1 divide-y divide-teton-off-white">
            {list.length === 0 && (
              <li className="py-6 text-center text-xs text-teton-ui-gray">
                {tab === 'open' ? (canWork ? 'No open tasks. Add one with + Task.' : 'No open tasks.') : 'Nothing completed yet.'}
              </li>
            )}
            {list.map((t) => {
              const threads = comments?.threads.filter((c) => c.area === 'task' && c.page === String(t.id)) ?? [];
              const openThreads = threads.filter((c) => !c.resolvedAt);
              return (
                <li key={t.id} id={`task-${t.id}`} className={`flex items-start gap-2.5 py-2.5 px-1 -mx-1 rounded-lg transition-colors duration-500 drawer-in ${flash === t.id ? 'bg-[#F5F9FF]' : ''}`}>
                  <TaskCheck done={!!t.completedAt} disabled={!canWork} title={t.title} onToggle={() => void call(`/${t.id}`, { method: 'PATCH', body: JSON.stringify({ done: !t.completedAt }) })} />
                  <div className="min-w-0 flex-1">
                    {t.canEdit && !t.completedAt ? (
                      <button type="button" className="text-left text-[13px] font-semibold leading-snug hover:underline underline-offset-2" onClick={() => setForm({ edit: t })} title="Edit this task">
                        {t.title}
                      </button>
                    ) : (
                      <p className={`text-[13px] leading-snug ${t.completedAt ? 'line-through text-teton-ui-gray' : 'font-semibold'}`}>{t.title}</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {t.completedAt ? (
                        <span className="text-[10px] font-bold px-2 py-px rounded-full bg-teton-pale-green text-[#256B41]">
                          Done {doneDate(t.completedAt)}
                          {t.completedBy ? ` by ${t.completedBy.name.split(' ')[0]}` : ''}
                        </span>
                      ) : (
                        <>
                          {t.priority && <PriorityTag p={t.priority} />}
                          <DueChip due={t.dueDate} />
                        </>
                      )}
                    </div>
                    <Who t={t} me={me} />
                  </div>
                  {comments && (
                    <CommentHoverCard threads={comments.composing === `task:${t.id}` ? [] : openThreads}>
                      <button
                        type="button"
                        className={`flex-shrink-0 inline-flex items-center gap-1 h-7 min-w-[28px] justify-center px-1.5 rounded-lg border text-[11px] font-bold transition-colors duration-200 ${comments.composing === `task:${t.id}` ? 'bg-[#3F8CEA] border-[#3F8CEA] text-white' : openThreads.length ? 'border-[#9cc0f0] bg-[#F5F9FF] text-[#1F5FB5] hover:bg-[#E9F2FE]' : 'border-teton-pale-gray bg-white text-teton-dark-gray hover:bg-teton-off-white'}`}
                        onClick={() => comments.open({ task: { id: t.id, title: t.title } })}
                        aria-label={openThreads.length ? `${openThreads.length} open comment${openThreads.length === 1 ? '' : 's'} on this task; add a comment` : `Comment on “${t.title}”`}
                      >
                        <BubbleIcon className="w-3.5 h-3.5" />
                        {openThreads.length > 0 && <span className="tabular-nums">{openThreads.length}</span>}
                      </button>
                    </CommentHoverCard>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Collapse>
    </section>
  );
}

/** Tasks changed (added, ticked, edited): the sidebar's counts refresh. */
export const TASKS_CHANGED = 'teton:tasks-changed';

const DAY_CHIPS = [1, 3, 7, 14, 30];
function TaskForm({ task, people, me, onCancel, onSave, onDelete }: { task: Task | null; people: Person[]; me: number | null; onCancel: () => void; onSave: (v: { title: string; assignees: number[]; priority: Priority | null; dueDate: string | null }) => Promise<void>; onDelete?: () => void }) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [assignees, setAssignees] = useState<number[]>(task?.assignees.map((p) => p.id) ?? []);
  const [due, setDue] = useState<string | null>(task?.dueDate ?? null);
  const [days, setDays] = useState<string>(task?.dueDate && daysFromToday(task.dueDate) >= 0 ? String(daysFromToday(task.dueDate)) : '');
  const [priority, setPriority] = useState<Priority | null>(task?.priority ?? null);
  const [q, setQ] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!canAutoFocus()) return;
    const t = setTimeout(() => titleRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);
  const setByDays = (n: number) => {
    setDays(String(n));
    setDue(addDays(localToday(), n));
  };
  const options = people.filter((p) => !assignees.includes(p.id) && p.name.toLowerCase().includes(q.toLowerCase()));
  const byId = new Map(people.map((p) => [p.id, p]));
  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    await onSave({ title: title.trim(), assignees, priority, dueDate: due });
    setBusy(false);
  };
  const eyebrow = 'block text-[9.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray mb-1';
  return (
    <div
      className="mb-3 rounded-xl border border-[#D6E4F7] bg-[#F8FBFF] p-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save();
      }}
    >
      <label className={eyebrow} htmlFor="task-title">
        Task
      </label>
      <input
        id="task-title"
        ref={titleRef}
        className="input-field w-full"
        value={title}
        maxLength={300}
        placeholder="What needs doing?"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void save();
          }
        }}
      />
      <div className="mt-2.5">
        <span className={eyebrow}>
          Assign to <span className="normal-case tracking-normal font-medium">(optional, any number)</span>
        </span>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-teton-pale-gray bg-white px-1.5 py-1 min-h-[2.25rem] focus-within:border-[#3F8CEA] focus-within:ring-2 focus-within:ring-[#3F8CEA]/20">
            {assignees.map((id) => {
              const p = byId.get(id);
              if (!p) return null;
              return (
                <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#E5EEFC] pl-0.5 pr-1 py-px text-[11.5px] font-semibold text-[#1F5FB5]">
                  <AuthorPill person={p} className="!px-1 !py-0" />
                  {p.name}
                  <button type="button" className="w-4 h-4 rounded-full hover:bg-white/70 leading-none" aria-label={`Unassign ${p.name}`} onClick={() => setAssignees((a) => a.filter((x) => x !== id))}>
                    ✕
                  </button>
                </span>
              );
            })}
            <input
              className="flex-1 min-w-[6rem] bg-transparent text-[12.5px] outline-none px-1 py-0.5"
              placeholder={assignees.length ? 'Add someone…' : 'Unassigned — type a name'}
              aria-label="Assign to"
              value={q}
              onFocus={() => setPickOpen(true)}
              onBlur={() => setTimeout(() => setPickOpen(false), 150)}
              onChange={(e) => {
                setQ(e.target.value);
                setPickOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && options[0]) {
                  e.preventDefault();
                  setAssignees((a) => [...a, options[0].id]);
                  setQ('');
                }
                if (e.key === 'Backspace' && !q && assignees.length) setAssignees((a) => a.slice(0, -1));
              }}
            />
          </div>
          {pickOpen && (
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-teton-off-white bg-white py-1 shadow-lg [animation:fadeIn_.15s_ease-out] motion-reduce:[animation:none]" role="listbox" aria-label="People on this deal">
              {options.map((p) => (
                <li key={p.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-[#F3F7FD]" onMouseDown={(e) => e.preventDefault()} onClick={() => (setAssignees((a) => [...a, p.id]), setQ(''))}>
                    <AuthorPill person={p} />
                    {p.name}
                    {p.id === me && <span className="text-teton-ui-gray">(you)</span>}
                  </button>
                </li>
              ))}
              <li className="px-2.5 py-1 text-[11px] text-teton-ui-gray">{options.length ? 'Only the deal’s owner and collaborators can be assigned' : 'Everyone on the deal is assigned'}</li>
            </ul>
          )}
        </div>
      </div>
      <div className="mt-2.5">
        <span className={eyebrow}>
          Due <span className="normal-case tracking-normal font-medium">(optional)</span>
        </span>
        <div className="flex flex-wrap gap-1">
          {DAY_CHIPS.map((n) => {
            const on = due != null && days === String(n) && due === addDays(localToday(), n);
            return (
              <button key={n} type="button" aria-pressed={on} className={`rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold transition-colors duration-200 ${on ? 'bg-teton-ink border-teton-ink text-white' : 'bg-white border-teton-pale-gray hover:bg-teton-off-white'}`} onClick={() => setByDays(n)}>
                {n} day{n === 1 ? '' : 's'}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          <span>In</span>
          <input
            type="number"
            min={0}
            max={3650}
            inputMode="numeric"
            className="input-field w-16 text-center py-1"
            aria-label="Days from today"
            value={days}
            onChange={(e) => {
              setDays(e.target.value);
              const n = Number(e.target.value);
              setDue(e.target.value !== '' && Number.isFinite(n) && n >= 0 ? addDays(localToday(), Math.min(3650, Math.round(n))) : null);
            }}
          />
          <span>days</span>
          <span className="text-teton-light-gray">or</span>
          <input
            type="date"
            className="input-field py-1 flex-1 min-w-[9rem]"
            aria-label="Due date"
            value={due ?? ''}
            onChange={(e) => {
              const v = e.target.value || null;
              setDue(v);
              setDays(v && daysFromToday(v) >= 0 ? String(daysFromToday(v)) : '');
            }}
          />
        </div>
        <p className="mt-1 h-4 text-[11.5px] font-semibold text-[#256B41]">
          {due && (
            <>
              Due {long(due)}
              {' · '}
              <button type="button" className="font-semibold text-[#1F5FB5] hover:underline" onClick={() => (setDue(null), setDays(''))}>
                clear
              </button>
            </>
          )}
        </p>
      </div>
      <div className="mt-2">
        <span className={eyebrow}>
          Priority <span className="normal-case tracking-normal font-medium">(optional)</span>
        </span>
        <SegGroup role="radiogroup" label="Priority" thumbClass="bg-white shadow-sm" className="flex rounded-lg bg-teton-almost-white p-0.5 text-[11.5px]">
          {(
            [
              [null, 'None'],
              ['low', 'Low'],
              ['medium', 'Medium'],
              ['high', 'High'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={priority === v}
              className={`flex-1 px-2 py-1 rounded-md font-semibold transition-colors duration-200 ${priority === v ? (v === 'high' ? 'text-[#B23A26]' : v === 'medium' ? 'text-[#8A5A00]' : 'text-teton-ink') : 'text-teton-ui-gray hover:text-teton-ink'}`}
              onClick={() => setPriority(v)}
            >
              {label}
            </button>
          ))}
        </SegGroup>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2">
        {onDelete && (
          <button type="button" className="mr-auto text-xs font-medium text-[#B23A26] hover:underline" onClick={onDelete}>
            Delete task
          </button>
        )}
        <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary py-1 px-3 text-xs disabled:opacity-40" disabled={!title.trim() || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : task ? 'Save' : 'Add task'}
        </button>
      </div>
    </div>
  );
}

'use client';

/**
 * The deals page's Open Tasks count. Hovering it shows the deal's open tasks (display only: tick and edit them on
 * the deal page). Loaded on first hover.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Task } from '@/lib/data/tasks';
import { DueChip, PriorityTag } from './TasksPanel';

export function DealTasksBadge({ quoteId, open, overdue }: { quoteId: number; open: number; overdue: number }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const tone = overdue > 0 ? 'bg-[#E5553B] text-white' : open > 0 ? 'bg-[#3F8CEA] text-white' : 'bg-teton-off-white text-teton-ui-gray';
  const enter = (e: React.PointerEvent | React.FocusEvent) => {
    if (!open || ('pointerType' in e && e.pointerType === 'touch')) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setShow(true);
      if (!tasks)
        void fetch(`/api/quotes/${quoteId}/tasks`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : { tasks: [] }))
          .then((j: { tasks?: Task[] }) => setTasks((j.tasks ?? []).filter((t) => !t.completedAt)))
          .catch(() => setTasks([]));
    }, 180);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setShow(false), 160);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!show || !anchor.current) return setPos(null);
    const r = anchor.current.getBoundingClientRect();
    const w = Math.min(340, window.innerWidth - 16);
    const h = card.current?.offsetHeight ?? 160;
    const up = r.bottom + 8 + h > window.innerHeight && r.top - 8 - h > 0;
    setPos({ left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top: up ? r.top - 8 - h : r.bottom + 8 });
  }, [show, tasks]);
  useEffect(() => {
    if (!show) return;
    const hide = () => setShow(false);
    window.addEventListener('scroll', hide, true);
    return () => window.removeEventListener('scroll', hide, true);
  }, [show]);
  return (
    <>
      <span
        ref={anchor}
        tabIndex={open ? 0 : undefined}
        onPointerEnter={enter}
        onPointerLeave={leave}
        onFocus={enter}
        onBlur={leave}
        className={`inline-flex items-center justify-center min-w-[1.75rem] h-7 px-1.5 rounded-full text-xs font-bold tabular-nums ${tone} ${open ? 'cursor-default' : ''}`}
        aria-label={open ? `${open} open task${open === 1 ? '' : 's'}${overdue ? `, ${overdue} overdue` : ''}` : 'No open tasks'}
        title={open ? undefined : 'No open tasks'}
      >
        {open}
      </span>
      {show &&
        createPortal(
          <div
            ref={card}
            role="tooltip"
            className="fixed z-[90] w-[min(340px,calc(100vw-16px))] max-h-[min(380px,60vh)] overflow-y-auto overscroll-contain rounded-xl border border-teton-off-white bg-white text-teton-ink shadow-[0_12px_32px_rgba(0,0,0,.18)] [animation:fadeScale_.15s_ease-out] motion-reduce:[animation:none] text-left"
            style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
            onPointerEnter={() => clearTimeout(timer.current)}
            onPointerLeave={leave}
          >
            <p className="sticky top-0 bg-white/95 backdrop-blur px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-[.7px] text-teton-ui-gray border-b border-teton-off-white">
              {open} open task{open === 1 ? '' : 's'}
              {overdue > 0 && <span className="text-[#B23A26]"> · {overdue} overdue</span>}
            </p>
            {!tasks ? (
              <p className="px-3 py-4 text-xs text-teton-ui-gray">Loading…</p>
            ) : (
              <ul className="divide-y divide-teton-off-white">
                {tasks.map((t) => (
                  <li key={t.id} className="px-3 py-2">
                    <p className="text-[12.5px] font-semibold leading-snug">{t.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {t.priority && <PriorityTag p={t.priority} />}
                      <DueChip due={t.dueDate} />
                    </div>
                    <p className="mt-1 text-[11px] text-teton-ui-gray truncate">
                      <span className="text-[9.5px] font-extrabold uppercase tracking-[.6px] text-teton-light-gray">Assigned to </span>
                      {t.assignees.length ? t.assignees.map((p) => p.name).join(', ') : <i>Unassigned</i>}
                      <span className="text-teton-pale-gray"> · </span>
                      <span className="text-[9.5px] font-extrabold uppercase tracking-[.6px] text-teton-light-gray">By </span>
                      {t.createdBy.initials}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

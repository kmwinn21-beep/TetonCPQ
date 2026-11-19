'use client';

/**
 * New notes and comments on this deal's floor plans that the user hasn't read.
 * Shown above the live preview only while there are some. A row opens the floor
 * plan at that note (and marks it read); Read marks one; Mark All as Read clears
 * them all.
 */
import { useState } from 'react';
import { Collapse } from '@/components/form/fields';
import type { UnreadItem } from '@/lib/data/planNotes';
import { useFloorPlans } from './FloorPlans';
import { AuthorPill, Triangle } from './PlanNotes';

const ago = (iso: string) => {
  const t = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).getTime();
  if (Number.isNaN(t)) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const what = (u: UnreadItem) => (u.kind === 'note' ? `added note ${u.noteNumber}` : u.noteId != null ? `commented on note ${u.noteNumber}` : 'left a general comment');

export function NotificationsPanel() {
  const fp = useFloorPlans();
  const [open, setOpen] = useState(false);
  const items = fp?.unread ?? [];
  if (!fp || !items.length) return null;
  const go = (u: UnreadItem) => {
    fp.openViewer(u.communityId, { planId: u.planId, noteId: u.noteId, commentId: u.kind === 'comment' ? u.id : undefined, notes: true });
    void fp.markRead([{ kind: u.kind, id: u.id }]);
  };
  return (
    <section className="card p-0 overflow-hidden drawer-in" aria-label="Notifications">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" className="flex flex-1 items-center gap-2 text-left min-w-0" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <h2 className="text-sm font-semibold">Notifications</h2>
          <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-[#3F8CEA] text-white text-[10px] font-bold leading-none">{items.length}</span>
          <span className="text-xs text-teton-ui-gray truncate">new on the floor plans</span>
          <svg className={`ml-auto w-3.5 h-3.5 text-teton-ui-gray transition-transform duration-200 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>
      <Collapse open={open}>
        <div className="border-t border-teton-off-white">
          <ul className="max-h-[22rem] overflow-y-auto divide-y divide-teton-off-white">
            {items.map((u) => (
              <li key={`${u.kind}-${u.id}`} className="flex items-start gap-2 px-4 py-2.5 hover:bg-teton-almost-white transition-colors">
                <button type="button" className="flex flex-1 min-w-0 items-start gap-2 text-left" onClick={() => go(u)} title="Open on the floor plan">
                  <span className="mt-0.5">
                    {u.color && u.noteNumber != null ? (
                      <Triangle color={u.color} n={u.noteNumber} size={16} />
                    ) : (
                      <svg className="w-4 h-4 text-teton-ui-gray" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[11px] text-teton-ui-gray">
                      <AuthorPill person={u.author} />
                      <span className="truncate">{what(u)} · {ago(u.createdAt)}</span>
                    </span>
                    <span className="block mt-0.5 text-xs text-teton-ink line-clamp-2 break-words">{u.preview}</span>
                    <span className="block mt-0.5 text-[10.5px] text-teton-ui-gray truncate">{u.planName}</span>
                  </span>
                </button>
                <button type="button" className="flex-shrink-0 rounded-md border border-teton-pale-gray px-2 py-0.5 text-[11px] font-medium text-teton-dark-gray hover:bg-white" onClick={() => void fp.markRead([{ kind: u.kind, id: u.id }])}>
                  Read
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-4 py-2.5 border-t border-teton-off-white bg-teton-almost-white">
            <button
              type="button"
              className="btn-secondary py-1 text-xs"
              onClick={() => {
                const n = items.length;
                void fp.markRead('all');
                fp.toast(`Marked ${n} notification${n === 1 ? '' : 's'} as read`);
              }}
            >
              Mark All as Read
            </button>
          </div>
        </div>
      </Collapse>
    </section>
  );
}

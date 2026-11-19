'use client';

/**
 * Notes on a floor plan: a numbered triangle on the spot a note is about and a
 * box with the note placed anywhere on the page (drag it, resize it; the text
 * wraps). The Notes drawer lists every note, on the plan or not, each with its
 * comment thread, and general comments at the bottom. Only a note's author
 * edits or deletes it; a comment's author or an admin can delete a comment.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { badgeOf, type RoomType } from '@/lib/quote/roomTypes';
import type { PlanComment, PlanNote, Person } from '@/lib/data/planNotes';
import { useFloorPlans } from './FloorPlans';

export const NOTE_COLORS = ['#E0A21B', '#D64B7A', '#1F9BB0', '#7A5BD6', '#2E9E6B', '#E0782B', '#3F6FD8', '#5B6472'] as const;
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface NoteDraft {
  id?: number;
  page: number;
  x: number;
  y: number;
  box: Box;
  body: string;
  roomTypeId: string | null;
  color: string;
  onPlan: boolean;
}
export interface Me extends Person {
  isAdmin: boolean;
}

// ---------------------------------------------------------------- data

export function usePlanNotes(quoteId: number, planId: number | undefined) {
  const [notes, setNotes] = useState<PlanNote[]>([]);
  const [general, setGeneral] = useState<PlanComment[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const base = planId ? `/api/quotes/${quoteId}/floorplans/${planId}` : '';
  const reload = useCallback(async () => {
    if (!base) return;
    const r = await fetch(`${base}/notes`, { cache: 'no-store' });
    if (!r.ok) return;
    const b = await r.json();
    setNotes(b.notes ?? []);
    setGeneral(b.general ?? []);
    setMe(b.me ?? null);
  }, [base]);
  useEffect(() => {
    setNotes([]);
    setGeneral([]);
    void reload();
  }, [reload]);
  const call = async (url: string, method: string, body?: unknown) => {
    setError(null);
    const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    if (!r.ok) {
      const msg = (await r.json().catch(() => ({}))).error ?? 'Something went wrong';
      setError(msg);
      throw new Error(msg);
    }
    await reload();
    return r.json().catch(() => ({}));
  };
  return {
    notes,
    general,
    me,
    error,
    reload,
    create: (d: NoteDraft) => call(`${base}/notes`, 'POST', d) as Promise<{ id: number }>,
    update: (id: number, d: Partial<NoteDraft>) => call(`${base}/notes/${id}`, 'PATCH', d),
    remove: (id: number) => call(`${base}/notes/${id}`, 'DELETE'),
    comment: (noteId: number | null, body: string) => call(`${base}/comments`, 'POST', { noteId, body }),
    deleteComment: (id: number) => call(`${base}/comments/${id}`, 'DELETE'),
  };
}
export type NotesApi = ReturnType<typeof usePlanNotes>;

/** The next note color nobody on this plan uses yet. */
export const nextNoteColor = (notes: Array<{ color: string }>) => NOTE_COLORS.find((c) => !notes.some((n) => n.color === c)) ?? NOTE_COLORS[notes.length % NOTE_COLORS.length];

// ---------------------------------------------------------------- small pieces

/** A note's numbered triangle. */
export function Triangle({ color, n, size = 16, className = '' }: { color: string; n: number | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size * 0.92} viewBox="0 0 24 22" className={`flex-shrink-0 drop-shadow-[0_1px_1.5px_rgba(0,0,0,.4)] ${className}`} aria-hidden="true">
      <path d="M12 1.5 L23 20.5 L1 20.5 Z" fill={color} stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <text x="12" y="17.2" textAnchor="middle" fontSize={String(n).length > 1 ? 8 : 9.5} fontWeight="800" fill="#fff" fontFamily="Inter, system-ui, sans-serif">
        {n}
      </text>
    </svg>
  );
}

const PERSON_TONES = ['bg-[#E5EEFC] text-[#2B5BB5]', 'bg-[#FCE8EF] text-[#A23A63]', 'bg-[#E6F4EC] text-[#2B7A4B]', 'bg-[#F1E9FB] text-[#6A3FB0]', 'bg-[#FFF1DC] text-[#8A5A00]', 'bg-[#E3F4F6] text-[#1C6E7C]'];
/** The author's initials in a pill (the same tone for the same person). */
export function AuthorPill({ person, className = '' }: { person: Person; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full pl-1 pr-1.5 py-px text-[9.5px] font-bold whitespace-nowrap ${PERSON_TONES[person.id % PERSON_TONES.length]} ${className}`} title={person.name}>
      <svg className="w-2.5 h-2.5 opacity-70" fill="none" stroke="currentColor" strokeWidth={2.4} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {person.initials}
    </span>
  );
}

const Bubble = ({ n, className = '' }: { n: number; className?: string }) => (
  <span className={`inline-flex min-w-[16px] h-4 px-1 items-center justify-center rounded-full bg-[#3F8CEA] text-white text-[9.5px] font-bold leading-none ${className}`}>{n}</span>
);
const when = (iso: string) => {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const roomTypeName = (types: RoomType[], id: string | null) => (id ? types.find((t) => t.id === id)?.name || 'Room type' : null);

// ---------------------------------------------------------------- the note on the plan

/** Drag a box by its body and resize it from the corner (positions are 0–1 of the page it sits on). */
function useBoxGestures(ref: React.RefObject<HTMLElement>, box: Box, onChange: (b: Box) => void, enabled: boolean) {
  const [live, setLive] = useState<Box | null>(null);
  const g = useRef<{ mode: 'move' | 'size'; sx: number; sy: number; b: Box; moved: boolean; id: number } | null>(null);
  const page = () => ref.current?.parentElement?.getBoundingClientRect();
  const start = (mode: 'move' | 'size') => (e: React.PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    if (mode === 'move' && (e.target as HTMLElement).closest('textarea, input, select, button, [data-no-drag]')) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    g.current = { mode, sx: e.clientX, sy: e.clientY, b: box, moved: false, id: e.pointerId };
  };
  const move = (e: React.PointerEvent) => {
    const s = g.current;
    const r = page();
    if (!s || !r || s.id !== e.pointerId) return;
    const dx = (e.clientX - s.sx) / r.width;
    const dy = (e.clientY - s.sy) / r.height;
    if (!s.moved && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 4) return;
    s.moved = true;
    if (s.mode === 'move') setLive({ ...s.b, x: Math.min(1 - s.b.w, Math.max(0, s.b.x + dx)), y: Math.min(1 - s.b.h, Math.max(0, s.b.y + dy)) });
    else setLive({ ...s.b, w: Math.min(1 - s.b.x, Math.max(0.08, s.b.w + dx)), h: Math.min(1 - s.b.y, Math.max(0.035, s.b.h + dy)) });
  };
  const end = (e: React.PointerEvent) => {
    const s = g.current;
    g.current = null;
    if (!s || s.id !== e.pointerId) return false;
    if (s.moved && live) onChange(live);
    setLive(null);
    return s.moved;
  };
  return { box: live ?? box, start, move, end };
}

/** A saved note on the plan: its triangle (left of the text), author, room type and the wrapped text. */
export function NoteOnPlan({ note, types, size, highlight, onOpen, onMove }: { note: PlanNote; types: RoomType[]; size: number; highlight?: boolean; onOpen: () => void; onMove: (b: Box) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const gest = useBoxGestures(ref, note.box, onMove, note.mine);
  const rt = roomTypeName(types, note.roomTypeId);
  const t = rt ? types.find((x) => x.id === note.roomTypeId) : null;
  const tb = t ? badgeOf(t, types.indexOf(t)) : null;
  const b = gest.box;
  return (
    <div
      ref={ref}
      data-plan-ui
      role="button"
      tabIndex={0}
      aria-label={`Note ${note.number} by ${note.author.name}`}
      className={`group/note absolute z-[15] flex gap-1.5 rounded-lg bg-white/95 border-[1.5px] px-2 py-1.5 text-left shadow-[0_4px_14px_rgba(0,0,0,.16)] touch-none transition-shadow duration-200 ${note.mine ? 'cursor-move' : 'cursor-pointer'} ${highlight ? 'ring-2 ring-offset-1 ring-teton-near-black' : ''}`}
      style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, minHeight: `${b.h * 100}%`, borderColor: note.color, fontSize: Math.max(10, Math.min(12.5, size * 0.52)) }}
      onPointerDown={gest.start('move')}
      onPointerMove={gest.move}
      onPointerUp={(e) => {
        if (!gest.end(e)) onOpen();
      }}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
    >
      <Triangle color={note.color} n={note.number} size={Math.max(14, size * 0.75)} className="mt-px" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[0.8em] font-semibold text-teton-dark-gray">
          {tb && <span className="inline-flex w-3.5 h-3.5 rounded-full items-center justify-center text-[6px] text-white font-extrabold flex-shrink-0" style={{ background: tb.color }}>{tb.initials}</span>}
          <span className="truncate">{rt ?? 'General note'}</span>
          <AuthorPill person={note.author} className="ml-auto" />
        </div>
        <p className="mt-0.5 leading-snug text-teton-ink whitespace-pre-wrap break-words">{note.body}</p>
      </div>
      {note.mine && (
        <span
          data-no-drag
          className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-white border-[1.5px] border-[#3F8CEA] cursor-nwse-resize opacity-0 group-hover/note:opacity-100 transition-opacity"
          onPointerDown={gest.start('size')}
          onPointerMove={gest.move}
          onPointerUp={gest.end}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/** A note's triangle on the spot it's about. */
export function NoteMarker({ color, n, x, y, size, faded, onClick }: { color: string; n: number | string; x: number; y: number; size: number; faded?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      data-plan-ui
      title={`Note ${n}`}
      aria-label={`Note ${n}`}
      className={`absolute z-[12] -translate-x-1/2 -translate-y-[62%] transition-opacity duration-200 ${faded ? 'opacity-40' : ''}`}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      <Triangle color={color} n={n} size={size + 2} />
    </button>
  );
}

/** Writing or editing a note: the box (drag, resize, text wraps) and its settings under it. */
export function NoteEditor({
  draft,
  number,
  me,
  types,
  size,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saving,
}: {
  draft: NoteDraft;
  number: number;
  me: Me | null;
  types: RoomType[];
  size: number;
  onChange: (d: NoteDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saving: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const gest = useBoxGestures(ref, draft.box, (box) => onChange({ ...draft, box }), true);
  const b = gest.box;
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The box grows as the text does (down to the bottom of the page); resize it to make it wider or shorter.
  const ta = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = ta.current;
    const pageH = ref.current?.parentElement?.getBoundingClientRect().height;
    if (!t || !pageH) return;
    const over = t.scrollHeight - t.clientHeight;
    if (over > 2 && draft.box.y + draft.box.h < 1) onChange({ ...draft, box: { ...draft.box, h: Math.min(1 - draft.box.y, draft.box.h + (over + 4) / pageH) } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.body, draft.box.w]);
  // Settings go under the box, or above it near the bottom of the page.
  const below = b.y + b.h < 0.62;
  return (
    <div
      ref={ref}
      data-plan-ui
      className="absolute z-[25] flex gap-1.5 rounded-lg bg-white border-2 px-2 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,.25)] cursor-move touch-none"
      style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%`, minHeight: 64, borderColor: draft.color }}
      onPointerDown={gest.start('move')}
      onPointerMove={gest.move}
      onPointerUp={gest.end}
    >
      <Triangle color={draft.color} n={number} size={Math.max(14, size * 0.75)} className="mt-0.5" />
      <textarea
        ref={ta}
        className="flex-1 min-w-0 h-full resize-none bg-transparent text-[12px] leading-snug outline-none cursor-text"
        placeholder="Write the note…"
        value={draft.body}
        autoFocus
        onChange={(e) => onChange({ ...draft, body: e.target.value })}
        aria-label="Note text"
      />
      {me && <AuthorPill person={me} className="self-start" />}
      <span data-no-drag className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-sm bg-white border-[1.5px] border-[#3F8CEA] cursor-nwse-resize" onPointerDown={gest.start('size')} onPointerMove={gest.move} onPointerUp={gest.end} aria-hidden="true" />
      <div
        data-no-drag
        className={`absolute left-0 w-[17rem] max-w-[80vw] rounded-xl border border-teton-off-white bg-white p-2.5 text-xs shadow-[0_12px_36px_rgba(0,0,0,.2)] cursor-auto drawer-in ${below ? 'top-[calc(100%+8px)]' : 'bottom-[calc(100%+8px)]'}`}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <label className="block text-[9.5px] font-semibold uppercase tracking-wider text-teton-ui-gray mb-1" htmlFor="note-attach">Attach to</label>
        <select id="note-attach" className="input-field py-1.5 text-xs" value={draft.roomTypeId ?? ''} onChange={(e) => onChange({ ...draft, roomTypeId: e.target.value || null })}>
          <option value="">General note</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name || 'Room type'}</option>)}
        </select>
        <label className="mt-2.5 flex items-center justify-between gap-2 cursor-pointer select-none">
          <span className="inline-flex items-center gap-2 font-medium">
            <span className="relative inline-flex">
              <input type="checkbox" role="switch" className="peer sr-only" checked={draft.onPlan} onChange={(e) => onChange({ ...draft, onPlan: e.target.checked })} />
              <span className="w-8 h-[18px] rounded-full bg-teton-pale-gray peer-checked:bg-teton-near-black transition-colors duration-200 motion-reduce:transition-none" />
              <span className="absolute left-[2px] top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none peer-checked:translate-x-[14px]" />
            </span>
            Show on floor plan
          </span>
          <span className="text-[10.5px] text-teton-ui-gray">{draft.onPlan ? '' : 'Tag only; note in the panel'}</span>
        </label>
        <span className="block text-[9.5px] font-semibold uppercase tracking-wider text-teton-ui-gray mt-2.5 mb-1">Color</span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Note color">
          {NOTE_COLORS.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={draft.color === c} aria-label={`Color ${c}`} onClick={() => onChange({ ...draft, color: c })} className={`w-5 h-5 rounded border-2 border-white transition-shadow duration-150 ${draft.color === c ? 'shadow-[0_0_0_2px_#16181D]' : 'shadow-[0_0_0_1px_#D9DCDF]'}`} style={{ background: c }} />
          ))}
        </div>
        <p className="mt-2 text-[10.5px] text-teton-ui-gray">Drag the note to move it; pull its corner to resize.</p>
        <div className="flex items-center justify-between gap-2 mt-2.5">
          {onDelete ? (
            confirmDelete ? (
              <span className="flex items-center gap-1.5">
                <button type="button" className="rounded-md bg-[#C2412D] text-white px-2 py-1 font-medium" onClick={onDelete}>Delete note</button>
                <button type="button" className="btn-ghost py-1 text-xs" onClick={() => setConfirmDelete(false)}>Keep</button>
              </span>
            ) : (
              <button type="button" className="text-[11.5px] text-[#B23A26] underline" onClick={() => setConfirmDelete(true)}>Delete</button>
            )
          ) : (
            <span />
          )}
          <span className="flex items-center gap-1.5">
            <button type="button" className="btn-ghost py-1 text-xs" onClick={onCancel}>Cancel</button>
            <button type="button" className="btn-primary py-1 text-xs disabled:opacity-40" disabled={!draft.body.trim() || saving} onClick={onSave}>
              {saving ? 'Saving…' : 'Save note'}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the Notes drawer

/** A comment thread: each comment (author, time, text; delete for its author or an admin) and a box to add one. */
function Thread({ comments, onPost, onDelete, placeholder, unread }: { comments: PlanComment[]; onPost: (body: string) => Promise<unknown>; onDelete: (id: number) => Promise<unknown>; placeholder: string; unread: Set<number> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const post = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await onPost(text.trim());
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2.5">
      {comments.length === 0 && <p className="text-[11px] text-teton-ui-gray">No comments yet.</p>}
      {comments.map((c) => (
        <div key={c.id} id={`plan-comment-${c.id}`} className={`pl-2.5 border-l-2 transition-colors duration-500 ${unread.has(c.id) ? 'border-[#3F8CEA]' : 'border-teton-off-white'}`}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[11px] font-semibold text-teton-ink">{c.author.name}</span>
            <span className="text-[10px] text-teton-ui-gray">{when(c.createdAt)}</span>
            {unread.has(c.id) && <span className="text-[9px] font-bold text-[#3F8CEA] uppercase tracking-wider">New</span>}
            {c.canDelete && (
              <button
                type="button"
                className="ml-auto text-teton-light-gray hover:text-[#B23A26] transition-colors"
                title={c.mine ? 'Delete your comment' : 'Delete comment (admin)'}
                aria-label="Delete comment"
                onClick={() => window.confirm('Delete this comment?') && void onDelete(c.id)}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            )}
          </div>
          <p className="text-[12px] leading-relaxed text-teton-dark-gray whitespace-pre-wrap break-words">{c.body}</p>
        </div>
      ))}
      <div>
        <textarea className="input-field resize-none w-full text-xs py-1.5" rows={2} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && void post()} />
        <div className="flex justify-end mt-1">
          <button type="button" className="btn-primary text-xs px-3 py-1 disabled:opacity-40" disabled={busy || !text.trim()} onClick={post}>{busy ? 'Posting…' : 'Post'}</button>
        </div>
      </div>
    </div>
  );
}

const Chat = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

/** The Notes drawer: one collapsible card per note (the same height collapsed), then general comments. */
export function NotesDrawer({
  api,
  types,
  pages,
  open,
  focus,
  onClose,
  onEdit,
  onGoTo,
}: {
  api: NotesApi;
  types: RoomType[];
  pages: number;
  open: boolean;
  /** A note (or 'general') to open and scroll to. */
  focus: { noteId: number | null; commentId?: number; key: number } | null;
  onClose: () => void;
  onEdit: (n: PlanNote) => void;
  onGoTo: (n: PlanNote) => void;
}) {
  const fp = useFloorPlans();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<number | null>(null);
  const [shown, setShown] = useState(open);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setShown(true);
    else {
      const t = setTimeout(() => setShown(false), 220);
      return () => clearTimeout(t);
    }
  }, [open]);
  // Open the focused note and bring it (or the comment) into view.
  useEffect(() => {
    if (!focus) return;
    if (focus.noteId != null) setExpanded((s) => new Set(s).add(focus.noteId as number));
    const t = setTimeout(() => {
      const el = document.getElementById(focus.commentId ? `plan-comment-${focus.commentId}` : focus.noteId != null ? `plan-note-${focus.noteId}` : 'plan-general');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.classList.add('ring-2', 'ring-[#3F8CEA]');
      setTimeout(() => el?.classList.remove('ring-2', 'ring-[#3F8CEA]'), 1600);
    }, 380);
    return () => clearTimeout(t);
  }, [focus, api.notes.length]);
  if (!shown) return null;
  const unreadNotes = new Set((fp?.unread ?? []).filter((u) => u.kind === 'note').map((u) => u.id));
  const unreadComments = new Set((fp?.unread ?? []).filter((u) => u.kind === 'comment').map((u) => u.id));
  const toggle = (id: number) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <aside
      data-plan-ui
      className={`absolute inset-y-0 right-0 z-30 flex w-[22rem] max-w-full flex-col border-l border-teton-off-white bg-white shadow-[-12px_0_28px_rgba(0,0,0,.08)] ${open ? 'drawer-in' : 'drawer-out'}`}
      aria-label="Notes"
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-teton-off-white">
        <p className="font-semibold text-sm">Notes</p>
        <Bubble n={api.notes.length} />
        <button type="button" className="ml-auto btn-ghost py-1" aria-label="Close notes" onClick={onClose}>✕</button>
      </div>
      <div ref={list} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="p-2 space-y-1.5">
          {api.notes.length === 0 && <p className="px-2 py-3 text-xs text-teton-ui-gray">No notes yet. Turn on Scope Mode, click <b>+ Note</b>, then click the spot the note is about.</p>}
          {api.notes.map((n) => {
            const isOpen = expanded.has(n.id);
            const rt = roomTypeName(types, n.roomTypeId);
            const fresh = unreadNotes.has(n.id) || n.comments.some((c) => unreadComments.has(c.id));
            return (
              <div key={n.id} id={`plan-note-${n.id}`} className={`rounded-xl border bg-white transition-[box-shadow,border-color] duration-200 ${isOpen ? 'border-[#C9D9F5] shadow-[0_2px_10px_rgba(63,140,234,.12)]' : 'border-teton-off-white'}`}>
                <button type="button" className="flex h-12 w-full items-center gap-2 px-2.5 text-left" aria-expanded={isOpen} onClick={() => toggle(n.id)}>
                  <Triangle color={n.color} n={n.number} size={16} />
                  <AuthorPill person={n.author} />
                  <span className="min-w-0 flex-1 truncate text-xs text-teton-dark-gray">{n.body}</span>
                  {fresh && <span className="w-2 h-2 rounded-full bg-[#3F8CEA] flex-shrink-0" title="New" />}
                  <span className="inline-flex items-center gap-1 text-teton-ui-gray"><Chat />{n.comments.length > 0 && <Bubble n={n.comments.length} />}</span>
                  <svg className={`w-3 h-3 text-teton-ui-gray transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </button>
                <Collapse open={isOpen}>
                  <div className="px-3 pb-3 border-t border-teton-off-white/80">
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px] text-teton-ui-gray">
                      <span className="rounded-full bg-teton-almost-white px-2 py-px font-medium text-teton-dark-gray">{rt ?? 'General note'}</span>
                      <button type="button" className="rounded-full bg-teton-almost-white px-2 py-px font-medium text-teton-dark-gray hover:underline" onClick={() => onGoTo(n)}>{pages > 1 ? `Page ${n.page}` : 'On the plan'} ›</button>
                      {!n.onPlan && <span className="rounded-full bg-[#FFF4D6] px-2 py-px font-medium text-[#8A5A00]">Tag only: note hidden on the plan</span>}
                      <span>· {n.author.name} · {when(n.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-teton-ink whitespace-pre-wrap break-words">{n.body}</p>
                    {n.mine ? (
                      <div className="mt-2 flex items-center gap-3 text-[11px]">
                        <button type="button" className="underline text-teton-dark-gray hover:text-teton-ink" onClick={() => onEdit(n)}>Edit</button>
                        {confirm === n.id ? (
                          <span className="flex items-center gap-1.5">
                            <button type="button" className="rounded-md bg-[#C2412D] text-white px-2 py-0.5 font-medium" onClick={() => void api.remove(n.id).then(() => setConfirm(null))}>Delete note</button>
                            <button type="button" className="btn-ghost py-0.5 text-[11px]" onClick={() => setConfirm(null)}>Keep</button>
                          </span>
                        ) : (
                          <button type="button" className="underline text-[#B23A26]" onClick={() => setConfirm(n.id)}>Delete</button>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-[10.5px] text-teton-ui-gray">🔒 Only {n.author.name} can edit this note.</p>
                    )}
                    <p className="mt-3 mb-2 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-teton-ui-gray">Comments <Bubble n={n.comments.length} className={n.comments.length ? '' : 'bg-teton-pale-gray'} /></p>
                    <Thread comments={n.comments} unread={unreadComments} placeholder="Add a comment…" onPost={(b) => api.comment(n.id, b)} onDelete={api.deleteComment} />
                  </div>
                </Collapse>
              </div>
            );
          })}
        </div>
        <div id="plan-general" className="m-2 mt-1 rounded-xl border border-teton-off-white bg-teton-almost-white/60 p-3 transition-shadow">
          <p className="mb-2 flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-teton-ui-gray">General comments <Bubble n={api.general.length} className={api.general.length ? '' : 'bg-teton-pale-gray'} /></p>
          <Thread comments={api.general} unread={unreadComments} placeholder="Add a general comment…" onPost={(b) => api.comment(null, b)} onDelete={api.deleteComment} />
        </div>
      </div>
      {api.error && <p className="px-3 py-2 text-[11px] text-[#9A2E1C] border-t border-teton-off-white">{api.error}</p>}
    </aside>
  );
}

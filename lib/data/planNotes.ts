/**
 * Notes on floor plans, their comment threads and each user's read marks.
 * Notes and comments belong to the floor plan file (not a quote version), so
 * everyone sees the same ones whichever version is active. Only the author
 * edits or deletes a note; a comment can be deleted by its author or an admin.
 */
import type { Client, Row } from '@libsql/client';

export const NOTE_COLORS = ['#E0A21B', '#D64B7A', '#1F9BB0', '#7A5BD6', '#2E9E6B', '#E0782B', '#3F6FD8', '#5B6472'] as const;

export interface Person {
  id: number;
  name: string;
  initials: string;
}
export interface PlanComment {
  id: number;
  noteId: number | null;
  body: string;
  author: Person;
  createdAt: string;
  mine: boolean;
  /** The viewer may delete it (its author, or an admin). */
  canDelete: boolean;
}
export interface PlanNote {
  id: number;
  planId: number;
  number: number;
  page: number;
  x: number;
  y: number;
  box: { x: number; y: number; w: number; h: number };
  body: string;
  roomTypeId: string | null;
  color: string;
  onPlan: boolean;
  author: Person;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  comments: PlanComment[];
}
export interface NoteInput {
  page?: number;
  x?: number;
  y?: number;
  box?: { x?: number; y?: number; w?: number; h?: number };
  body?: string;
  roomTypeId?: string | null;
  color?: string;
  onPlan?: boolean;
}
export interface Viewer {
  id: number;
  name: string;
  role: string;
}
export interface UnreadItem {
  kind: 'note' | 'comment';
  id: number;
  planId: number;
  planName: string;
  communityId: string;
  /** The note it is (or is on); null for a general comment. */
  noteId: number | null;
  noteNumber: number | null;
  color: string | null;
  preview: string;
  author: Person;
  createdAt: string;
}

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

/** "Kevin Winn" → "KW"; one name → its first two letters. */
export function initialsOf(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[w.length - 1][0]).toUpperCase();
}
const person = (id: unknown, name: unknown): Person => ({ id: Number(id), name: String(name ?? 'Someone'), initials: initialsOf(String(name ?? '')) });
const clamp01 = (v: unknown, fb: number) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : fb);
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

async function planOf(db: Client, quoteId: number, planId: number) {
  const r = await db.execute({ sql: 'SELECT id, community_id, name FROM floor_plans WHERE id = ? AND quote_id = ? AND complete = 1', args: [planId, quoteId] });
  if (!r.rows.length) throw httpError('Floor plan not found', 404);
  return { communityId: String(r.rows[0].community_id), name: String(r.rows[0].name) };
}

const toComment = (r: Row, v: Viewer): PlanComment => ({
  id: Number(r.id),
  noteId: r.note_id == null ? null : Number(r.note_id),
  body: String(r.body),
  author: person(r.author_id, r.author_name),
  createdAt: String(r.created_at),
  mine: Number(r.author_id) === v.id,
  canDelete: Number(r.author_id) === v.id || v.role === 'admin',
});

/** A plan's notes (with their comments) and its general comments. */
export async function listPlanNotes(db: Client, quoteId: number, planId: number, v: Viewer): Promise<{ notes: PlanNote[]; general: PlanComment[] }> {
  await planOf(db, quoteId, planId);
  const n = await db.execute({ sql: 'SELECT n.*, u.name AS author_name FROM plan_notes n JOIN users u ON u.id = n.author_id WHERE n.floor_plan_id = ? ORDER BY n.number', args: [planId] });
  const c = await db.execute({ sql: 'SELECT c.*, u.name AS author_name FROM plan_comments c JOIN users u ON u.id = c.author_id WHERE c.floor_plan_id = ? ORDER BY c.id', args: [planId] });
  const comments = c.rows.map((r) => toComment(r, v));
  const notes = n.rows.map((r) => ({
    id: Number(r.id),
    planId,
    number: Number(r.number),
    page: Number(r.page),
    x: Number(r.x),
    y: Number(r.y),
    box: { x: Number(r.box_x), y: Number(r.box_y), w: Number(r.box_w), h: Number(r.box_h) },
    body: String(r.body),
    roomTypeId: r.room_type_id == null ? null : String(r.room_type_id),
    color: String(r.color),
    onPlan: Number(r.on_plan) === 1,
    author: person(r.author_id, r.author_name),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    mine: Number(r.author_id) === v.id,
    comments: comments.filter((x) => x.noteId === Number(r.id)),
  }));
  return { notes, general: comments.filter((x) => x.noteId == null) };
}

function cleanBox(b: NoteInput['box'], fb: { x: number; y: number; w: number; h: number }) {
  const w = Math.min(1, Math.max(0.06, Number(b?.w) || fb.w));
  const h = Math.min(1, Math.max(0.03, Number(b?.h) || fb.h));
  return { x: Math.min(1 - w, clamp01(b?.x, fb.x)), y: Math.min(1 - h, clamp01(b?.y, fb.y)), w, h };
}
const cleanColor = (c: unknown, fb: string) => ((NOTE_COLORS as readonly string[]).includes(String(c)) ? String(c) : fb);

export async function createPlanNote(db: Client, quoteId: number, planId: number, input: NoteInput, v: Viewer): Promise<number> {
  await planOf(db, quoteId, planId);
  const body = text(input.body, 4000);
  if (!body) throw httpError('Write the note first', 400);
  const last = await db.execute({ sql: 'SELECT COALESCE(MAX(number), 0) AS n, COUNT(*) AS c FROM plan_notes WHERE floor_plan_id = ?', args: [planId] });
  const number = Number(last.rows[0].n) + 1;
  const x = clamp01(input.x, 0.5);
  const y = clamp01(input.y, 0.5);
  const box = cleanBox(input.box, { x: Math.min(0.7, x + 0.03), y, w: 0.28, h: 0.1 });
  const color = cleanColor(input.color, NOTE_COLORS[Number(last.rows[0].c) % NOTE_COLORS.length]);
  const r = await db.execute({
    sql: `INSERT INTO plan_notes (quote_id, floor_plan_id, number, page, x, y, box_x, box_y, box_w, box_h, body, room_type_id, color, on_plan, author_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [quoteId, planId, number, Math.max(1, Math.round(Number(input.page) || 1)), x, y, box.x, box.y, box.w, box.h, body, input.roomTypeId ? String(input.roomTypeId).slice(0, 40) : null, color, input.onPlan === false ? 0 : 1, v.id],
  });
  const id = Number(r.rows[0].id);
  // The author has read their own note.
  await db.execute({ sql: "INSERT OR IGNORE INTO plan_reads (user_id, kind, item_id) VALUES (?, 'note', ?)", args: [v.id, id] });
  return id;
}

async function noteRow(db: Client, quoteId: number, planId: number, noteId: number) {
  const r = await db.execute({ sql: 'SELECT * FROM plan_notes WHERE id = ? AND floor_plan_id = ? AND quote_id = ?', args: [noteId, planId, quoteId] });
  if (!r.rows.length) throw httpError('Note not found', 404);
  return r.rows[0];
}

/** Only the author can change a note. */
export async function updatePlanNote(db: Client, quoteId: number, planId: number, noteId: number, input: NoteInput, v: Viewer): Promise<void> {
  const r = await noteRow(db, quoteId, planId, noteId);
  if (Number(r.author_id) !== v.id) throw httpError('Only the author can edit this note', 403);
  const body = input.body === undefined ? String(r.body) : text(input.body, 4000);
  if (!body) throw httpError('A note needs some text', 400);
  const box = cleanBox(input.box ?? {}, { x: Number(r.box_x), y: Number(r.box_y), w: Number(r.box_w), h: Number(r.box_h) });
  await db.execute({
    sql: `UPDATE plan_notes SET page = ?, x = ?, y = ?, box_x = ?, box_y = ?, box_w = ?, box_h = ?, body = ?, room_type_id = ?, color = ?, on_plan = ?, updated_at = datetime('now') WHERE id = ?`,
    args: [
      input.page === undefined ? Number(r.page) : Math.max(1, Math.round(Number(input.page) || 1)),
      input.x === undefined ? Number(r.x) : clamp01(input.x, Number(r.x)),
      input.y === undefined ? Number(r.y) : clamp01(input.y, Number(r.y)),
      box.x,
      box.y,
      box.w,
      box.h,
      body,
      input.roomTypeId === undefined ? r.room_type_id : input.roomTypeId ? String(input.roomTypeId).slice(0, 40) : null,
      input.color === undefined ? String(r.color) : cleanColor(input.color, String(r.color)),
      input.onPlan === undefined ? Number(r.on_plan) : input.onPlan ? 1 : 0,
      noteId,
    ],
  });
}

/** Only the author can delete a note (its comments go with it). */
export async function deletePlanNote(db: Client, quoteId: number, planId: number, noteId: number, v: Viewer): Promise<void> {
  const r = await noteRow(db, quoteId, planId, noteId);
  if (Number(r.author_id) !== v.id) throw httpError('Only the author can delete this note', 403);
  await db.execute({ sql: "DELETE FROM plan_reads WHERE kind = 'comment' AND item_id IN (SELECT id FROM plan_comments WHERE note_id = ?)", args: [noteId] });
  await db.execute({ sql: 'DELETE FROM plan_comments WHERE note_id = ?', args: [noteId] });
  await db.execute({ sql: "DELETE FROM plan_reads WHERE kind = 'note' AND item_id = ?", args: [noteId] });
  await db.execute({ sql: 'DELETE FROM plan_notes WHERE id = ?', args: [noteId] });
}

/** A comment on a note, or a general comment on the plan (noteId null). */
export async function addPlanComment(db: Client, quoteId: number, planId: number, input: { noteId?: number | null; body?: string }, v: Viewer): Promise<number> {
  await planOf(db, quoteId, planId);
  const body = text(input.body, 4000);
  if (!body) throw httpError('Write a comment first', 400);
  const noteId = input.noteId == null ? null : Number(input.noteId);
  if (noteId != null) await noteRow(db, quoteId, planId, noteId);
  const r = await db.execute({ sql: 'INSERT INTO plan_comments (quote_id, floor_plan_id, note_id, body, author_id) VALUES (?, ?, ?, ?, ?) RETURNING id', args: [quoteId, planId, noteId, body, v.id] });
  const id = Number(r.rows[0].id);
  await db.execute({ sql: "INSERT OR IGNORE INTO plan_reads (user_id, kind, item_id) VALUES (?, 'comment', ?)", args: [v.id, id] });
  return id;
}

/** Its author or an admin can delete a comment (no one edits one). */
export async function deletePlanComment(db: Client, quoteId: number, planId: number, commentId: number, v: Viewer): Promise<void> {
  const r = await db.execute({ sql: 'SELECT author_id FROM plan_comments WHERE id = ? AND floor_plan_id = ? AND quote_id = ?', args: [commentId, planId, quoteId] });
  if (!r.rows.length) throw httpError('Comment not found', 404);
  if (Number(r.rows[0].author_id) !== v.id && v.role !== 'admin') throw httpError('Only the author or an admin can delete this comment', 403);
  await db.execute({ sql: "DELETE FROM plan_reads WHERE kind = 'comment' AND item_id = ?", args: [commentId] });
  await db.execute({ sql: 'DELETE FROM plan_comments WHERE id = ?', args: [commentId] });
}

/** Notes and comments on this deal's floor plans that someone else wrote and the viewer hasn't read, newest first. */
export async function unreadPlanItems(db: Client, quoteId: number, v: Viewer): Promise<UnreadItem[]> {
  const notes = await db.execute({
    sql: `SELECT n.id, n.floor_plan_id, n.number, n.color, n.body, n.created_at, n.author_id, u.name AS author_name, f.name AS plan_name, f.community_id
          FROM plan_notes n JOIN users u ON u.id = n.author_id JOIN floor_plans f ON f.id = n.floor_plan_id
          WHERE n.quote_id = ? AND n.author_id <> ? AND f.complete = 1
            AND NOT EXISTS (SELECT 1 FROM plan_reads r WHERE r.user_id = ? AND r.kind = 'note' AND r.item_id = n.id)`,
    args: [quoteId, v.id, v.id],
  });
  const comments = await db.execute({
    sql: `SELECT c.id, c.floor_plan_id, c.note_id, c.body, c.created_at, c.author_id, u.name AS author_name, f.name AS plan_name, f.community_id, n.number, n.color
          FROM plan_comments c JOIN users u ON u.id = c.author_id JOIN floor_plans f ON f.id = c.floor_plan_id LEFT JOIN plan_notes n ON n.id = c.note_id
          WHERE c.quote_id = ? AND c.author_id <> ? AND f.complete = 1
            AND NOT EXISTS (SELECT 1 FROM plan_reads r WHERE r.user_id = ? AND r.kind = 'comment' AND r.item_id = c.id)`,
    args: [quoteId, v.id, v.id],
  });
  const preview = (s: unknown) => String(s).replace(/\s+/g, ' ').slice(0, 140);
  const items: UnreadItem[] = [
    ...notes.rows.map((r) => ({ kind: 'note' as const, id: Number(r.id), planId: Number(r.floor_plan_id), planName: String(r.plan_name), communityId: String(r.community_id), noteId: Number(r.id), noteNumber: Number(r.number), color: String(r.color), preview: preview(r.body), author: person(r.author_id, r.author_name), createdAt: String(r.created_at) })),
    ...comments.rows.map((r) => ({ kind: 'comment' as const, id: Number(r.id), planId: Number(r.floor_plan_id), planName: String(r.plan_name), communityId: String(r.community_id), noteId: r.note_id == null ? null : Number(r.note_id), noteNumber: r.number == null ? null : Number(r.number), color: r.color == null ? null : String(r.color), preview: preview(r.body), author: person(r.author_id, r.author_name), createdAt: String(r.created_at) })),
  ];
  return items.sort((a, b) => (a.createdAt === b.createdAt ? b.id - a.id : a.createdAt < b.createdAt ? 1 : -1));
}

/** Mark items read (or, with `all`, every unread item on this deal's plans). */
export async function markPlanItemsRead(db: Client, quoteId: number, v: Viewer, items: Array<{ kind: string; id: number }> | 'all'): Promise<void> {
  const list = items === 'all' ? (await unreadPlanItems(db, quoteId, v)).map((x) => ({ kind: x.kind, id: x.id })) : items;
  for (const it of list.slice(0, 2000)) {
    if (it.kind !== 'note' && it.kind !== 'comment') continue;
    await db.execute({ sql: 'INSERT OR IGNORE INTO plan_reads (user_id, kind, item_id) VALUES (?, ?, ?)', args: [v.id, it.kind, Math.round(Number(it.id))] });
  }
}

/** A plan's notes and comments go when the plan does. */
export async function deletePlanNotesFor(db: Client, planId: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM plan_reads WHERE kind = 'comment' AND item_id IN (SELECT id FROM plan_comments WHERE floor_plan_id = ?)", args: [planId] });
  await db.execute({ sql: "DELETE FROM plan_reads WHERE kind = 'note' AND item_id IN (SELECT id FROM plan_notes WHERE floor_plan_id = ?)", args: [planId] });
  await db.execute({ sql: 'DELETE FROM plan_comments WHERE floor_plan_id = ?', args: [planId] });
  await db.execute({ sql: 'DELETE FROM plan_notes WHERE floor_plan_id = ?', args: [planId] });
}

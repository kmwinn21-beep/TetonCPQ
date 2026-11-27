/**
 * Notes on tagged rooms (Scope Mode badges). One note can sit on many rooms: it
 * keeps the ids of the marks it belongs to. Its author edits it, either for every
 * room it's on or for one room only (that room gets its own copy). The author or
 * an admin can delete it. Notes belong to the deal, not a version.
 */
import { allowed } from '@/lib/auth/permissions';
import type { Client, Row } from '@libsql/client';
import { initialsOf, type Person, type Viewer } from './planNotes';

export interface TagNote {
  id: number;
  markIds: string[];
  body: string;
  author: Person;
  createdAt: string;
  updatedAt: string;
  mine: boolean;
  /** The viewer may delete it (its author, or an admin). */
  canDelete: boolean;
}

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const text = (v: unknown) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 2000);
function cleanIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return [...new Set(v.map((x) => String(x ?? '').trim().slice(0, 40)).filter(Boolean))].slice(0, 3000);
}
const parseIds = (v: unknown): string[] => {
  try {
    return cleanIds(JSON.parse(String(v)));
  } catch {
    return [];
  }
};
const toNote = (r: Row, v: Viewer): TagNote => ({
  id: Number(r.id),
  markIds: parseIds(r.mark_ids),
  body: String(r.body),
  author: { id: Number(r.author_id), name: String(r.author_name ?? 'Someone'), initials: initialsOf(String(r.author_name ?? '')) },
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  mine: Number(r.author_id) === v.id,
  canDelete: Number(r.author_id) === v.id || allowed(v, 'notes.moderate'),
});

async function quoteExists(db: Client, quoteId: number) {
  const r = await db.execute({ sql: 'SELECT 1 FROM quotes WHERE id = ?', args: [quoteId] });
  if (!r.rows.length) throw httpError('Deal not found', 404);
}
async function row(db: Client, quoteId: number, id: number) {
  const r = await db.execute({ sql: 'SELECT * FROM tag_notes WHERE id = ? AND quote_id = ?', args: [id, quoteId] });
  if (!r.rows.length) throw httpError('Note not found', 404);
  return r.rows[0];
}

export async function listTagNotes(db: Client, quoteId: number, v: Viewer): Promise<TagNote[]> {
  const r = await db.execute({ sql: 'SELECT n.*, u.name AS author_name FROM tag_notes n JOIN users u ON u.id = n.author_id WHERE n.quote_id = ? ORDER BY n.id', args: [quoteId] });
  return r.rows.map((x) => toNote(x, v)).filter((n) => n.markIds.length);
}

export async function createTagNote(db: Client, quoteId: number, input: { markIds?: unknown; body?: unknown }, v: Viewer): Promise<number> {
  await quoteExists(db, quoteId);
  const body = text(input.body);
  if (!body) throw httpError('Write the note first', 400);
  const ids = cleanIds(input.markIds);
  if (!ids.length) throw httpError('Choose the rooms the note is for', 400);
  const r = await db.execute({ sql: 'INSERT INTO tag_notes (quote_id, mark_ids, body, author_id) VALUES (?, ?, ?, ?) RETURNING id', args: [quoteId, JSON.stringify(ids), body, v.id] });
  return Number(r.rows[0].id);
}

/**
 * The author changes a note. `only` (a mark id): the change is for that room alone; it leaves the shared note and
 * gets its own copy with the new text (or no note, when the text is cleared). Otherwise the change is for every room
 * the note is on; clearing the text deletes the note.
 */
export async function updateTagNote(db: Client, quoteId: number, id: number, input: { body?: unknown; only?: unknown }, v: Viewer): Promise<{ id: number | null }> {
  const r = await row(db, quoteId, id);
  if (Number(r.author_id) !== v.id) throw httpError('Only the author can edit this note', 403);
  const body = text(input.body);
  const ids = parseIds(r.mark_ids);
  const only = input.only == null ? null : String(input.only);
  if (only && ids.length > 1) {
    if (!ids.includes(only)) throw httpError('That room isn’t on this note', 400);
    await db.execute({ sql: "UPDATE tag_notes SET mark_ids = ?, updated_at = datetime('now') WHERE id = ?", args: [JSON.stringify(ids.filter((x) => x !== only)), id] });
    return { id: body ? await createTagNote(db, quoteId, { markIds: [only], body }, v) : null };
  }
  if (!body) {
    await db.execute({ sql: 'DELETE FROM tag_notes WHERE id = ?', args: [id] });
    return { id: null };
  }
  await db.execute({ sql: "UPDATE tag_notes SET body = ?, updated_at = datetime('now') WHERE id = ?", args: [body, id] });
  return { id };
}

/** Its author or an admin deletes a note (from every room it's on). */
export async function deleteTagNote(db: Client, quoteId: number, id: number, v: Viewer): Promise<void> {
  const r = await row(db, quoteId, id);
  if (Number(r.author_id) !== v.id && !allowed(v, 'notes.moderate')) throw httpError('Only the author (or someone allowed to delete others’ notes) can delete this note', 403);
  await db.execute({ sql: 'DELETE FROM tag_notes WHERE id = ?', args: [id] });
}

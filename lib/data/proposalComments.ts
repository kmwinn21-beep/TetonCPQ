/**
 * Comments on a deal's business case: on a whole page, a section of a page, or general. Threads (a comment and its
 * replies) stay with the deal across versions; each notes the version it was made on. Anyone who can view the deal
 * comments; the author edits their own; the author or an admin deletes. A thread is resolved (or reopened) by its
 * author, the deal's owner, or anyone mentioned in it. @mentions show in the mentioned person's notifications.
 */
import type { Client, Row } from '@libsql/client';
import { initialsOf, type Person, type Viewer } from './planNotes';

export interface ProposalComment {
  id: number;
  body: string;
  author: Person;
  mentions: number[];
  createdAt: string;
  updatedAt: string;
  versionNo: number | null;
  mine: boolean;
  canDelete: boolean;
}
export interface CommentThread extends ProposalComment {
  /** Business case page id (null: a general comment), and the section within it (null: the whole page). */
  page: string | null;
  block: string | null;
  /** What it's on, in words (e.g. "Sources of value · What the program returns"). */
  label: string;
  versionId: number | null;
  resolvedAt: string | null;
  resolvedBy: Person | null;
  replies: ProposalComment[];
  /** The viewer may resolve or reopen it. */
  canResolve: boolean;
}
export interface MentionItem {
  id: number;
  threadId: number;
  versionId: number | null;
  versionNo: number | null;
  label: string;
  preview: string;
  author: Person;
  createdAt: string;
}

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const person = (id: unknown, name: unknown): Person => ({ id: Number(id), name: String(name ?? 'Someone'), initials: initialsOf(String(name ?? '')) });
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const ids = (v: unknown): number[] => {
  try {
    const a = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(a) ? [...new Set(a.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 30) : [];
  } catch {
    return [];
  }
};

async function dealOfVersion(db: Client, versionId: number) {
  const r = await db.execute({ sql: 'SELECT q.deal_id, v.version_no, d.owner_id FROM quote_versions v JOIN quotes q ON q.id = v.quote_id JOIN deals d ON d.id = q.deal_id WHERE v.id = ?', args: [versionId] });
  if (!r.rows.length) throw httpError('Proposal not found', 404);
  return { dealId: Number(r.rows[0].deal_id), versionNo: Number(r.rows[0].version_no), ownerId: r.rows[0].owner_id == null ? null : Number(r.rows[0].owner_id) };
}

const toComment = (r: Row, v: Viewer): ProposalComment => ({
  id: Number(r.id),
  body: String(r.body),
  author: person(r.author_id, r.author_name),
  mentions: ids(r.mentions),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
  versionNo: r.version_no == null ? null : Number(r.version_no),
  mine: Number(r.author_id) === v.id,
  canDelete: Number(r.author_id) === v.id || v.role === 'admin',
});

/** Every thread on the deal (newest first), opened from one of its versions. */
export async function listComments(db: Client, versionId: number, v: Viewer): Promise<CommentThread[]> {
  const { dealId, ownerId } = await dealOfVersion(db, versionId);
  const r = await db.execute({
    sql: `SELECT c.*, u.name AS author_name, rb.name AS resolved_by_name FROM proposal_comments c JOIN users u ON u.id = c.author_id LEFT JOIN users rb ON rb.id = c.resolved_by
          WHERE c.deal_id = ? ORDER BY c.id`,
    args: [dealId],
  });
  const replies = r.rows.filter((x) => x.parent_id != null);
  return r.rows
    .filter((x) => x.parent_id == null)
    .map((x) => {
      const reps = replies.filter((y) => Number(y.parent_id) === Number(x.id)).map((y) => toComment(y, v));
      const root = toComment(x, v);
      const mentioned = [root, ...reps].some((c) => c.mentions.includes(v.id));
      return {
        ...root,
        page: x.page == null ? null : String(x.page),
        block: x.block == null ? null : String(x.block),
        label: String(x.target_label ?? (x.page == null ? 'General' : 'Page')),
        versionId: x.version_id == null ? null : Number(x.version_id),
        resolvedAt: x.resolved_at == null ? null : String(x.resolved_at),
        resolvedBy: x.resolved_by == null ? null : person(x.resolved_by, x.resolved_by_name),
        replies: reps,
        canResolve: root.mine || ownerId === v.id || mentioned,
      };
    })
    .reverse();
}

export interface NewComment {
  parentId?: number | null;
  page?: string | null;
  block?: string | null;
  label?: string;
  body?: string;
  mentions?: number[];
}

/** A new thread (on a page, a section or general) or a reply to one. The author has read their own mentions. */
export async function addComment(db: Client, versionId: number, input: NewComment, v: Viewer): Promise<number> {
  const { dealId, versionNo } = await dealOfVersion(db, versionId);
  const body = text(input.body, 4000);
  if (!body) throw httpError('Write a comment first', 400);
  let page: string | null = input.page ? text(input.page, 40) : null;
  let block: string | null = input.block ? text(input.block, 60) : null;
  let label = text(input.label, 160) || (page ? 'Page' : 'General');
  const parentId = input.parentId == null ? null : Number(input.parentId);
  if (parentId != null) {
    const p = await db.execute({ sql: 'SELECT page, block, target_label FROM proposal_comments WHERE id = ? AND deal_id = ? AND parent_id IS NULL', args: [parentId, dealId] });
    if (!p.rows.length) throw httpError('Thread not found', 404);
    page = p.rows[0].page == null ? null : String(p.rows[0].page);
    block = p.rows[0].block == null ? null : String(p.rows[0].block);
    label = String(p.rows[0].target_label ?? label);
  }
  const mentions = ids(input.mentions).filter((id) => id !== v.id);
  const r = await db.execute({
    sql: `INSERT INTO proposal_comments (deal_id, version_id, version_no, parent_id, page, block, target_label, body, mentions, author_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [dealId, versionId, versionNo, parentId, page, block, label, body, JSON.stringify(mentions), v.id],
  });
  // A reply reopens a resolved thread.
  if (parentId != null) await db.execute({ sql: 'UPDATE proposal_comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ?', args: [parentId] });
  return Number(r.rows[0].id);
}

async function commentRow(db: Client, versionId: number, id: number) {
  const { dealId, ownerId } = await dealOfVersion(db, versionId);
  const r = await db.execute({ sql: 'SELECT * FROM proposal_comments WHERE id = ? AND deal_id = ?', args: [id, dealId] });
  if (!r.rows.length) throw httpError('Comment not found', 404);
  return { row: r.rows[0], ownerId, dealId };
}

/** The author edits their comment (text and who it mentions). */
export async function editComment(db: Client, versionId: number, id: number, input: { body?: string; mentions?: number[] }, v: Viewer): Promise<void> {
  const { row } = await commentRow(db, versionId, id);
  if (Number(row.author_id) !== v.id) throw httpError('Only the author can edit this comment', 403);
  const body = text(input.body, 4000);
  if (!body) throw httpError('A comment needs some text', 400);
  const mentions = input.mentions === undefined ? ids(row.mentions) : ids(input.mentions).filter((x) => x !== v.id);
  await db.execute({ sql: "UPDATE proposal_comments SET body = ?, mentions = ?, updated_at = datetime('now') WHERE id = ?", args: [body, JSON.stringify(mentions), id] });
}

/** Resolve or reopen a thread: its author, the deal's owner, or anyone mentioned in it. */
export async function resolveThread(db: Client, versionId: number, id: number, resolved: boolean, v: Viewer): Promise<void> {
  const { row, ownerId } = await commentRow(db, versionId, id);
  if (row.parent_id != null) throw httpError('Resolve the thread, not a reply', 400);
  const all = await db.execute({ sql: 'SELECT mentions FROM proposal_comments WHERE id = ? OR parent_id = ?', args: [id, id] });
  const mentioned = all.rows.some((x) => ids(x.mentions).includes(v.id));
  if (Number(row.author_id) !== v.id && ownerId !== v.id && !mentioned) throw httpError('Only the author, the deal owner or someone tagged in it can resolve this', 403);
  await db.execute({ sql: resolved ? "UPDATE proposal_comments SET resolved_at = datetime('now'), resolved_by = ? WHERE id = ?" : 'UPDATE proposal_comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ? AND ? IS NOT NULL', args: resolved ? [v.id, id] : [id, v.id] });
}

/** Its author or an admin deletes a comment (a thread goes with its replies). */
export async function deleteComment(db: Client, versionId: number, id: number, v: Viewer): Promise<void> {
  const { row } = await commentRow(db, versionId, id);
  if (Number(row.author_id) !== v.id && v.role !== 'admin') throw httpError('Only the author or an admin can delete this comment', 403);
  await db.execute({ sql: 'DELETE FROM comment_reads WHERE comment_id IN (SELECT id FROM proposal_comments WHERE id = ? OR parent_id = ?)', args: [id, id] });
  await db.execute({ sql: 'DELETE FROM proposal_comments WHERE id = ? OR parent_id = ?', args: [id, id] });
}

/** Comments on this deal that mention the viewer and they haven't read, newest first. */
export async function unreadMentions(db: Client, quoteId: number, v: Viewer): Promise<MentionItem[]> {
  const r = await db.execute({
    // A deleted version's comments open on the deal's active version.
    sql: `SELECT c.*, u.name AS author_name, COALESCE(c.version_id, (SELECT active_version_id FROM quotes WHERE id = ?)) AS open_version FROM proposal_comments c JOIN users u ON u.id = c.author_id
          WHERE c.deal_id = (SELECT deal_id FROM quotes WHERE id = ?) AND c.author_id <> ?
            AND EXISTS (SELECT 1 FROM json_each(c.mentions) j WHERE j.value = ?)
            AND NOT EXISTS (SELECT 1 FROM comment_reads r WHERE r.user_id = ? AND r.comment_id = c.id)
          ORDER BY c.id DESC`,
    args: [quoteId, quoteId, v.id, v.id, v.id],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    threadId: x.parent_id == null ? Number(x.id) : Number(x.parent_id),
    versionId: x.open_version == null ? null : Number(x.open_version),
    versionNo: x.version_no == null ? null : Number(x.version_no),
    label: String(x.target_label ?? 'General'),
    preview: String(x.body).replace(/\s+/g, ' ').slice(0, 140),
    author: person(x.author_id, x.author_name),
    createdAt: String(x.created_at),
  }));
}

export async function markMentionsRead(db: Client, quoteId: number, v: Viewer, list: number[] | 'all'): Promise<void> {
  const items = list === 'all' ? (await unreadMentions(db, quoteId, v)).map((m) => m.id) : list;
  for (const id of items.slice(0, 2000)) await db.execute({ sql: 'INSERT OR IGNORE INTO comment_reads (user_id, comment_id) VALUES (?, ?)', args: [v.id, Math.round(Number(id))] });
}

/** Active users, to @mention. */
export async function mentionable(db: Client): Promise<Person[]> {
  const r = await db.execute('SELECT id, name FROM users WHERE active = 1 ORDER BY name');
  return r.rows.map((x) => person(x.id, x.name));
}

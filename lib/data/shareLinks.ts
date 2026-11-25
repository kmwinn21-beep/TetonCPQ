/**
 * Proposal links shared with prospects. A deal has at most one live link: it shows one saved version of the
 * proposal to the emails the rep lists (and, if the rep turns it on, only with a 6-digit code as well). Links expire
 * (30 days by default) and can be turned off. Prospects comment on the business case (a page, a section, or the
 * whole proposal); the deal's owner gets an in-app notification for each comment and for each person's first visit.
 */
import { randomBytes, randomInt } from 'node:crypto';
import type { Client, Row } from '@libsql/client';

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

export const DEFAULT_LINK_DAYS = 30;
export const MAX_LINK_DAYS = 365;
export const EXPIRY_WARNING_DAYS = 7;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ShareLinkPerson {
  email: string;
  /** Their name, as the rep gave it (for "Hey Dana"). */
  name: string | null;
  /** When the share email last went to them. */
  emailedAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  views: number;
}
export interface ShareLink {
  id: number;
  token: string;
  dealId: number;
  versionId: number;
  versionNo: number;
  /** Last day it opens (yyyy-mm-dd, inclusive). */
  expiresOn: string;
  allowComments: boolean;
  allowPdf: boolean;
  /** Signing in also needs a 6-digit code emailed to them. */
  verifyEmail: boolean;
  /** The share email: the proposal's name, the opening line ({first name} filled in), a note. */
  proposalName: string | null;
  intro: string | null;
  note: string | null;
  createdAt: string;
  people: ShareLinkPerson[];
}

/** yyyy-mm-dd of a date (UTC), or today; plus some days. */
export const isoDay = (d = new Date(), plusDays = 0) => new Date(d.getTime() + plusDays * 86400000).toISOString().slice(0, 10);
/** Whole days from today until the last day (0 = it's the last day; negative = expired). */
export const daysLeft = (expiresOn: string, today = isoDay()) => Math.round((Date.parse(`${expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);

export function normalizeEmails(raw: unknown): string[] {
  return normalizePeople(raw).map((p) => p.email);
}
/** People to share with: emails (strings, "Name <email>", or { email, name }), checked and without repeats. */
export function normalizePeople(raw: unknown): Array<{ email: string; name: string | null }> {
  const items = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,;\n]+/);
  const out = new Map<string, { email: string; name: string | null }>();
  for (const it of items) {
    let email = '';
    let name: string | null = null;
    if (it && typeof it === 'object') {
      email = String((it as { email?: unknown }).email ?? '');
      name = String((it as { name?: unknown }).name ?? '').trim() || null;
    } else {
      const t = String(it ?? '').trim();
      const m = t.match(/^(.*)<([^>]+)>$/);
      if (m) {
        name = m[1].replace(/"/g, '').trim() || null;
        email = m[2];
      } else email = t;
    }
    email = email.trim().toLowerCase();
    if (!email) continue;
    if (!EMAIL.test(email) || email.length > 200) throw httpError(`“${email}” isn’t an email address`, 400);
    out.set(email, { email, name: name ? name.slice(0, 80) : out.get(email)?.name ?? null });
  }
  return [...out.values()].slice(0, 50);
}

const newToken = () => randomBytes(12).toString('base64url');
export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

async function linkRow(db: Client, where: string, args: Array<string | number>): Promise<ShareLink | null> {
  const r = await db.execute({ sql: `SELECT l.*, v.version_no FROM share_links l JOIN quote_versions v ON v.id = l.version_id WHERE ${where} ORDER BY l.id DESC LIMIT 1`, args });
  if (!r.rows.length) return null;
  const x = r.rows[0];
  const people = await db.execute({ sql: 'SELECT * FROM share_link_emails WHERE link_id = ? ORDER BY id', args: [Number(x.id)] });
  return toLink(x, people.rows);
}
const toLink = (x: Row, people: Row[]): ShareLink => ({
  id: Number(x.id),
  token: String(x.token),
  dealId: Number(x.deal_id),
  versionId: Number(x.version_id),
  versionNo: Number(x.version_no),
  expiresOn: String(x.expires_on),
  allowComments: Number(x.allow_comments) === 1,
  allowPdf: Number(x.allow_pdf) === 1,
  verifyEmail: Number(x.verify_email) === 1,
  proposalName: x.proposal_name == null ? null : String(x.proposal_name),
  intro: x.intro == null ? null : String(x.intro),
  note: x.note == null ? null : String(x.note),
  createdAt: String(x.created_at),
  people: people.map((p) => ({
    email: String(p.email),
    name: p.name == null ? null : String(p.name),
    emailedAt: p.emailed_at == null ? null : String(p.emailed_at),
    firstOpenedAt: p.first_opened_at == null ? null : String(p.first_opened_at),
    lastOpenedAt: p.last_opened_at == null ? null : String(p.last_opened_at),
    views: Number(p.views),
  })),
});

async function dealOfQuote(db: Client, quoteId: number) {
  const r = await db.execute({ sql: 'SELECT deal_id FROM quotes WHERE id = ?', args: [quoteId] });
  if (!r.rows.length) throw httpError('Deal not found', 404);
  return Number(r.rows[0].deal_id);
}

/** The deal's live link (not turned off), if any. */
export async function getDealShareLink(db: Client, quoteId: number): Promise<ShareLink | null> {
  return linkRow(db, 'l.deal_id = ? AND l.revoked_at IS NULL', [await dealOfQuote(db, quoteId)]);
}

export interface ShareLinkInput {
  versionId: number;
  emails: unknown;
  allowComments?: boolean;
  allowPdf?: boolean;
  /** yyyy-mm-dd; default 30 days from today. */
  expiresOn?: string | null;
  /** Signing in also needs a 6-digit code emailed to them. */
  verifyEmail?: boolean;
  proposalName?: string | null;
  intro?: string | null;
  note?: string | null;
}

/** Creates the deal's link, or changes the live one (who, what it allows, when it expires, the version it shows). */
export async function saveShareLink(db: Client, quoteId: number, input: ShareLinkInput, userId: number, today = isoDay()): Promise<ShareLink> {
  const dealId = await dealOfQuote(db, quoteId);
  const v = await db.execute({ sql: 'SELECT v.id, v.status, q.deal_id FROM quote_versions v JOIN quotes q ON q.id = v.quote_id WHERE v.id = ?', args: [Number(input.versionId)] });
  if (!v.rows.length || Number(v.rows[0].deal_id) !== dealId) throw httpError('That version isn’t part of this deal', 400);
  if (v.rows[0].status === 'draft') throw httpError('Save a version first: links show saved versions only', 400);
  const people = normalizePeople(input.emails);
  const emails = people.map((p) => p.email);
  if (!emails.length) throw httpError('Add at least one email', 400);
  const expiresOn = input.expiresOn ? String(input.expiresOn).slice(0, 10) : isoDay(new Date(`${today}T00:00:00Z`), DEFAULT_LINK_DAYS);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || Number.isNaN(Date.parse(expiresOn))) throw httpError('Pick an expiry date', 400);
  const left = daysLeft(expiresOn, today);
  if (left < 0) throw httpError('The expiry date has passed: pick today or later', 400);
  if (left > MAX_LINK_DAYS) throw httpError(`Links can last up to ${MAX_LINK_DAYS} days`, 400);
  const live = await getDealShareLink(db, quoteId);
  const opt = (v: unknown, max: number) => (v == null ? null : String(v).replace(/\r\n?/g, '\n').trim().slice(0, max) || null);
  const args = [Number(input.versionId), expiresOn, input.allowComments === false ? 0 : 1, input.allowPdf === false ? 0 : 1, input.verifyEmail ? 1 : 0, opt(input.proposalName, 120), opt(input.intro, 300), opt(input.note, 2000)];
  let id: number;
  if (live) {
    id = live.id;
    await db.execute({ sql: "UPDATE share_links SET version_id = ?, expires_on = ?, allow_comments = ?, allow_pdf = ?, verify_email = ?, proposal_name = ?, intro = ?, note = ?, access_code = NULL, updated_at = datetime('now') WHERE id = ?", args: [...args, id] });
  } else {
    const r = await db.execute({ sql: 'INSERT INTO share_links (version_id, expires_on, allow_comments, allow_pdf, verify_email, proposal_name, intro, note, deal_id, token, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', args: [...args, dealId, newToken(), userId] });
    id = Number(r.rows[0].id);
  }
  // People: keep the ones still listed (and when they opened it), add the new ones, drop the rest.
  await db.execute({ sql: `DELETE FROM share_link_emails WHERE link_id = ? AND email NOT IN (${emails.map(() => '?').join(',')})`, args: [id, ...emails] });
  for (const p of people) {
    await db.execute({ sql: 'INSERT OR IGNORE INTO share_link_emails (link_id, email) VALUES (?, ?)', args: [id, p.email] });
    await db.execute({ sql: 'UPDATE share_link_emails SET name = ? WHERE link_id = ? AND email = ?', args: [p.name, id, p.email] });
  }
  return (await linkRow(db, 'l.id = ?', [id]))!;
}

/** Turns the deal's link off: it stops opening (comments stay with the deal). */
export async function revokeShareLink(db: Client, quoteId: number): Promise<void> {
  await db.execute({ sql: "UPDATE share_links SET revoked_at = datetime('now') WHERE deal_id = ? AND revoked_at IS NULL", args: [await dealOfQuote(db, quoteId)] });
}

// ---------------------------------------------------------------- the prospect's side

export interface PublicLink extends ShareLink {
  revoked: boolean;
  dealName: string;
  ownerId: number | null;
  ownerName: string;
  ownerEmail: string;
}

/** A link by its token (turned off ones too, to say so), with who it's from. */
export async function linkByToken(db: Client, token: string): Promise<PublicLink | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return null;
  const r = await db.execute({
    sql: `SELECT l.*, v.version_no, d.customer_name, d.owner_id, u.name AS owner_name, u.email AS owner_email FROM share_links l JOIN quote_versions v ON v.id = l.version_id
          JOIN deals d ON d.id = l.deal_id LEFT JOIN users u ON u.id = d.owner_id WHERE l.token = ?`,
    args: [token],
  });
  if (!r.rows.length) return null;
  const x = r.rows[0];
  const people = await db.execute({ sql: 'SELECT * FROM share_link_emails WHERE link_id = ? ORDER BY id', args: [Number(x.id)] });
  return {
    ...toLink(x, people.rows),
    revoked: x.revoked_at != null,
    dealName: String(x.customer_name ?? ''),
    ownerId: x.owner_id == null ? null : Number(x.owner_id),
    ownerName: String(x.owner_name ?? 'Teton'),
    ownerEmail: String(x.owner_email ?? ''),
  };
}

export type LinkState = 'ok' | 'revoked' | 'expired';
export const linkState = (l: Pick<PublicLink, 'revoked' | 'expiresOn'>, today = isoDay()): LinkState => (l.revoked ? 'revoked' : daysLeft(l.expiresOn, today) < 0 ? 'expired' : 'ok');

/** May this email open the link (before any emailed code)? Emails ignore case and spaces. */
export function checkAccess(l: PublicLink, email: string, today = isoDay()): 'ok' | 'revoked' | 'expired' | 'email' {
  const st = linkState(l, today);
  if (st !== 'ok') return st;
  const e = email.trim().toLowerCase();
  if (!l.people.some((p) => p.email === e)) return 'email';
  return 'ok';
}

/** Counts a visit; a person's first one tells the deal's owner. */
export async function recordOpen(db: Client, l: PublicLink, email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  const r = await db.execute({ sql: 'SELECT id, first_opened_at FROM share_link_emails WHERE link_id = ? AND email = ?', args: [l.id, e] });
  if (!r.rows.length) return;
  const rowId = Number(r.rows[0].id);
  const first = r.rows[0].first_opened_at == null;
  await db.execute({ sql: "UPDATE share_link_emails SET views = views + 1, last_opened_at = datetime('now'), first_opened_at = COALESCE(first_opened_at, datetime('now')) WHERE id = ?", args: [rowId] });
  if (first && l.ownerId != null) await notifyOwner(db, l, 'prospect_open', rowId);
}

async function notifyOwner(db: Client, l: PublicLink, kind: 'prospect_open' | 'prospect_comment', ref: number) {
  await db.execute({ sql: 'INSERT OR IGNORE INTO user_notifications (user_id, deal_id, kind, task_id) VALUES (?, ?, ?, ?)', args: [l.ownerId!, l.dealId, kind, ref] });
}

export interface ProspectComment {
  parentId?: number | null;
  page?: string | null;
  block?: string | null;
  label?: string;
  body?: string;
}
const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

/** A prospect's new thread (on a page, a section, or general) or reply to a thread on their link. Tells the owner. */
export async function addProspectComment(db: Client, l: PublicLink, who: { email: string; name?: string | null }, input: ProspectComment, opts: { questionId?: number } = {}): Promise<number> {
  // Answers to the team's questions are comments too, even where the link doesn't take comments.
  if (!l.allowComments && opts.questionId == null) throw httpError('Comments are turned off for this link', 403);
  if (l.ownerId == null) throw httpError('This deal has no owner to reply', 400);
  const body = text(input.body, opts.questionId != null ? 6000 : 4000);
  if (!body) throw httpError('Write a comment first', 400);
  let page: string | null = input.page ? text(input.page, 40) : null;
  let block: string | null = input.block ? text(input.block, 60) : null;
  let label = text(input.label, 160) || (page ? 'Page' : 'General');
  const parentId = input.parentId == null ? null : Number(input.parentId);
  if (parentId != null) {
    // Replies only on this link's own threads.
    const p = await db.execute({ sql: "SELECT page, block, target_label FROM proposal_comments WHERE id = ? AND parent_id IS NULL AND share_link_id = ? AND area = 'deliverable'", args: [parentId, l.id] });
    if (!p.rows.length) throw httpError('Thread not found', 404);
    page = p.rows[0].page == null ? null : String(p.rows[0].page);
    block = p.rows[0].block == null ? null : String(p.rows[0].block);
    label = String(p.rows[0].target_label ?? label);
  }
  const r = await db.execute({
    sql: `INSERT INTO proposal_comments (deal_id, version_id, version_no, parent_id, page, block, target_label, body, mentions, author_id, area, prospect_email, prospect_name, share_link_id, question_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, 'deliverable', ?, ?, ?, ?) RETURNING id`,
    args: [l.dealId, l.versionId, l.versionNo, parentId, page, block, label, body, l.ownerId, who.email.trim().toLowerCase(), who.name ? text(who.name, 80) : null, l.id, opts.questionId ?? null],
  });
  const id = Number(r.rows[0].id);
  if (parentId != null) await db.execute({ sql: 'UPDATE proposal_comments SET resolved_at = NULL, resolved_by = NULL WHERE id = ?', args: [parentId] });
  await notifyOwner(db, l, 'prospect_comment', id);
  return id;
}

// ---------------------------------------------------------------- the owner's notifications

export interface ProspectNotification {
  id: number;
  kind: 'prospect_comment' | 'prospect_open';
  /** Who: the prospect's name, or their email. */
  who: string;
  email: string;
  createdAt: string;
  /** Comments: the comment, its thread, what it's on, and the version to open. */
  commentId: number | null;
  threadId: number | null;
  label: string | null;
  body: string | null;
  reply: boolean;
  versionId: number | null;
}

/** Unread prospect notifications for a user on one deal (newest first). */
export async function prospectNotifications(db: Client, userId: number, quoteId: number): Promise<ProspectNotification[]> {
  const r = await db.execute({
    sql: `SELECT n.id, n.kind, n.created_at, c.id AS comment_id, c.parent_id, c.target_label, c.body, c.prospect_email, c.prospect_name, c.version_id, e.email AS open_email
          FROM user_notifications n
          LEFT JOIN proposal_comments c ON n.kind = 'prospect_comment' AND c.id = n.task_id
          LEFT JOIN share_link_emails e ON n.kind = 'prospect_open' AND e.id = n.task_id
          WHERE n.user_id = ? AND n.read_at IS NULL AND n.kind IN ('prospect_comment', 'prospect_open') AND n.deal_id = (SELECT deal_id FROM quotes WHERE id = ?)
          ORDER BY n.created_at DESC, n.id DESC`,
    args: [userId, quoteId],
  });
  return r.rows
    .filter((x) => (x.kind === 'prospect_comment' ? x.comment_id != null : x.open_email != null))
    .map((x) => {
      const comment = x.kind === 'prospect_comment';
      const email = String(comment ? x.prospect_email : x.open_email);
      return {
        id: Number(x.id),
        kind: comment ? ('prospect_comment' as const) : ('prospect_open' as const),
        who: comment && x.prospect_name ? String(x.prospect_name) : email,
        email,
        createdAt: String(x.created_at),
        commentId: comment ? Number(x.comment_id) : null,
        threadId: comment ? (x.parent_id == null ? Number(x.comment_id) : Number(x.parent_id)) : null,
        label: comment ? String(x.target_label ?? 'General') : null,
        body: comment ? String(x.body) : null,
        reply: comment && x.parent_id != null,
        versionId: comment && x.version_id != null ? Number(x.version_id) : null,
      };
    });
}

export async function markProspectNotificationsRead(db: Client, userId: number, ids: number[]): Promise<void> {
  for (const id of ids.slice(0, 2000)) await db.execute({ sql: "UPDATE user_notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?", args: [Math.round(Number(id)), userId] });
}

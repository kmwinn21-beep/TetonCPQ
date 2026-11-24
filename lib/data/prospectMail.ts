/**
 * Email to prospects on a shared proposal link:
 * - the share email (the rep sends it from the Share dialog),
 * - sign-in codes, when the link verifies emails (6 digits, 10 minutes, 5 tries),
 * - the team's replies and comments. These wait: each one is held 3 minutes, and another for the same person in
 *   that time joins it (one email); never more than 10 minutes from the first. Resend holds the scheduled email; a
 *   newer batch cancels and replaces it. If the prospect opens the proposal before it goes, it isn't sent. A
 *   prospect who clicked "Stop these emails" gets none.
 */
import { createHash, createHmac } from 'node:crypto';
import type { Client } from '@libsql/client';
import { mailer } from '@/lib/email/send';
import { codeEmail, commentEmail, firstNameOf, shareEmail, type CommentEmailItem } from '@/lib/email/templates';
import { getDealShareLink, linkByToken, linkState, newCode, type PublicLink, type ShareLink } from './shareLinks';

export const HOLD_MS = 3 * 60_000;
export const MAX_HOLD_MS = 10 * 60_000;
const CODE_MS = 10 * 60_000;
const MAX_CODES = 5;
const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const sqlTime = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);
const parseTime = (s: string) => new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);

export const linkUrl = (baseUrl: string, token: string) => `${baseUrl}/p/${token}`;
export const proposalNameOf = (l: Pick<ShareLink, 'proposalName'>, dealName: string) => l.proposalName?.trim() || `${dealName} proposal`;

async function userOf(db: Client, id: number | null) {
  if (id == null) return null;
  const r = await db.execute({ sql: 'SELECT name, email FROM users WHERE id = ?', args: [id] });
  return r.rows.length ? { name: String(r.rows[0].name), email: String(r.rows[0].email) } : null;
}

// ---------------------------------------------------------------- the share email

/**
 * Emails the link (from the rep sending it): to the listed emails given, or to everyone not emailed yet. Returns who
 * it went to.
 */
export async function sendShareEmails(db: Client, quoteId: number, baseUrl: string, sender: { id: number }, only?: string[]): Promise<string[]> {
  const live = await getDealShareLink(db, quoteId);
  if (!live) throw httpError('Create the link first', 400);
  const l = (await linkByToken(db, live.token))!;
  if (linkState(l) !== 'ok') throw httpError('This link has expired: change the expiry date first', 400);
  const rep = (await userOf(db, sender.id)) ?? { name: l.ownerName, email: l.ownerEmail };
  const want = only?.length ? l.people.filter((p) => only.includes(p.email)) : l.people.filter((p) => !p.emailedAt);
  const v = await db.execute({ sql: 'SELECT saved_at FROM quote_versions WHERE id = ?', args: [l.versionId] });
  const preparedOn = v.rows[0]?.saved_at ? String(v.rows[0].saved_at).slice(0, 10) : null;
  const sent: string[] = [];
  for (const p of want) {
    const e = shareEmail({
      baseUrl,
      url: linkUrl(baseUrl, l.token),
      email: p.email,
      first: firstNameOf(p.name, p.email),
      repName: rep.name,
      proposalName: proposalNameOf(l, l.dealName),
      intro: l.intro,
      note: l.note,
      preparedOn,
      allowComments: l.allowComments,
      allowPdf: l.allowPdf,
      verify: l.verifyEmail,
      expiresOn: l.expiresOn,
    });
    await mailer().send({ fromName: `${rep.name} (Teton)`, to: p.email, replyTo: rep.email, ...e });
    await db.execute({ sql: "UPDATE share_link_emails SET emailed_at = datetime('now') WHERE link_id = ? AND email = ?", args: [l.id, p.email] });
    sent.push(p.email);
  }
  return sent;
}

// ---------------------------------------------------------------- sign-in codes

const hashCode = (linkId: number, email: string, code: string) => createHash('sha256').update(`${linkId}|${email}|${code}|${process.env.JWT_SECRET ?? ''}`).digest('hex');

/** Emails a 6-digit code to a listed email (up to 5 in 10 minutes). */
export async function sendSignInCode(db: Client, l: PublicLink, email: string, baseUrl: string, now = new Date()): Promise<void> {
  const e = email.trim().toLowerCase();
  const recent = await db.execute({ sql: 'SELECT COUNT(*) AS n FROM share_link_codes WHERE link_id = ? AND email = ? AND created_at > ?', args: [l.id, e, sqlTime(new Date(now.getTime() - CODE_MS))] });
  if (Number(recent.rows[0].n) >= MAX_CODES) throw httpError('Too many codes sent. Wait 10 minutes and try again.', 429);
  const code = newCode();
  await db.execute({ sql: 'INSERT INTO share_link_codes (link_id, email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', args: [l.id, e, hashCode(l.id, e, code), sqlTime(new Date(now.getTime() + CODE_MS)), sqlTime(now)] });
  const person = l.people.find((p) => p.email === e);
  const msg = codeEmail({ baseUrl, first: firstNameOf(person?.name, e), code, proposalName: proposalNameOf(l, l.dealName), repName: l.ownerName });
  await mailer().send({ fromName: `${l.ownerName} (Teton)`, to: e, replyTo: l.ownerEmail || null, ...msg });
}

/** Checks a code: the latest unused one for this email, not expired, under 5 tries. */
export async function checkSignInCode(db: Client, l: PublicLink, email: string, code: string, now = new Date()): Promise<boolean> {
  const e = email.trim().toLowerCase();
  const r = await db.execute({ sql: 'SELECT * FROM share_link_codes WHERE link_id = ? AND email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1', args: [l.id, e] });
  const row = r.rows[0];
  if (!row || parseTime(String(row.expires_at)) < now || Number(row.attempts) >= MAX_CODES) return false;
  if (row.code_hash !== hashCode(l.id, e, String(code).replace(/\s/g, ''))) {
    await db.execute({ sql: 'UPDATE share_link_codes SET attempts = attempts + 1 WHERE id = ?', args: [Number(row.id)] });
    return false;
  }
  await db.execute({ sql: 'UPDATE share_link_codes SET used_at = ? WHERE id = ?', args: [sqlTime(now), Number(row.id)] });
  return true;
}

// ---------------------------------------------------------------- the team's replies and comments

/** Signed "stop these emails" links (per link and email). */
const muteSig = (linkId: number, email: string) => createHmac('sha256', process.env.JWT_SECRET ?? 'teton').update(`mute|${linkId}|${email}`).digest('base64url').slice(0, 22);
export const unsubscribeUrl = (baseUrl: string, l: Pick<PublicLink, 'id' | 'token'>, email: string) => `${baseUrl}/p/${l.token}/stop?e=${encodeURIComponent(email)}&s=${muteSig(l.id, email)}`;
export async function muteReplies(db: Client, l: PublicLink, email: string, sig: string, now = new Date()): Promise<boolean> {
  const e = email.trim().toLowerCase();
  if (sig !== muteSig(l.id, e)) return false;
  await db.execute({ sql: 'UPDATE share_link_emails SET mute_replies = 1 WHERE link_id = ? AND email = ?', args: [l.id, e] });
  // And nothing still waiting goes.
  await dropPending(db, l.id, e, 'canceled', now);
  return true;
}

/**
 * After a team member's comment: if it's on the deal's shared link (a reply in a prospect's thread, or a comment
 * shared with the prospect), each prospect it's for gets it by email, held and batched.
 */
export async function queueProspectMail(db: Client, commentId: number, baseUrl: string, now = new Date()): Promise<number> {
  const c = await db.execute({ sql: 'SELECT id, parent_id, share_link_id, prospect_email FROM proposal_comments WHERE id = ?', args: [commentId] });
  const row = c.rows[0];
  if (!row || row.share_link_id == null || row.prospect_email != null) return 0;
  const lr = await db.execute({ sql: 'SELECT token FROM share_links WHERE id = ?', args: [Number(row.share_link_id)] });
  const l = lr.rows[0] ? await linkByToken(db, String(lr.rows[0].token)) : null;
  if (!l || linkState(l) !== 'ok') return 0;
  const reply = row.parent_id != null;
  let to: string[];
  if (reply) {
    // The prospects in that thread (still on the link).
    const t = await db.execute({ sql: 'SELECT DISTINCT prospect_email FROM proposal_comments WHERE (id = ? OR parent_id = ?) AND prospect_email IS NOT NULL', args: [Number(row.parent_id), Number(row.parent_id)] });
    to = t.rows.map((x) => String(x.prospect_email));
  } else to = l.people.map((p) => p.email);
  const muted = new Set((await db.execute({ sql: 'SELECT email FROM share_link_emails WHERE link_id = ? AND mute_replies = 1', args: [l.id] })).rows.map((x) => String(x.email)));
  to = to.filter((e) => l.people.some((p) => p.email === e) && !muted.has(e));
  for (const e of to) {
    await db.execute({ sql: 'INSERT INTO prospect_mail (link_id, email, comment_id, kind, created_at) VALUES (?, ?, ?, ?, ?)', args: [l.id, e, commentId, reply ? 'reply' : 'comment', sqlTime(now)] });
    await reschedule(db, l, e, baseUrl, now);
  }
  return to.length;
}

/** The items waiting for one person: not yet in an email that has gone. */
async function waiting(db: Client, linkId: number, email: string, now: Date) {
  const r = await db.execute({ sql: "SELECT * FROM prospect_mail WHERE link_id = ? AND email = ? AND status = 'scheduled' ORDER BY id", args: [linkId, email] });
  // An email whose time has come has gone (or is going): its items are done.
  return r.rows.filter((x) => x.send_at == null || parseTime(String(x.send_at)).getTime() > now.getTime() + 15_000);
}

/** (Re)builds the one email for a person's waiting items: cancels the scheduled one, schedules the new batch. */
async function reschedule(db: Client, l: PublicLink, email: string, baseUrl: string, now: Date) {
  let rows = await waiting(db, l.id, email, now);
  // Cancel the email they were in; if it can't be (it went), those items are done: leave them out.
  const old = [...new Set(rows.map((x) => x.email_id).filter((x): x is string => x != null).map(String))];
  for (const id of old) {
    if (!(await mailer().cancel(id))) rows = rows.filter((x) => String(x.email_id) !== id);
  }
  if (!rows.length) return;
  const first = Math.min(...rows.map((x) => parseTime(String(x.created_at)).getTime()));
  const sendAt = new Date(Math.min(now.getTime() + HOLD_MS, first + MAX_HOLD_MS));
  const built = await buildCommentEmail(db, l, email, rows.map((x) => Number(x.comment_id)), baseUrl);
  if (!built) return;
  const { id } = await mailer().send({ ...built, to: email, scheduledAt: sendAt, headers: { 'List-Unsubscribe': `<${unsubscribeUrl(baseUrl, l, email)}>` } });
  for (const x of rows) await db.execute({ sql: 'UPDATE prospect_mail SET email_id = ?, send_at = ? WHERE id = ?', args: [id, sqlTime(sendAt), Number(x.id)] });
}

/** Grouped by thread: the prospect's comment (for replies) and the team's messages, oldest first. */
async function buildCommentEmail(db: Client, l: PublicLink, email: string, commentIds: number[], baseUrl: string) {
  const r = await db.execute({
    sql: `SELECT c.id, c.parent_id, c.body, c.created_at, c.target_label, c.prospect_email, c.prospect_name, u.name AS author_name, u.email AS author_email
          FROM proposal_comments c JOIN users u ON u.id = c.author_id WHERE c.id IN (${commentIds.map(() => '?').join(',')}) ORDER BY c.id`,
    args: commentIds,
  });
  if (!r.rows.length) return null;
  const threads = new Map<number, CommentEmailItem & { rep: string; repEmail: string }>();
  for (const x of r.rows) {
    const root = x.parent_id == null ? Number(x.id) : Number(x.parent_id);
    let it = threads.get(root);
    if (!it) {
      let original: CommentEmailItem['original'] = null;
      if (x.parent_id != null) {
        const p = await db.execute({ sql: 'SELECT body, created_at, prospect_email, prospect_name FROM proposal_comments WHERE id = ?', args: [root] });
        const pr = p.rows[0];
        if (pr?.prospect_email != null) {
          const mine = String(pr.prospect_email) === email;
          const who = mine ? 'You' : String(pr.prospect_name || pr.prospect_email);
          original = { who, initials: initialsFor(mine ? (l.people.find((q) => q.email === email)?.name ?? email) : who), body: String(pr.body), at: String(pr.created_at) };
        }
      }
      it = { kind: x.parent_id == null ? 'comment' : 'reply', label: String(x.target_label ?? 'Whole proposal'), original, messages: [], rep: String(x.author_name), repEmail: String(x.author_email) };
      threads.set(root, it);
    }
    it.messages.push({ author: String(x.author_name), body: String(x.body), at: String(x.created_at) });
  }
  const items = [...threads.values()];
  const rep = items[0].rep;
  const person = l.people.find((p) => p.email === email);
  const mail = commentEmail({
    baseUrl,
    url: linkUrl(baseUrl, l.token),
    first: firstNameOf(person?.name, email),
    firstInitials: initialsFor(person?.name ?? email),
    repName: rep,
    proposalName: proposalNameOf(l, l.dealName),
    items,
    unsubscribeUrl: unsubscribeUrl(baseUrl, l, email),
  });
  return { fromName: `${rep} (Teton)`, replyTo: items[0].repEmail, ...mail };
}
const initialsFor = (s: string) => {
  const w = s.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 1)).toUpperCase();
};

/** Drops a person's waiting items (seen, or stopped): their scheduled email is canceled. */
async function dropPending(db: Client, linkId: number, email: string, status: 'seen' | 'canceled', now: Date) {
  const rows = await waiting(db, linkId, email, now);
  for (const id of [...new Set(rows.map((x) => x.email_id).filter((x) => x != null).map(String))]) await mailer().cancel(id);
  for (const x of rows) await db.execute({ sql: 'UPDATE prospect_mail SET status = ? WHERE id = ?', args: [status, Number(x.id)] });
}

/** The prospect opened the proposal (and its comments): what was waiting for them they've now seen. */
export async function markSeen(db: Client, l: PublicLink, email: string, now = new Date()): Promise<void> {
  const e = email.trim().toLowerCase();
  await db.execute({ sql: 'UPDATE share_link_emails SET last_seen_at = ? WHERE link_id = ? AND email = ?', args: [sqlTime(now), l.id, e] });
  await dropPending(db, l.id, e, 'seen', now);
}

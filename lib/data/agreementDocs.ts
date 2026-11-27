/**
 * The agreement, worked out in rounds of Word files (V1: everyone edits in Word).
 *
 * Teton uploads a draft and sends it. The prospect's reviewers download it, redline it in Word and upload their round;
 * a lead reviewer sends it to Teton. Teton accepts or rejects each change (tracked in Word, or found by comparing with
 * the previous round), writes Teton-only notes and replies the prospect sees, downloads the round with its decisions
 * applied, writes counters in Word and uploads that as the next round. The prospect can accept Teton's round. Teton
 * marks the agreement final (a clean Word file; nothing open; the deal's active version confirmed to match), then
 * signed (the deal is won).
 *
 * Who can do what on Teton's side comes from the roles & permissions matrix (agreement.*); on the prospect's side from
 * each person's level (view, comment, redline, lead). Signatories are always lead reviewers.
 */
import type { Client } from '@libsql/client';
import { reaches, type Grantee } from '@/lib/auth/permissions';
import { applyDecisions, parseDocx, titleOf, untrackedChanges, type Change, type Decision, type ParsedDoc } from '@/lib/agreement/docx';
import { readBytes, saveBytes } from './storedFiles';
import { getDealDetails } from './dealDetails';
import type { DealAccess } from './access';

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_DOCX_BYTES = 4 * 1024 * 1024;
const line = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const para = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

export type Status = 'draft' | 'with_prospect' | 'with_teton' | 'final' | 'signed';
export type Level = 'none' | 'view' | 'comment' | 'redline' | 'lead';
const LEVELS: Level[] = ['none', 'view', 'comment', 'redline', 'lead'];
const atLeast = (l: Level, min: Level) => LEVELS.indexOf(l) >= LEVELS.indexOf(min);

export interface Settings {
  /** The signatory can invite reviewers (default on). */
  signatoryCanInvite: boolean;
  /** People the signatory invites see the proposal / deal room too (default: agreement only). */
  inviteesSeeProposal: boolean;
  inviteesSeeResources: boolean;
  /** The signatory can give the people they invite the proposal and deal room. */
  signatoryCanGiveTabs: boolean;
}
const DEFAULT_SETTINGS: Settings = { signatoryCanInvite: true, inviteesSeeProposal: false, inviteesSeeResources: false, signatoryCanGiveTabs: true };
const settingsOf = (raw: unknown): Settings => {
  try {
    const s = JSON.parse(String(raw ?? '{}')) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...Object.fromEntries(Object.entries(s).filter(([k, v]) => k in DEFAULT_SETTINGS && typeof v === 'boolean')) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

/** Teton's abilities on one deal's agreement (from the permission matrix). */
export interface TeamCaps {
  view: boolean;
  upload: boolean;
  /** Accept / reject changes, reply to the prospect, send rounds. */
  review: boolean;
  /** The prospect's people and their access. */
  people: boolean;
  /** Mark final and signed. */
  finish: boolean;
}
export function teamCaps(u: Grantee, a: Pick<DealAccess, 'isOwner' | 'isCollaborator' | 'archived'>): TeamCaps {
  const on = (key: string) => reaches(u, key, { isOwner: a.isOwner, collaboratorSwitch: a.isCollaborator });
  const view = on('agreement.view');
  const live = !a.archived;
  return { view, upload: live && on('agreement.upload'), review: live && on('agreement.review'), people: live && on('agreement.people'), finish: live && on('agreement.finish') };
}

export type Actor = { kind: 'team'; id: number; name: string; caps: TeamCaps } | { kind: 'prospect'; email: string; name: string | null; level: Level; signatory: boolean };

export interface NoteView {
  id: number;
  roundId: number | null;
  changeId: number | null;
  visibility: 'internal' | 'shared';
  body: string;
  author: string;
  team: boolean;
  createdAt: string;
}
export interface ChangeView {
  id: number;
  cid: string;
  kind: Change['kind'];
  author: string;
  date: string | null;
  deleted: string;
  inserted: string;
  paragraph: number | null;
  before: string;
  after: string;
  /** Touches price, term, pilot or similar commercial wording: check it against the price book's rules. */
  commercial: boolean;
  decision: Decision | null;
  decidedBy: string | null;
}
export interface RoundView {
  id: number;
  no: number;
  side: 'teton' | 'prospect';
  fileName: string;
  createdAt: string;
  uploadedBy: string;
  sent: boolean;
  sentAt: string | null;
  note: string | null;
  /** The text, Word comments, and which change each of Word's change marks belongs to. */
  doc: Pick<ParsedDoc, 'paragraphs' | 'comments'> & { partOf?: Record<string, string> };
  changes: ChangeView[];
}
export interface PersonView {
  email: string;
  name: string | null;
  organization: string | null;
  level: Level;
  signatory: boolean;
  showProposal: boolean;
  showResources: boolean;
  invitedBy: string | null;
  /** On the shared link (the rep added them, or a signatory invited them). */
  onLink: boolean;
}
export interface EventView {
  id: number;
  kind: string;
  message: string;
  who: string;
  createdAt: string;
}
export interface AgreementView {
  id: number | null;
  status: Status;
  title: string | null;
  settings: Settings;
  rounds: RoundView[];
  people: PersonView[];
  events: EventView[];
  prospectAccepted: { round: number; by: string; at: string } | null;
  final: { fileId: number; at: string } | null;
  signedAt: string | null;
  /** Whose turn it is, in words. */
  turn: string;
}

// ---------------------------------------------------------------- reading

async function agreementRow(db: Client, dealId: number) {
  const r = await db.execute({ sql: 'SELECT * FROM agreement_docs WHERE deal_id = ?', args: [dealId] });
  return r.rows[0] ?? null;
}

async function ensure(db: Client, dealId: number): Promise<number> {
  await db.execute({ sql: 'INSERT OR IGNORE INTO agreement_docs (deal_id) VALUES (?)', args: [dealId] });
  return Number((await agreementRow(db, dealId))!.id);
}

const turnOf = (status: Status, rounds: RoundView[], accepted: boolean): string => {
  if (status === 'signed') return 'Signed';
  if (status === 'final') return 'Final: ready to sign';
  if (!rounds.some((r) => r.side === 'teton' && r.sent)) return 'Teton is preparing the draft';
  if (status === 'with_prospect') return 'With the prospect';
  return accepted ? 'The prospect accepted Teton’s changes: ready to mark final' : 'With Teton';
};

/** Everyone on the prospect's side: signatories, people on the shared link, and people a signatory invited. */
export async function agreementPeople(db: Client, dealId: number): Promise<PersonView[]> {
  const det = await getDealDetails(db, dealId);
  const sig = new Set((det?.signatories ?? []).map((s) => s.email.trim().toLowerCase()).filter(Boolean));
  const sigName = new Map((det?.signatories ?? []).map((s) => [s.email.trim().toLowerCase(), `${s.first} ${s.last}`.trim() || null]));
  const link = await db.execute({
    sql: `SELECT e.email, e.name FROM share_link_emails e JOIN share_links l ON l.id = e.link_id WHERE l.deal_id = ? AND l.revoked_at IS NULL`,
    args: [dealId],
  });
  const onLink = new Map(link.rows.map((x) => [String(x.email).toLowerCase(), x.name == null ? null : String(x.name)]));
  const rows = await db.execute({ sql: 'SELECT * FROM agreement_people WHERE deal_id = ? ORDER BY created_at, id', args: [dealId] });
  const byEmail = new Map(rows.rows.map((x) => [String(x.email).toLowerCase(), x]));
  const emails = [...new Set([...sig, ...onLink.keys(), ...byEmail.keys()])];
  return emails
    .map((email) => {
      const r = byEmail.get(email);
      const signatory = sig.has(email);
      return {
        email,
        name: (r?.name as string | null) ?? onLink.get(email) ?? sigName.get(email) ?? null,
        organization: r?.organization == null ? null : String(r.organization),
        level: signatory ? 'lead' : r ? (String(r.level) as Level) : 'none',
        signatory,
        showProposal: r ? Number(r.show_proposal) === 1 : true,
        showResources: r ? Number(r.show_resources) === 1 : true,
        invitedBy: r?.invited_by_email == null ? null : String(r.invited_by_email),
        onLink: onLink.has(email),
      } satisfies PersonView;
    })
    .sort((a, b) => Number(b.signatory) - Number(a.signatory) || LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || a.email.localeCompare(b.email));
}

/** One prospect's access (a person not listed has none for the agreement and sees the proposal and deal room). */
export async function prospectAccess(db: Client, dealId: number, email: string): Promise<PersonView> {
  const e = email.trim().toLowerCase();
  return (await agreementPeople(db, dealId)).find((p) => p.email === e) ?? { email: e, name: null, organization: null, level: 'none', signatory: false, showProposal: true, showResources: true, invitedBy: null, onLink: false };
}

export async function getAgreement(db: Client, dealId: number, actor: Actor): Promise<AgreementView> {
  const a = await agreementRow(db, dealId);
  const people = await agreementPeople(db, dealId);
  const team = actor.kind === 'team';
  if (!a) return { id: null, status: 'draft', title: null, settings: DEFAULT_SETTINGS, rounds: [], people: team ? people : [], events: [], prospectAccepted: null, final: null, signedAt: null, turn: 'No agreement yet' };
  const aid = Number(a.id);
  const rs = await db.execute({
    sql: `SELECT r.*, u.name AS uploader FROM agreement_rounds r LEFT JOIN users u ON u.id = r.uploaded_by WHERE r.agreement_id = ? ORDER BY r.no`,
    args: [aid],
  });
  const cs = await db.execute({
    sql: `SELECT c.*, u.name AS decider FROM agreement_changes c LEFT JOIN users u ON u.id = c.decided_by WHERE c.round_id IN (SELECT id FROM agreement_rounds WHERE agreement_id = ?) ORDER BY c.round_id, c.id`,
    args: [aid],
  });
  // The prospect sees sent rounds, and their own side's round still waiting to be sent.
  const visible = rs.rows.filter((r) => team || r.sent_at != null || r.side === 'prospect');
  const rounds: RoundView[] = visible.map((r) => {
    let doc: RoundView['doc'] = { paragraphs: [], comments: [] };
    try {
      doc = JSON.parse(String(r.doc_json)) as RoundView['doc'];
    } catch {
      /* ignore */
    }
    return {
      id: Number(r.id),
      no: Number(r.no),
      side: String(r.side) as 'teton' | 'prospect',
      fileName: String(r.file_name),
      createdAt: String(r.created_at),
      uploadedBy: r.side === 'teton' ? String(r.uploader ?? 'Teton') : String(r.uploaded_name || r.uploaded_email || 'Prospect'),
      sent: r.sent_at != null,
      sentAt: r.sent_at == null ? null : String(r.sent_at),
      note: r.note == null ? null : String(r.note),
      doc,
      changes: cs.rows
        .filter((c) => Number(c.round_id) === Number(r.id))
        .map((c) => ({
          id: Number(c.id),
          cid: String(c.cid),
          kind: String(c.kind) as Change['kind'],
          author: String(c.author ?? ''),
          date: c.changed_at == null ? null : String(c.changed_at),
          deleted: String(c.deleted),
          inserted: String(c.inserted),
          paragraph: c.paragraph == null ? null : Number(c.paragraph),
          before: String(c.before_text),
          after: String(c.after_text),
          commercial: Number(c.commercial) === 1,
          // A Teton decision on a prospect round is shown to the prospect once Teton has sent its next round.
          decision: c.decision == null ? null : (String(c.decision) as Decision),
          decidedBy: c.decided_by != null ? String(c.decider ?? 'Teton') : c.decided_email != null ? String(c.decided_email) : null,
        })),
    };
  });
  if (!team) {
    // Decisions on a prospect round stay Teton's until Teton answers with its next round.
    const lastTetonSent = Math.max(0, ...rounds.filter((r) => r.side === 'teton' && r.sent).map((r) => r.no));
    for (const r of rounds) if (r.side === 'prospect' && r.no > lastTetonSent) for (const c of r.changes) (c.decision = null), (c.decidedBy = null);
  }
  const accepted = a.prospect_accepted_round == null ? null : { round: Number(a.prospect_accepted_round), by: String(a.prospect_accepted_by ?? ''), at: String(a.prospect_accepted_at ?? '') };
  const status = String(a.status) as Status;
  const lastSent = [...rounds].reverse().find((r) => r.sent);
  return {
    id: aid,
    status,
    title: a.title == null ? null : String(a.title),
    settings: settingsOf(a.settings),
    rounds,
    people: team || (actor.kind === 'prospect' && atLeast(actor.level, 'view')) ? people.filter((p) => team || p.level !== 'none') : [],
    events: team ? await events(db, aid) : [],
    prospectAccepted: accepted,
    final: a.final_file_id == null ? null : { fileId: Number(a.final_file_id), at: String(a.finalized_at ?? '') },
    signedAt: a.signed_at == null ? null : String(a.signed_at),
    turn: turnOf(status, rounds, !!accepted && !!lastSent && accepted.round === lastSent.no),
  };
}

async function events(db: Client, aid: number): Promise<EventView[]> {
  const r = await db.execute({ sql: 'SELECT e.*, u.name AS uname FROM agreement_events e LEFT JOIN users u ON u.id = e.actor_id WHERE e.agreement_id = ? ORDER BY e.id DESC LIMIT 30', args: [aid] });
  return r.rows.map((x) => ({ id: Number(x.id), kind: String(x.kind), message: String(x.message), who: String(x.uname ?? x.actor_name ?? x.actor_email ?? 'Someone'), createdAt: String(x.created_at) }));
}

/** Notes the actor can see: everything for Teton, shared ones for the prospect. */
export async function agreementNotes(db: Client, dealId: number, actor: Actor): Promise<NoteView[]> {
  const a = await agreementRow(db, dealId);
  if (!a) return [];
  const r = await db.execute({
    sql: `SELECT n.*, u.name AS uname FROM agreement_notes n LEFT JOIN users u ON u.id = n.author_id WHERE n.agreement_id = ? ${actor.kind === 'team' ? '' : "AND n.visibility = 'shared'"} ORDER BY n.id`,
    args: [Number(a.id)],
  });
  return r.rows.map((x) => ({
    id: Number(x.id),
    roundId: x.round_id == null ? null : Number(x.round_id),
    changeId: x.change_id == null ? null : Number(x.change_id),
    visibility: String(x.visibility) as 'internal' | 'shared',
    body: String(x.body),
    author: String(x.uname ?? x.author_name ?? x.author_email ?? 'Someone'),
    team: x.author_id != null,
    createdAt: String(x.created_at),
  }));
}

// ---------------------------------------------------------------- events and notifications

const who = (actor: Actor) => (actor.kind === 'team' ? actor.name : actor.name || actor.email);

async function log(db: Client, dealId: number, aid: number, kind: string, message: string, actor: Actor) {
  const r = await db.execute({
    sql: 'INSERT INTO agreement_events (agreement_id, kind, message, actor_id, actor_email, actor_name) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    args: [aid, kind, message, actor.kind === 'team' ? actor.id : null, actor.kind === 'prospect' ? actor.email : null, actor.kind === 'prospect' ? actor.name : null],
  });
  // What the prospect does reaches the deal's owner (in Notifications).
  if (actor.kind === 'prospect') {
    await db.execute({
      sql: `INSERT OR IGNORE INTO user_notifications (user_id, deal_id, kind, task_id, step) SELECT owner_id, id, 'agreement_event', ?, 0 FROM deals WHERE id = ? AND owner_id IS NOT NULL`,
      args: [Number(r.rows[0].id), dealId],
    });
  }
}

// ---------------------------------------------------------------- rounds

// Commercial terms: money words anywhere near the change, or a number/duration change in a term, pilot, renewal or
// termination clause. ("Five (5) years" in a confidentiality clause isn't commercial.)
const MONEY = /\$|\d\s*%|\bpric|\bfees?\b|\bdiscount|\bcredit|\bpayment|\binvoice|\brate\b|\bminimum\b|\bcost\b/i;
const TERM = /\bterm\b|\bpilot\b|\brenew|\bterminat/i;
const isCommercial = (c: Pick<Change, 'deleted' | 'inserted' | 'before'> & { after?: string }) => {
  const text = `${c.deleted} ${c.inserted}`;
  const ctx = `${c.before.slice(-60)} ${(c.after ?? '').slice(0, 30)}`;
  return MONEY.test(`${text} ${ctx}`) || (TERM.test(`${text} ${ctx}`) && /\d|\bmonths?\b|\byears?\b|\bdays?\b/i.test(text));
};

async function latestRound(db: Client, aid: number) {
  return (await db.execute({ sql: 'SELECT * FROM agreement_rounds WHERE agreement_id = ? ORDER BY no DESC LIMIT 1', args: [aid] })).rows[0] ?? null;
}

async function roundBytes(db: Client, dealId: number, fileId: number) {
  return (await readBytes(db, dealId, fileId)).data;
}

/** Store a round: the file, what Word says changed, and edits made without Track Changes (vs the previous round). */
async function addRound(db: Client, dealId: number, aid: number, side: 'teton' | 'prospect', file: { name: string; data: Uint8Array }, actor: Actor, note: string | null) {
  if (!/\.docx$/i.test(file.name)) throw httpError('Upload a Word document (.docx).');
  if (file.data.byteLength > MAX_DOCX_BYTES) throw httpError('That file is over 4 MB. Save a smaller copy (e.g. without embedded images) and try again.');
  const doc = parseDocx(file.data);
  const prev = await latestRound(db, aid);
  // An unsent round of the same side is replaced by the new upload.
  if (prev && prev.sent_at == null) {
    if (String(prev.side) !== side) throw httpError('The other side’s round is waiting to be sent.');
    await removeRound(db, dealId, Number(prev.id));
  }
  const base = (await latestRound(db, aid)) ?? null;
  let untracked: Change[] = [];
  if (base) {
    try {
      untracked = untrackedChanges(parseDocx(await roundBytes(db, dealId, Number(base.file_id))), doc);
    } catch {
      untracked = [];
    }
  }
  const fileId = await saveBytes(db, dealId, { name: file.name, mime: DOCX, data: file.data }, actor.kind === 'team' ? actor.id : null);
  const no = (base ? Number(base.no) : 0) + 1;
  const r = await db.execute({
    sql: `INSERT INTO agreement_rounds (agreement_id, no, side, file_id, file_name, doc_json, note, uploaded_by, uploaded_email, uploaded_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [aid, no, side, fileId, line(file.name, 200), JSON.stringify({ paragraphs: doc.paragraphs, comments: doc.comments, partOf: Object.fromEntries(doc.changes.flatMap((c) => c.parts.map((k) => [k, c.id]))) }), note, actor.kind === 'team' ? actor.id : null, actor.kind === 'prospect' ? actor.email : null, actor.kind === 'prospect' ? actor.name : null],
  });
  const roundId = Number(r.rows[0].id);
  const all = [...doc.changes, ...untracked.map((c, i) => ({ ...c, id: `u${i + 1}` }))];
  for (const c of all) {
    await db.execute({
      sql: `INSERT INTO agreement_changes (round_id, cid, kind, author, changed_at, deleted, inserted, paragraph, before_text, after_text, commercial) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [roundId, c.id, c.kind, line(c.author, 120), c.date, para(c.deleted, 4000), para(c.inserted, 4000), c.paragraph, para(c.before, 200), para(c.after, 200), isCommercial(c) ? 1 : 0],
    });
  }
  if (no === 1 || !(await agreementRow(db, dealId))?.title) await db.execute({ sql: 'UPDATE agreement_docs SET title = COALESCE(title, ?) WHERE id = ?', args: [titleOf(doc), aid] });
  await db.execute({ sql: "UPDATE agreement_docs SET updated_at = datetime('now') WHERE id = ?", args: [aid] });
  return { roundId, no, changes: all.length };
}

async function removeRound(db: Client, dealId: number, roundId: number) {
  const r = (await db.execute({ sql: 'SELECT file_id FROM agreement_rounds WHERE id = ?', args: [roundId] })).rows[0];
  await db.batch(
    [
      { sql: 'DELETE FROM agreement_notes WHERE change_id IN (SELECT id FROM agreement_changes WHERE round_id = ?)', args: [roundId] },
      { sql: 'DELETE FROM agreement_notes WHERE round_id = ?', args: [roundId] },
      { sql: 'DELETE FROM agreement_changes WHERE round_id = ?', args: [roundId] },
      { sql: 'DELETE FROM agreement_rounds WHERE id = ?', args: [roundId] },
      ...(r ? [{ sql: 'DELETE FROM stored_file_chunks WHERE file_id = ?', args: [Number(r.file_id)] }, { sql: 'DELETE FROM stored_files WHERE id = ? AND deal_id = ?', args: [Number(r.file_id), dealId] }] : []),
    ],
    'write',
  );
}

const live = (s: Status) => s !== 'final' && s !== 'signed';

/** Teton uploads a round (its draft, or its response with counters). It waits until someone sends it. */
export async function uploadTetonRound(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>, file: { name: string; data: Uint8Array }, note?: unknown) {
  if (!actor.caps.upload) throw httpError('You don’t have permission to upload agreement rounds', 403);
  const aid = await ensure(db, dealId);
  const a = (await agreementRow(db, dealId))!;
  if (!live(String(a.status) as Status)) throw httpError('The agreement is final. Reopen it to add a round.');
  if (String(a.status) === 'with_prospect') throw httpError('The prospect has it: wait for their round (or their acceptance) before uploading Teton’s.');
  const r = await addRound(db, dealId, aid, 'teton', file, actor, line(note, 500) || null);
  await log(db, dealId, aid, 'teton_upload', `uploaded round ${r.no} (${line(file.name, 80)})`, actor);
  return r;
}

/** Teton sends its waiting round to the prospect. */
export async function sendTetonRound(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>) {
  if (!actor.caps.review) throw httpError('You don’t have permission to send agreement rounds', 403);
  const a = await agreementRow(db, dealId);
  if (!a) throw httpError('There’s no agreement yet');
  const last = await latestRound(db, Number(a.id));
  if (!last || last.side !== 'teton' || last.sent_at != null) throw httpError('Upload Teton’s round first.');
  await db.batch(
    [
      { sql: "UPDATE agreement_rounds SET sent_at = datetime('now') WHERE id = ?", args: [Number(last.id)] },
      { sql: "UPDATE agreement_docs SET status = 'with_prospect', updated_at = datetime('now') WHERE id = ?", args: [Number(a.id)] },
    ],
    'write',
  );
  await log(db, dealId, Number(a.id), 'teton_send', `sent round ${Number(last.no)} to the prospect`, actor);
}

/** Take back a round that hasn't been sent. */
export async function deleteUnsentRound(db: Client, dealId: number, actor: Actor) {
  const a = await agreementRow(db, dealId);
  const last = a ? await latestRound(db, Number(a.id)) : null;
  if (!a || !last || last.sent_at != null) throw httpError('There’s no round waiting to be sent.');
  if (actor.kind === 'team' ? last.side !== 'teton' || !(actor.caps.upload || actor.caps.review) : last.side !== 'prospect' || !atLeast(actor.level, 'redline')) throw httpError('You can’t remove that round', 403);
  await removeRound(db, dealId, Number(last.id));
  await log(db, dealId, Number(a.id), 'round_removed', `removed round ${Number(last.no)} before it was sent`, actor);
}

/** The prospect uploads their redlined Word file (redline or lead). A lead reviewer sends it to Teton. */
export async function uploadProspectRound(db: Client, dealId: number, actor: Extract<Actor, { kind: 'prospect' }>, file: { name: string; data: Uint8Array }, note?: unknown) {
  if (!atLeast(actor.level, 'redline')) throw httpError('You can read the agreement but not upload redlines. Ask the person who invited you.', 403);
  const a = await agreementRow(db, dealId);
  if (!a || String(a.status) !== 'with_prospect') throw httpError('The agreement isn’t with you right now.');
  const r = await addRound(db, dealId, Number(a.id), 'prospect', file, actor, line(note, 500) || null);
  await log(db, dealId, Number(a.id), 'prospect_upload', `uploaded redlines (${line(file.name, 80)})`, actor);
  return r;
}

export async function sendProspectRound(db: Client, dealId: number, actor: Extract<Actor, { kind: 'prospect' }>) {
  if (actor.level !== 'lead') throw httpError('Only a lead reviewer can send redlines to Teton.', 403);
  const a = await agreementRow(db, dealId);
  const last = a ? await latestRound(db, Number(a.id)) : null;
  if (!a || !last || last.side !== 'prospect' || last.sent_at != null) throw httpError('Upload your redlined Word file first.');
  await db.batch(
    [
      { sql: "UPDATE agreement_rounds SET sent_at = datetime('now'), sent_by_email = ? WHERE id = ?", args: [actor.email, Number(last.id)] },
      { sql: "UPDATE agreement_docs SET status = 'with_teton', updated_at = datetime('now') WHERE id = ?", args: [Number(a.id)] },
    ],
    'write',
  );
  await log(db, dealId, Number(a.id), 'prospect_send', `sent their redlines to Teton (round ${Number(last.no)})`, actor);
}

/** The prospect accepts Teton's latest round as it stands (lead). */
export async function acceptTetonRound(db: Client, dealId: number, actor: Extract<Actor, { kind: 'prospect' }>) {
  if (actor.level !== 'lead') throw httpError('Only a lead reviewer can accept Teton’s changes.', 403);
  const a = await agreementRow(db, dealId);
  const last = a ? await latestRound(db, Number(a.id)) : null;
  if (!a || String(a.status) !== 'with_prospect' || !last || last.side !== 'teton' || last.sent_at == null) throw httpError('There’s no Teton round to accept right now.');
  await db.execute({
    sql: "UPDATE agreement_docs SET status = 'with_teton', prospect_accepted_round = ?, prospect_accepted_by = ?, prospect_accepted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    args: [Number(last.no), actor.name || actor.email, Number(a.id)],
  });
  await log(db, dealId, Number(a.id), 'prospect_accept', `accepted Teton’s round ${Number(last.no)}`, actor);
}

// ---------------------------------------------------------------- decisions and notes

/** Teton accepts or rejects (or clears) a change in a prospect round. */
export async function decideChange(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>, changeId: number, decision: unknown) {
  if (!actor.caps.review) throw httpError('You don’t have permission to accept or reject changes', 403);
  const d = decision === 'accepted' || decision === 'rejected' ? decision : decision === null ? null : undefined;
  if (d === undefined) throw httpError('Bad decision');
  const r = await db.execute({
    sql: `SELECT c.id, r.side, r.sent_at, r.no, a.status, a.id AS aid FROM agreement_changes c JOIN agreement_rounds r ON r.id = c.round_id JOIN agreement_docs a ON a.id = r.agreement_id WHERE c.id = ? AND a.deal_id = ?`,
    args: [changeId, dealId],
  });
  const x = r.rows[0];
  if (!x) throw httpError('Change not found', 404);
  if (x.side !== 'prospect') throw httpError('Teton’s own changes are accepted by the prospect.');
  if (!live(String(x.status) as Status)) throw httpError('The agreement is final.');
  const later = (await db.execute({ sql: 'SELECT COUNT(*) AS n FROM agreement_rounds WHERE agreement_id = ? AND no > ? AND sent_at IS NOT NULL', args: [Number(x.aid), Number(x.no)] })).rows[0].n;
  if (Number(later) > 0) throw httpError('A later round has been sent: decide changes in the latest round.');
  await db.execute({ sql: "UPDATE agreement_changes SET decision = ?, decided_by = ?, decided_email = NULL, decided_at = CASE WHEN ? IS NULL THEN NULL ELSE datetime('now') END WHERE id = ?", args: [d, d ? actor.id : null, d, changeId] });
}

/** Accept or reject every open change in a round at once. */
export async function decideAll(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>, roundId: number, decision: Decision) {
  const r = await db.execute({ sql: 'SELECT c.id FROM agreement_changes c JOIN agreement_rounds r ON r.id = c.round_id JOIN agreement_docs a ON a.id = r.agreement_id WHERE r.id = ? AND a.deal_id = ? AND c.decision IS NULL', args: [roundId, dealId] });
  for (const c of r.rows) await decideChange(db, dealId, actor, Number(c.id), decision);
  return r.rows.length;
}

/** A note: Teton-only, or shared with the prospect (Teton replies need review; prospect comments need comment). */
export async function addNote(db: Client, dealId: number, actor: Actor, input: { roundId?: unknown; changeId?: unknown; visibility?: unknown; body?: unknown }) {
  const a = await agreementRow(db, dealId);
  if (!a) throw httpError('There’s no agreement yet');
  const body = para(input.body, 2000);
  if (!body) throw httpError('Write something first');
  const visibility = actor.kind === 'prospect' ? 'shared' : input.visibility === 'shared' ? 'shared' : 'internal';
  if (actor.kind === 'team' && (visibility === 'shared' ? !actor.caps.review : !actor.caps.view)) throw httpError(visibility === 'shared' ? 'You don’t have permission to reply to the prospect' : 'You can’t see this agreement', 403);
  if (actor.kind === 'prospect' && !atLeast(actor.level, 'comment')) throw httpError('You can read the agreement but not comment on it.', 403);
  const changeId = Number(input.changeId) > 0 ? Number(input.changeId) : null;
  let roundId = Number(input.roundId) > 0 ? Number(input.roundId) : null;
  if (changeId) {
    const c = await db.execute({ sql: 'SELECT c.round_id FROM agreement_changes c JOIN agreement_rounds r ON r.id = c.round_id WHERE c.id = ? AND r.agreement_id = ?', args: [changeId, Number(a.id)] });
    if (!c.rows.length) throw httpError('Change not found', 404);
    roundId = Number(c.rows[0].round_id);
  } else if (roundId) {
    const c = await db.execute({ sql: 'SELECT id FROM agreement_rounds WHERE id = ? AND agreement_id = ?', args: [roundId, Number(a.id)] });
    if (!c.rows.length) throw httpError('Round not found', 404);
  }
  await db.execute({
    sql: 'INSERT INTO agreement_notes (agreement_id, round_id, change_id, visibility, body, author_id, author_email, author_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [Number(a.id), roundId, changeId, visibility, body, actor.kind === 'team' ? actor.id : null, actor.kind === 'prospect' ? actor.email : null, actor.kind === 'prospect' ? actor.name : null],
  });
  if (actor.kind === 'prospect') await log(db, dealId, Number(a.id), 'prospect_comment', `commented: “${body.slice(0, 120)}”`, actor);
}

// ---------------------------------------------------------------- files

/** A round's Word file: as uploaded, or (a prospect round, for Teton) with Teton's decisions applied. */
export async function roundFile(db: Client, dealId: number, actor: Actor, roundId: number, withDecisions = false): Promise<{ name: string; data: Uint8Array }> {
  const view = await getAgreement(db, dealId, actor);
  const r = view.rounds.find((x) => x.id === roundId);
  if (!r) throw httpError('Round not found', 404);
  const row = (await db.execute({ sql: 'SELECT file_id FROM agreement_rounds WHERE id = ?', args: [roundId] })).rows[0];
  const data = await roundBytes(db, dealId, Number(row.file_id));
  if (!withDecisions || actor.kind !== 'team' || r.side !== 'prospect') return { name: r.fileName, data };
  const decisions = Object.fromEntries(r.changes.filter((c) => c.decision && c.kind !== 'untracked').map((c) => [c.cid, c.decision!]));
  return { name: r.fileName.replace(/\.docx$/i, '') + ' - Teton response.docx', data: applyDecisions(data, decisions, { counterAs: { author: actor.name ? `${actor.name} (Teton)` : 'Teton' } }) };
}

export async function finalFile(db: Client, dealId: number): Promise<{ name: string; data: Uint8Array }> {
  const a = await agreementRow(db, dealId);
  if (!a?.final_file_id) throw httpError('The agreement isn’t final yet', 404);
  const f = await readBytes(db, dealId, Number(a.final_file_id));
  return { name: f.name, data: f.data };
}

// ---------------------------------------------------------------- final and signed

/** What stands between the agreement and "final" (empty: it can be marked final). */
export async function finalBlockers(db: Client, dealId: number): Promise<string[]> {
  const view = await getAgreement(db, dealId, { kind: 'team', id: 0, name: '', caps: { view: true, upload: false, review: false, people: false, finish: false } });
  if (!live(view.status)) return ['The agreement is already final.'];
  const last = [...view.rounds].reverse().find((r) => r.sent || r.side === 'prospect');
  if (!last || !last.sent) return ['Send the latest round first.'];
  const out: string[] = [];
  if (last.side === 'teton') {
    if (view.prospectAccepted?.round !== last.no) out.push('The prospect hasn’t accepted Teton’s latest round.');
  } else {
    const open = last.changes.filter((c) => !c.decision).length;
    if (open) out.push(`${open} change${open === 1 ? ' is' : 's are'} still open in round ${last.no}.`);
    const reverts = last.changes.filter((c) => c.kind === 'untracked' && c.decision === 'rejected').length;
    if (reverts) out.push(`${reverts} rejected edit${reverts === 1 ? ' was' : 's were'} made without Track Changes: undo ${reverts === 1 ? 'it' : 'them'} in Word and send Teton’s response as a new round.`);
    if (last.changes.some((c) => c.decision === 'rejected' && c.kind !== 'untracked')) out.push('Some changes were rejected: send Teton’s response so the prospect sees it before marking final.');
  }
  return out;
}

export async function markFinal(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>, confirm: { versionMatches?: unknown }) {
  if (!actor.caps.finish) throw httpError('You don’t have permission to mark the agreement final', 403);
  const blockers = await finalBlockers(db, dealId);
  if (blockers.length) throw httpError(blockers[0]);
  if (confirm.versionMatches !== true) throw httpError('Confirm the deal’s active version matches the agreed price, term, pilot and rooms.');
  const view = await getAgreement(db, dealId, actor);
  const last = [...view.rounds].reverse().find((r) => r.sent)!;
  const row = (await db.execute({ sql: 'SELECT file_id FROM agreement_rounds WHERE id = ?', args: [last.id] })).rows[0];
  const bytes = await roundBytes(db, dealId, Number(row.file_id));
  // Teton's round accepted by the prospect: all its changes accepted. A prospect round: Teton's decisions.
  const decisions: Record<string, Decision> = Object.fromEntries(last.changes.filter((c) => c.kind !== 'untracked').map((c) => [c.cid, last.side === 'teton' ? 'accepted' : c.decision!]));
  const clean = applyDecisions(bytes, decisions, { clean: true });
  const name = `${(view.title || 'Agreement').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)} - final.docx`;
  const fileId = await saveBytes(db, dealId, { name, mime: DOCX, data: clean }, actor.id);
  await db.execute({ sql: "UPDATE agreement_docs SET status = 'final', final_file_id = ?, finalized_by = ?, finalized_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", args: [fileId, actor.id, view.id] });
  await log(db, dealId, view.id!, 'final', 'marked the agreement final', actor);
}

export async function reopen(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>) {
  if (!actor.caps.finish) throw httpError('You don’t have permission to reopen the agreement', 403);
  const a = await agreementRow(db, dealId);
  if (!a || String(a.status) !== 'final') throw httpError('Only a final agreement can be reopened.');
  await db.execute({ sql: "UPDATE agreement_docs SET status = 'with_teton', final_file_id = NULL, finalized_by = NULL, finalized_at = NULL, prospect_accepted_round = NULL, updated_at = datetime('now') WHERE id = ?", args: [Number(a.id)] });
  await log(db, dealId, Number(a.id), 'reopened', 'reopened the agreement', actor);
}

export async function markSigned(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>) {
  if (!actor.caps.finish) throw httpError('You don’t have permission to mark the agreement signed', 403);
  const a = await agreementRow(db, dealId);
  if (!a || String(a.status) !== 'final') throw httpError('Mark the agreement final first.');
  await db.batch(
    [
      { sql: "UPDATE agreement_docs SET status = 'signed', signed_by = ?, signed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", args: [actor.id, Number(a.id)] },
      { sql: "UPDATE deals SET status = 'won', updated_at = datetime('now') WHERE id = ?", args: [dealId] },
    ],
    'write',
  );
  await log(db, dealId, Number(a.id), 'signed', 'marked the agreement signed (deal won)', actor);
}

// ---------------------------------------------------------------- people

/** Teton sets a person's access: agreement level and which other tabs they see. */
export async function setPerson(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>, input: { email?: unknown; level?: unknown; showProposal?: unknown; showResources?: unknown; name?: unknown }) {
  if (!actor.caps.people) throw httpError('You don’t have permission to manage the prospect’s people', 403);
  const email = line(input.email, 200).toLowerCase();
  if (!EMAIL.test(email)) throw httpError('Enter a valid email');
  const cur = await prospectAccess(db, dealId, email);
  const level = LEVELS.includes(input.level as Level) ? (input.level as Level) : cur.level;
  if (cur.signatory && level !== 'lead') throw httpError('Signatories are always lead reviewers. Change the signatory in Deal details.');
  await upsertPerson(db, dealId, { email, name: input.name === undefined ? cur.name : line(input.name, 120) || null, organization: cur.organization, level, showProposal: input.showProposal === undefined ? cur.showProposal : input.showProposal === true, showResources: input.showResources === undefined ? cur.showResources : input.showResources === true, invitedBy: cur.invitedBy });
  const aid = await ensure(db, dealId);
  await log(db, dealId, aid, 'person_set', `set ${email}: ${level === 'none' ? 'no agreement access' : level}`, actor);
}

async function upsertPerson(db: Client, dealId: number, p: { email: string; name: string | null; organization: string | null; level: Level; showProposal: boolean; showResources: boolean; invitedBy: string | null }) {
  await db.execute({
    sql: `INSERT INTO agreement_people (deal_id, email, name, organization, level, show_proposal, show_resources, invited_by_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (deal_id, email) DO UPDATE SET name = excluded.name, organization = excluded.organization, level = excluded.level, show_proposal = excluded.show_proposal, show_resources = excluded.show_resources`,
    args: [dealId, p.email, p.name, p.organization, p.level, p.showProposal ? 1 : 0, p.showResources ? 1 : 0, p.invitedBy],
  });
}

/** Add someone to the deal's live shared link (so they can sign in). */
async function addToLink(db: Client, dealId: number, email: string, name: string | null) {
  const l = await db.execute({ sql: 'SELECT id FROM share_links WHERE deal_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', args: [dealId] });
  if (!l.rows.length) throw httpError('The proposal isn’t shared right now.');
  await db.execute({ sql: 'INSERT OR IGNORE INTO share_link_emails (link_id, email, name) VALUES (?, ?, ?)', args: [Number(l.rows[0].id), email, name] });
}

/** Teton removes a person: their agreement access, and (if a signatory invited them) their place on the link. */
export async function removePerson(db: Client, dealId: number, actor: Actor, emailIn: unknown) {
  const email = line(emailIn, 200).toLowerCase();
  const cur = await prospectAccess(db, dealId, email);
  if (cur.signatory) throw httpError('Signatories can’t be removed here. Change the signatory in Deal details.');
  if (actor.kind === 'team' ? !actor.caps.people : !(actor.signatory && cur.invitedBy === actor.email)) throw httpError('You can’t remove that person', 403);
  await db.execute({ sql: 'DELETE FROM agreement_people WHERE deal_id = ? AND email = ?', args: [dealId, email] });
  if (cur.invitedBy) await db.execute({ sql: 'DELETE FROM share_link_emails WHERE email = ? AND link_id IN (SELECT id FROM share_links WHERE deal_id = ?)', args: [email, dealId] });
  const aid = await ensure(db, dealId);
  await log(db, dealId, aid, 'person_removed', `removed ${email}`, actor);
}

/** A signatory invites a reviewer (if Teton allows it). The deal's owner is notified. */
export async function invite(db: Client, dealId: number, actor: Extract<Actor, { kind: 'prospect' }>, input: { email?: unknown; name?: unknown; organization?: unknown; level?: unknown; showProposal?: unknown; showResources?: unknown }) {
  const aid = await ensure(db, dealId);
  const a = (await agreementRow(db, dealId))!;
  const s = settingsOf(a.settings);
  if (!actor.signatory) throw httpError('Only a signatory can invite reviewers.', 403);
  if (!s.signatoryCanInvite) throw httpError('Ask Teton to add reviewers for you.', 403);
  const email = line(input.email, 200).toLowerCase();
  if (!EMAIL.test(email)) throw httpError('Enter a valid email');
  const level: Level = (['view', 'comment', 'redline', 'lead'] as Level[]).includes(input.level as Level) ? (input.level as Level) : 'comment';
  const cur = await prospectAccess(db, dealId, email);
  if (cur.onLink && !cur.invitedBy) throw httpError('They’re already on the proposal link. Ask Teton to change their access.');
  const give = s.signatoryCanGiveTabs;
  await upsertPerson(db, dealId, {
    email,
    name: line(input.name, 120) || null,
    organization: line(input.organization, 120) || null,
    level,
    showProposal: give && input.showProposal !== undefined ? input.showProposal === true : s.inviteesSeeProposal,
    showResources: give && input.showResources !== undefined ? input.showResources === true : s.inviteesSeeResources,
    invitedBy: actor.email,
  });
  await addToLink(db, dealId, email, line(input.name, 120) || null);
  await log(db, dealId, aid, 'invite', `invited ${line(input.name, 80) || email}${line(input.organization, 80) ? ` (${line(input.organization, 80)})` : ''} as ${level === 'lead' ? 'lead reviewer' : level}`, actor);
}

export async function saveSettings(db: Client, dealId: number, actor: Extract<Actor, { kind: 'team' }>, input: Partial<Record<keyof Settings, unknown>>) {
  if (!actor.caps.people) throw httpError('You don’t have permission to change who can invite', 403);
  const aid = await ensure(db, dealId);
  const cur = settingsOf((await agreementRow(db, dealId))!.settings);
  const next: Settings = { ...cur, ...Object.fromEntries(Object.entries(input).filter(([k, v]) => k in DEFAULT_SETTINGS && typeof v === 'boolean')) };
  await db.execute({ sql: 'UPDATE agreement_docs SET settings = ? WHERE id = ?', args: [JSON.stringify(next), aid] });
  return next;
}

/** Unread agreement activity for the owner's notifications. */
export async function agreementNotifications(db: Client, userId: number, quoteId: number) {
  const r = await db.execute({
    sql: `SELECT n.id, n.created_at, e.message, COALESCE(e.actor_name, e.actor_email) AS who, e.actor_email
          FROM user_notifications n JOIN agreement_events e ON e.id = n.task_id
          WHERE n.user_id = ? AND n.read_at IS NULL AND n.kind = 'agreement_event' AND n.deal_id = (SELECT deal_id FROM quotes WHERE id = ?)
          ORDER BY n.created_at DESC, n.id DESC`,
    args: [userId, quoteId],
  });
  return r.rows.map((x) => ({ id: Number(x.id), createdAt: String(x.created_at), who: String(x.who ?? 'Someone'), email: String(x.actor_email ?? ''), message: String(x.message) }));
}

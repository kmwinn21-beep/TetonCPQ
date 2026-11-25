/**
 * "Request Agreement for Review" on a shared link: the prospect asks for the agreement and, if they like, confirms
 * or corrects what it needs (the legal entity, the signatory, the pilot communities). Corrections to the entity and
 * signatory go straight into the deal's details; a change to the communities goes to the owner as a note. The deal's
 * owner gets a notification and an email.
 */
import type { Client } from '@libsql/client';
import { bedsOf, placeOf } from '@/lib/quote/draft';
import { getVersion } from './quotes';
import { EMAIL, emptyDetails, getDealDetails, type DealDetails, type Signatory } from './dealDetails';
import type { PublicLink } from './shareLinks';

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });
const line = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const para = (v: unknown, max: number) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

export interface AgreementCommunity {
  id: string;
  name: string;
  place: string;
  /** Beds in the pilot (the pilot's units when set, else the community's beds). */
  beds: number;
  hasPlan: boolean;
}
export interface AgreementInfo {
  entity: string;
  signatory: Signatory | null;
  /** True: the deal has a pilot and these are its communities; false: no pilot, so every community. */
  pilot: boolean;
  communities: AgreementCommunity[];
  /** This person's last request. */
  requestedAt: string | null;
  /** The deal's latest request (anyone's on the link): the form says who asked, when, and whether it's been sent. */
  latest: AgreementRequestInfo | null;
}

/** What the form shows: the deal's details now, and the communities of the shared version. */
export async function agreementInfo(db: Client, l: PublicLink, email: string): Promise<AgreementInfo> {
  const d = (await getDealDetails(db, l.dealId)) ?? emptyDetails();
  const v = await getVersion(db, l.versionId);
  const all = v?.inputs.communities ?? [];
  const pilot = !!v?.inputs.schedule?.withPilot && all.some((c) => c.pilot);
  const plans = v
    ? new Set((await db.execute({ sql: 'SELECT DISTINCT community_id FROM floor_plans WHERE quote_id = ? AND complete = 1', args: [v.quoteId] })).rows.map((r) => String(r.community_id)))
    : new Set<string>();
  const last = await db.execute({ sql: 'SELECT created_at FROM agreement_requests WHERE deal_id = ? AND email = ? ORDER BY id DESC LIMIT 1', args: [l.dealId, email.trim().toLowerCase()] });
  return {
    entity: d.legalEntity ?? '',
    signatory: d.signatories?.[0] ?? null,
    pilot,
    communities: all
      .filter((c) => !pilot || c.pilot)
      .map((c, i) => ({ id: c.id, name: c.name || `Community ${i + 1}`, place: placeOf(c), beds: pilot && c.pilotUnits ? c.pilotUnits : bedsOf(c), hasPlan: plans.has(c.id) })),
    requestedAt: last.rows.length ? String(last.rows[0].created_at) : null,
    latest: (await requestsOf(db, l.dealId, 1))[0] ?? null,
  };
}

/** Each part of the form: left alone, ticked as right, or changed (which also confirms it). */
export type PartStatus = 'skipped' | 'confirmed' | 'updated';
export interface AgreementInput {
  entity?: { confirmed?: boolean; value?: string | null };
  signatory?: { confirmed?: boolean; value?: Partial<Signatory> | null };
  communities?: { confirmed?: boolean; change?: string | null };
  note?: string | null;
}
/** What was asked, as stored and as the owner sees it. */
export interface AgreementPayload {
  entity: { status: PartStatus; value: string; was: string };
  signatory: { status: PartStatus; value: Signatory | null; was: Signatory | null };
  communities: { status: PartStatus; pilot: boolean; list: Array<{ name: string; beds: number; hasPlan: boolean }>; change: string };
  note: string;
}

const sameSig = (a: Signatory | null, b: Signatory | null) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Checks and shapes what the prospect sent against the deal as it is now (pure: no saving). */
export function shapeRequest(info: AgreementInfo, input: AgreementInput): AgreementPayload {
  const entityIn = input.entity?.value == null ? null : line(input.entity.value, 200);
  const entity =
    entityIn != null && entityIn && entityIn !== info.entity
      ? { status: 'updated' as const, value: entityIn, was: info.entity }
      : { status: input.entity?.confirmed && info.entity ? ('confirmed' as const) : ('skipped' as const), value: info.entity, was: info.entity };

  let signatory: AgreementPayload['signatory'] = { status: input.signatory?.confirmed && info.signatory ? 'confirmed' : 'skipped', value: info.signatory, was: info.signatory };
  const s = input.signatory?.value;
  if (s) {
    const next: Signatory = { first: line(s.first, 80), last: line(s.last, 80), title: line(s.title, 120), email: line(s.email, 200).toLowerCase() };
    if (next.email && !EMAIL.test(next.email)) throw httpError(`“${next.email}” isn’t a valid email address`);
    if (!(next.first || next.last)) throw httpError('Add the signatory’s name');
    if (!sameSig(next, info.signatory)) signatory = { status: 'updated', value: next, was: info.signatory };
    else if (info.signatory) signatory = { ...signatory, status: 'confirmed' };
  }

  const change = para(input.communities?.change, 2000);
  const communities = {
    status: (change ? 'updated' : input.communities?.confirmed && info.communities.length ? 'confirmed' : 'skipped') as PartStatus,
    pilot: info.pilot,
    list: info.communities.map((c) => ({ name: c.name, beds: c.beds, hasPlan: c.hasPlan })),
    change,
  };
  return { entity, signatory, communities, note: para(input.note, 4000) };
}

/**
 * Saves a request: corrections into the deal's details (the first signatory is the one asked about), the request
 * itself, and a notification for the deal's owner. Returns the request's id and what was asked.
 */
export async function requestAgreement(db: Client, l: PublicLink, who: { email: string; name?: string | null }, input: AgreementInput): Promise<{ id: number; payload: AgreementPayload }> {
  if (l.ownerId == null) throw httpError('This deal has no owner to send the agreement');
  const email = who.email.trim().toLowerCase();
  const info = await agreementInfo(db, l, email);
  const payload = shapeRequest(info, input);
  if (payload.entity.status === 'updated' || payload.signatory.status === 'updated') {
    const cur: DealDetails = (await getDealDetails(db, l.dealId)) ?? emptyDetails();
    const sigs = [...(cur.signatories ?? [])];
    if (payload.signatory.status === 'updated' && payload.signatory.value) sigs.splice(0, sigs.length ? 1 : 0, payload.signatory.value);
    const next: DealDetails = { ...cur, legalEntity: payload.entity.value, signatories: sigs, updatedAt: new Date().toISOString() };
    await db.execute({ sql: "UPDATE deals SET details = ?, updated_at = datetime('now') WHERE id = ?", args: [JSON.stringify(next), l.dealId] });
  }
  const r = await db.execute({
    sql: 'INSERT INTO agreement_requests (deal_id, link_id, version_id, email, name, payload) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
    args: [l.dealId, l.id, l.versionId, email, who.name ? line(who.name, 80) : null, JSON.stringify(payload)],
  });
  const id = Number(r.rows[0].id);
  await db.execute({ sql: "INSERT OR IGNORE INTO user_notifications (user_id, deal_id, kind, task_id) VALUES (?, ?, 'prospect_agreement', ?)", args: [l.ownerId, l.dealId, id] });
  return { id, payload };
}

/** One line per part, for notifications and plain-text email. */
export function describePart(p: AgreementPayload, part: 'entity' | 'signatory' | 'communities'): string {
  if (part === 'entity') return p.entity.value || 'Not given';
  if (part === 'signatory') {
    const s = p.signatory.value;
    return s ? [`${s.first} ${s.last}`.trim(), s.title, s.email].filter(Boolean).join(' · ') : 'Not given';
  }
  const n = p.communities.list.length;
  const missing = p.communities.list.filter((c) => !c.hasPlan).length;
  return `${n} ${n === 1 ? 'community' : 'communities'}${missing ? ` · ${missing} need${missing === 1 ? 's' : ''} floor plans` : ''}`;
}

// ---------------------------------------------------------------- the rep's side: who asked, sent, snoozed

export interface AgreementRequestInfo {
  id: number;
  email: string;
  /** Their name, else their email. */
  who: string;
  createdAt: string;
  versionId: number | null;
  versionNo: number | null;
  payload: AgreementPayload;
  sentAt: string | null;
  sentByName: string | null;
  snoozedUntil: string | null;
}

/** A deal's requests, newest first. */
async function requestsOf(db: Client, dealId: number, limit = 50): Promise<AgreementRequestInfo[]> {
  const r = await db.execute({
    sql: `SELECT a.*, v.version_no, u.name AS sent_by_name FROM agreement_requests a LEFT JOIN quote_versions v ON v.id = a.version_id LEFT JOIN users u ON u.id = a.sent_by
          WHERE a.deal_id = ? ORDER BY a.id DESC LIMIT ?`,
    args: [dealId, limit],
  });
  return r.rows.flatMap((x) => {
    let payload: AgreementPayload;
    try {
      payload = JSON.parse(String(x.payload)) as AgreementPayload;
    } catch {
      return [];
    }
    return [{
      id: Number(x.id),
      email: String(x.email),
      who: x.name ? String(x.name) : String(x.email),
      createdAt: String(x.created_at),
      versionId: x.version_id == null ? null : Number(x.version_id),
      versionNo: x.version_no == null ? null : Number(x.version_no),
      payload,
      sentAt: x.sent_at == null ? null : String(x.sent_at),
      sentByName: x.sent_by_name == null ? null : String(x.sent_by_name),
      snoozedUntil: x.snoozed_until == null ? null : String(x.snoozed_until),
    }];
  });
}

/** Days from an SQLite UTC timestamp to now (whole days, rounded down). */
const daysSince = (at: string, now = new Date()) => Math.floor((now.getTime() - Date.parse(`${at.replace(' ', 'T')}Z`)) / 86_400_000);
/** After this many days without being marked sent, the alert turns red and can't be snoozed. */
export const LATE_DAYS = 2;

export interface DealAgreement {
  /** The newest request still waiting (not marked sent), and who else has asked since the last one was sent. */
  open: AgreementRequestInfo | null;
  others: string[];
  /** Days since the first waiting request; `late` at LATE_DAYS or more. */
  waitingDays: number;
  late: boolean;
  /** Hidden until then (unless late). */
  snoozedUntil: string | null;
  /** The last one marked sent (for the "sent" line and its Undo). */
  lastSent: AgreementRequestInfo | null;
  /** The newest request per version (the Version History tags). */
  byVersion: Array<{ versionId: number; versionNo: number | null; who: string; email: string; createdAt: string; payload: AgreementPayload }>;
  /** The version on the live shared link. */
  sharedVersionId: number | null;
}

export async function dealAgreement(db: Client, dealId: number, now = new Date()): Promise<DealAgreement> {
  const all = await requestsOf(db, dealId);
  const waiting = all.filter((x) => !x.sentAt);
  const open = waiting[0] ?? null;
  const oldest = waiting[waiting.length - 1];
  const waitingDays = oldest ? daysSince(oldest.createdAt, now) : 0;
  const byVersion = new Map<number, DealAgreement['byVersion'][number]>();
  for (const x of all) if (x.versionId != null && !byVersion.has(x.versionId)) byVersion.set(x.versionId, { versionId: x.versionId, versionNo: x.versionNo, who: x.who, email: x.email, createdAt: x.createdAt, payload: x.payload });
  const link = await db.execute({ sql: 'SELECT version_id FROM share_links WHERE deal_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', args: [dealId] });
  return {
    open,
    others: [...new Set(waiting.slice(1).map((x) => x.who))].filter((w) => w !== open?.who),
    waitingDays,
    late: !!open && waitingDays >= LATE_DAYS,
    snoozedUntil: open?.snoozedUntil ?? null,
    lastSent: all.find((x) => x.sentAt) ?? null,
    byVersion: [...byVersion.values()],
    sharedVersionId: link.rows.length ? Number(link.rows[0].version_id) : null,
  };
}

/** The rep's actions: mark the waiting requests sent, undo the last "sent", or snooze the alert for a day. */
export async function agreementAction(db: Client, dealId: number, userId: number, action: 'sent' | 'undo' | 'snooze', now = new Date()): Promise<void> {
  if (action === 'sent') {
    await db.execute({ sql: "UPDATE agreement_requests SET sent_at = datetime('now'), sent_by = ? WHERE deal_id = ? AND sent_at IS NULL", args: [userId, dealId] });
  } else if (action === 'undo') {
    await db.execute({ sql: 'UPDATE agreement_requests SET sent_at = NULL, sent_by = NULL WHERE deal_id = ? AND sent_at = (SELECT MAX(sent_at) FROM agreement_requests WHERE deal_id = ?)', args: [dealId, dealId] });
  } else if (action === 'snooze') {
    const until = new Date(now.getTime() + 86_400_000).toISOString().replace('T', ' ').slice(0, 19);
    await db.execute({ sql: 'UPDATE agreement_requests SET snoozed_until = ? WHERE deal_id = ? AND sent_at IS NULL', args: [until, dealId] });
  } else throw httpError('Unknown action');
}

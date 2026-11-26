/**
 * A deal's Resources tab on its shared link: the settings (tab name, Your Team page, sections), the cards (files,
 * videos, embedded videos, links, one pagers, scoped floor plans) with their blocks, what a signed-in prospect looked
 * at, and the engagement summary the team sees.
 */
import type { Client, Row } from '@libsql/client';
import { productsOf, type QuoteDraft } from '@/lib/quote/draft';
import { normalizeAllowance, type RoomType } from '@/lib/quote/roomTypes';
import { mailer } from '@/lib/email/send';
import { getProfile, listProfiles, type Profile } from './profiles';
import { deleteFile } from './storedFiles';
import { cardImageExists } from './cardImages';
import { PACK_IDS, TINT_IDS } from '@/lib/resources/iconPack';
import type { PublicLink } from './shareLinks';
import { embedInput, isDeckEmbed } from '@/lib/resources/embed';
import {
  DEFAULT_HEADING,
  DEFAULT_TAB,
  embedOf,
  normalizeBlocks,
  normalizeSections,
  normalizeTeam,
  safeUrl,
  sectionFor,
  type CardIconChoice,
  type Resource,
  type ResourceKind,
  type RoomSettings,
} from '@/lib/resources/model';

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });
const line = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const json = <T,>(v: unknown, fb: T): T => {
  try {
    return v == null ? fb : (JSON.parse(String(v)) as T);
  } catch {
    return fb;
  }
};
const KINDS: ResourceKind[] = ['file', 'video', 'embed', 'link', 'onepager', 'floorplan'];

export async function dealOfQuote(db: Client, quoteId: number) {
  const r = await db.execute({ sql: 'SELECT q.deal_id, d.owner_id, d.customer_name, q.active_version_id FROM quotes q JOIN deals d ON d.id = q.deal_id WHERE q.id = ?', args: [quoteId] });
  if (!r.rows.length) throw httpError('Deal not found', 404);
  const x = r.rows[0];
  return { dealId: Number(x.deal_id), ownerId: x.owner_id == null ? null : Number(x.owner_id), customer: String(x.customer_name ?? ''), activeVersionId: x.active_version_id == null ? null : Number(x.active_version_id) };
}

// ---------------------------------------------------------------- settings

export async function getRoom(db: Client, dealId: number, ownerId: number | null): Promise<RoomSettings> {
  const r = await db.execute({ sql: 'SELECT * FROM deal_rooms WHERE deal_id = ?', args: [dealId] });
  const x = r.rows[0];
  const ownerBook = ownerId ? (await getProfile(db, ownerId))?.bookDefault !== false : true;
  if (!x) return { enabled: true, tabName: DEFAULT_TAB, heading: DEFAULT_HEADING, note: null, contactUserId: ownerId, showBooking: ownerBook, team: [], sections: normalizeSections([]), novelty: false };
  return {
    enabled: Number(x.enabled) === 1,
    tabName: String(x.tab_name ?? '') || DEFAULT_TAB,
    heading: String(x.heading ?? '') || DEFAULT_HEADING,
    note: x.note == null ? null : String(x.note),
    contactUserId: x.contact_user_id == null ? ownerId : Number(x.contact_user_id),
    showBooking: Number(x.show_booking) === 1,
    team: normalizeTeam(json(x.team, [])),
    sections: normalizeSections(json(x.sections, [])),
    novelty: Number(x.novelty ?? 0) === 1,
  };
}

export async function saveRoom(db: Client, quoteId: number, patch: Partial<Record<keyof RoomSettings, unknown>>): Promise<RoomSettings> {
  const d = await dealOfQuote(db, quoteId);
  const cur = await getRoom(db, d.dealId, d.ownerId);
  const next: RoomSettings = {
    enabled: patch.enabled === undefined ? cur.enabled : patch.enabled !== false,
    tabName: patch.tabName === undefined ? cur.tabName : line(patch.tabName, 30) || DEFAULT_TAB,
    heading: patch.heading === undefined ? cur.heading : line(patch.heading, 120) || DEFAULT_HEADING,
    note: patch.note === undefined ? cur.note : String(patch.note ?? '').trim().slice(0, 1000) || null,
    contactUserId: patch.contactUserId === undefined ? cur.contactUserId : Number(patch.contactUserId) || d.ownerId,
    showBooking: patch.showBooking === undefined ? cur.showBooking : patch.showBooking !== false,
    team: patch.team === undefined ? cur.team : normalizeTeam(patch.team),
    sections: patch.sections === undefined ? cur.sections : normalizeSections(patch.sections),
    novelty: patch.novelty === undefined ? cur.novelty : patch.novelty === true,
  };
  // Only real, active users.
  const ids = [...new Set([next.contactUserId, ...next.team.map((t) => t.userId)].filter((n): n is number => n != null))];
  const known = new Set((await listProfiles(db, ids)).map((p) => p.userId));
  if (next.contactUserId && !known.has(next.contactUserId)) next.contactUserId = d.ownerId;
  next.team = next.team.filter((t) => known.has(t.userId) && t.userId !== next.contactUserId);
  await db.execute({
    sql: `INSERT INTO deal_rooms (deal_id, enabled, tab_name, heading, note, contact_user_id, show_booking, team, sections, novelty, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(deal_id) DO UPDATE SET enabled = excluded.enabled, tab_name = excluded.tab_name, heading = excluded.heading, note = excluded.note,
            contact_user_id = excluded.contact_user_id, show_booking = excluded.show_booking, team = excluded.team, sections = excluded.sections, novelty = excluded.novelty, updated_at = excluded.updated_at`,
    args: [d.dealId, next.enabled ? 1 : 0, next.tabName, next.heading, next.note, next.contactUserId, next.showBooking ? 1 : 0, JSON.stringify(next.team), JSON.stringify(next.sections), next.novelty ? 1 : 0],
  });
  return next;
}

// ---------------------------------------------------------------- cards

/** A card icon as saved: a known pack icon and tint, or a saved image's key. Anything else means "by type". */
export function iconChoice(v: unknown): CardIconChoice | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.pack === 'string' && PACK_IDS.has(o.pack)) return { pack: o.pack, tint: typeof o.tint === 'string' && TINT_IDS.has(o.tint) ? o.tint : 'sand' };
  if (typeof o.image === 'string' && /^[0-9a-f]{24}$/.test(o.image)) return { image: o.image, fit: o.fit === 'fit' ? 'fit' : 'fill' };
  return null;
}

const toResource = (r: Row): Resource => {
  const meta = json<{ roomNumbers?: boolean; duration?: number; recommended?: boolean; icon?: unknown }>(r.meta, {});
  const kind = String(r.kind) as ResourceKind;
  const url = r.url == null ? null : String(r.url);
  return {
    id: Number(r.id),
    sectionId: String(r.section_id),
    position: Number(r.position),
    kind,
    title: String(r.title),
    description: r.description == null ? null : String(r.description),
    hidden: Number(r.hidden) === 1,
    allowDownload: Number(r.allow_download) === 1,
    url,
    embed: kind === 'embed' ? embedOf(url) : null,
    file: r.file_id == null || r.f_name == null ? null : { id: Number(r.file_id), name: String(r.f_name), mime: String(r.f_mime), size: Number(r.f_size) },
    planId: r.plan_id == null ? null : Number(r.plan_id),
    pageId: r.page_id == null ? null : String(r.page_id),
    roomNumbers: meta.roomNumbers !== false,
    duration: Number(meta.duration) > 0 ? Number(meta.duration) : null,
    recommended: meta.recommended === true,
    icon: iconChoice(meta.icon),
    blocks: normalizeBlocks(json(r.blocks, [])),
    updatedAt: String(r.updated_at),
  };
};

export async function listResources(db: Client, dealId: number): Promise<Resource[]> {
  const r = await db.execute({
    sql: `SELECT r.*, f.name AS f_name, f.mime AS f_mime, f.size AS f_size FROM deal_resources r LEFT JOIN stored_files f ON f.id = r.file_id AND f.complete = 1
          WHERE r.deal_id = ? AND r.deleted_at IS NULL ORDER BY r.position, r.id`,
    args: [dealId],
  });
  return r.rows.map(toResource);
}

export interface ResourceInput {
  kind?: unknown;
  title?: unknown;
  description?: unknown;
  url?: unknown;
  fileId?: unknown;
  planId?: unknown;
  pageId?: unknown;
  sectionId?: unknown;
  allowDownload?: unknown;
  hidden?: unknown;
  roomNumbers?: unknown;
  duration?: unknown;
  recommended?: unknown;
  icon?: unknown;
  blocks?: unknown;
}

export async function addResource(db: Client, quoteId: number, input: ResourceInput, userId: number): Promise<Resource> {
  const d = await dealOfQuote(db, quoteId);
  let kind = KINDS.includes(input.kind as ResourceKind) ? (input.kind as ResourceKind) : null;
  if (!kind) throw httpError('Unknown kind of resource', 400);
  let url: string | null = null;
  let fileId: number | null = null;
  let planId: number | null = null;
  let pageId: string | null = null;
  let title = line(input.title, 160);
  let blocks: unknown = [];
  if (kind === 'file' || kind === 'video') {
    fileId = Number(input.fileId);
    const f = await db.execute({ sql: 'SELECT name, mime FROM stored_files WHERE id = ? AND deal_id = ? AND complete = 1', args: [fileId, d.dealId] });
    if (!f.rows.length) throw httpError('Upload the file first', 400);
    kind = String(f.rows[0].mime).startsWith('video/') ? 'video' : 'file';
    title ||= String(f.rows[0].name).replace(/\.[a-z0-9]{1,6}$/i, '');
  } else if (kind === 'embed') {
    url = safeUrl(embedInput(String(input.url ?? '')));
    if (!url || !embedOf(url)) throw httpError('That link can’t be shown inside the page. Use a Canva, Google Slides or Pitch link for a deck, or a YouTube, Vimeo, Loom or Wistia link for a video; or add it as a link instead.', 400);
    title ||= isDeckEmbed(embedOf(url)) ? 'Deck' : 'Video';
  } else if (kind === 'link') {
    url = safeUrl(input.url);
    if (!url) throw httpError('Enter a web address', 400);
    title ||= new URL(url).hostname.replace(/^www\./, '');
  } else if (kind === 'floorplan') {
    planId = Number(input.planId);
    const p = await db.execute({ sql: 'SELECT name FROM floor_plans WHERE id = ? AND quote_id = ? AND complete = 1', args: [planId, quoteId] });
    if (!p.rows.length) throw httpError('Floor plan not found', 404);
    title ||= String(p.rows[0].name).replace(/\.[a-z0-9]{1,6}$/i, '');
    blocks = input.blocks ?? [{ type: 'plan' }, { type: 'summary' }];
  } else if (kind === 'onepager') {
    pageId = line(input.pageId, 40).replace(/[^\w-]/g, '') || null;
    if (!pageId) throw httpError('Pick a one pager', 400);
    title ||= 'One pager';
  }
  const room = await getRoom(db, d.dealId, d.ownerId);
  const want = line(input.sectionId, 40);
  const sectionId = room.sections.some((s) => s.id === want) ? want : kind === 'embed' && isDeckEmbed(embedOf(url)) ? 'docs' : sectionFor(kind);
  const meta = { roomNumbers: input.roomNumbers !== false };
  const r = await db.execute({
    sql: `INSERT INTO deal_resources (deal_id, section_id, position, kind, title, description, allow_download, url, file_id, plan_id, page_id, meta, blocks, created_by)
          VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM deal_resources WHERE deal_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    args: [d.dealId, sectionId, d.dealId, kind, title, line(input.description, 240) || null, input.allowDownload === false ? 0 : 1, url, fileId, planId, pageId, JSON.stringify(meta), JSON.stringify(normalizeBlocks(blocks)), userId],
  });
  return (await listResources(db, d.dealId)).find((x) => x.id === Number(r.rows[0].id))!;
}

export async function updateResource(db: Client, quoteId: number, id: number, input: ResourceInput): Promise<Resource> {
  const d = await dealOfQuote(db, quoteId);
  const cur = (await listResources(db, d.dealId)).find((x) => x.id === id);
  if (!cur) throw httpError('Resource not found', 404);
  const room = await getRoom(db, d.dealId, d.ownerId);
  let url = cur.url;
  if (input.url !== undefined && (cur.kind === 'link' || cur.kind === 'embed')) {
    url = safeUrl(embedInput(String(input.url ?? '')));
    if (!url) throw httpError('Enter a web address', 400);
    if (cur.kind === 'embed' && !embedOf(url)) throw httpError('That link can’t be shown inside the page', 400);
  }
  // A replaced file (same kind: a document stays a document, a video a video).
  let fileId = cur.file?.id ?? null;
  if (input.fileId !== undefined && (cur.kind === 'file' || cur.kind === 'video')) {
    const f = await db.execute({ sql: 'SELECT mime FROM stored_files WHERE id = ? AND deal_id = ? AND complete = 1', args: [Number(input.fileId), d.dealId] });
    if (!f.rows.length) throw httpError('Upload the file first', 400);
    if (String(f.rows[0].mime).startsWith('video/') !== (cur.kind === 'video')) throw httpError(cur.kind === 'video' ? 'Replace a video with a video' : 'Replace a document with a document', 400);
    fileId = Number(input.fileId);
  }
  const want = input.sectionId === undefined ? cur.sectionId : line(input.sectionId, 40);
  const meta = {
    roomNumbers: input.roomNumbers === undefined ? cur.roomNumbers : input.roomNumbers !== false,
    duration: input.duration === undefined ? cur.duration : Number(input.duration) > 0 ? Math.round(Number(input.duration)) : null,
    recommended: input.recommended === undefined ? cur.recommended : input.recommended === true,
    icon: input.icon === undefined ? cur.icon : iconChoice(input.icon),
  };
  if (input.icon !== undefined && meta.icon && 'image' in meta.icon && !(await cardImageExists(db, meta.icon.image))) throw httpError('That image wasn’t found', 400);
  await db.execute({
    // Starring a card, or changing its icon, isn't a change to it: it shouldn't look new to the prospect again.
    sql: `UPDATE deal_resources SET title = ?, description = ?, section_id = ?, hidden = ?, allow_download = ?, url = ?, file_id = ?, meta = ?, blocks = ?${Object.keys(input).every((k) => k === 'recommended' || k === 'icon') ? '' : ", updated_at = datetime('now')"} WHERE id = ?`,
    args: [
      input.title === undefined ? cur.title : line(input.title, 160) || cur.title,
      input.description === undefined ? cur.description : line(input.description, 240) || null,
      room.sections.some((s) => s.id === want) ? want : cur.sectionId,
      (input.hidden === undefined ? cur.hidden : input.hidden === true) ? 1 : 0,
      (input.allowDownload === undefined ? cur.allowDownload : input.allowDownload !== false) ? 1 : 0,
      url,
      fileId,
      JSON.stringify(meta),
      JSON.stringify(input.blocks === undefined ? cur.blocks : normalizeBlocks(input.blocks)),
      id,
    ],
  });
  if (cur.file && fileId !== cur.file.id) await deleteFile(db, d.dealId, cur.file.id).catch(() => {});
  return (await listResources(db, d.dealId)).find((x) => x.id === id)!;
}

export async function deleteResource(db: Client, quoteId: number, id: number): Promise<void> {
  const d = await dealOfQuote(db, quoteId);
  const cur = (await listResources(db, d.dealId)).find((x) => x.id === id);
  if (!cur) throw httpError('Resource not found', 404);
  await db.execute({ sql: "UPDATE deal_resources SET deleted_at = datetime('now') WHERE id = ?", args: [id] });
  if (cur.file) await deleteFile(db, d.dealId, cur.file.id).catch(() => {});
}

/** Put cards in order, by section: [{ sectionId, ids }]. */
export async function reorderResources(db: Client, quoteId: number, order: unknown): Promise<Resource[]> {
  const d = await dealOfQuote(db, quoteId);
  const room = await getRoom(db, d.dealId, d.ownerId);
  const now = await listResources(db, d.dealId);
  const stmts: Array<{ sql: string; args: Array<string | number> }> = [];
  let pos = 1;
  for (const g of Array.isArray(order) ? order : []) {
    const sid = line((g as { sectionId?: unknown }).sectionId, 40);
    if (!room.sections.some((s) => s.id === sid)) continue;
    for (const rid of Array.isArray((g as { ids?: unknown }).ids) ? (g as { ids: unknown[] }).ids : []) {
      if (now.some((x) => x.id === Number(rid))) stmts.push({ sql: 'UPDATE deal_resources SET section_id = ?, position = ? WHERE id = ? AND deal_id = ?', args: [sid, pos++, Number(rid), d.dealId] });
    }
  }
  if (stmts.length) await db.batch(stmts, 'write');
  return listResources(db, d.dealId);
}

// ---------------------------------------------------------------- floor plans

export interface FloorPlanInfo {
  planId: number;
  name: string;
  mime: string;
  communityName: string;
  /** The community's room types, with only this plan's tagged rooms. */
  types: RoomType[];
  allowancePct: number;
  products: ReturnType<typeof productsOf>;
  roomsTagged: number;
}
/** The deal's floor plans with their scope (from a version's inputs): what a floor plan card draws. */
export async function floorPlanInfo(db: Client, quoteId: number, draft: QuoteDraft): Promise<FloorPlanInfo[]> {
  const r = await db.execute({ sql: 'SELECT id, community_id, name, mime FROM floor_plans WHERE quote_id = ? AND complete = 1 ORDER BY id', args: [quoteId] });
  return r.rows.map((x) => {
    const planId = Number(x.id);
    const c = draft.communities.find((k) => k.id === String(x.community_id));
    const types = (c?.roomTypes ?? []).map((t) => ({ ...t, marks: (t.marks ?? []).filter((m) => m.plan === planId) }));
    return {
      planId,
      name: String(x.name).replace(/\.[a-z0-9]{1,6}$/i, ''),
      mime: String(x.mime),
      communityName: c?.name || 'Community',
      types,
      allowancePct: normalizeAllowance(c?.sensorAllowancePct),
      products: productsOf(c ?? {}),
      roomsTagged: types.reduce((s, t) => s + (t.marks?.length ?? 0), 0),
    };
  });
}

// ---------------------------------------------------------------- the prospect's view

export interface RoomPerson {
  userId: number;
  name: string;
  title: string | null;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  linkedin: string | null;
  bio: string | null;
  schedulingUrl: string | null;
  line: string | null;
}
const person = (p: Profile, lineText: string | null): RoomPerson => ({
  userId: p.userId,
  name: p.name,
  title: p.title,
  email: p.email,
  phone: p.showPhone ? p.phone : null,
  photoUrl: p.photoUrl,
  linkedin: p.linkedin,
  bio: p.bio,
  schedulingUrl: p.schedulingUrl,
  line: lineText,
});
export interface ProspectRoom {
  tabName: string;
  heading: string;
  note: string | null;
  showBooking: boolean;
  contact: RoomPerson | null;
  team: RoomPerson[];
  sections: Array<{ id: string; name: string }>;
  resources: Resource[];
  /** Teton Novelty Mode: show the cards like the Teton dashboard. */
  novelty: boolean;
}
export async function roomForLink(db: Client, l: PublicLink): Promise<ProspectRoom | null> {
  const room = await getRoom(db, l.dealId, l.ownerId);
  if (!room.enabled) return null;
  const profiles = await listProfiles(db, [...new Set([room.contactUserId, ...room.team.map((t) => t.userId)].filter((n): n is number => n != null))]);
  const byId = new Map(profiles.map((p) => [p.userId, p]));
  const contact = room.contactUserId ? byId.get(room.contactUserId) : null;
  const resources = (await listResources(db, l.dealId)).filter((x) => !x.hidden);
  return {
    tabName: room.tabName,
    heading: room.heading.replace(/\{customer\}/gi, l.dealName),
    note: room.note,
    showBooking: room.showBooking && !!contact?.schedulingUrl,
    contact: contact ? person(contact, null) : null,
    team: room.team.flatMap((t) => (byId.get(t.userId) ? [person(byId.get(t.userId)!, t.line)] : [])),
    sections: room.sections.filter((s) => resources.some((x) => x.sectionId === s.id)),
    resources,
    novelty: room.novelty,
  };
}

// ---------------------------------------------------------------- engagement

export type EventKind = 'open' | 'time' | 'video' | 'download' | 'click' | 'page';
export interface EventInput {
  target?: unknown;
  resourceId?: unknown;
  kind?: unknown;
  value?: unknown;
  detail?: unknown;
}
/** Record what a signed-in prospect did (heartbeats carry seconds since the last one, at most a minute). */
export async function logEvent(db: Client, l: PublicLink, email: string, e: EventInput, baseUrl?: string): Promise<void> {
  const target = e.target === 'team' || e.target === 'proposal' ? e.target : 'item';
  const kind = (['open', 'time', 'video', 'download', 'click', 'page'] as const).find((k) => k === e.kind);
  if (!kind) throw httpError('Unknown event', 400);
  let resourceId: number | null = null;
  let title = '';
  if (target === 'item') {
    resourceId = Number(e.resourceId);
    const r = await db.execute({ sql: 'SELECT title FROM deal_resources WHERE id = ? AND deal_id = ? AND deleted_at IS NULL', args: [resourceId, l.dealId] });
    if (!r.rows.length) throw httpError('Resource not found', 404);
    title = String(r.rows[0].title);
  }
  const value = kind === 'time' || kind === 'video' ? Math.min(60, Math.max(0, Number(e.value) || 0)) : Math.max(0, Number(e.value) || 0);
  const who = email.trim().toLowerCase();
  // The owner can ask for an email the first time someone opens a resource.
  if (kind === 'open' && target === 'item' && l.ownerId) {
    const seen = await db.execute({ sql: "SELECT 1 FROM resource_events WHERE link_id = ? AND email = ? AND resource_id = ? AND kind = 'open' LIMIT 1", args: [l.id, who, resourceId] });
    const owner = seen.rows.length ? null : await getProfile(db, l.ownerId);
    if (owner?.emailOnOpen) {
      const name = l.people.find((p) => p.email === who)?.name || who;
      void mailer()
        .send({
          fromName: 'Teton proposals',
          to: owner.email,
          replyTo: owner.email,
          subject: `${name} opened “${title}”`,
          html: `<p>${name} (${who}) just opened <b>${title.replace(/</g, '&lt;')}</b> on the ${l.dealName.replace(/</g, '&lt;')} shared link.</p>${baseUrl ? `<p><a href="${baseUrl}/deals">Open Teton</a></p>` : ''}`,
          text: `${name} (${who}) just opened “${title}” on the ${l.dealName} shared link.`,
        })
        .catch(() => {});
    }
  }
  await db.execute({
    sql: 'INSERT INTO resource_events (link_id, deal_id, email, target, resource_id, kind, value, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    args: [l.id, l.dealId, who, target, resourceId, kind, value, e.detail == null ? null : line(e.detail, 80)],
  });
}

export interface ActivityCell {
  time: number;
  opens: number;
  downloads: number;
  clicks: number;
  video: number;
  /** The proposal: the page they came back to most, and how often. */
  topPage: { id: string; count: number } | null;
}
export interface Activity {
  people: Array<{ email: string; name: string | null; emailedAt: string | null; firstOpenedAt: string | null; lastSeenAt: string | null }>;
  rows: Array<{ key: string; title: string; kind: ResourceKind | 'proposal' | 'team'; duration: number | null; hidden: boolean }>;
  cells: Record<string, ActivityCell>;
  recent: Array<{ email: string; kind: EventKind; target: string; key: string; title: string; detail: string | null; value: number; at: string }>;
  totalTime: number;
  weekTime: number;
  lastVisit: { email: string; at: string } | null;
}
export async function activityFor(db: Client, quoteId: number, days = 90): Promise<Activity> {
  const d = await dealOfQuote(db, quoteId);
  const link = await db.execute({ sql: 'SELECT id FROM share_links WHERE deal_id = ? AND revoked_at IS NULL ORDER BY id DESC LIMIT 1', args: [d.dealId] });
  const people = link.rows.length
    ? (await db.execute({ sql: 'SELECT email, name, emailed_at, first_opened_at, last_seen_at FROM share_link_emails WHERE link_id = ? ORDER BY id', args: [Number(link.rows[0].id)] })).rows.map((x) => ({
        email: String(x.email),
        name: x.name == null ? null : String(x.name),
        emailedAt: x.emailed_at == null ? null : String(x.emailed_at),
        firstOpenedAt: x.first_opened_at == null ? null : String(x.first_opened_at),
        lastSeenAt: x.last_seen_at == null ? null : String(x.last_seen_at),
      }))
    : [];
  const resources = await listResources(db, d.dealId);
  const ev = await db.execute({
    sql: `SELECT email, target, resource_id, kind, value, detail, created_at FROM resource_events WHERE deal_id = ? AND created_at >= datetime('now', ?) ORDER BY id`,
    args: [d.dealId, `-${days} days`],
  });
  for (const x of ev.rows) if (!people.some((p) => p.email === String(x.email))) people.push({ email: String(x.email), name: null, emailedAt: null, firstOpenedAt: null, lastSeenAt: null });
  const keyOf = (x: Row) => (String(x.target) === 'item' ? `r${x.resource_id}` : String(x.target));
  const cells: Record<string, ActivityCell> = {};
  const pages: Record<string, Record<string, number>> = {};
  let totalTime = 0;
  let weekTime = 0;
  const weekAgo = Date.now() - 7 * 86400000;
  const titles = new Map<string, string>([
    ['proposal', 'Proposal'],
    ['team', 'Your Team'],
    ...resources.map((r) => [`r${r.id}`, r.title] as [string, string]),
  ]);
  for (const x of ev.rows) {
    const k = `${keyOf(x)}|${x.email}`;
    const c = (cells[k] ??= { time: 0, opens: 0, downloads: 0, clicks: 0, video: 0, topPage: null });
    const v = Number(x.value);
    if (x.kind === 'time') {
      c.time += v;
      totalTime += v;
      if (Date.parse(`${String(x.created_at).replace(' ', 'T')}Z`) >= weekAgo) weekTime += v;
    } else if (x.kind === 'video') c.video += v;
    else if (x.kind === 'open') c.opens += 1;
    else if (x.kind === 'download') c.downloads += 1;
    else if (x.kind === 'click') c.clicks += 1;
    else if (x.kind === 'page' && x.detail) {
      const m = (pages[k] ??= {});
      m[String(x.detail)] = (m[String(x.detail)] ?? 0) + 1;
    }
  }
  for (const [k, m] of Object.entries(pages)) {
    const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0];
    if (top && cells[k]) cells[k].topPage = { id: top[0], count: top[1] };
    else if (top) cells[k] = { time: 0, opens: 0, downloads: 0, clicks: 0, video: 0, topPage: { id: top[0], count: top[1] } };
  }
  const notable = ev.rows.filter((x) => x.kind !== 'time' && x.kind !== 'page' && x.kind !== 'video');
  const recent = notable
    .slice(-40)
    .reverse()
    .map((x) => ({ email: String(x.email), kind: String(x.kind) as EventKind, target: String(x.target), key: keyOf(x), title: titles.get(keyOf(x)) ?? 'A resource', detail: x.detail == null ? null : String(x.detail), value: Number(x.value), at: String(x.created_at) }));
  const last = ev.rows[ev.rows.length - 1];
  return {
    people,
    rows: [
      { key: 'proposal', title: 'Proposal', kind: 'proposal', duration: null, hidden: false },
      { key: 'team', title: 'Your Team', kind: 'team', duration: null, hidden: false },
      ...resources.map((r) => ({ key: `r${r.id}`, title: r.title, kind: r.kind, duration: r.duration, hidden: r.hidden })),
    ],
    cells,
    recent,
    totalTime,
    weekTime,
    lastVisit: last ? { email: String(last.email), at: String(last.created_at) } : null,
  };
}

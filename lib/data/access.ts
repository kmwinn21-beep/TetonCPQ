/**
 * Who can change a deal. The deal's owner (its creator, unless it was handed
 * over) and admins can do everything. Collaborators the owner adds can edit
 * the inputs, use Scope Mode (room types, in the floor plans and the drawer),
 * and/or edit the deliverables (the proposal's wording and layout). Everyone
 * else can view, and add floor plan notes and comments.
 */
import { SCOPE_FIELDS } from '@/lib/quote/scopeWork';
import { archiveInfo, type ArchiveInfo } from './archive';
import type { Client } from '@libsql/client';
import { normalizeDraft, type QuoteDraft } from '@/lib/quote/draft';
import { initialsOf } from './planNotes';

export type Permission = 'inputs' | 'scope' | 'deliverables';
export interface DealAccess {
  dealId: number;
  quoteId: number;
  owner: { id: number; name: string; initials: string } | null;
  isOwner: boolean;
  isAdmin: boolean;
  inputs: boolean;
  scope: boolean;
  deliverables: boolean;
  /** Add, change and remove collaborators; hand the deal over. */
  canManage: boolean;
  /** A collaborator (not the owner). */
  isCollaborator: boolean;
  /** Archived: read-only for everyone (null when active). */
  archived: ArchiveInfo | null;
}
export interface Actor {
  id: number;
  role: string;
}
export interface Collaborator {
  user: { id: number; name: string; email: string; initials: string };
  inputs: boolean;
  scope: boolean;
  deliverables: boolean;
  addedAt: string;
}

const forbidden = (msg: string) => Object.assign(new Error(msg), { status: 403 });
const notFound = (msg: string) => Object.assign(new Error(msg), { status: 404 });

async function accessForDeal(db: Client, dealId: number, quoteId: number, u: Actor): Promise<DealAccess> {
  const d = await db.execute({ sql: 'SELECT d.owner_id, u.name FROM deals d LEFT JOIN users u ON u.id = d.owner_id WHERE d.id = ?', args: [dealId] });
  if (!d.rows.length) throw notFound('Deal not found');
  const ownerId = d.rows[0].owner_id == null ? null : Number(d.rows[0].owner_id);
  const owner = ownerId == null ? null : { id: ownerId, name: String(d.rows[0].name ?? 'Someone'), initials: initialsOf(String(d.rows[0].name ?? '')) };
  const isOwner = ownerId === u.id;
  const isAdmin = u.role === 'admin';
  const c = await db.execute({ sql: 'SELECT can_inputs, can_scope, can_deliverables FROM deal_collaborators WHERE deal_id = ? AND user_id = ?', args: [dealId, u.id] });
  const r = c.rows[0];
  const archived = await archiveInfo(db, dealId);
  // Archived deals are read-only for everyone (the owner or an admin can unarchive or delete).
  const all = (isOwner || isAdmin) && !archived;
  const can = (v: unknown) => !archived && (all || Number(v) === 1);
  return {
    dealId,
    quoteId,
    owner,
    isOwner,
    isAdmin,
    inputs: can(r?.can_inputs),
    scope: can(r?.can_scope),
    deliverables: can(r?.can_deliverables),
    canManage: all,
    isCollaborator: !isOwner && !!r,
    archived,
  };
}

export async function accessForQuote(db: Client, quoteId: number, u: Actor): Promise<DealAccess> {
  const q = await db.execute({ sql: 'SELECT deal_id FROM quotes WHERE id = ?', args: [quoteId] });
  if (!q.rows.length) throw notFound('Quote not found');
  return accessForDeal(db, Number(q.rows[0].deal_id), quoteId, u);
}

export async function accessForVersion(db: Client, versionId: number, u: Actor): Promise<DealAccess> {
  const v = await db.execute({ sql: 'SELECT q.id AS quote_id, q.deal_id FROM quote_versions v JOIN quotes q ON q.id = v.quote_id WHERE v.id = ?', args: [versionId] });
  if (!v.rows.length) throw notFound('Version not found');
  return accessForDeal(db, Number(v.rows[0].deal_id), Number(v.rows[0].quote_id), u);
}

const MESSAGES: Record<Permission | 'manage', string> = {
  inputs: 'You can view this deal but not edit its inputs. Ask the owner to add you as a collaborator.',
  scope: 'You can view this deal but not change its scope. Ask the owner for Edit Scope.',
  deliverables: 'You can view this proposal but not edit it. Ask the owner for Edit Deliverables.',
  manage: 'Only the deal’s owner or an admin can do that.',
};
/** Throws 403 unless the user has at least one of these. */
export function need(a: DealAccess, ...perms: Array<Permission | 'manage'>): void {
  if (perms.some((p) => (p === 'manage' ? a.canManage : a[p]))) return;
  throw forbidden(MESSAGES[perms[0]]);
}

// ---------------------------------------------------------------- scope-only edits


const stable = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v ?? null);
const withoutScope = (d: QuoteDraft) => ({
  ...d,
  communities: d.communities.map((c) => {
    const rest: Record<string, unknown> = { ...c };
    for (const k of SCOPE_FIELDS) delete rest[k];
    return rest;
  }),
});
/** Whether a draft differs from the saved one only in room types (and the beds and sensors they set). */
export function onlyScopeChanged(before: QuoteDraft, after: QuoteDraft): boolean {
  try {
    return stable(withoutScope(normalizeDraft(before))) === stable(withoutScope(normalizeDraft(after)));
  } catch {
    return false; // not a whole draft: not a scope-only change
  }
}

/** A draft save: Edit Inputs may change anything; Edit Scope only room types. */
export function needDraftEdit(a: DealAccess, before: QuoteDraft | null, after: QuoteDraft): void {
  if (a.inputs) return;
  if (a.scope && before && onlyScopeChanged(before, after)) return;
  throw forbidden(a.scope ? 'With Edit Scope you can change room types only. Ask the owner for Edit Inputs to change the rest.' : MESSAGES.inputs);
}

// ---------------------------------------------------------------- collaborators

export async function listCollaborators(db: Client, dealId: number): Promise<Collaborator[]> {
  const r = await db.execute({
    sql: 'SELECT c.*, u.name, u.email FROM deal_collaborators c JOIN users u ON u.id = c.user_id WHERE c.deal_id = ? ORDER BY c.created_at, u.name',
    args: [dealId],
  });
  return r.rows.map((x) => ({
    user: { id: Number(x.user_id), name: String(x.name), email: String(x.email), initials: initialsOf(String(x.name)) },
    inputs: Number(x.can_inputs) === 1,
    scope: Number(x.can_scope) === 1,
    deliverables: Number(x.can_deliverables) === 1,
    addedAt: String(x.created_at),
  }));
}

/** Active users who could be added (not the owner, not already collaborators). */
export async function collaboratorCandidates(db: Client, dealId: number): Promise<Array<{ id: number; name: string; email: string }>> {
  const r = await db.execute({
    sql: `SELECT id, name, email FROM users WHERE active = 1
          AND id <> COALESCE((SELECT owner_id FROM deals WHERE id = ?), 0)
          AND id NOT IN (SELECT user_id FROM deal_collaborators WHERE deal_id = ?) ORDER BY name`,
    args: [dealId, dealId],
  });
  return r.rows.map((x) => ({ id: Number(x.id), name: String(x.name), email: String(x.email) }));
}

export interface Perms {
  inputs?: boolean;
  scope?: boolean;
  deliverables?: boolean;
}

/** Add someone, or change their permissions (owner or admin). */
export async function setCollaborator(db: Client, a: DealAccess, userId: number, p: Perms, actorId: number): Promise<void> {
  need(a, 'manage');
  if (a.owner?.id === userId) throw new Error('The owner can already edit everything');
  const u = await db.execute({ sql: 'SELECT active FROM users WHERE id = ?', args: [userId] });
  if (!u.rows.length || Number(u.rows[0].active) !== 1) throw new Error('That user can’t be added');
  await db.execute({
    sql: `INSERT INTO deal_collaborators (deal_id, user_id, can_inputs, can_scope, can_deliverables, added_by) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (deal_id, user_id) DO UPDATE SET can_inputs = excluded.can_inputs, can_scope = excluded.can_scope, can_deliverables = excluded.can_deliverables`,
    args: [a.dealId, userId, p.inputs ? 1 : 0, p.scope ? 1 : 0, p.deliverables ? 1 : 0, actorId],
  });
}

export async function removeCollaborator(db: Client, a: DealAccess, userId: number): Promise<void> {
  need(a, 'manage');
  await db.execute({ sql: 'DELETE FROM deal_collaborators WHERE deal_id = ? AND user_id = ?', args: [a.dealId, userId] });
}

/** Hand the deal to someone else (owner or admin). The previous owner stays on as a collaborator with every permission. */
export async function transferOwnership(db: Client, a: DealAccess, userId: number, actorId: number): Promise<void> {
  need(a, 'manage');
  if (a.owner?.id === userId) return;
  const u = await db.execute({ sql: 'SELECT active FROM users WHERE id = ?', args: [userId] });
  if (!u.rows.length || Number(u.rows[0].active) !== 1) throw new Error('That user can’t own deals');
  await db.execute({ sql: 'DELETE FROM deal_collaborators WHERE deal_id = ? AND user_id = ?', args: [a.dealId, userId] });
  if (a.owner)
    await db.execute({
      sql: `INSERT INTO deal_collaborators (deal_id, user_id, can_inputs, can_scope, can_deliverables, added_by) VALUES (?, ?, 1, 1, 1, ?)
            ON CONFLICT (deal_id, user_id) DO UPDATE SET can_inputs = 1, can_scope = 1, can_deliverables = 1`,
      args: [a.dealId, a.owner.id, actorId],
    });
  await db.execute({ sql: "UPDATE deals SET owner_id = ?, updated_at = datetime('now') WHERE id = ?", args: [userId, a.dealId] });
}

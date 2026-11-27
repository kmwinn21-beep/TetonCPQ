/**
 * Roles & permissions: every permission, its defaults per role, and how a grant is read. Shared by the server checks
 * and the Settings matrix, so a permission can't be shown without being checked (see permissions.test.ts).
 *
 * Two kinds:
 * - flag: on / off (things not tied to one deal, like the price book);
 * - reach: how far it goes on deals: every deal ('all'), deals the person owns plus ones they collaborate on with
 *   that switch on ('collab'), deals they own ('own'), or none ('off').
 *
 * Admin has everything and can't be edited. A permission that isn't `shipped` is a read-only preview of a feature on
 * the backlog: nothing is stored for it and nothing checks it yet.
 */
import type { Role } from './roles';

export type Reach = 'all' | 'collab' | 'own' | 'off';
export type Flag = 'on' | 'off';
export type Value = Reach | Flag;

export type GroupId = 'deals' | 'prospects' | 'templates' | 'pricebook' | 'approvals' | 'agreements' | 'users';
export const GROUPS: Array<{ id: GroupId; title: string; soon?: string }> = [
  { id: 'deals', title: 'Deals' },
  { id: 'prospects', title: 'Prospects & deal room' },
  { id: 'templates', title: 'Templates' },
  { id: 'pricebook', title: 'Price book' },
  { id: 'approvals', title: 'Approvals', soon: 'Arrives with the approval workflow' },
  { id: 'agreements', title: 'Agreements', soon: 'Arrives with agreement redlines' },
  { id: 'users', title: 'Users & settings' },
];

/** Roles whose permissions can be edited (Admin is all on, locked). */
export const EDITABLE_ROLES = ['rep', 'deal_desk', 'vp_sales', 'ceo'] as const satisfies readonly Role[];
type EditableRole = (typeof EDITABLE_ROLES)[number];

export interface Capability {
  key: string;
  group: GroupId;
  label: string;
  sub?: string;
  kind: 'flag' | 'reach';
  /** Per editable role. */
  defaults: Record<EditableRole, Value>;
  /** Built and checked on the server. False: a preview of a backlog feature (read-only, nothing stored). */
  shipped: boolean;
  /** The same for every role and not editable (a decision, e.g. everyone sees every deal). */
  fixed?: boolean;
  /** For reach permissions: 'collab' doesn't apply (no collaborator switch for it), so it reads as 'own'. */
  noCollab?: boolean;
}

const every = (v: Value): Record<EditableRole, Value> => ({ rep: v, deal_desk: v, vp_sales: v, ceo: v });

export const CAPABILITIES: Capability[] = [
  // Deals
  { key: 'deal.view', group: 'deals', label: 'See deals', sub: 'The deals list, and opening any deal read-only', kind: 'reach', defaults: every('all'), shipped: true, fixed: true },
  { key: 'deal.create', group: 'deals', label: 'Create deals', kind: 'flag', defaults: every('on'), shipped: true },
  { key: 'deal.inputs', group: 'deals', label: 'Edit deal inputs', sub: 'Terms, products, pricing, communities', kind: 'reach', defaults: every('collab'), shipped: true },
  { key: 'deal.scope', group: 'deals', label: 'Scope floor plans', sub: 'Scope Mode, room types, common areas', kind: 'reach', defaults: { ...every('collab'), deal_desk: 'all' }, shipped: true },
  { key: 'deal.proposal', group: 'deals', label: 'Format the proposal', sub: 'Wording, layout, business case, templates applied', kind: 'reach', defaults: every('collab'), shipped: true },
  { key: 'deal.versions', group: 'deals', label: 'Save versions, make one active', sub: 'Deleting a version also needs Edit deal inputs', kind: 'reach', defaults: every('collab'), shipped: true },
  { key: 'deal.manage', group: 'deals', label: 'Manage collaborators, hand a deal over', kind: 'reach', defaults: every('own'), shipped: true, noCollab: true },
  { key: 'deal.delete', group: 'deals', label: 'Archive or delete a deal', kind: 'reach', defaults: every('own'), shipped: true, noCollab: true },
  // Prospects & deal room
  { key: 'deal.share', group: 'prospects', label: 'Share with prospects', sub: 'Share link, emails, who’s on it', kind: 'reach', defaults: every('collab'), shipped: true },
  { key: 'deal.room', group: 'prospects', label: 'Edit the deal room', sub: 'Resources and questions for prospects', kind: 'reach', defaults: every('collab'), shipped: true },
  { key: 'deal.comment', group: 'prospects', label: 'Comment, notes and tasks', sub: 'Proposal comments, floor plan notes, tasks', kind: 'reach', defaults: every('all'), shipped: true, fixed: true },
  { key: 'notes.moderate', group: 'prospects', label: 'Delete other people’s comments, notes and tasks', kind: 'flag', defaults: every('off'), shipped: true },
  // Templates
  { key: 'templates.create', group: 'templates', label: 'Create templates', sub: 'From a business case, or by duplicating one', kind: 'flag', defaults: every('on'), shipped: true },
  { key: 'templates.share', group: 'templates', label: 'Share templates with everyone', kind: 'flag', defaults: every('on'), shipped: true },
  { key: 'templates.manage', group: 'templates', label: 'Edit or delete anyone’s templates', kind: 'flag', defaults: every('off'), shipped: true },
  // Price book
  { key: 'pricebook.view', group: 'pricebook', label: 'See the price book', kind: 'flag', defaults: every('on'), shipped: true, fixed: true },
  { key: 'pricebook.edit', group: 'pricebook', label: 'Edit prices and items', sub: 'Add items, list and market prices, names, SKUs, details, icons', kind: 'flag', defaults: { ...every('off'), deal_desk: 'on' }, shipped: true },
  { key: 'pricebook.delete', group: 'pricebook', label: 'Delete and restore items', kind: 'flag', defaults: every('off'), shipped: true },
  { key: 'pricebook.lineup', group: 'pricebook', label: 'Edit core products and price book settings', sub: 'The line-up and software billing default', kind: 'flag', defaults: every('off'), shipped: true },
  // Approvals (backlog: approval workflow)
  { key: 'approve.tier1', group: 'approvals', label: 'Approve tier 1', sub: 'e.g. price under 90% of list, term under 36 months', kind: 'reach', defaults: { rep: 'off', deal_desk: 'all', vp_sales: 'all', ceo: 'all' }, shipped: false },
  { key: 'approve.tier2', group: 'approvals', label: 'Approve tier 2', sub: 'e.g. price under 75% of list, free pilot', kind: 'reach', defaults: { rep: 'off', deal_desk: 'off', vp_sales: 'all', ceo: 'all' }, shipped: false },
  { key: 'approve.rules', group: 'approvals', label: 'Edit approval rules', sub: 'Thresholds and approvers', kind: 'flag', defaults: every('off'), shipped: false },
  // Agreements (backlog: agreement redlines V1)
  { key: 'agreement.view', group: 'agreements', label: 'See the agreement', sub: 'Rounds, comments, Teton-only notes', kind: 'reach', defaults: { rep: 'collab', deal_desk: 'all', vp_sales: 'all', ceo: 'all' }, shipped: false },
  { key: 'agreement.upload', group: 'agreements', label: 'Upload rounds', kind: 'reach', defaults: { rep: 'off', deal_desk: 'all', vp_sales: 'off', ceo: 'off' }, shipped: false },
  { key: 'agreement.review', group: 'agreements', label: 'Accept / reject changes, send rounds', kind: 'reach', defaults: { rep: 'own', deal_desk: 'off', vp_sales: 'off', ceo: 'off' }, shipped: false },
  { key: 'agreement.people', group: 'agreements', label: 'Manage prospect reviewers and what they see', kind: 'reach', defaults: { rep: 'own', deal_desk: 'off', vp_sales: 'off', ceo: 'off' }, shipped: false },
  { key: 'agreement.finish', group: 'agreements', label: 'Mark final and signed', kind: 'reach', defaults: { rep: 'own', deal_desk: 'all', vp_sales: 'off', ceo: 'off' }, shipped: false },
  // Users & settings (Admin only, by design)
  { key: 'users.manage', group: 'users', label: 'Add users, change roles, deactivate', sub: 'Admin only', kind: 'flag', defaults: every('off'), shipped: true, fixed: true },
  { key: 'permissions.manage', group: 'users', label: 'Edit roles & permissions', sub: 'Admin only', kind: 'flag', defaults: every('off'), shipped: true, fixed: true },
];

export type CapKey = (typeof CAPABILITIES)[number]['key'];
const BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));
export const capability = (key: string) => BY_KEY.get(key);

const REACHES: Reach[] = ['all', 'collab', 'own', 'off'];
const FLAGS: Flag[] = ['on', 'off'];
/** The values a permission can take (for its picker and for checking what's saved). */
export const valuesOf = (c: Capability): Value[] => (c.kind === 'flag' ? FLAGS : c.noCollab ? REACHES.filter((r) => r !== 'collab') : REACHES);
/** A permission an admin can change: built, and not fixed. */
export const isEditable = (c: Capability) => c.shipped && !c.fixed;

/** One role's grants: permission key → value (only what differs from the defaults is stored). */
export type Grants = Record<string, Value>;

/** The value a role has: Admin all, otherwise its saved value if valid and editable, else the default. */
export function grantOf(role: Role | string, key: string, saved?: Grants | null): Value {
  const c = BY_KEY.get(key);
  if (!c) return 'off';
  if (role === 'admin') return c.kind === 'flag' ? 'on' : 'all';
  const r = (EDITABLE_ROLES as readonly string[]).includes(role) ? (role as EditableRole) : 'rep';
  const v = saved?.[key];
  if (v && isEditable(c) && valuesOf(c).includes(v)) return v;
  return c.defaults[r];
}

/** The full set of values for a role (what the server checks against). */
export function grantsFor(role: Role | string, saved?: Grants | null): Grants {
  return Object.fromEntries(CAPABILITIES.map((c) => [c.key, grantOf(role, c.key, saved)]));
}

/** Someone a permission is checked for: their role and, when loaded, their role's grants. */
export interface Grantee {
  role: string;
  grants?: Grants;
}

/** A flag permission. */
export function allowed(u: Grantee, key: string): boolean {
  return (u.grants?.[key] ?? grantOf(u.role, key)) === 'on' || u.role === 'admin';
}

/** A reach permission on one deal: whether it covers this deal for this person. */
export function reaches(u: Grantee, key: string, deal: { isOwner: boolean; collaboratorSwitch: boolean }): boolean {
  if (u.role === 'admin') return true;
  const c = BY_KEY.get(key);
  const v = (u.grants?.[key] ?? grantOf(u.role, key)) as Reach;
  if (v === 'all') return true;
  if (v === 'off') return false;
  if (v === 'collab' && !c?.noCollab) return deal.isOwner || deal.collaboratorSwitch;
  return deal.isOwner;
}

/** Only the values that differ from the defaults, and only editable ones (what's stored for a role). */
export function changedFromDefaults(role: Role | string, grants: Grants): Grants {
  const out: Grants = {};
  if (role === 'admin') return out;
  for (const c of CAPABILITIES) {
    const v = grants[c.key];
    if (!v || !isEditable(c) || !valuesOf(c).includes(v)) continue;
    if (v !== grantOf(role, c.key)) out[c.key] = v;
  }
  return out;
}

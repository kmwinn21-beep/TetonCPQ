/**
 * Roles & permissions storage: the values admins changed from the defaults, per role. Reading merges them with the
 * defaults (lib/auth/permissions.ts); saving keeps only real changes to permissions that can be edited.
 */
import type { Client } from '@libsql/client';
import { CAPABILITIES, changedFromDefaults, grantsFor, type Grants } from '@/lib/auth/permissions';
import type { Role, RoleDef } from '@/lib/auth/roles';
import { listRoles } from './roles';

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

/** What's stored for each editable role (changes from the defaults only). */
export async function savedGrants(db: Client): Promise<Record<string, Grants>> {
  const r = await db.execute('SELECT role, capability, value FROM role_permissions');
  const out: Record<string, Grants> = {};
  for (const x of r.rows) (out[String(x.role)] ??= {})[String(x.capability)] = String(x.value) as Grants[string];
  return out;
}

/** One role's full grants (what the server checks against for someone with that role). */
export async function grantsForRole(db: Client, role: Role | string): Promise<Grants> {
  if (role === 'admin') return grantsFor('admin');
  const r = await db.execute({ sql: 'SELECT capability, value FROM role_permissions WHERE role = ?', args: [role] });
  const saved: Grants = Object.fromEntries(r.rows.map((x) => [String(x.capability), String(x.value) as Grants[string]]));
  // A custom role's defaults come from the role it started from; a role that no longer exists gets nothing.
  const def = await db.execute({ sql: 'SELECT based_on FROM roles WHERE key = ?', args: [role] });
  if (!def.rows.length) return grantsFor(role, null, null);
  return grantsFor(role, saved, def.rows[0].based_on == null ? null : String(def.rows[0].based_on));
}

export interface Matrix {
  /** The roles, in order (Admin last). */
  list: RoleDef[];
  /** Full values per role, Admin included. */
  roles: Record<string, Grants>;
  updatedAt: string | null;
  updatedBy: string | null;
}

export async function getMatrix(db: Client): Promise<Matrix> {
  const saved = await savedGrants(db);
  const list = await listRoles(db);
  const roles: Record<string, Grants> = Object.fromEntries(list.map((r) => [r.key, grantsFor(r.key, saved[r.key], r.basedOn)]));
  const last = await db.execute('SELECT p.updated_at, u.name FROM role_permissions p LEFT JOIN users u ON u.id = p.updated_by ORDER BY p.updated_at DESC LIMIT 1');
  return { list, roles, updatedAt: last.rows[0] ? String(last.rows[0].updated_at) : null, updatedBy: last.rows[0]?.name != null ? String(last.rows[0].name) : null };
}

/**
 * Save the matrix: for each editable role, its full values (anything missing keeps the default). Values that match
 * the defaults, permissions that can't be edited and unknown keys are dropped. Replaces what was stored.
 */
export async function saveMatrix(db: Client, input: unknown, actorId: number): Promise<Matrix> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Bad permissions');
  const rows: Array<[string, string, string]> = [];
  const editable = (await listRoles(db)).filter((r) => r.key !== 'admin');
  for (const { key: role, basedOn } of editable) {
    const g = (input as Record<string, unknown>)[role];
    if (g == null) continue;
    if (typeof g !== 'object' || Array.isArray(g)) throw httpError('Bad permissions');
    const known = Object.fromEntries(Object.entries(g as Record<string, unknown>).filter(([k, v]) => typeof v === 'string' && CAPABILITIES.some((c) => c.key === k))) as Grants;
    for (const [k, v] of Object.entries(changedFromDefaults(role, known, basedOn))) rows.push([role, k, v]);
  }
  const roles = editable.map((r) => r.key).filter((r) => (input as Record<string, unknown>)[r] != null);
  await db.batch(
    [
      ...roles.map((r) => ({ sql: 'DELETE FROM role_permissions WHERE role = ?', args: [r] })),
      ...rows.map(([r, k, v]) => ({ sql: 'INSERT INTO role_permissions (role, capability, value, updated_by) VALUES (?, ?, ?, ?)', args: [r, k, v, actorId] })),
    ],
    'write',
  );
  return getMatrix(db);
}

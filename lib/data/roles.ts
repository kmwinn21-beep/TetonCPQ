/**
 * Roles admins can add, rename, describe, reorder and delete. A role's key never changes (users and permissions
 * point at it); renaming changes only its name. Admin can't be renamed or deleted. A role with people can't be
 * deleted until they're moved to another role. A custom role takes its defaults for permissions added later from the
 * built-in role it started from (or none).
 */
import type { Client } from '@libsql/client';
import { isEditableRole } from '@/lib/auth/permissions';
import { ROLES, type RoleDef } from '@/lib/auth/roles';

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

export const MAX_ROLES = 20;
const NAME_MAX = 40;
const DESC_MAX = 200;

/** The built-in stand-in stored in users.role (which keeps its fixed list) for a role key. */
export const legacyRole = (key: string, basedOn?: string | null) => ((ROLES as readonly string[]).includes(key) ? key : isEditableRole(basedOn) ? basedOn : 'rep');

const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export async function listRoles(db: Client): Promise<RoleDef[]> {
  const r = await db.execute(
    `SELECT r.*, (SELECT COUNT(*) FROM users u WHERE COALESCE(u.role_key, u.role) = r.key AND u.active = 1) AS n FROM roles r ORDER BY r.sort, r.created_at`,
  );
  return r.rows.map((x) => ({
    key: String(x.key),
    name: String(x.name),
    description: String(x.description ?? ''),
    sort: Number(x.sort),
    basedOn: x.based_on == null ? null : String(x.based_on),
    builtin: Number(x.builtin) === 1,
    users: Number(x.n),
  }));
}

export async function getRole(db: Client, key: string): Promise<RoleDef | null> {
  return (await listRoles(db)).find((r) => r.key === key) ?? null;
}

async function checkName(db: Client, name: string, except?: string) {
  if (!name) throw httpError('Give the role a name');
  if (name.toLowerCase() === 'admin' && except !== 'admin') throw httpError('“Admin” is taken by the Admin role');
  const r = await db.execute({ sql: 'SELECT key FROM roles WHERE lower(name) = lower(?) AND key <> ?', args: [name, except ?? ''] });
  if (r.rows.length) throw httpError(`There’s already a role called “${name}”`, 409);
}

/**
 * A new role, starting with another role's permissions (its saved changes copied, its defaults inherited) or with
 * nothing. Goes just before Admin.
 */
export async function createRole(db: Client, input: { name?: unknown; description?: unknown; from?: unknown }, actorId: number): Promise<RoleDef> {
  const name = clean(input.name, NAME_MAX);
  await checkName(db, name);
  const roles = await listRoles(db);
  if (roles.length >= MAX_ROLES) throw httpError(`There can be at most ${MAX_ROLES} roles`);
  const from = typeof input.from === 'string' && input.from !== 'none' ? roles.find((r) => r.key === input.from) : null;
  if (typeof input.from === 'string' && input.from !== 'none' && !from) throw httpError('Pick a role to start from');
  if (from?.key === 'admin') throw httpError('A role can’t start from Admin');
  const basedOn = from ? (from.builtin ? from.key : from.basedOn) : null;
  const key = `r_${Math.random().toString(36).slice(2, 10)}`;
  const sort = Math.max(0, ...roles.filter((r) => r.key !== 'admin').map((r) => r.sort)) + 10;
  await db.batch(
    [
      { sql: 'INSERT INTO roles (key, name, description, sort, based_on, builtin) VALUES (?, ?, ?, ?, ?, 0)', args: [key, name, clean(input.description, DESC_MAX), sort, basedOn] },
      ...(from
        ? [{ sql: 'INSERT INTO role_permissions (role, capability, value, updated_by) SELECT ?, capability, value, ? FROM role_permissions WHERE role = ?', args: [key, actorId, from.key] }]
        : []),
    ],
    'write',
  );
  return (await getRole(db, key))!;
}

/** Rename or re-describe a role (Admin keeps its name). */
export async function updateRole(db: Client, key: string, input: { name?: unknown; description?: unknown }): Promise<RoleDef> {
  const role = await getRole(db, key);
  if (!role) throw httpError('Role not found', 404);
  if (input.name !== undefined) {
    const name = clean(input.name, NAME_MAX);
    if (key === 'admin' && name !== role.name) throw httpError('Admin can’t be renamed');
    await checkName(db, name, key);
    await db.execute({ sql: 'UPDATE roles SET name = ? WHERE key = ?', args: [name, key] });
  }
  if (input.description !== undefined) await db.execute({ sql: 'UPDATE roles SET description = ? WHERE key = ?', args: [clean(input.description, DESC_MAX), key] });
  return (await getRole(db, key))!;
}

/** The roles in a new order (Admin always last). */
export async function reorderRoles(db: Client, keys: unknown): Promise<RoleDef[]> {
  const roles = await listRoles(db);
  if (!Array.isArray(keys)) throw httpError('Bad order');
  const order = (keys as unknown[]).filter((k): k is string => typeof k === 'string' && k !== 'admin' && roles.some((r) => r.key === k));
  const rest = roles.filter((r) => r.key !== 'admin' && !order.includes(r.key)).map((r) => r.key);
  const all = [...new Set([...order, ...rest])];
  await db.batch(all.map((k, i) => ({ sql: 'UPDATE roles SET sort = ? WHERE key = ?', args: [(i + 1) * 10, k] })), 'write');
  return listRoles(db);
}

/** Delete a role: its people (if any) move to `moveTo` first; its saved permissions go with it. */
export async function deleteRole(db: Client, key: string, moveTo?: unknown): Promise<{ moved: number }> {
  const roles = await listRoles(db);
  const role = roles.find((r) => r.key === key);
  if (!role) throw httpError('Role not found', 404);
  if (key === 'admin') throw httpError('Admin can’t be deleted');
  if (roles.filter((r) => r.key !== 'admin').length <= 1) throw httpError('Keep at least one role besides Admin');
  const all = Number((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM users WHERE COALESCE(role_key, role) = ?', args: [key] })).rows[0].n);
  let target: RoleDef | undefined;
  if (all > 0) {
    target = roles.find((r) => r.key === moveTo);
    if (!target || target.key === key) throw httpError(`${all} ${all === 1 ? 'person has' : 'people have'} this role. Pick a role to move them to.`);
  }
  await db.batch(
    [
      ...(target ? [{ sql: 'UPDATE users SET role_key = ?, role = ? WHERE COALESCE(role_key, role) = ?', args: [target.key, legacyRole(target.key, target.basedOn), key] }] : []),
      { sql: 'DELETE FROM role_permissions WHERE role = ?', args: [key] },
      { sql: 'DELETE FROM roles WHERE key = ?', args: [key] },
    ],
    'write',
  );
  return { moved: all };
}

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '@/lib/db/migrate';
import { createRole, deleteRole, listRoles, reorderRoles, updateRole } from './roles';
import { getMatrix, grantsForRole, saveMatrix } from './permissions';
import { createUser, getUser, updateUser } from './users';

let db: Client;
let dir: string;
let adminId: number;

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'teton-roles-'));
  db = createClient({ url: `file:${path.join(dir, 'test.db')}` });
  await migrate(db);
  adminId = (await createUser(db, { email: 'a@x.test', name: 'Ada Admin', role: 'admin', password: 'admin password 123' })).id;
});
afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('roles', () => {
  it('ships the five built-in roles, Admin last', async () => {
    const roles = await listRoles(db);
    expect(roles.map((r) => [r.key, r.name])).toEqual([['rep', 'Sales rep'], ['deal_desk', 'RevOps'], ['vp_sales', 'VP Sales'], ['ceo', 'CEO'], ['admin', 'Admin']]);
    expect(roles.every((r) => r.builtin)).toBe(true);
  });

  it('renames without touching who has the role; Admin keeps its name; names are unique', async () => {
    const u = await createUser(db, { email: 'r@x.test', name: 'Riley Rep', role: 'rep', password: 'rep password 1234' });
    await updateRole(db, 'rep', { name: 'Account Executive', description: 'Owns deals' });
    expect((await listRoles(db))[0]).toMatchObject({ key: 'rep', name: 'Account Executive', description: 'Owns deals', users: 1 });
    expect((await getUser(db, u.id))?.role).toBe('rep');
    await expect(updateRole(db, 'admin', { name: 'Boss' })).rejects.toThrow(/can’t be renamed/);
    await expect(updateRole(db, 'ceo', { name: 'account executive' })).rejects.toThrow(/already a role/);
    await expect(updateRole(db, 'ceo', { name: 'Admin' })).rejects.toThrow(/taken/);
  });

  it('adds a role from another role’s permissions, inheriting its defaults; or from nothing', async () => {
    await saveMatrix(db, { rep: { 'deal.share': 'own' } }, adminId);
    const se = await createRole(db, { name: 'Sales Engineer', description: 'Technical lead', from: 'rep' }, adminId);
    expect(se).toMatchObject({ builtin: false, basedOn: 'rep', users: 0 });
    const g = await grantsForRole(db, se.key);
    expect(g['deal.share']).toBe('own'); // copied change
    expect(g['deal.inputs']).toBe('collab'); // Sales rep's default
    expect(g['agreement.review']).toBe('own'); // a later permission: Sales rep's default
    const blank = await createRole(db, { name: 'Viewer', from: 'none' }, adminId);
    const b = await grantsForRole(db, blank.key);
    expect(b['deal.inputs']).toBe('off');
    expect(b['deal.view']).toBe('all'); // fixed for everyone
    // Copy of a custom role keeps the built-in it came from.
    expect((await createRole(db, { name: 'Sales Engineer II', from: se.key }, adminId)).basedOn).toBe('rep');
    // New roles go before Admin; the matrix has a column for each.
    const keys = (await listRoles(db)).map((r) => r.key);
    expect(keys[keys.length - 1]).toBe('admin');
    expect(Object.keys((await getMatrix(db)).roles)).toContain(se.key);
    await expect(createRole(db, { name: 'sales engineer', from: 'rep' }, adminId)).rejects.toThrow(/already/);
  });

  it('saves a custom role’s permissions against its own defaults', async () => {
    const se = (await listRoles(db)).find((r) => r.name === 'Sales Engineer')!;
    await saveMatrix(db, { [se.key]: { ...(await grantsForRole(db, se.key)), 'deal.scope': 'all' } }, adminId);
    const rows = await db.execute({ sql: 'SELECT capability, value FROM role_permissions WHERE role = ? ORDER BY capability', args: [se.key] });
    expect(rows.rows.map((x) => [x.capability, x.value])).toEqual([['deal.scope', 'all'], ['deal.share', 'own']]);
  });

  it('assigns custom roles to people, reorders, and deletes (moving people first)', async () => {
    const se = (await listRoles(db)).find((r) => r.name === 'Sales Engineer')!;
    const u = await createUser(db, { email: 'se@x.test', name: 'Sam Engineer', role: se.key, password: 'se password 12345' });
    expect(u.role).toBe(se.key);
    expect((await db.execute({ sql: 'SELECT role FROM users WHERE id = ?', args: [u.id] })).rows[0].role).toBe('rep'); // built-in stand-in
    await expect(updateUser(db, adminId, u.id, { role: 'nope' })).rejects.toThrow(/Unknown role/);
    const order = await reorderRoles(db, [se.key, 'rep']);
    expect(order[0].key).toBe(se.key);
    expect(order[order.length - 1].key).toBe('admin');
    await expect(deleteRole(db, 'admin')).rejects.toThrow(/can’t be deleted/);
    await expect(deleteRole(db, se.key)).rejects.toThrow(/Pick a role/);
    expect(await deleteRole(db, se.key, 'deal_desk')).toEqual({ moved: 1 });
    expect((await getUser(db, u.id))?.role).toBe('deal_desk');
    expect((await db.execute({ sql: 'SELECT COUNT(*) AS n FROM role_permissions WHERE role = ?', args: [se.key] })).rows[0].n).toBe(0);
    // Built-in roles can go too once nobody has them.
    expect(await deleteRole(db, 'ceo')).toEqual({ moved: 0 });
    expect((await listRoles(db)).some((r) => r.key === 'ceo')).toBe(false);
  });
});

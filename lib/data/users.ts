/** Users. Every function takes the DB client so it's testable. */
import type { Client, Row } from '@libsql/client';
import { checkPasswordRules, hashPassword, verifyPassword } from '@/lib/auth/password';

import { ROLES, type Role, type User } from '@/lib/auth/roles';

export { ROLES, ROLE_LABEL, type Role, type User } from '@/lib/auth/roles';

const toUser = (r: Row): User => ({
  id: Number(r.id),
  email: String(r.email),
  name: String(r.name),
  role: String(r.role) as Role,
  active: Number(r.active) === 1,
  createdAt: String(r.created_at),
});

let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashPassword('not-a-real-password'));

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function countUsers(db: Client): Promise<number> {
  return Number((await db.execute('SELECT COUNT(*) AS n FROM users')).rows[0].n);
}

export async function getUser(db: Client, id: number): Promise<User | null> {
  const rs = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
  return rs.rows.length ? toUser(rs.rows[0]) : null;
}

export async function listUsers(db: Client): Promise<User[]> {
  return (await db.execute('SELECT * FROM users ORDER BY active DESC, name')).rows.map(toUser);
}

export async function createUser(db: Client, u: { email: string; name: string; role: Role; password: string }): Promise<User> {
  const email = normalizeEmail(u.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email');
  if (!u.name.trim()) throw new Error('Name is required');
  if (!ROLES.includes(u.role)) throw new Error('Unknown role');
  const bad = checkPasswordRules(u.password);
  if (bad) throw new Error(bad);
  const exists = await db.execute({ sql: 'SELECT 1 FROM users WHERE email = ?', args: [email] });
  if (exists.rows.length) throw new Error('A user with that email already exists');
  const rs = await db.execute({
    sql: 'INSERT INTO users (email, name, role, password_hash) VALUES (?, ?, ?, ?) RETURNING *',
    args: [email, u.name.trim(), u.role, await hashPassword(u.password)],
  });
  return toUser(rs.rows[0]);
}

/** The first account becomes an admin; refused once any user exists. */
export async function createFirstAdmin(db: Client, u: { email: string; name: string; password: string }): Promise<User> {
  if ((await countUsers(db)) > 0) throw new Error('Setup is already complete');
  return createUser(db, { ...u, role: 'admin' });
}

/** Returns the user if the email/password match an active account. Same answer for unknown email and wrong password. */
export async function authenticate(db: Client, email: string, password: string): Promise<User | null> {
  const rs = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [normalizeEmail(email ?? '')] });
  const row = rs.rows[0];
  // Compare against a dummy hash when the user doesn't exist, so timing doesn't reveal which emails exist.
  const hash = row?.password_hash ? String(row.password_hash) : await dummyHash();
  const ok = await verifyPassword(password ?? '', hash);
  if (!row || !ok || Number(row.active) !== 1) return null;
  return toUser(row);
}

export async function setPassword(db: Client, id: number, password: string): Promise<void> {
  const bad = checkPasswordRules(password);
  if (bad) throw new Error(bad);
  await db.execute({ sql: 'UPDATE users SET password_hash = ? WHERE id = ?', args: [await hashPassword(password), id] });
}

export async function changeOwnPassword(db: Client, id: number, current: string, next: string): Promise<void> {
  const rs = await db.execute({ sql: 'SELECT password_hash FROM users WHERE id = ?', args: [id] });
  if (!rs.rows.length || !(await verifyPassword(current ?? '', String(rs.rows[0].password_hash ?? '')))) throw new Error('Current password is incorrect');
  await setPassword(db, id, next);
}

export async function updateUser(db: Client, actorId: number, id: number, patch: { role?: Role; active?: boolean; name?: string }): Promise<User> {
  const u = await getUser(db, id);
  if (!u) throw new Error('User not found');
  if (patch.role && !ROLES.includes(patch.role)) throw new Error('Unknown role');
  const losingAdmin = (patch.role && patch.role !== 'admin') || patch.active === false;
  if (u.role === 'admin' && losingAdmin) {
    if (id === actorId) throw new Error('You can’t remove your own admin access');
    const admins = Number((await db.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1")).rows[0].n);
    if (admins <= 1) throw new Error('There must be at least one active admin');
  }
  const rs = await db.execute({
    sql: 'UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active), name = COALESCE(?, name) WHERE id = ? RETURNING *',
    args: [patch.role ?? null, patch.active == null ? null : patch.active ? 1 : 0, patch.name?.trim() || null, id],
  });
  return toUser(rs.rows[0]);
}

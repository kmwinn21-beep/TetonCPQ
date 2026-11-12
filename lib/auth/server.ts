/**
 * Server-side auth: who is signed in, and guards for pages and route handlers.
 * The session token is re-checked against the database on every request, so a
 * deactivated user loses access immediately.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getUser, type User } from '@/lib/data/users';
import { SESSION_COOKIE, verifySession } from './session';

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403) {
    super(message);
  }
}

export async function getSessionUser(): Promise<User | null> {
  const claims = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const user = await getUser(await getDb(), claims.uid);
  return user && user.active ? user : null;
}

/** For pages: signed-in user, or a redirect to the login page. */
export async function requirePageUser(opts: { admin?: boolean } = {}): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  if (opts.admin && user.role !== 'admin') redirect('/deals');
  return user;
}

/** For route handlers: signed-in user, or an AuthError (401/403) for jsonError to return. */
export async function requireApiUser(opts: { admin?: boolean } = {}): Promise<User> {
  const user = await getSessionUser();
  if (!user) throw new AuthError('Not signed in', 401);
  if (opts.admin && user.role !== 'admin') throw new AuthError('Admins only', 403);
  return user;
}

/** Simple in-memory brake on password guessing (per instance): 10 failures per 15 minutes per email+IP. */
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const recent = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(key, recent);
  return recent.length >= 10;
}
export function recordFailure(key: string) {
  failures.set(key, [...(failures.get(key) ?? []), Date.now()]);
}
export function clearFailures(key: string) {
  failures.delete(key);
}

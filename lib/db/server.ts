/** Route-handler helpers. */
import 'server-only';
import { NextResponse } from 'next/server';

export function jsonError(e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : String(e);
  // AuthError (lib/auth/server) carries its own 401/403.
  const s = e && typeof e === 'object' && 'status' in e && (e.status === 401 || e.status === 403 || e.status === 409) ? (e.status as number) : status;
  return NextResponse.json({ error: message }, { status: s });
}

export function idParam(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid id');
  return n;
}

/** Route-handler helpers. */
import 'server-only';
import { NextResponse } from 'next/server';

export function jsonError(e: unknown, status = 400) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status });
}

export function idParam(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid id');
  return n;
}

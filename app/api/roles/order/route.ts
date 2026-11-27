import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { reorderRoles } from '@/lib/data/roles';
import { getMatrix } from '@/lib/data/permissions';

/** The roles' order: { keys } (Admin stays last; admins). */
export async function PUT(req: Request) {
  try {
    requireAllowed(await requireApiUser(), 'permissions.manage');
    const db = await getDb();
    await reorderRoles(db, ((await req.json()) as { keys?: unknown }).keys);
    return NextResponse.json({ matrix: await getMatrix(db) });
  } catch (e) {
    return jsonError(e);
  }
}

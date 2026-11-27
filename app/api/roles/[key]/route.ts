import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { deleteRole, updateRole } from '@/lib/data/roles';
import { getMatrix } from '@/lib/data/permissions';

/** Rename or re-describe a role: { name?, description? } (admins). */
export async function PATCH(req: Request, { params }: { params: { key: string } }) {
  try {
    requireAllowed(await requireApiUser(), 'permissions.manage');
    const db = await getDb();
    await updateRole(db, params.key, (await req.json()) as { name?: unknown; description?: unknown });
    return NextResponse.json({ matrix: await getMatrix(db) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Delete a role: { moveTo } when people have it (admins). */
export async function DELETE(req: Request, { params }: { params: { key: string } }) {
  try {
    requireAllowed(await requireApiUser(), 'permissions.manage');
    const db = await getDb();
    const b = (await req.json().catch(() => ({}))) as { moveTo?: unknown };
    const r = await deleteRole(db, params.key, b.moveTo);
    return NextResponse.json({ ...r, matrix: await getMatrix(db) });
  } catch (e) {
    return jsonError(e);
  }
}

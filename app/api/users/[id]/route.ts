import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { setPassword, updateUser, type Role } from '@/lib/data/users';
import { requireApiUser } from '@/lib/auth/server';

/** Admin: change role, name or active status, or set a new password. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireApiUser({ admin: true });
    const id = idParam(params.id);
    const b = (await req.json()) as { role?: Role; active?: boolean; name?: string; password?: string };
    const db = await getDb();
    if (b.password) await setPassword(db, id, b.password);
    const user = await updateUser(db, actor.id, id, { role: b.role, active: b.active, name: b.name });
    return NextResponse.json(user);
  } catch (e) {
    return jsonError(e);
  }
}

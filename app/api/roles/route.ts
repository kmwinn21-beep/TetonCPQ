import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { createRole } from '@/lib/data/roles';
import { getMatrix } from '@/lib/data/permissions';

/** Add a role: { name, description?, from: role key | 'none' } (admins). Returns it and the updated matrix. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    requireAllowed(user, 'permissions.manage');
    const db = await getDb();
    const role = await createRole(db, (await req.json()) as Record<string, unknown>, user.id);
    return NextResponse.json({ role, matrix: await getMatrix(db) }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { getMatrix, saveMatrix } from '@/lib/data/permissions';

/** Roles & permissions: every role's values (admins). */
export async function GET() {
  try {
    requireAllowed(await requireApiUser(), 'permissions.manage');
    return NextResponse.json(await getMatrix(await getDb()), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Save it: { roles: { rep: { key: value }, deal_desk: … } } (admins). Defaults and locked rows are never stored. */
export async function PUT(req: Request) {
  try {
    const user = await requireApiUser();
    requireAllowed(user, 'permissions.manage');
    const b = (await req.json()) as { roles?: unknown };
    return NextResponse.json(await saveMatrix(await getDb(), b.roles, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { accessForQuote, removeCollaborator, setCollaborator, type Perms } from '@/lib/data/access';
import { requireApiUser } from '@/lib/auth/server';

type P = { params: { id: string; userId: string } };

/** Change a collaborator's permissions (owner or admin). */
export async function PATCH(req: Request, { params }: P) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    await setCollaborator(db, await accessForQuote(db, idParam(params.id), user), idParam(params.userId), (await req.json()) as Perms, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

/** Remove a collaborator (owner or admin). */
export async function DELETE(_req: Request, { params }: P) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    await removeCollaborator(db, await accessForQuote(db, idParam(params.id), user), idParam(params.userId));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { accessForQuote, collaboratorCandidates, listCollaborators, setCollaborator, type Perms } from '@/lib/data/access';
import { requireApiUser } from '@/lib/auth/server';

/** The deal's owner, collaborators, what the asker can do, and (for the owner or an admin) who could be added. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const access = await accessForQuote(db, idParam(params.id), user);
    return NextResponse.json({
      access,
      collaborators: await listCollaborators(db, access.dealId),
      candidates: access.canManage ? await collaboratorCandidates(db, access.dealId) : [],
    });
  } catch (e) {
    return jsonError(e);
  }
}

/** Add a collaborator: { userId, inputs, scope, deliverables } (owner or admin). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const access = await accessForQuote(db, idParam(params.id), user);
    const body = (await req.json()) as Perms & { userId: number };
    await setCollaborator(db, access, idParam(String(body.userId)), body, user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

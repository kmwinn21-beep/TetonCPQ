import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deleteComment, editComment, listComments, resolveThread } from '@/lib/data/proposalComments';
import { requireApiUser } from '@/lib/auth/server';
import { accessForVersion } from '@/lib/data/access';

/** { resolved } resolves or reopens a thread; { body, mentions } edits your own comment. */
export async function PATCH(req: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const vid = idParam(params.id);
    await accessForVersion(db, vid, u);
    const b = (await req.json()) as { resolved?: boolean; body?: string; mentions?: number[] };
    if (typeof b.resolved === 'boolean') await resolveThread(db, vid, idParam(params.cid), b.resolved, u);
    else await editComment(db, vid, idParam(params.cid), b, u);
    return NextResponse.json({ threads: await listComments(db, vid, u) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const vid = idParam(params.id);
    await accessForVersion(db, vid, u);
    await deleteComment(db, vid, idParam(params.cid), u);
    return NextResponse.json({ threads: await listComments(db, vid, u) });
  } catch (e) {
    return jsonError(e);
  }
}

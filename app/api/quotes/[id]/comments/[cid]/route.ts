import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deleteComment, editComment, listDealComments, resolveThread } from '@/lib/data/proposalComments';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote } from '@/lib/data/access';

/** Inputs comments only (business case comments change from the business case). { resolved } or { body, mentions }. */
export async function PATCH(req: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const quoteId = idParam(params.id);
    await accessForQuote(db, quoteId, u);
    const b = (await req.json()) as { resolved?: boolean; body?: string; mentions?: number[] };
    if (typeof b.resolved === 'boolean') await resolveThread(db, { quoteId }, idParam(params.cid), b.resolved, u);
    else await editComment(db, { quoteId }, idParam(params.cid), b, u);
    return NextResponse.json({ threads: await listDealComments(db, quoteId, u) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; cid: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const quoteId = idParam(params.id);
    await accessForQuote(db, quoteId, u);
    await deleteComment(db, { quoteId }, idParam(params.cid), u);
    return NextResponse.json({ threads: await listDealComments(db, quoteId, u) });
  } catch (e) {
    return jsonError(e);
  }
}

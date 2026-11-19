import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deletePlanComment } from '@/lib/data/planNotes';
import { requireApiUser } from '@/lib/auth/server';

/** Its author or an admin deletes a comment. */
export async function DELETE(_req: Request, { params }: { params: { id: string; fid: string; cid: string } }) {
  try {
    const u = await requireApiUser();
    await deletePlanComment(await getDb(), idParam(params.id), idParam(params.fid), idParam(params.cid), u);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

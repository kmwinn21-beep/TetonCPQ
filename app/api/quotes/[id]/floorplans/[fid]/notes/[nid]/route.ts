import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deletePlanNote, updatePlanNote, type NoteInput } from '@/lib/data/planNotes';
import { requireApiUser } from '@/lib/auth/server';

type P = { params: { id: string; fid: string; nid: string } };

/** The author changes their note (text, room type, color, on the plan or not, place and box). */
export async function PATCH(req: Request, { params }: P) {
  try {
    const u = await requireApiUser();
    await updatePlanNote(await getDb(), idParam(params.id), idParam(params.fid), idParam(params.nid), (await req.json()) as NoteInput, u);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: P) {
  try {
    const u = await requireApiUser();
    await deletePlanNote(await getDb(), idParam(params.id), idParam(params.fid), idParam(params.nid), u);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

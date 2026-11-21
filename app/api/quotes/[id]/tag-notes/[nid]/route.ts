import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deleteTagNote, updateTagNote } from '@/lib/data/tagNotes';
import { requireApiUser } from '@/lib/auth/server';

type P = { params: { id: string; nid: string } };

/** The author changes the note: { body, only? } (only: a mark id, to change it for that room alone). */
export async function PATCH(req: Request, { params }: P) {
  try {
    const u = await requireApiUser();
    return NextResponse.json(await updateTagNote(await getDb(), idParam(params.id), idParam(params.nid), await req.json(), u));
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: P) {
  try {
    const u = await requireApiUser();
    await deleteTagNote(await getDb(), idParam(params.id), idParam(params.nid), u);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { createTagNote, listTagNotes } from '@/lib/data/tagNotes';
import { requireApiUser } from '@/lib/auth/server';

/** Notes on this deal's tagged rooms. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ notes: await listTagNotes(await getDb(), idParam(params.id), u) });
  } catch (e) {
    return jsonError(e);
  }
}

/** A note on one or more tagged rooms: { markIds, body }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const id = await createTagNote(await getDb(), idParam(params.id), await req.json(), u);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

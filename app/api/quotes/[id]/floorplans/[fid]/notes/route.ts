import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { createPlanNote, initialsOf, listPlanNotes, type NoteInput } from '@/lib/data/planNotes';
import { requireApiUser } from '@/lib/auth/server';

/** A floor plan's notes (with comments), its general comments, and who's asking. */
export async function GET(_req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const u = await requireApiUser();
    const data = await listPlanNotes(await getDb(), idParam(params.id), idParam(params.fid), u);
    return NextResponse.json({ ...data, me: { id: u.id, name: u.name, initials: initialsOf(u.name), isAdmin: u.role === 'admin' } });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const u = await requireApiUser();
    const id = await createPlanNote(await getDb(), idParam(params.id), idParam(params.fid), (await req.json()) as NoteInput, u);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { addPlanComment } from '@/lib/data/planNotes';
import { requireApiUser } from '@/lib/auth/server';

/** { noteId, body } comments on a note; { body } alone is a general comment on the plan. */
export async function POST(req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const u = await requireApiUser();
    const id = await addPlanComment(await getDb(), idParam(params.id), idParam(params.fid), (await req.json()) as { noteId?: number | null; body?: string }, u);
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

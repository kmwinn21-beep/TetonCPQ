import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { accessForQuote } from '@/lib/data/access';
import { archiveDeal, unarchiveDeal } from '@/lib/data/archive';
import { requireApiUser } from '@/lib/auth/server';

/** Archive the deal: { reason, note? } (its owner or an admin). Turns its shared links off. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const body = (await req.json()) as { reason?: unknown; note?: unknown };
    return NextResponse.json(await archiveDeal(db, await accessForQuote(db, idParam(params.id), user), body, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

/** Unarchive: back to Active, with the links archiving turned off turned back on. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    return NextResponse.json(await unarchiveDeal(db, await accessForQuote(db, idParam(params.id), user)));
  } catch (e) {
    return jsonError(e);
  }
}

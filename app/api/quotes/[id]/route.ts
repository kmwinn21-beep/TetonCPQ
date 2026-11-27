import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { accessForQuote } from '@/lib/data/access';
import { deleteDeal } from '@/lib/data/deleteDeal';
import { requireApiUser } from '@/lib/auth/server';

/** Delete the deal this proposal belongs to, for good (its owner or an admin). */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    return NextResponse.json(await deleteDeal(db, await accessForQuote(db, idParam(params.id), user)));
  } catch (e) {
    return jsonError(e);
  }
}

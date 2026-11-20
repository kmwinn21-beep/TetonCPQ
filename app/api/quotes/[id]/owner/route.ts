import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { accessForQuote, transferOwnership } from '@/lib/data/access';
import { requireApiUser } from '@/lib/auth/server';

/** Hand the deal to someone else: { userId } (owner or admin). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const { userId } = (await req.json()) as { userId: number };
    await transferOwnership(db, await accessForQuote(db, idParam(params.id), user), idParam(String(userId)), user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

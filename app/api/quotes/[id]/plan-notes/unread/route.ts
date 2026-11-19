import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { unreadPlanItems } from '@/lib/data/planNotes';
import { requireApiUser } from '@/lib/auth/server';

/** Notes and comments on this deal's floor plans the user hasn't read (written by someone else). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ items: await unreadPlanItems(await getDb(), idParam(params.id), u) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

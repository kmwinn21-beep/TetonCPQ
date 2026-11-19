import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { markPlanItemsRead } from '@/lib/data/planNotes';
import { requireApiUser } from '@/lib/auth/server';

/** { items: [{ kind, id }] } marks those read; { all: true } marks everything on this deal read. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const body = (await req.json()) as { all?: boolean; items?: Array<{ kind: string; id: number }> };
    await markPlanItemsRead(await getDb(), idParam(params.id), u, body.all ? 'all' : Array.isArray(body.items) ? body.items : []);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

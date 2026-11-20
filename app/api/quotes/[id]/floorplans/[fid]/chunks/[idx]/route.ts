import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { putFloorPlanChunk } from '@/lib/data/floorPlans';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';

/** One piece of the file, as the raw request body. */
export async function PUT(req: Request, { params }: { params: { id: string; fid: string; idx: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    need(await accessForQuote(db, idParam(params.id), user), 'inputs', 'scope');
    const data = new Uint8Array(await req.arrayBuffer());
    await putFloorPlanChunk(db, idParam(params.id), idParam(params.fid), Number(params.idx), data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

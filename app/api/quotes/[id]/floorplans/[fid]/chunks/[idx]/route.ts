import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { putFloorPlanChunk } from '@/lib/data/floorPlans';
import { requireApiUser } from '@/lib/auth/server';

/** One piece of the file, as the raw request body. */
export async function PUT(req: Request, { params }: { params: { id: string; fid: string; idx: string } }) {
  try {
    await requireApiUser();
    const data = new Uint8Array(await req.arrayBuffer());
    await putFloorPlanChunk(await getDb(), idParam(params.id), idParam(params.fid), Number(params.idx), data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

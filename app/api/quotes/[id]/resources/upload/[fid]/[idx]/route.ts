import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { putChunk } from '@/lib/data/storedFiles';
import { repFor } from '@/lib/resources/server';

/** One chunk of a file kept in the database. */
export async function PUT(req: Request, { params }: { params: { id: string; fid: string; idx: string } }) {
  try {
    const { db, dealId } = await repFor(params.id, true);
    await putChunk(db, dealId, Number(params.fid), Number(params.idx), new Uint8Array(await req.arrayBuffer()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

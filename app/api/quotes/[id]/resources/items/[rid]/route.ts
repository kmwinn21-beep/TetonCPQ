import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { deleteResource, updateResource, type ResourceInput } from '@/lib/data/dealRooms';
import { repFor } from '@/lib/resources/server';

export async function PATCH(req: Request, { params }: { params: { id: string; rid: string } }) {
  try {
    const { db, quoteId } = await repFor(params.id, true);
    return NextResponse.json({ resource: await updateResource(db, quoteId, Number(params.rid), (await req.json()) as ResourceInput) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; rid: string } }) {
  try {
    const { db, quoteId } = await repFor(params.id, true);
    await deleteResource(db, quoteId, Number(params.rid));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

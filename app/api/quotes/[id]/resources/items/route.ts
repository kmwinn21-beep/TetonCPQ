import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { addResource, reorderResources, type ResourceInput } from '@/lib/data/dealRooms';
import { repFor } from '@/lib/resources/server';

/** Add a card. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, quoteId, u } = await repFor(params.id, true);
    return NextResponse.json({ resource: await addResource(db, quoteId, (await req.json()) as ResourceInput, u.id) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Reorder: { order: [{ sectionId, ids }] }. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, quoteId } = await repFor(params.id, true);
    const { order } = (await req.json()) as { order?: unknown };
    return NextResponse.json({ resources: await reorderResources(db, quoteId, order) });
  } catch (e) {
    return jsonError(e);
  }
}

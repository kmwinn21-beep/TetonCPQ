import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { openDealsWith, updateItemDetails, type DetailsPatch } from '@/lib/data/items';

/** Admin: how many open deals have this item (for the warning before changing how it bills). */
export async function GET(_req: Request, { params }: { params: { sku: string } }) {
  try {
    await requireApiUser({ admin: true });
    return NextResponse.json({ openDeals: await openDealsWith(await getDb(), decodeURIComponent(params.sku)) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Admin: change an item's details (billing, every N years, priced per, counted by, pilot rule, place, description). */
export async function PATCH(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as DetailsPatch;
    return NextResponse.json(await updateItemDetails(await getDb(), decodeURIComponent(params.sku), b, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { openDealsWith, updateItemDetails, type DetailsPatch } from '@/lib/data/items';

/** Price book editors (roles & permissions): how many open deals have this item (for the warning before changing how it bills). */
export async function GET(_req: Request, { params }: { params: { sku: string } }) {
  try {
    requireAllowed(await requireApiUser(), 'pricebook.edit');
    return NextResponse.json({ openDeals: await openDealsWith(await getDb(), decodeURIComponent(params.sku)) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Price book editors (roles & permissions): change an item's details (billing, every N years, priced per, counted by, pilot rule, place, description). */
export async function PATCH(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser();
    requireAllowed(user, 'pricebook.edit');
    const b = (await req.json()) as DetailsPatch;
    return NextResponse.json(await updateItemDetails(await getDb(), decodeURIComponent(params.sku), b, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

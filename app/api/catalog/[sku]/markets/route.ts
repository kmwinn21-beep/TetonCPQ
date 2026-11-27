import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { setMarketPrice } from '@/lib/data/priceBook';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';

/** Price book editors (roles & permissions): a product's reference price outside the US. Body: { market, value: number | 'not_sold' | null | 'default' }. */
export async function PATCH(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser();
    requireAllowed(user, 'pricebook.edit');
    const b = (await req.json()) as { market?: unknown; value?: unknown };
    return NextResponse.json(await setMarketPrice(await getDb(), decodeURIComponent(params.sku), String(b.market ?? ''), b.value, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

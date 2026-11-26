import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { setItemCode, setListPrice } from '@/lib/data/priceBook';
import { requireApiUser } from '@/lib/auth/server';

/** Admin: change a product's list price ({ list: number | 'default' }) or its SKU ({ itemCode }). */
export async function PATCH(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as { list?: unknown; itemCode?: unknown };
    const db = await getDb();
    const sku = decodeURIComponent(params.sku);
    return NextResponse.json(b.itemCode !== undefined ? await setItemCode(db, sku, b.itemCode, user.id) : await setListPrice(db, sku, b.list, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { setItemCode, setListPrice, setProductName } from '@/lib/data/priceBook';
import { requireApiUser } from '@/lib/auth/server';
import { refreshLineupItems } from '@/lib/data/items';

/** Admin: change a product's list price ({ list: number | 'default' }) its SKU ({ itemCode }) or its name ({ name }). */
export async function PATCH(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as { list?: unknown; itemCode?: unknown; name?: unknown };
    const db = await getDb();
    const sku = decodeURIComponent(params.sku);
    const row = b.name !== undefined ? await setProductName(db, sku, b.name, user.id) : b.itemCode !== undefined ? await setItemCode(db, sku, b.itemCode, user.id) : await setListPrice(db, sku, b.list, user.id);
    // An item priced from its details: the line-up keeps a copy of its name, SKU and list price (a new version).
    if (row.generic) await refreshLineupItems(db, user.id);
    return NextResponse.json(row);
  } catch (e) {
    return jsonError(e);
  }
}

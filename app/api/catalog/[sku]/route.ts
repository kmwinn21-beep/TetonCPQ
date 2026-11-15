import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { setListPrice } from '@/lib/data/priceBook';
import { requireApiUser } from '@/lib/auth/server';

/** Admin: change a product's list price. Body: { list: number } or { list: 'default' }. */
export async function PATCH(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as { list?: unknown };
    return NextResponse.json(await setListPrice(await getDb(), decodeURIComponent(params.sku), b.list, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { setItemIcon } from '@/lib/data/items';

/** Admin: an item's icon from the icon pack and its tint (`icon: null` back to its category's). */
export async function PATCH(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as { icon?: unknown; tint?: unknown };
    return NextResponse.json({ item: await setItemIcon(await getDb(), decodeURIComponent(params.sku), b.icon ?? null, b.tint ?? null, user.id) });
  } catch (e) {
    return jsonError(e);
  }
}

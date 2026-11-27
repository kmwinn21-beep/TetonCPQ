import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { archiveInfo, archiveItem, restoreItem } from '@/lib/data/items';

/** Admin: where an item is used, before deleting it. */
export async function GET(_req: Request, { params }: { params: { sku: string } }) {
  try {
    await requireApiUser({ admin: true });
    return NextResponse.json(await archiveInfo(await getDb(), decodeURIComponent(params.sku)));
  } catch (e) {
    return jsonError(e);
  }
}

/** Admin: delete (archive) an item — `{ confirm: its name, removeFromCores }` — or `{ restore: true }` to bring it back. */
export async function POST(req: Request, { params }: { params: { sku: string } }) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as { confirm?: unknown; removeFromCores?: unknown; restore?: unknown };
    const db = await getDb();
    const sku = decodeURIComponent(params.sku);
    if (b.restore === true) return NextResponse.json({ item: await restoreItem(db, sku, user.id) });
    return NextResponse.json(await archiveItem(db, sku, b, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

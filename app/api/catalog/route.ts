import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { createItem, type ItemInput } from '@/lib/data/items';

/** Admin: add an item to the price book (priced from its details), optionally straight into a core product. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as ItemInput;
    return NextResponse.json(await createItem(await getDb(), b, user.id), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

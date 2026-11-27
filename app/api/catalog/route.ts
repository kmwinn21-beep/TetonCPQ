import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { createItem, type ItemInput } from '@/lib/data/items';

/** Price book editors (roles & permissions): add an item to the price book (priced from its details), optionally straight into a core product. */
export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    requireAllowed(user, 'pricebook.edit');
    const b = (await req.json()) as ItemInput;
    // Putting it straight into a core product changes the line-up.
    if (b.addTo) requireAllowed(user, 'pricebook.lineup');
    return NextResponse.json(await createItem(await getDb(), b, user.id), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

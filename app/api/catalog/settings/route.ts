import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { setSoftwareBillingDefault } from '@/lib/data/priceBook';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';

/** Price book editors (roles & permissions): price book settings. Body: { softwareBilling: 'monthly' | 'upfront' }. */
export async function PATCH(req: Request) {
  try {
    const user = await requireApiUser();
    requireAllowed(user, 'pricebook.lineup');
    const b = (await req.json()) as { softwareBilling?: unknown };
    return NextResponse.json(await setSoftwareBillingDefault(await getDb(), b.softwareBilling, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

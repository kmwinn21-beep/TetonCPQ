import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { nextFreeCode } from '@/lib/data/items';

/** Price book editors (roles & permissions): the next free SKU in a series (?prefix=TT-CAP → TT-CAP-015). */
export async function GET(req: Request) {
  try {
    requireAllowed(await requireApiUser(), 'pricebook.edit');
    const prefix = new URL(req.url).searchParams.get('prefix') ?? 'TT-ITM';
    if (!/^[A-Za-z0-9-]{1,24}$/.test(prefix)) throw new Error('Invalid prefix');
    return NextResponse.json({ code: await nextFreeCode(await getDb(), prefix) });
  } catch (e) {
    return jsonError(e);
  }
}

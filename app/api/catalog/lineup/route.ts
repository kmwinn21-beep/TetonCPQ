import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireAllowed, requireApiUser } from '@/lib/auth/server';
import { getLineup, saveLineup } from '@/lib/data/lineup';

/** Price book editors (roles & permissions): the core products line-up. */
export async function GET() {
  try {
    requireAllowed(await requireApiUser(), 'pricebook.lineup');
    return NextResponse.json(await getLineup(await getDb()));
  } catch (e) {
    return jsonError(e);
  }
}

/** Price book editors (roles & permissions): save a new version ({ lineup, baseVersion }); 409 when someone saved since baseVersion. */
export async function PUT(req: Request) {
  try {
    const user = await requireApiUser();
    requireAllowed(user, 'pricebook.lineup');
    const b = (await req.json()) as { lineup?: unknown; baseVersion?: unknown };
    const base = Number(b.baseVersion);
    if (!Number.isInteger(base) || base < 0) throw Object.assign(new Error('Missing baseVersion'), { status: 400 });
    return NextResponse.json(await saveLineup(await getDb(), b.lineup, user.id, base));
  } catch (e) {
    return jsonError(e);
  }
}

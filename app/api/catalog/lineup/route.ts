import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { getLineup, saveLineup } from '@/lib/data/lineup';

/** Admin: the core products line-up. */
export async function GET() {
  try {
    await requireApiUser({ admin: true });
    return NextResponse.json(await getLineup(await getDb()));
  } catch (e) {
    return jsonError(e);
  }
}

/** Admin: save a new version ({ lineup, baseVersion }); 409 when someone saved since baseVersion. */
export async function PUT(req: Request) {
  try {
    const user = await requireApiUser({ admin: true });
    const b = (await req.json()) as { lineup?: unknown; baseVersion?: unknown };
    const base = Number(b.baseVersion);
    if (!Number.isInteger(base) || base < 0) throw Object.assign(new Error('Missing baseVersion'), { status: 400 });
    return NextResponse.json(await saveLineup(await getDb(), b.lineup, user.id, base));
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { allNotifications, markNotificationsRead, type ReadRequest } from '@/lib/data/notifications';
import { requireApiUser } from '@/lib/auth/server';

/** My unread notifications across deals, grouped by deal. */
export async function GET() {
  try {
    const u = await requireApiUser();
    return NextResponse.json(await allNotifications(await getDb(), u), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** { all } (optionally one deal: quoteId), or { quoteId, tasks, mentions, plan }. */
export async function POST(req: Request) {
  try {
    const u = await requireApiUser();
    await markNotificationsRead(await getDb(), u, (await req.json().catch(() => ({}))) as ReadRequest);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { markTaskNotificationsRead, taskNotifications } from '@/lib/data/tasks';
import { requireApiUser } from '@/lib/auth/server';

/** My unread task notifications on this deal (assigned, overdue). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ items: await taskNotifications(await getDb(), u, idParam(params.id)) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** { ids } or { all: true } (this deal). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const b = (await req.json().catch(() => ({}))) as { ids?: number[]; all?: boolean };
    await markTaskNotificationsRead(await getDb(), u, b.all ? 'all' : Array.isArray(b.ids) ? b.ids : [], b.all ? idParam(params.id) : undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

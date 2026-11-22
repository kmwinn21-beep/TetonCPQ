import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { myTaskCounts, openTasksFor, type TaskScope } from '@/lib/data/tasks';
import { requireApiUser } from '@/lib/auth/server';

/** Open tasks across deals: ?scope=mine (assigned to me, default) | byme (I added) | all (my deals). Plus my counts. */
export async function GET(req: Request) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const s = new URL(req.url).searchParams.get('scope');
    const scope: TaskScope = s === 'byme' || s === 'all' ? s : 'mine';
    const counts = await myTaskCounts(db, u);
    const tasks = new URL(req.url).searchParams.get('counts') ? [] : await openTasksFor(db, u, scope);
    return NextResponse.json({ tasks, counts }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

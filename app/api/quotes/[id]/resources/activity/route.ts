import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { activityFor } from '@/lib/data/dealRooms';
import { repFor } from '@/lib/resources/server';

/** Who on the link looked at what (?days=30). */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, quoteId } = await repFor(params.id);
    const days = Math.min(365, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 90));
    return NextResponse.json({ activity: await activityFor(db, quoteId, days) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

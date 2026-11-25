import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { getVersion } from '@/lib/data/quotes';
import { listResources } from '@/lib/data/dealRooms';
import { readFloorPlan } from '@/lib/data/floorPlans';
import { prospectFor } from '@/lib/resources/server';

/** A floor plan file, only when a visible card on the link shows it (the badges are drawn on in the browser). */
export async function GET(_req: Request, { params }: { params: { token: string; pid: string } }) {
  try {
    const { db, l } = await prospectFor(params.token);
    const pid = Number(params.pid);
    if (!(await listResources(db, l.dealId)).some((r) => r.kind === 'floorplan' && r.planId === pid && !r.hidden)) throw Object.assign(new Error('Not found'), { status: 404 });
    const v = await getVersion(db, l.versionId);
    const f = await readFloorPlan(db, v!.quoteId, pid);
    return new NextResponse(f.data.buffer as ArrayBuffer, { headers: { 'content-type': f.mime, 'content-length': String(f.data.byteLength), 'cache-control': 'private, max-age=300', 'x-content-type-options': 'nosniff' } });
  } catch (e) {
    return jsonError(e, 404);
  }
}

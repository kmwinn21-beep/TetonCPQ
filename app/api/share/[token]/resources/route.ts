import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { getVersion } from '@/lib/data/quotes';
import { floorPlanInfo, roomForLink } from '@/lib/data/dealRooms';
import { prospectFor } from '@/lib/resources/server';
import { prospectAccess } from '@/lib/data/agreementDocs';

/** The Resources tab for the prospect: Your Team, the visible cards, and the floor plans they show. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, who } = await prospectFor(params.token);
    // Their access can hide the deal room.
    if (!who.team && !(await prospectAccess(db, l.dealId, who.email)).showResources) return NextResponse.json({ room: null });
    const room = await roomForLink(db, l);
    if (!room) return NextResponse.json({ room: null });
    const used = new Set(room.resources.filter((r) => r.kind === 'floorplan').map((r) => r.planId));
    const v = used.size ? await getVersion(db, l.versionId) : null;
    const plans = v ? (await floorPlanInfo(db, v.quoteId, v.inputs)).filter((p) => used.has(p.planId)) : [];
    return NextResponse.json({ room, plans }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

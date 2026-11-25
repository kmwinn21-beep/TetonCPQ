import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { listResources, logEvent } from '@/lib/data/dealRooms';
import { prospectFor } from '@/lib/resources/server';

/** A link card (or a button block's link, ?b=<block id>): recorded as a click, then on to the page. */
export async function GET(req: Request, { params }: { params: { token: string; rid: string } }) {
  try {
    const { db, l, who } = await prospectFor(params.token);
    const r = (await listResources(db, l.dealId)).find((x) => x.id === Number(params.rid) && !x.hidden);
    if (!r) throw Object.assign(new Error('Not found'), { status: 404 });
    const bid = new URL(req.url).searchParams.get('b');
    const block = bid ? r.blocks.find((b) => b.id === bid && b.type === 'button') : null;
    const url = block && block.type === 'button' ? block.url : r.url;
    if (!url) throw Object.assign(new Error('Not found'), { status: 404 });
    if (!who.team) await logEvent(db, l, who.email, { target: 'item', resourceId: r.id, kind: 'click', detail: block ? 'button' : null });
    return NextResponse.redirect(url, 302);
  } catch (e) {
    return jsonError(e, 404);
  }
}

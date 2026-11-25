import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { logEvent, type EventInput } from '@/lib/data/dealRooms';
import { baseUrlOf } from '@/lib/email/send';
import { prospectFor } from '@/lib/resources/server';

/** What the signed-in prospect is looking at: { events: [...] } (opens, heartbeats, video, proposal pages). */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, who } = await prospectFor(params.token);
    const body = (await req.json().catch(() => ({}))) as { events?: EventInput[] };
    for (const e of (body.events ?? []).slice(0, 20)) await logEvent(db, l, who.email, e, baseUrlOf(req)).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

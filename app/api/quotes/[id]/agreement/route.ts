import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { need } from '@/lib/data/access';
import { repFor } from '@/lib/resources/server';
import { agreementAction, dealAgreement } from '@/lib/data/agreements';

/** Where the deal's agreement request stands: waiting (and for how long), snoozed, sent; and which versions it came from. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, dealId } = await repFor(params.id);
    return NextResponse.json(await dealAgreement(db, dealId), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Mark the agreement sent, undo that, or snooze the alert for a day (people who can edit the inputs). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, dealId, a, u } = await repFor(params.id);
    need(a, 'inputs');
    const { action } = (await req.json()) as { action?: string };
    if (action !== 'sent' && action !== 'undo' && action !== 'snooze') throw Object.assign(new Error('Unknown action'), { status: 400 });
    await agreementAction(db, dealId, u.id, action);
    return NextResponse.json(await dealAgreement(db, dealId));
  } catch (e) {
    return jsonError(e);
  }
}

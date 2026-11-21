import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { getPlanLabels, savePlanLabels } from '@/lib/data/floorPlans';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';

/** The room numbers read from this plan (null until someone has run "Fill numbers from plan"). */
export async function GET(_req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    await requireApiUser();
    return NextResponse.json({ labels: await getPlanLabels(await getDb(), idParam(params.id), idParam(params.fid)) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Save what the browser read from the plan (room numbers and where they are). Needs Edit Scope. */
export async function PUT(req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    need(await accessForQuote(db, idParam(params.id), user), 'scope');
    return NextResponse.json({ labels: await savePlanLabels(db, idParam(params.id), idParam(params.fid), await req.json()) });
  } catch (e) {
    return jsonError(e);
  }
}

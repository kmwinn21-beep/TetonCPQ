import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { completeFloorPlan } from '@/lib/data/floorPlans';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';

export async function POST(_req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    need(await accessForQuote(db, idParam(params.id), user), 'inputs', 'scope');
    return NextResponse.json({ plan: await completeFloorPlan(db, idParam(params.id), idParam(params.fid)) });
  } catch (e) {
    return jsonError(e);
  }
}

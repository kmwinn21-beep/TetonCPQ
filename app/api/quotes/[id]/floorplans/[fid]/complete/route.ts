import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { completeFloorPlan } from '@/lib/data/floorPlans';
import { requireApiUser } from '@/lib/auth/server';

export async function POST(_req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    await requireApiUser();
    return NextResponse.json({ plan: await completeFloorPlan(await getDb(), idParam(params.id), idParam(params.fid)) });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { listFloorPlans, startFloorPlan } from '@/lib/data/floorPlans';
import { requireApiUser } from '@/lib/auth/server';

/** The deal's floor plans (every community). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiUser();
    return NextResponse.json({ plans: await listFloorPlans(await getDb(), idParam(params.id)) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Start uploading one: { communityId, name, mime, size } → { id, chunks }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const body = (await req.json()) as { communityId: string; name: string; mime: string; size: number };
    return NextResponse.json(await startFloorPlan(await getDb(), idParam(params.id), body, user.id), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

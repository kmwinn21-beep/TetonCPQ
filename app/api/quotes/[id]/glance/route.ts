import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { dealGlance } from '@/lib/data/dealGlance';
import { requireApiUser } from '@/lib/auth/server';

/** The Deals page side panel: a quick look at one deal (anyone signed in can view deals). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    return NextResponse.json(await dealGlance(await getDb(), idParam(params.id), user.id));
  } catch (e) {
    return jsonError(e);
  }
}

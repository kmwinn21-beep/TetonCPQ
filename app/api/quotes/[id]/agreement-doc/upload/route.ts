import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { teamActor, uploadedDocx } from '@/lib/agreement/server';
import { uploadTetonRound } from '@/lib/data/agreementDocs';

/** Upload Teton's round: the Word file as the body, ?name=…&note=… */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, dealId, actor } = await teamActor(params.id);
    const f = await uploadedDocx(req);
    const r = await uploadTetonRound(db, dealId, actor, f, new URL(req.url).searchParams.get('note'));
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

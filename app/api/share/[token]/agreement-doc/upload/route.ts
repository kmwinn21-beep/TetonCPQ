import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { prospectActor, uploadedDocx } from '@/lib/agreement/server';
import { uploadProspectRound } from '@/lib/data/agreementDocs';

/** The prospect uploads their redlined Word file (the body), ?name=…&note=… */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, actor, who } = await prospectActor(params.token);
    if (who.team) throw Object.assign(new Error('You’re viewing as the Teton team.'), { status: 403 });
    const r = await uploadProspectRound(db, l.dealId, actor, await uploadedDocx(req), new URL(req.url).searchParams.get('note'));
    return NextResponse.json(r, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

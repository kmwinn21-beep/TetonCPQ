import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { startUpload } from '@/lib/data/storedFiles';
import { repFor } from '@/lib/resources/server';

/** Start an upload: { name, mime, size } → a signed R2 URL, or how many chunks to send here. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, dealId, u } = await repFor(params.id, true);
    return NextResponse.json(await startUpload(db, dealId, await req.json(), u.id));
  } catch (e) {
    return jsonError(e);
  }
}

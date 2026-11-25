import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { completeUpload } from '@/lib/data/storedFiles';
import { repFor } from '@/lib/resources/server';

export async function POST(_req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const { db, dealId } = await repFor(params.id, true);
    return NextResponse.json({ file: await completeUpload(db, dealId, Number(params.fid)) });
  } catch (e) {
    return jsonError(e);
  }
}

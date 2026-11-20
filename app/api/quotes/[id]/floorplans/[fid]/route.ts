import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deleteFloorPlan, readFloorPlan } from '@/lib/data/floorPlans';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';

/** The file itself: shown in the browser, or downloaded with ?download=1. */
export async function GET(req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    await requireApiUser();
    const f = await readFloorPlan(await getDb(), idParam(params.id), idParam(params.fid));
    const download = new URL(req.url).searchParams.get('download') === '1';
    const ascii = f.name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    return new NextResponse(f.data.buffer as ArrayBuffer, {
      headers: {
        'content-type': f.mime,
        'content-length': String(f.data.byteLength),
        'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    return jsonError(e, 404);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    need(await accessForQuote(db, idParam(params.id), user), 'inputs', 'scope');
    await deleteFloorPlan(db, idParam(params.id), idParam(params.fid));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

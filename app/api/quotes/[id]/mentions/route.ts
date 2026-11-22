import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { markMentionsRead, unreadMentions } from '@/lib/data/proposalComments';
import { requireApiUser } from '@/lib/auth/server';

/** Business case comments on this deal that @mention the user and they haven't read. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ items: await unreadMentions(await getDb(), idParam(params.id), u) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** { ids } or { all: true }: mark mentions read. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const b = (await req.json().catch(() => ({}))) as { ids?: number[]; all?: boolean };
    await markMentionsRead(await getDb(), idParam(params.id), u, b.all ? 'all' : Array.isArray(b.ids) ? b.ids : []);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

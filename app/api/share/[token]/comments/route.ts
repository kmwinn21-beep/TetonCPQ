import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { addProspectComment, linkByToken, type ProspectComment } from '@/lib/data/shareLinks';
import { listSharedThreads } from '@/lib/data/proposalComments';
import { prospectSession } from '@/lib/auth/prospect';

async function prospect(token: string) {
  const db = await getDb();
  const l = await linkByToken(db, token);
  const who = l ? await prospectSession(l) : null;
  if (!l || !who) throw Object.assign(new Error('Open the link and enter your email first'), { status: 401 });
  return { db, l, who };
}

/** The link's comment threads (the prospects' own, with the team's replies). */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l } = await prospect(params.token);
    return NextResponse.json({ threads: await listSharedThreads(db, l.versionId, l.id), people: [], me: null }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** A new comment (on a page, a section, or general) or a reply. The deal's owner is notified. */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, who } = await prospect(params.token);
    const id = await addProspectComment(db, l, who, (await req.json()) as ProspectComment);
    return NextResponse.json({ id, threads: await listSharedThreads(db, l.versionId, l.id) });
  } catch (e) {
    return jsonError(e);
  }
}

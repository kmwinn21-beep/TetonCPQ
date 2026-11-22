import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { addInputComment, listDealComments, mentionable, type NewComment } from '@/lib/data/proposalComments';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote } from '@/lib/data/access';

/** Every comment thread on the deal (inputs and business case), and the people who can be @mentioned. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const qid = idParam(params.id);
    await accessForQuote(db, qid, u);
    const [threads, people] = await Promise.all([listDealComments(db, qid, u), mentionable(db)]);
    return NextResponse.json({ threads, people, me: u.id }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** A comment on the inputs (a section or the whole deal), or a reply to one. Anyone who can open the deal. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const qid = idParam(params.id);
    await accessForQuote(db, qid, u);
    const id = await addInputComment(db, qid, (await req.json()) as NewComment & { draft?: boolean }, u);
    return NextResponse.json({ id, threads: await listDealComments(db, qid, u) });
  } catch (e) {
    return jsonError(e);
  }
}

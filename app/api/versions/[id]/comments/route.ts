import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { addComment, listComments, mentionable, type NewComment } from '@/lib/data/proposalComments';
import { requireApiUser } from '@/lib/auth/server';
import { accessForVersion } from '@/lib/data/access';

/** Every comment thread on this version's deal, and the people who can be @mentioned. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const vid = idParam(params.id);
    await accessForVersion(db, vid, u);
    const [threads, people] = await Promise.all([listComments(db, vid, u), mentionable(db)]);
    return NextResponse.json({ threads, people, me: u.id }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Anyone who can open the proposal comments (a new thread or a reply). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const vid = idParam(params.id);
    await accessForVersion(db, vid, u);
    const id = await addComment(db, vid, (await req.json()) as NewComment, u);
    return NextResponse.json({ id, threads: await listComments(db, vid, u) });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { addComment, listComments, mentionable, type NewComment } from '@/lib/data/proposalComments';
import { requireApiUser } from '@/lib/auth/server';
import { accessForVersion } from '@/lib/data/access';
import { queueProspectMail } from '@/lib/data/prospectMail';
import { baseUrlOf } from '@/lib/email/send';

/** Every comment thread on this version's deal, and the people who can be @mentioned. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const vid = idParam(params.id);
    await accessForVersion(db, vid, u);
    const [threads, people] = await Promise.all([listComments(db, vid, u), mentionable(db)]);
    // Whether the deal has a live link (comments can then be shared with the prospect).
    const link = await db.execute({ sql: 'SELECT 1 FROM share_links l JOIN quotes q ON q.deal_id = l.deal_id JOIN quote_versions v ON v.quote_id = q.id WHERE v.id = ? AND l.revoked_at IS NULL LIMIT 1', args: [vid] });
    return NextResponse.json({ threads, people, me: u.id, shareLink: link.rows.length > 0 }, { headers: { 'cache-control': 'no-store' } });
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
    // On the shared link: the prospect gets it by email (held a few minutes, batched). A failed email doesn't fail the comment.
    try {
      await queueProspectMail(db, id, baseUrlOf(req));
    } catch (e) {
      console.error('prospect email', e);
    }
    return NextResponse.json({ id, threads: await listComments(db, vid, u) });
  } catch (e) {
    return jsonError(e);
  }
}

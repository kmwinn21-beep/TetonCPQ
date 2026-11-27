import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';
import { getDealShareLink } from '@/lib/data/shareLinks';
import { sendShareEmails } from '@/lib/data/prospectMail';
import { baseUrlOf } from '@/lib/email/send';

/** Email the link: { emails } (listed ones), or everyone not emailed yet. From the signed-in rep (Reply goes to them). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    need(await accessForQuote(db, q, u), 'share');
    const b = (await req.json().catch(() => ({}))) as { emails?: string[] };
    const sent = await sendShareEmails(db, q, baseUrlOf(req), u, Array.isArray(b.emails) ? b.emails.map((e) => String(e).toLowerCase()) : undefined);
    return NextResponse.json({ sent, link: await getDealShareLink(db, q) });
  } catch (e) {
    return jsonError(e);
  }
}

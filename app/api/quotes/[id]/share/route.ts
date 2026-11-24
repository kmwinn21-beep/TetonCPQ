import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';
import { EMAIL_FROM } from '@/lib/email/send';
import { getDealShareLink, revokeShareLink, saveShareLink, type ShareLinkInput } from '@/lib/data/shareLinks';

/** The deal's shared link (null: none), for anyone who can open the deal. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    const a = await accessForQuote(db, q, u);
    const d = await db.execute({ sql: 'SELECT d.customer_name FROM deals d JOIN quotes q ON q.deal_id = d.id WHERE q.id = ?', args: [q] });
    const link = await getDealShareLink(db, q);
    // For the email preview: who it's from (the rep sending it), and when the shown version was saved.
    const vid = link?.versionId ?? Number(new URL(req.url).searchParams.get('version'));
    const v = vid ? await db.execute({ sql: 'SELECT saved_at FROM quote_versions WHERE id = ? AND quote_id = ?', args: [vid, q] }) : null;
    const preparedOn = v?.rows[0]?.saved_at ? String(v.rows[0].saved_at).slice(0, 10) : null;
    return NextResponse.json({ link, canEdit: a.deliverables, dealName: String(d.rows[0]?.customer_name ?? ''), me: { name: u.name, email: u.email }, from: EMAIL_FROM, preparedOn }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Create or change the link (Edit Deliverables). */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    need(await accessForQuote(db, q, u), 'deliverables');
    return NextResponse.json({ link: await saveShareLink(db, q, (await req.json()) as ShareLinkInput, u.id) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Turn the link off. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    need(await accessForQuote(db, q, u), 'deliverables');
    await revokeShareLink(db, q);
    return NextResponse.json({ link: null });
  } catch (e) {
    return jsonError(e);
  }
}

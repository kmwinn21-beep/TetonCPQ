import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';
import { getDealShareLink, revokeShareLink, saveShareLink, type ShareLinkInput } from '@/lib/data/shareLinks';

/** The deal's shared link (null: none), for anyone who can open the deal. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    const a = await accessForQuote(db, q, u);
    return NextResponse.json({ link: await getDealShareLink(db, q), canEdit: a.deliverables }, { headers: { 'cache-control': 'no-store' } });
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

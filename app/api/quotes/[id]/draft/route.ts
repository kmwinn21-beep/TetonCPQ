import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { getQuoteEditor, saveDraft } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, needDraftEdit } from '@/lib/data/access';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    // `tab`: this browser tab (its own saves never conflict); `force`: keep this tab's version over a newer one.
    const { draft, baseUpdatedAt, tab, force } = await req.json();
    const db = await getDb();
    const quoteId = idParam(params.id);
    // Edit Inputs may change anything; Edit Scope only room types.
    needDraftEdit(await accessForQuote(db, quoteId, user), (await getQuoteEditor(db, quoteId))?.draft ?? null, draft);
    return NextResponse.json(await saveDraft(db, quoteId, draft, force ? null : baseUpdatedAt ?? null, tab ?? null));
  } catch (e) {
    return jsonError(e);
  }
}

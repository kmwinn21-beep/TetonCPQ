import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deleteVersion, getQuoteEditor } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';

/** Delete a saved version and everything stored for it. */
export async function DELETE(_req: Request, { params }: { params: { id: string; versionId: string } }) {
  try {
    const user = await requireApiUser();
    const quoteId = idParam(params.id);
    const db = await getDb();
    need(await accessForQuote(db, quoteId, user), 'inputs');
    await deleteVersion(db, quoteId, idParam(params.versionId));
    return NextResponse.json({ editor: await getQuoteEditor(db, quoteId) });
  } catch (e) {
    return jsonError(e);
  }
}

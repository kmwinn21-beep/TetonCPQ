import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { assertDraft, getQuoteEditor, saveDraft, saveVersion } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need, needDraftEdit } from '@/lib/data/access';

/**
 * Save the current draft as a frozen version. The body carries the latest
 * draft so nothing typed since the last autosave is lost.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const quoteId = idParam(params.id);
    const { note, draft, baseUpdatedAt } = (await req.json()) as { note?: string; draft?: unknown; baseUpdatedAt?: string | null };
    const db = await getDb();
    // Saving a version: anyone who can edit the inputs or the scope (what they send must be theirs to change).
    const a = await accessForQuote(db, quoteId, user);
    need(a, 'versions');
    if (draft) {
      assertDraft(draft);
      needDraftEdit(a, (await getQuoteEditor(db, quoteId))?.draft ?? null, draft);
      await saveDraft(db, quoteId, draft, baseUpdatedAt ?? null);
    }
    const saved = await saveVersion(db, quoteId, note ?? null, user.id);
    return NextResponse.json({ ...saved, editor: await getQuoteEditor(db, quoteId) }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

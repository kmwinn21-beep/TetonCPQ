import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { assertDraft, getQuoteEditor, saveDraft, saveVersion } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';

/**
 * Save the current draft as a frozen version. The body carries the latest
 * draft so nothing typed since the last autosave is lost.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const quoteId = idParam(params.id);
    const { note, draft } = (await req.json()) as { note?: string; draft?: unknown };
    const db = await getDb();
    if (draft) {
      assertDraft(draft);
      await saveDraft(db, quoteId, draft);
    }
    const saved = await saveVersion(db, quoteId, note ?? null, user.id);
    return NextResponse.json({ ...saved, editor: await getQuoteEditor(db, quoteId) }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

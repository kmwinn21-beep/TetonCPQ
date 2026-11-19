import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { activateVersion, getQuoteEditor } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';

/** Make a saved version the active one: the draft takes its inputs. */
export async function POST(_req: Request, { params }: { params: { id: string; versionId: string } }) {
  try {
    await requireApiUser();
    const quoteId = idParam(params.id);
    const db = await getDb();
    await activateVersion(db, quoteId, idParam(params.versionId));
    return NextResponse.json({ editor: await getQuoteEditor(db, quoteId) });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { saveDraft } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiUser();
    const { draft } = await req.json();
    return NextResponse.json(await saveDraft(await getDb(), idParam(params.id), draft));
  } catch (e) {
    return jsonError(e);
  }
}

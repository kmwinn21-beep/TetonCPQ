import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { duplicateTemplate } from '@/lib/data/bcTemplates';
import { requireApiUser } from '@/lib/auth/server';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ id: await duplicateTemplate(await getDb(), idParam(params.id), u) });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { deleteTemplate, getTemplate, updateTemplate, type TemplateMeta } from '@/lib/data/bcTemplates';
import { requireApiUser } from '@/lib/auth/server';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ template: await getTemplate(await getDb(), idParam(params.id), u) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Details ({ name, persona, description, shared }) and/or content ({ edits, layout }). */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const id = idParam(params.id);
    await updateTemplate(db, id, u, (await req.json()) as TemplateMeta & { edits?: unknown; layout?: unknown });
    return NextResponse.json({ template: await getTemplate(db, id, u) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    await deleteTemplate(await getDb(), idParam(params.id), u);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

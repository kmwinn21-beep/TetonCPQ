import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { createTemplate, listTemplates, templateFromVersion, type TemplateMeta } from '@/lib/data/bcTemplates';
import { requireApiUser } from '@/lib/auth/server';
import { accessForVersion } from '@/lib/data/access';
import type { Include } from '@/lib/proposal/templates';

/** Business case templates the user can use. */
export async function GET() {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ templates: await listTemplates(await getDb(), u) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** A new template: { fromVersionId, include } saves a deal's business case; otherwise blank (or { edits, layout }). */
export async function POST(req: Request) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const b = (await req.json()) as TemplateMeta & { fromVersionId?: number; include?: Include; edits?: unknown; layout?: unknown };
    let id: number;
    if (b.fromVersionId) {
      await accessForVersion(db, Number(b.fromVersionId), u);
      id = await templateFromVersion(db, Number(b.fromVersionId), u, b, b.include, b.layout !== undefined ? { edits: b.edits, layout: b.layout } : undefined);
    } else id = await createTemplate(db, u, b, b.edits !== undefined || b.layout !== undefined ? { edits: b.edits, layout: b.layout } : undefined);
    return NextResponse.json({ id, templates: await listTemplates(db, u) });
  } catch (e) {
    return jsonError(e);
  }
}

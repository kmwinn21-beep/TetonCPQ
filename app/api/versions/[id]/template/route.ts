import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { applyTemplateToVersion } from '@/lib/data/bcTemplates';
import { requireApiUser } from '@/lib/auth/server';
import { accessForVersion, need } from '@/lib/data/access';

/** Format this version's business case from a template: { templateId, mode: 'all' | 'layout' }. Needs Edit Deliverables. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const u = await requireApiUser();
    const db = await getDb();
    const vid = idParam(params.id);
    need(await accessForVersion(db, vid, u), 'deliverables');
    const b = (await req.json()) as { templateId?: number; mode?: string };
    return NextResponse.json(await applyTemplateToVersion(db, vid, Number(b.templateId), b.mode === 'layout' ? 'layout' : 'all', u));
  } catch (e) {
    return jsonError(e);
  }
}

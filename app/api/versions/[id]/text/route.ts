import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { saveProposalCustomization } from '@/lib/data/proposalText';
import { requireApiUser } from '@/lib/auth/server';
import { accessForVersion, need } from '@/lib/data/access';

/** Save this version's proposal wording and layout (numbers are never stored here). */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    need(await accessForVersion(await getDb(), idParam(params.id), user), 'deliverables');
    const body = (await req.json()) as { edits?: unknown; layout?: unknown };
    return NextResponse.json(await saveProposalCustomization(await getDb(), idParam(params.id), body, user.id));
  } catch (e) {
    return jsonError(e);
  }
}

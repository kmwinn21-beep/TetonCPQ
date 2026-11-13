import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { saveProposalText } from '@/lib/data/proposalText';
import { requireApiUser } from '@/lib/auth/server';

/** Save the rep's wording changes to this version's proposal (numbers are never stored here). */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const { edits } = (await req.json()) as { edits?: unknown };
    return NextResponse.json({ edits: await saveProposalText(await getDb(), idParam(params.id), edits ?? {}, user.id) });
  } catch (e) {
    return jsonError(e);
  }
}

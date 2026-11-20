import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { saveProposalChanges } from '@/lib/data/whatIf';
import { requireApiUser } from '@/lib/auth/server';
import { accessForVersion, need } from '@/lib/data/access';

/** Save input changes made on this version's proposal as the deal's next version. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    // Saving what-if changes changes the deal's inputs.
    need(await accessForVersion(await getDb(), idParam(params.id), user), 'inputs');
    const { changes } = (await req.json()) as { changes?: Record<string, number | boolean | null> };
    return NextResponse.json(await saveProposalChanges(await getDb(), idParam(params.id), changes ?? {}, user.id), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

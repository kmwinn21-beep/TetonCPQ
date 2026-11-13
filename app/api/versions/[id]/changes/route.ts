import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { saveProposalChanges } from '@/lib/data/whatIf';
import { requireApiUser } from '@/lib/auth/server';

/** Save input changes made on this version's proposal as the deal's next version. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const { changes } = (await req.json()) as { changes?: Record<string, number | null> };
    return NextResponse.json(await saveProposalChanges(await getDb(), idParam(params.id), changes ?? {}, user.id), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

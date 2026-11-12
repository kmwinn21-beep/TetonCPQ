import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { markSent } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';

/** Record that this version's proposal was sent, keeping the exact HTML that was viewed. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const { sentTo, html } = (await req.json()) as { sentTo?: string; html?: string };
    return NextResponse.json(await markSent(await getDb(), idParam(params.id), sentTo ?? '', html ?? '', user.id), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

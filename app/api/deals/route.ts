import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { createDeal, listDeals } from '@/lib/data/quotes';
import { requireApiUser } from '@/lib/auth/server';

export async function GET() {
  try {
    await requireApiUser();
    return NextResponse.json(await listDeals(await getDb()));
  } catch (e) {
    return jsonError(e, 500);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const { customerName } = (await req.json()) as { customerName?: string };
    return NextResponse.json(await createDeal(await getDb(), customerName ?? '', { userId: user.id }), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

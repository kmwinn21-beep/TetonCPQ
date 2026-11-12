import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { createDeal, listDeals } from '@/lib/data/quotes';

export async function GET() {
  try {
    return NextResponse.json(await listDeals(await getDb()));
  } catch (e) {
    return jsonError(e, 500);
  }
}

export async function POST(req: Request) {
  try {
    const { customerName } = (await req.json()) as { customerName?: string };
    return NextResponse.json(await createDeal(await getDb(), customerName ?? ''), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

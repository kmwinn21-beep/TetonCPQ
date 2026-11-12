import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { changeOwnPassword } from '@/lib/data/users';
import { requireApiUser } from '@/lib/auth/server';

export async function POST(req: Request) {
  try {
    const user = await requireApiUser();
    const { current, next } = (await req.json()) as { current?: string; next?: string };
    await changeOwnPassword(await getDb(), user.id, current ?? '', next ?? '');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

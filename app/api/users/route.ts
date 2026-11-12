import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { createUser, listUsers, type Role } from '@/lib/data/users';
import { requireApiUser } from '@/lib/auth/server';

export async function GET() {
  try {
    await requireApiUser({ admin: true });
    return NextResponse.json(await listUsers(await getDb()));
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireApiUser({ admin: true });
    const b = (await req.json()) as { email?: string; name?: string; role?: Role; password?: string };
    return NextResponse.json(await createUser(await getDb(), { email: b.email ?? '', name: b.name ?? '', role: b.role ?? 'rep', password: b.password ?? '' }), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

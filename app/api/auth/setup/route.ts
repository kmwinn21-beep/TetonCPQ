import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { createFirstAdmin } from '@/lib/data/users';
import { sessionCookie, signSession } from '@/lib/auth/session';

/** Creates the first admin. Refused once any user exists. */
export async function POST(req: Request) {
  try {
    const { email, name, password } = (await req.json()) as { email?: string; name?: string; password?: string };
    const user = await createFirstAdmin(await getDb(), { email: email ?? '', name: name ?? '', password: password ?? '' });
    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.cookies.set(sessionCookie(await signSession({ uid: user.id, role: user.role })));
    return res;
  } catch (e) {
    return jsonError(e);
  }
}

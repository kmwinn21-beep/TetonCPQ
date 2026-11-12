import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { authenticate } from '@/lib/data/users';
import { clearFailures, recordFailure, tooManyAttempts } from '@/lib/auth/server';
import { sessionCookie, signSession } from '@/lib/auth/session';

export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    const key = `${(email ?? '').trim().toLowerCase()}|${req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'}`;
    if (tooManyAttempts(key)) return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
    const user = await authenticate(await getDb(), email ?? '', password ?? '');
    if (!user) {
      recordFailure(key);
      return NextResponse.json({ error: 'Email or password is incorrect' }, { status: 401 });
    }
    clearFailures(key);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(sessionCookie(await signSession({ uid: user.id, role: user.role })));
    return res;
  } catch (e) {
    return jsonError(e, 500);
  }
}

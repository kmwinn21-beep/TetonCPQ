import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { checkAccess, linkByToken } from '@/lib/data/shareLinks';
import { recordFailure, tooManyAttempts } from '@/lib/auth/server';
import { prospectCookie } from '@/lib/auth/prospect';

/**
 * A prospect opens a shared link: { email, code?, name? }. Their email has to be one the rep listed (and the code
 * match, when the link needs one). Sets their cookie for this link.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const b = (await req.json().catch(() => ({}))) as { email?: string; code?: string; name?: string };
    const key = `share|${params.token}|${req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'}`;
    if (tooManyAttempts(key)) return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 });
    const l = await linkByToken(await getDb(), params.token);
    if (!l) return NextResponse.json({ error: 'This link doesn’t exist.' }, { status: 404 });
    const email = String(b.email ?? '').trim().toLowerCase();
    const r = checkAccess(l, email, b.code);
    if (r === 'revoked') return NextResponse.json({ error: 'This link has been turned off.', state: r }, { status: 403 });
    if (r === 'expired') return NextResponse.json({ error: 'This link has expired.', state: r }, { status: 403 });
    if (r !== 'ok') {
      recordFailure(key);
      return NextResponse.json(
        { error: r === 'email' ? `That email doesn’t have access to this proposal. Check the spelling, or ask ${l.ownerName} to add it.` : 'That code doesn’t match. Check it and try again.', state: r },
        { status: 403 },
      );
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(await prospectCookie(l, { email, name: String(b.name ?? '').trim().slice(0, 80) || null }));
    return res;
  } catch (e) {
    return jsonError(e);
  }
}

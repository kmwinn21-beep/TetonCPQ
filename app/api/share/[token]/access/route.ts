import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { checkAccess, linkByToken } from '@/lib/data/shareLinks';
import { checkSignInCode, sendSignInCode } from '@/lib/data/prospectMail';
import { recordFailure, tooManyAttempts } from '@/lib/auth/server';
import { prospectCookie } from '@/lib/auth/prospect';
import { baseUrlOf } from '@/lib/email/send';

/**
 * A prospect opens a shared link: { email, name? }. Their email has to be one the rep listed. When the link verifies
 * emails, a 6-digit code goes to that email first ({ needCode: true }); then { email, code } signs them in. Sets their
 * cookie for this link.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const b = (await req.json().catch(() => ({}))) as { email?: string; code?: string; name?: string; resend?: boolean };
    const key = `share|${params.token}|${req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'}`;
    if (tooManyAttempts(key)) return NextResponse.json({ error: 'Too many tries. Wait 15 minutes and try again.' }, { status: 429 });
    const db = await getDb();
    const l = await linkByToken(db, params.token);
    if (!l) return NextResponse.json({ error: 'This link doesn’t exist.' }, { status: 404 });
    const email = String(b.email ?? '').trim().toLowerCase();
    const r = checkAccess(l, email);
    if (r === 'revoked') return NextResponse.json({ error: 'This link has been turned off.', state: r }, { status: 403 });
    if (r === 'expired') return NextResponse.json({ error: 'This link has expired.', state: r }, { status: 403 });
    if (r === 'email') {
      recordFailure(key);
      return NextResponse.json({ error: `That email doesn’t have access to this proposal. Check the spelling, or ask ${l.ownerName} to add it.`, state: r }, { status: 403 });
    }
    if (l.verifyEmail) {
      const code = String(b.code ?? '').replace(/\s/g, '');
      if (!code || b.resend) {
        await sendSignInCode(db, l, email, baseUrlOf(req));
        return NextResponse.json({ needCode: true, sentTo: email });
      }
      if (!(await checkSignInCode(db, l, email, code))) {
        recordFailure(key);
        return NextResponse.json({ error: 'That code doesn’t match, or it has expired. Check it, or send a new one.', state: 'code' }, { status: 403 });
      }
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(await prospectCookie(l, { email, name: String(b.name ?? '').trim().slice(0, 80) || l.people.find((p) => p.email === email)?.name || null }));
    return res;
  } catch (e) {
    return jsonError(e);
  }
}

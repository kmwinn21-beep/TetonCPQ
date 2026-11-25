import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { getDb } from '@/lib/db/client';
import { linkByToken } from '@/lib/data/shareLinks';
import { prospectSession } from '@/lib/auth/prospect';
import { getVersion } from '@/lib/data/quotes';
import { agreementInfo, requestAgreement, type AgreementInput } from '@/lib/data/agreements';
import { agreementEmail, firstNameOf } from '@/lib/email/templates';
import { baseUrlOf, mailer } from '@/lib/email/send';

async function prospect(token: string) {
  const db = await getDb();
  const l = await linkByToken(db, token);
  const who = l ? await prospectSession(l) : null;
  if (!l || !who || l.revoked || l.expiresOn < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Open the link and enter your email first'), { status: 401 });
  return { db, l, who };
}

/** What the agreement form shows (the deal's details now), and whether they've asked already. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, who } = await prospect(params.token);
    return NextResponse.json({ ...(await agreementInfo(db, l, who.email)), me: who.email.toLowerCase(), team: !!who.team, ownerName: l.ownerName, ownerEmail: l.ownerEmail }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Ask for the agreement: saves their corrections to the deal, and tells the deal's owner (in the app and by email). */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, who } = await prospect(params.token);
    if (who.team) return NextResponse.json({ error: 'You’re viewing as the Teton team. Only the prospect can request the agreement.' }, { status: 403 });
    const input = (await req.json()) as AgreementInput;
    const email = who.email.toLowerCase();
    // Their name: from their sign-in, the rep's list, or the signatory when that's them.
    const sigIn = input.signatory?.value;
    const sigName = (s: { first?: string; last?: string; email?: string } | null | undefined) => (s && String(s.email ?? '').toLowerCase() === email ? `${s.first ?? ''} ${s.last ?? ''}`.trim() : '');
    const before = await agreementInfo(db, l, email);
    const name = who.name || l.people.find((p) => p.email === email)?.name || sigName(sigIn) || sigName(before.signatory) || null;
    const { payload } = await requestAgreement(db, l, { email, name }, input);
    const first = firstNameOf(name, email);
    const whoLabel = name || email;
    if (l.ownerEmail) {
      const v = await getVersion(db, l.versionId);
      const base = baseUrlOf(req);
      const msg = agreementEmail({ baseUrl: base, url: `${base}/quotes/${v?.quoteId ?? ''}`, who: whoLabel, first, dealName: l.dealName, ownerName: l.ownerName, payload });
      await mailer()
        .send({ fromName: 'Teton Proposals', to: l.ownerEmail, replyTo: email, ...msg })
        .catch((e) => console.error('agreement email not sent', e));
    }
    return NextResponse.json({ ok: true, payload, me: email, ...(await agreementInfo(db, l, email)) });
  } catch (e) {
    return jsonError(e);
  }
}

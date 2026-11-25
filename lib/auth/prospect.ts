/**
 * A prospect's access to a shared proposal link: a signed cookie per link, set once their email (and the code, when
 * the link needs one) matched. Every request re-checks it against the link as it is now: still on, not expired, the
 * email still listed, the same code. Not an app login: it opens that one link only.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { jwtVerify, SignJWT } from 'jose';
import { checkAccess, daysLeft, isTeamEmail, isoDay, type PublicLink } from '@/lib/data/shareLinks';

const MAX_AGE = 60 * 60 * 24 * 30; // 30 days (and never past the link's expiry)
export const prospectCookieName = (linkId: number) => `teton_p${linkId}`;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
  return new TextEncoder().encode(s);
}
/** Sessions note whether the link wanted an emailed code then: turning it on later asks everyone again. */
const codeTag = (l: Pick<PublicLink, 'verifyEmail'>) => (l.verifyEmail ? 'v' : '');

export interface ProspectSession {
  email: string;
  name: string | null;
  /** The deal's owner or a collaborator viewing the link (not a prospect). */
  team?: boolean;
}

export async function prospectCookie(l: PublicLink, who: ProspectSession) {
  const days = Math.max(1, Math.min(30, daysLeft(l.expiresOn, isoDay()) + 1));
  const token = await new SignJWT({ lid: l.id, em: who.email, nm: who.name ?? '', ct: codeTag(l) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${Math.min(MAX_AGE, days * 86400)}s`)
    .sign(secret());
  return {
    name: prospectCookieName(l.id),
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    path: '/',
    maxAge: Math.min(MAX_AGE, days * 86400),
  };
}

/** The prospect signed in to this link, if their cookie still matches it. */
export async function prospectSession(l: PublicLink): Promise<ProspectSession | null> {
  const raw = cookies().get(prospectCookieName(l.id))?.value;
  if (!raw) return null;
  try {
    const { payload } = await jwtVerify(raw, secret(), { algorithms: ['HS256'] });
    if (Number(payload.lid) !== l.id || String(payload.ct ?? '') !== codeTag(l)) return null;
    const email = String(payload.em ?? '');
    // The code (if any) was checked when the cookie was made: here, the link's state and the email.
    if (checkAccess(l, email) !== 'ok') return null;
    return { email, name: payload.nm ? String(payload.nm) : null, team: isTeamEmail(l, email) };
  } catch {
    return null;
  }
}

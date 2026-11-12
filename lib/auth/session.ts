/**
 * Session tokens: a signed JWT in an httpOnly cookie. Edge-safe (used by
 * middleware), so no database access here — lib/auth/server.ts re-checks the
 * user is still active on every request.
 */
import { jwtVerify, SignJWT } from 'jose';

export const SESSION_COOKIE = 'teton_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export interface SessionClaims {
  uid: number;
  role: string;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters');
  return new TextEncoder().encode(s);
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(claims.uid))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    const uid = Number(payload.sub);
    if (!Number.isInteger(uid) || uid <= 0) return null;
    return { uid, role: String(payload.role ?? 'rep') };
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  };
}

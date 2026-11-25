/** Shared bits for the Resources API routes: who's asking, and the deal they're asking about. */
import { getDb } from '@/lib/db/client';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';
import { linkByToken } from '@/lib/data/shareLinks';
import { prospectSession } from '@/lib/auth/prospect';
import { dealOfQuote } from '@/lib/data/dealRooms';

/** A signed-in user who can open the deal (edit: Edit Deliverables). */
export async function repFor(quoteParam: string, edit = false) {
  const u = await requireApiUser();
  const db = await getDb();
  const quoteId = Number(quoteParam);
  if (!Number.isInteger(quoteId) || quoteId <= 0) throw Object.assign(new Error('Bad id'), { status: 400 });
  const a = await accessForQuote(db, quoteId, u);
  if (edit) need(a, 'deliverables');
  const d = await dealOfQuote(db, quoteId);
  return { u, db, quoteId, a, ...d };
}

/** A prospect signed in to a shared link that's still open. */
export async function prospectFor(token: string) {
  const db = await getDb();
  const l = await linkByToken(db, token);
  const who = l ? await prospectSession(l) : null;
  if (!l || !who || l.revoked || l.expiresOn < new Date().toISOString().slice(0, 10)) throw Object.assign(new Error('Open the link and enter your email first'), { status: 401 });
  return { db, l, who };
}

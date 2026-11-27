import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { AuthError, requireAllowed, requireApiUser } from '@/lib/auth/server';
import { reaches } from '@/lib/auth/permissions';
import { accessForQuote } from '@/lib/data/access';
import { duplicateDeal, duplicateInfo, type DuplicateOptions } from '@/lib/data/duplicateDeal';
import type { User } from '@/lib/auth/roles';

/** Duplicating needs Duplicate deals on this deal and Create deals. */
async function check(db: Awaited<ReturnType<typeof getDb>>, quoteId: number, user: User) {
  const a = await accessForQuote(db, quoteId, user);
  if (!reaches(user, 'deal.duplicate', { isOwner: a.isOwner, collaboratorSwitch: a.isCollaborator })) throw new AuthError('You don’t have permission to duplicate this deal', 403);
  requireAllowed(user, 'deal.create');
}

/** What the duplicate dialog shows: the deal, its versions, what can come along. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    await check(db, q, user);
    return NextResponse.json(await duplicateInfo(db, q), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Duplicate it: { name, from: 'active' | 'draft' | versionId, room, questions }. Returns the new deal's ids. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const q = idParam(params.id);
    await check(db, q, user);
    const b = (await req.json()) as DuplicateOptions;
    return NextResponse.json(await duplicateDeal(db, q, user.id, b), { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}

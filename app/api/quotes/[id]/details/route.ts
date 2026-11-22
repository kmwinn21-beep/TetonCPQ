import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { idParam, jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote, need } from '@/lib/data/access';
import { getDealDetails, saveDealDetails } from '@/lib/data/dealDetails';

/** The deal's details (null until filled in). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const a = await accessForQuote(db, idParam(params.id), user);
    return NextResponse.json({ details: await getDealDetails(db, a.dealId) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Save the whole set of details (the HubSpot link is required). Needs Edit Inputs. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireApiUser();
    const db = await getDb();
    const a = await accessForQuote(db, idParam(params.id), user);
    need(a, 'inputs');
    return NextResponse.json({ details: await saveDealDetails(db, a.dealId, await req.json()) });
  } catch (e) {
    return jsonError(e);
  }
}

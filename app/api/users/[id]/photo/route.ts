import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { getProfilePhoto } from '@/lib/data/profiles';

/** A user's profile photo. Public: prospects see it on shared links and in emails. Cached by its ?v= version. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const p = await getProfilePhoto(await getDb(), Number(params.id));
  if (!p) return new NextResponse(null, { status: 404 });
  return new NextResponse(p.data as unknown as BodyInit, { headers: { 'content-type': p.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

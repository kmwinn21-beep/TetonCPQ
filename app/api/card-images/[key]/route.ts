import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { readCardImage } from '@/lib/data/cardImages';

/** A saved card image. Public (prospects see it on cards); the key is unguessable and the bytes never change. */
export async function GET(_req: Request, { params }: { params: { key: string } }) {
  const img = await readCardImage(await getDb(), params.key);
  if (!img) return new NextResponse(null, { status: 404 });
  return new NextResponse(img.data as unknown as BodyInit, { headers: { 'content-type': img.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
}

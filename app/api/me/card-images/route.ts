import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { deleteCardImage, listCardImages, saveCardImage } from '@/lib/data/cardImages';

/** Your saved card images. */
export async function GET() {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ images: await listCardImages(await getDb(), u.id) });
  } catch (e) {
    return jsonError(e);
  }
}

/** Save one: the body is the (already resized) image; ?name= is its file name. */
export async function POST(req: Request) {
  try {
    const u = await requireApiUser();
    const data = new Uint8Array(await req.arrayBuffer());
    const name = new URL(req.url).searchParams.get('name') ?? 'Image';
    return NextResponse.json({ image: await saveCardImage(await getDb(), u.id, { name, mime: req.headers.get('content-type') ?? '', data }) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const u = await requireApiUser();
    await deleteCardImage(await getDb(), u.id, new URL(req.url).searchParams.get('key') ?? '');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

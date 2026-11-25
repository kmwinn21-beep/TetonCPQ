import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { setProfilePhoto } from '@/lib/data/profiles';

/** Your photo: the body is the (already resized) image. */
export async function PUT(req: Request) {
  try {
    const u = await requireApiUser();
    const data = new Uint8Array(await req.arrayBuffer());
    return NextResponse.json({ profile: await setProfilePhoto(await getDb(), u.id, { data, mime: req.headers.get('content-type') ?? '' }) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE() {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ profile: await setProfilePhoto(await getDb(), u.id, null) });
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { jsonError } from '@/lib/db/server';
import { requireApiUser } from '@/lib/auth/server';
import { getProfile, saveProfile } from '@/lib/data/profiles';

export async function GET() {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ profile: await getProfile(await getDb(), u.id) });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const u = await requireApiUser();
    return NextResponse.json({ profile: await saveProfile(await getDb(), u.id, await req.json()) });
  } catch (e) {
    return jsonError(e);
  }
}

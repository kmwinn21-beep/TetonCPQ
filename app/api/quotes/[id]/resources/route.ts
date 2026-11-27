import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { getVersion } from '@/lib/data/quotes';
import { floorPlanInfo, getRoom, listResources, saveRoom } from '@/lib/data/dealRooms';
import { listProfiles } from '@/lib/data/profiles';
import { getDealShareLink } from '@/lib/data/shareLinks';
import { r2Configured } from '@/lib/storage/r2';
import { repFor } from '@/lib/resources/server';

/** The Resources tab for the editor: settings, cards, people to pick from, and the deal's floor plans with their scope. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { u, db, quoteId, a, dealId, ownerId, customer, activeVersionId } = await repFor(params.id);
    const link = await getDealShareLink(db, quoteId);
    const vid = link?.versionId ?? (Number(new URL(req.url).searchParams.get('version')) || activeVersionId);
    const v = vid ? await getVersion(db, vid) : null;
    return NextResponse.json(
      {
        settings: await getRoom(db, dealId, ownerId),
        resources: await listResources(db, dealId),
        profiles: await listProfiles(db),
        plans: v && v.quoteId === quoteId ? await floorPlanInfo(db, quoteId, v.inputs) : [],
        customer,
        me: u.id,
        ownerId,
        canEdit: a.room,
        r2: r2Configured(),
        hasLink: !!link,
      },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (e) {
    return jsonError(e);
  }
}

/** Change the settings (tab name, Your Team page, sections). */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, quoteId } = await repFor(params.id, true);
    return NextResponse.json({ settings: await saveRoom(db, quoteId, await req.json()) });
  } catch (e) {
    return jsonError(e);
  }
}

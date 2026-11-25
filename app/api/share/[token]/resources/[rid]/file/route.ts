import { jsonError } from '@/lib/db/server';
import { listResources, logEvent } from '@/lib/data/dealRooms';
import { fileResponse, readFile } from '@/lib/data/storedFiles';
import { prospectFor } from '@/lib/resources/server';

/**
 * A card's file (or ?f= a file in one of its blocks), to view or (?dl=1, when the card allows it) download. Downloads
 * are recorded.
 */
export async function GET(req: Request, { params }: { params: { token: string; rid: string } }) {
  try {
    const { db, l, who } = await prospectFor(params.token);
    const r = (await listResources(db, l.dealId)).find((x) => x.id === Number(params.rid) && !x.hidden);
    if (!r) throw Object.assign(new Error('Not found'), { status: 404 });
    const q = new URL(req.url).searchParams;
    const blockFile = Number(q.get('f'));
    const fileId = blockFile ? r.blocks.flatMap((b) => ('fileId' in b && b.fileId === blockFile ? [blockFile] : []))[0] : r.file?.id;
    if (!fileId) throw Object.assign(new Error('Not found'), { status: 404 });
    const dl = q.get('dl') === '1' && (r.allowDownload || !!blockFile);
    if (dl && !who.team) await logEvent(db, l, who.email, { target: 'item', resourceId: r.id, kind: 'download', detail: blockFile ? 'attachment' : null });
    return fileResponse(await readFile(db, l.dealId, fileId, { download: dl }), req, dl);
  } catch (e) {
    return jsonError(e, 404);
  }
}

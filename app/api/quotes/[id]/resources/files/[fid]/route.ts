import { jsonError } from '@/lib/db/server';
import { fileResponse, readFile } from '@/lib/data/storedFiles';
import { repFor } from '@/lib/resources/server';

/** A file for the team (view, or ?dl=1 to download). */
export async function GET(req: Request, { params }: { params: { id: string; fid: string } }) {
  try {
    const { db, dealId } = await repFor(params.id);
    const dl = new URL(req.url).searchParams.get('dl') === '1';
    return fileResponse(await readFile(db, dealId, Number(params.fid), { download: dl }), req, dl);
  } catch (e) {
    return jsonError(e, 404);
  }
}

import { jsonError } from '@/lib/db/server';
import { docxResponse, teamActor } from '@/lib/agreement/server';
import { finalFile, roundFile } from '@/lib/data/agreementDocs';

/** A round's Word file (?round=ID, &decisions=1 for Teton's decisions applied), or ?final=1. */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, dealId, actor } = await teamActor(params.id);
    const q = new URL(req.url).searchParams;
    if (q.get('final')) return docxResponse(await finalFile(db, dealId));
    return docxResponse(await roundFile(db, dealId, actor, Number(q.get('round')), q.get('decisions') === '1'));
  } catch (e) {
    return jsonError(e);
  }
}

import { jsonError } from '@/lib/db/server';
import { docxResponse, prospectActor } from '@/lib/agreement/server';
import { finalFile, getAgreement, roundFile } from '@/lib/data/agreementDocs';

/** A round's Word file (?round=ID) or the final (?final=1), for people with agreement access. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, actor } = await prospectActor(params.token);
    if (actor.level === 'none') throw Object.assign(new Error('You don’t have access to the agreement'), { status: 403 });
    const q = new URL(req.url).searchParams;
    if (q.get('final')) {
      const v = await getAgreement(db, l.dealId, actor);
      if (!v.final) throw Object.assign(new Error('The agreement isn’t final yet'), { status: 404 });
      return docxResponse(await finalFile(db, l.dealId));
    }
    return docxResponse(await roundFile(db, l.dealId, actor, Number(q.get('round'))));
  } catch (e) {
    return jsonError(e);
  }
}

import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { teamActor } from '@/lib/agreement/server';
import { addNote, agreementNotes, decideAll, decideChange, deleteUnsentRound, finalBlockers, getAgreement, markFinal, markSigned, removePerson, reopen, saveSettings, sendTetonRound, setPerson } from '@/lib/data/agreementDocs';

/** The agreement for Teton: rounds, changes, notes (Teton-only too), people, activity, and what this user can do. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, dealId, actor } = await teamActor(params.id);
    const [view, notes, blockers] = await Promise.all([getAgreement(db, dealId, actor), agreementNotes(db, dealId, actor), finalBlockers(db, dealId)]);
    const shared = (await db.execute({ sql: 'SELECT COUNT(*) AS n FROM share_links WHERE deal_id = ? AND revoked_at IS NULL', args: [dealId] })).rows[0].n;
    return NextResponse.json({ view, notes, blockers, caps: actor.caps, shared: Number(shared) > 0 }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Actions: send, decide, decideAll, note, final, reopen, signed, person, removePerson, settings, deleteRound. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { db, dealId, actor } = await teamActor(params.id);
    const b = (await req.json()) as Record<string, unknown>;
    switch (b.action) {
      case 'send':
        await sendTetonRound(db, dealId, actor);
        break;
      case 'decide':
        await decideChange(db, dealId, actor, Number(b.changeId), b.decision ?? null);
        break;
      case 'decideAll':
        await decideAll(db, dealId, actor, Number(b.roundId), b.decision === 'rejected' ? 'rejected' : 'accepted');
        break;
      case 'note':
        await addNote(db, dealId, actor, b);
        break;
      case 'final':
        await markFinal(db, dealId, actor, { versionMatches: b.versionMatches });
        break;
      case 'reopen':
        await reopen(db, dealId, actor);
        break;
      case 'signed':
        await markSigned(db, dealId, actor);
        break;
      case 'person':
        await setPerson(db, dealId, actor, b);
        break;
      case 'removePerson':
        await removePerson(db, dealId, actor, b.email);
        break;
      case 'settings':
        await saveSettings(db, dealId, actor, (b.settings ?? {}) as Record<string, unknown>);
        break;
      case 'deleteRound':
        await deleteUnsentRound(db, dealId, actor);
        break;
      default:
        throw Object.assign(new Error('Unknown action'), { status: 400 });
    }
    const [view, notes, blockers] = await Promise.all([getAgreement(db, dealId, actor), agreementNotes(db, dealId, actor), finalBlockers(db, dealId)]);
    return NextResponse.json({ view, notes, blockers, caps: actor.caps });
  } catch (e) {
    return jsonError(e);
  }
}

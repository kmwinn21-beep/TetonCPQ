import { NextResponse } from 'next/server';
import { jsonError } from '@/lib/db/server';
import { prospectActor } from '@/lib/agreement/server';
import { acceptTetonRound, addNote, agreementNotes, deleteUnsentRound, getAgreement, invite, removePerson, sendProspectRound } from '@/lib/data/agreementDocs';

/** The agreement for the prospect: sent rounds (and theirs waiting), shared notes, people, and what they can do. */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, actor, person, who } = await prospectActor(params.token);
    if (actor.level === 'none' && !who.team) return NextResponse.json({ access: false, tabs: { proposal: person.showProposal, resources: person.showResources } });
    const view = await getAgreement(db, l.dealId, actor);
    if (!view.rounds.some((r) => r.side === 'teton' && r.sent)) return NextResponse.json({ access: true, ready: false, me: actor, tabs: { proposal: person.showProposal, resources: person.showResources } });
    return NextResponse.json({ access: true, ready: true, view, notes: await agreementNotes(db, l.dealId, actor), me: actor, team: !!who.team, tabs: { proposal: person.showProposal, resources: person.showResources } }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return jsonError(e);
  }
}

/** Actions: send (lead), accept (lead), note (comment+), invite / remove (signatory), deleteRound (redline+). */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const { db, l, actor, who } = await prospectActor(params.token);
    if (who.team) throw Object.assign(new Error('You’re viewing as the Teton team: open the agreement from the deal to work on it.'), { status: 403 });
    const b = (await req.json()) as Record<string, unknown>;
    switch (b.action) {
      case 'send':
        await sendProspectRound(db, l.dealId, actor);
        break;
      case 'accept':
        await acceptTetonRound(db, l.dealId, actor);
        break;
      case 'note':
        await addNote(db, l.dealId, actor, b);
        break;
      case 'invite':
        await invite(db, l.dealId, actor, b);
        break;
      case 'removePerson':
        await removePerson(db, l.dealId, actor, b.email);
        break;
      case 'deleteRound':
        await deleteUnsentRound(db, l.dealId, actor);
        break;
      default:
        throw Object.assign(new Error('Unknown action'), { status: 400 });
    }
    return NextResponse.json({ view: await getAgreement(db, l.dealId, actor), notes: await agreementNotes(db, l.dealId, actor) });
  } catch (e) {
    return jsonError(e);
  }
}

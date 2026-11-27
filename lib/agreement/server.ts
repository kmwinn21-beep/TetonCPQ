/** Who's asking about a deal's agreement: a Teton user (with their matrix abilities) or a prospect on the link. */
import { getDb } from '@/lib/db/client';
import { requireApiUser } from '@/lib/auth/server';
import { accessForQuote } from '@/lib/data/access';
import { prospectFor } from '@/lib/resources/server';
import { prospectAccess, teamCaps, type Actor } from '@/lib/data/agreementDocs';

const forbidden = (m: string) => Object.assign(new Error(m), { status: 403 });

export async function teamActor(quoteParam: string) {
  const u = await requireApiUser();
  const db = await getDb();
  const quoteId = Number(quoteParam);
  if (!Number.isInteger(quoteId) || quoteId <= 0) throw Object.assign(new Error('Bad id'), { status: 400 });
  const a = await accessForQuote(db, quoteId, u);
  const caps = teamCaps(u, a);
  if (!caps.view) throw forbidden('You don’t have permission to see this agreement');
  const actor: Extract<Actor, { kind: 'team' }> = { kind: 'team', id: u.id, name: u.name, caps };
  return { db, dealId: a.dealId, quoteId, actor, access: a };
}

/** The Teton team looking at the link read the agreement only. */
export async function prospectActor(token: string) {
  const { db, l, who } = await prospectFor(token);
  const p = await prospectAccess(db, l.dealId, who.email);
  const actor: Extract<Actor, { kind: 'prospect' }> = { kind: 'prospect', email: who.email.toLowerCase(), name: who.name ?? p.name, level: who.team ? 'view' : p.level, signatory: !who.team && p.signatory };
  return { db, l, who, person: p, actor };
}

/** A Word file as a download. */
export function docxResponse(f: { name: string; data: Uint8Array }) {
  return new Response(new Blob([f.data as BlobPart]), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      'cache-control': 'no-store',
    },
  });
}

/** An uploaded Word file sent as the request body (?name=…). */
export async function uploadedDocx(req: Request): Promise<{ name: string; data: Uint8Array }> {
  const name = new URL(req.url).searchParams.get('name') || 'agreement.docx';
  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.byteLength) throw Object.assign(new Error('Pick a Word file first'), { status: 400 });
  return { name, data };
}

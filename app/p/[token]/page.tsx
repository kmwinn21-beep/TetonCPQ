import type { Metadata } from 'next';
import { getDb } from '@/lib/db/client';
import { getVersion, getVersionLines, loadPriceBook } from '@/lib/data/quotes';
import { buildPriceLines } from '@/lib/pricing/lines';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { getProposalCustomization } from '@/lib/data/proposalText';
import { daysLeft, EXPIRY_WARNING_DAYS, linkByToken, linkState, recordOpen } from '@/lib/data/shareLinks';
import { prospectSession } from '@/lib/auth/prospect';
import { markSeen } from '@/lib/data/prospectMail';
import { ProspectClosed, ProspectGate } from '@/components/share/ProspectGate';
import { ProspectView } from '@/components/share/ProspectView';
import { prospectAccess } from '@/lib/data/agreementDocs';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const l = await linkByToken(await getDb(), params.token);
  return { title: l ? `Proposal for ${l.dealName} — Teton` : 'Proposal — Teton', robots: { index: false, follow: false } };
}

/**
 * A proposal shared with a prospect: the email gate (and code, when the link needs one), then the proposal itself,
 * read-only, with comments if the rep allowed them.
 */
export default async function SharedProposalPage({ params }: { params: { token: string } }) {
  const db = await getDb();
  const l = await linkByToken(db, params.token);
  if (!l) return <ProspectClosed reason="missing" ownerName="" ownerEmail="" />;
  const state = linkState(l);
  if (state !== 'ok') return <ProspectClosed reason={state} ownerName={l.ownerName} ownerEmail={l.ownerEmail} expiresOn={l.expiresOn} />;
  const who = await prospectSession(l);
  if (!who) return <ProspectGate token={l.token} dealName={l.dealName} ownerName={l.ownerName} ownerEmail={l.ownerEmail} needsCode={l.verifyEmail} />;

  const v = await getVersion(db, l.versionId);
  if (!v || !v.outputs) return <ProspectClosed reason="missing" ownerName={l.ownerName} ownerEmail={l.ownerEmail} />;
  let lines = await getVersionLines(db, v.id, v.inputs.communities.map((c) => c.name || 'Unnamed community'));
  if (!lines.length) lines = buildPriceLines(v.inputs, toModelInputs(v.inputs), (await loadPriceBook(db)).book);
  const custom = await getProposalCustomization(db, v.id);
  // The deal's owner and collaborators can look too; their visits aren't the prospect's.
  if (!who.team) {
    await recordOpen(db, l, who.email);
    await markSeen(db, l, who.email).catch(() => {});
  }
  const left = daysLeft(l.expiresOn);
  // Their access can hide the proposal (e.g. outside counsel a signatory invited sees the agreement only).
  const hideProposal = !who.team && !(await prospectAccess(db, l.dealId, who.email)).showProposal;
  return (
    <ProspectView
      token={l.token}
      versionId={v.id}
      quoteId={v.quoteId}
      versionNo={v.versionNo}
      savedAt={v.savedAt}
      draft={hideProposal ? null : v.inputs}
      outputs={hideProposal ? null : v.outputs}
      lines={hideProposal ? [] : lines}
      edits={hideProposal ? {} : custom.edits}
      layout={custom.layout}
      dealName={l.dealName}
      team={!!who.team}
      ownerName={l.ownerName}
      email={who.email}
      allowComments={l.allowComments && !who.team}
      allowPdf={l.allowPdf}
      expiresOn={l.expiresOn}
      expiryWarning={left <= EXPIRY_WARNING_DAYS ? left : null}
    />
  );
}

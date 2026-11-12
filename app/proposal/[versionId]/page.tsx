import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getVersion, getVersionLines, listExports, loadPriceBook } from '@/lib/data/quotes';
import { buildPriceLines } from '@/lib/pricing/lines';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { ProposalDocument } from '@/components/proposal/ProposalDocument';
import { ProposalToolbar } from '@/components/proposal/ProposalToolbar';

export const dynamic = 'force-dynamic';

async function load(raw: string) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const db = await getDb();
  const v = await getVersion(db, id);
  // Proposals come from saved versions only — never from a draft that can still change.
  if (!v || v.status === 'draft' || !v.outputs) return null;
  let lines = await getVersionLines(db, id, v.inputs.communities.map((c) => c.name || 'Unnamed community'));
  // Versions saved before price lines were stored: rebuild them from the version's own inputs.
  if (!lines.length) lines = buildPriceLines(v.inputs, toModelInputs(v.inputs), (await loadPriceBook(db)).book);
  const history = await listExports(db, id);
  return { id, v, lines, history };
}

export async function generateMetadata({ params }: { params: { versionId: string } }): Promise<Metadata> {
  const d = await load(params.versionId);
  return { title: d ? `Teton proposal — ${d.v.inputs.customerName} (v${d.v.versionNo})` : 'Proposal' };
}

export default async function ProposalPage({ params }: { params: { versionId: string } }) {
  const d = await load(params.versionId);
  if (!d) notFound();
  const { id, v, lines, history } = d;
  return (
    <div className="proposal-page min-h-screen bg-teton-almost-white print:bg-white">
      <ProposalToolbar versionId={id} quoteId={v.quoteId} versionNo={v.versionNo} status={v.status} sentTo={v.sentTo} sentAt={v.sentAt} history={history} />
      <ProposalDocument draft={v.inputs} outputs={v.outputs!} lines={lines} versionNo={v.versionNo} savedAt={v.savedAt} />
    </div>
  );
}

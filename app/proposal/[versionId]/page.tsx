import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getQuoteEditor, getVersion, getVersionLines, listExports, loadPriceBook } from '@/lib/data/quotes';
import { diffDrafts } from '@/lib/quote/diff';
import { buildPriceLines } from '@/lib/pricing/lines';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { ProposalDocument } from '@/components/proposal/ProposalDocument';
import { ProposalToolbar } from '@/components/proposal/ProposalToolbar';
import { getSessionUser, requirePageUser } from '@/lib/auth/server';
import { getProposalCustomization } from '@/lib/data/proposalText';
import { ProposalTextProvider } from '@/components/proposal/EditableText';
import { RemovedPanel, ValueLabelsProvider } from '@/components/proposal/ProposalSections';

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
  // Changes in the current draft that this saved version doesn't include (e.g. a pilot ticked since).
  const editor = await getQuoteEditor(db, v.quoteId);
  const pending = editor ? diffDrafts(v.inputs, editor.draft).length : 0;
  const newer = editor ? editor.versions.filter((x) => x.versionNo > v.versionNo).length : 0;
  const custom = await getProposalCustomization(db, id);
  return { id, v, lines, history, pending, newer, custom };
}

export async function generateMetadata({ params }: { params: { versionId: string } }): Promise<Metadata> {
  if (!(await getSessionUser())) return { title: 'Proposal' };
  const d = await load(params.versionId);
  return { title: d ? `Teton proposal — ${d.v.inputs.customerName} (v${d.v.versionNo})` : 'Proposal' };
}

export default async function ProposalPage({ params }: { params: { versionId: string } }) {
  await requirePageUser();
  const d = await load(params.versionId);
  if (!d) notFound();
  const { id, v, lines, history, pending, newer, custom } = d;
  return (
    <div className="proposal-page min-h-screen bg-teton-almost-white print:bg-white">
      {/* Wording is editable on screen; numbers come from the saved version and aren't. */}
      <ProposalTextProvider versionId={id} initial={custom.edits} initialLayout={custom.layout}>
        <ValueLabelsProvider>
          <ProposalToolbar versionId={id} quoteId={v.quoteId} versionNo={v.versionNo} status={v.status} sentTo={v.sentTo} sentAt={v.sentAt} sentBy={v.sentByName} history={history} pendingChanges={pending} newerVersions={newer} />
          <div className="relative max-w-[8.5in] mx-auto">
            {/* Removed sections and figures, to add back: beside the page on wide screens, above it otherwise. */}
            <div className="no-print px-4 pt-4 2xl:p-0 2xl:absolute 2xl:right-full 2xl:top-6 2xl:mr-6 2xl:w-56 2xl:h-full">
              <div className="2xl:sticky 2xl:top-24">
                <RemovedPanel />
              </div>
            </div>
            <ProposalDocument draft={v.inputs} outputs={v.outputs!} lines={lines} versionNo={v.versionNo} savedAt={v.savedAt} />
          </div>
        </ValueLabelsProvider>
      </ProposalTextProvider>
    </div>
  );
}

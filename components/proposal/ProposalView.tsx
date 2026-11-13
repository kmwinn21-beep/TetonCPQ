'use client';

/**
 * The proposal screen: toolbar, Removed panel and the document, rendered from
 * the saved version or, while a rep is changing inputs, from a preview of it.
 */
import type { PriceLine } from '@/lib/pricing/lines';
import type { Product } from '@/lib/pricing/catalog';
import type { QuoteDraft } from '@/lib/quote/draft';
import type { StoredOutputs } from '@/lib/quote/outputs';
import { ProposalDocument } from './ProposalDocument';
import { ProposalToolbar, type SentRecord } from './ProposalToolbar';
import { RemovedPanel } from './ProposalSections';
import { WhatIfWorkspace } from './WhatIf';

export function ProposalView(p: {
  versionId: number;
  quoteId: number;
  versionNo: number;
  nextVersionNo: number;
  status: string;
  sentTo: string | null;
  sentAt: string | null;
  sentBy: string | null;
  savedAt: string | null;
  history: SentRecord[];
  pendingChanges: number;
  newerVersions: number;
  draft: QuoteDraft;
  outputs: StoredOutputs;
  lines: PriceLine[];
  products: Product[];
}) {
  return (
    <WhatIfWorkspace
      versionId={p.versionId}
      versionNo={p.versionNo}
      nextVersionNo={p.nextVersionNo}
      pendingDealChanges={p.pendingChanges}
      draft={p.draft}
      outputs={p.outputs}
      lines={p.lines}
      products={p.products}
    >
      {(data, banner) => (
        <>
          <ProposalToolbar
            versionId={p.versionId}
            quoteId={p.quoteId}
            versionNo={p.versionNo}
            status={p.status}
            sentTo={p.sentTo}
            sentAt={p.sentAt}
            sentBy={p.sentBy}
            history={p.history}
            pendingChanges={p.pendingChanges}
            newerVersions={p.newerVersions}
            banner={banner}
          />
          <div className="relative max-w-[8.5in] mx-auto">
            {/* Removed sections and figures, to add back: beside the page on wide screens, above it otherwise. */}
            <div className="no-print px-4 pt-4 2xl:p-0 2xl:absolute 2xl:right-full 2xl:top-6 2xl:mr-6 2xl:w-56 2xl:h-full">
              <div className="2xl:sticky 2xl:top-24">
                <RemovedPanel />
              </div>
            </div>
            <ProposalDocument draft={data.draft} outputs={data.outputs} lines={data.lines} versionNo={p.versionNo} savedAt={p.savedAt} />
          </div>
        </>
      )}
    </WhatIfWorkspace>
  );
}

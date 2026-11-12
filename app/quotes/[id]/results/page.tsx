import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getQuoteEditor, getVersion } from '@/lib/data/quotes';
import { ResultsView } from '@/components/results/ResultsView';

export const dynamic = 'force-dynamic';

/** Results for the current draft, or — with ?v=<versionId> — exactly what a saved version contained. */
export default async function ResultsPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string } }) {
  const quoteId = Number(params.id);
  if (!Number.isInteger(quoteId) || quoteId <= 0) notFound();
  const db = await getDb();
  const editor = await getQuoteEditor(db, quoteId);
  if (!editor) notFound();

  let version = null;
  if (searchParams.v) {
    const v = await getVersion(db, Number(searchParams.v));
    if (!v || v.quoteId !== quoteId || v.status === 'draft') notFound();
    version = v;
  }

  return (
    <ResultsView
      quoteId={quoteId}
      draft={version ? version.inputs : editor.draft}
      stored={version ? { versionNo: version.versionNo, savedAt: version.savedAt, note: version.changeNote, engineVersion: version.engineVersion, outputs: version.outputs, guardrails: version.guardrails } : null}
      versions={editor.versions}
      draftVersionNo={editor.draftVersionNo}
      products={editor.products}
    />
  );
}

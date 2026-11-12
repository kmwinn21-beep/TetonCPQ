import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getQuoteEditor, getVersion } from '@/lib/data/quotes';
import { ResultsView } from '@/components/results/ResultsView';

export const dynamic = 'force-dynamic';

/** Results for the current draft, or — with ?v=<versionId> — exactly what a saved version contained. */
export default async function ResultsPage({ params, searchParams }: { params: { id: string }; searchParams: { v?: string; compare?: string } }) {
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

  // Compare against: ?compare=<id>, else the previous saved version (or the latest one, for the draft).
  const others = editor.versions.filter((x) => x.id !== version?.id);
  const defaultCompare = version ? others.find((x) => x.versionNo < version.versionNo) : others[0];
  const compareId = searchParams.compare ? Number(searchParams.compare) : defaultCompare?.id;
  let compare = null;
  if (compareId) {
    const c = await getVersion(db, compareId);
    if (c && c.quoteId === quoteId && c.outputs) compare = { id: c.id, versionNo: c.versionNo, savedAt: c.savedAt, inputs: c.inputs, outputs: c.outputs };
  }

  return (
    <ResultsView
      versionId={version?.id ?? null}
      compare={compare}
      quoteId={quoteId}
      draft={version ? version.inputs : editor.draft}
      stored={version ? { versionNo: version.versionNo, savedAt: version.savedAt, note: version.changeNote, engineVersion: version.engineVersion, outputs: version.outputs, guardrails: version.guardrails } : null}
      versions={editor.versions}
      draftVersionNo={editor.draftVersionNo}
      products={editor.products}
    />
  );
}

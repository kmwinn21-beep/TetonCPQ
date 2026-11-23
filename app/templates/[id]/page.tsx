import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getTemplate } from '@/lib/data/bcTemplates';
import { getQuoteEditor, getVersion, getVersionLines, listDeals, loadPriceBook } from '@/lib/data/quotes';
import { requirePageUser } from '@/lib/auth/server';
import { computeOutputs } from '@/lib/quote/outputs';
import { sampleDraft } from '@/lib/quote/sampleDraft';
import { buildPriceLines } from '@/lib/pricing/lines';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { TemplateEditor } from '@/components/templates/TemplateEditor';

export const dynamic = 'force-dynamic';

/** The template editor: the business case laid out by this template, with sample figures or a real deal's. */
export default async function TemplatePage({ params, searchParams }: { params: { id: string }; searchParams: { deal?: string } }) {
  const user = await requirePageUser();
  const db = await getDb();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const template = await getTemplate(db, id, user).catch(() => null);
  if (!template) notFound();
  const { book } = await loadPriceBook(db);
  // Deals with a saved version, for the Preview data picker.
  const deals = (await listDeals(db, user.id)).filter((d) => d.savedVersions > 0).map((d) => ({ quoteId: d.quoteId, name: d.customerName }));

  // Preview figures: the chosen deal's active version, or the sample deal.
  let preview = null as null | { source: number | null; draft: Awaited<ReturnType<typeof sampleDraft>>; outputs: ReturnType<typeof computeOutputs>['outputs']; lines: ReturnType<typeof computeOutputs>['lines'] };
  const dealId = Number(searchParams.deal);
  if (dealId) {
    const ed = await getQuoteEditor(db, dealId);
    const v = ed?.activeVersionId ? await getVersion(db, ed.activeVersionId) : null;
    if (v?.outputs) {
      let lines = await getVersionLines(db, v.id, v.inputs.communities.map((c) => c.name || 'Unnamed community'));
      if (!lines.length) lines = buildPriceLines(v.inputs, toModelInputs(v.inputs), book);
      preview = { source: dealId, draft: v.inputs, outputs: v.outputs, lines };
    }
  }
  if (!preview) {
    const draft = sampleDraft(book);
    const { outputs, lines } = computeOutputs(draft, book);
    preview = { source: null, draft, outputs, lines };
  }
  return <TemplateEditor template={template} deals={deals} preview={preview} />;
}

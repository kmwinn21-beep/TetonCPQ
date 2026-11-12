import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getQuoteEditor } from '@/lib/data/quotes';
import { QuoteEditor } from '@/components/quote/QuoteEditor';
import { requirePageUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export default async function QuotePage({ params }: { params: { id: string } }) {
  await requirePageUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const data = await getQuoteEditor(await getDb(), id);
  if (!data) notFound();
  return <QuoteEditor initial={data} />;
}

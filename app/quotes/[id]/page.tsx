import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getQuoteEditor } from '@/lib/data/quotes';
import { QuoteEditor } from '@/components/quote/QuoteEditor';
import { requirePageUser } from '@/lib/auth/server';
import { accessForQuote } from '@/lib/data/access';

export const dynamic = 'force-dynamic';

export default async function QuotePage({ params }: { params: { id: string } }) {
  const user = await requirePageUser();
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const db = await getDb();
  const data = await getQuoteEditor(db, id);
  if (!data) notFound();
  return <QuoteEditor initial={data} access={await accessForQuote(db, id, user)} />;
}

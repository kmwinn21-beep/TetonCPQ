import { getDb } from '@/lib/db/client';
import { listDeals } from '@/lib/data/quotes';
import { requirePageUser } from '@/lib/auth/server';
import { DealsModule } from '@/components/deals/DealsModule';

export const dynamic = 'force-dynamic';

export default async function DealsPage({ searchParams }: { searchParams: { view?: string; reason?: string; archived?: string } }) {
  const user = await requirePageUser();
  const deals = await listDeals(await getDb(), user.id);
  const justArchived = searchParams.archived ? deals.find((d) => d.archived && String(d.quoteId) === searchParams.archived) : undefined;
  return <DealsModule deals={deals} userId={user.id} archivedView={searchParams.view === 'archived'} reason={searchParams.reason} justArchived={justArchived} />;
}

import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { listDeals } from '@/lib/data/quotes';
import { count, dateLabel } from '@/lib/format';
import { NewDealButton } from '@/components/quote/NewDealButton';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const deals = await listDeals(await getDb());
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Deals</h1>
          <p className="text-sm text-teton-ui-gray">Every proposal, with every version that was saved.</p>
        </div>
        <NewDealButton />
      </div>
      {deals.length === 0 ? (
        <div className="card text-center py-12">
          <p className="font-medium">No deals yet</p>
          <p className="text-sm text-teton-ui-gray mt-1">Start one to build the ROI case and proposal.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-teton-almost-white text-left text-xs text-teton-dark-gray">
              <tr>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium text-right">Communities</th>
                <th className="px-4 py-2.5 font-medium text-right">Beds</th>
                <th className="px-4 py-2.5 font-medium text-right">Saved versions</th>
                <th className="px-4 py-2.5 font-medium">Last change</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.dealId} className="border-t border-teton-off-white hover:bg-teton-almost-white">
                  <td className="px-4 py-3">
                    <Link href={`/quotes/${d.quoteId}`} className="font-medium hover:underline">
                      {d.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{count(d.communities)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{count(d.beds)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{d.savedVersions}</td>
                  <td className="px-4 py-3 text-teton-ui-gray">{dateLabel(d.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

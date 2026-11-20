import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { listDeals, type DealSummary } from '@/lib/data/quotes';
import { count, dateLabel } from '@/lib/format';
import { NewDealButton } from '@/components/quote/NewDealButton';
import { requirePageUser } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

const PERM_PILLS = [
  ['inputs', 'Edit Inputs', 'bg-[#E5EEFC] text-[#2B5BB5]'],
  ['scope', 'Edit Scope', 'bg-[#E6F4EC] text-[#2B7A4B]'],
  ['deliverables', 'Edit Deliverables', 'bg-[#FFF1DC] text-[#8A5A00]'],
] as const;

function Perms({ d }: { d: DealSummary }) {
  if (!d.myPerms) return null;
  const on = PERM_PILLS.filter(([k]) => d.myPerms?.[k]);
  return (
    <span className="flex flex-wrap gap-1 mt-1">
      {on.length ? on.map(([k, label, tone]) => <span key={k} className={`rounded-full px-1.5 py-px text-[10px] font-bold ${tone}`}>{label}</span>) : <span className="rounded-full px-1.5 py-px text-[10px] font-bold bg-teton-almost-white text-teton-ui-gray">View only</span>}
    </span>
  );
}

/** One group of deals: cards on phones, a table on wider screens. */
function DealGroup({ title, note, deals, empty }: { title: string; note?: string; deals: DealSummary[]; empty?: string }) {
  return (
    <section className="mb-8">
      <h2 className="flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider text-teton-dark-gray">
        {title}
        <span className="rounded-full bg-teton-off-white px-1.5 py-px text-[10px] text-teton-ui-gray">{deals.length}</span>
        {note && <span className="normal-case tracking-normal font-normal text-teton-ui-gray">· {note}</span>}
      </h2>
      {deals.length === 0 ? (
        <p className="card text-sm text-teton-ui-gray py-4">{empty}</p>
      ) : (
        <>
          <ul className="sm:hidden space-y-2">
            {deals.map((d) => (
              <li key={d.dealId}>
                <Link href={`/quotes/${d.quoteId}`} className="block rounded-xl border border-teton-off-white bg-white px-4 py-3 shadow-sm active:bg-teton-almost-white">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-base leading-snug">{d.customerName}</span>
                    <span className="text-xs text-teton-ui-gray whitespace-nowrap">{dateLabel(d.updatedAt)}</span>
                  </span>
                  <span className="block text-sm text-teton-dark-gray mt-0.5">
                    {count(d.communities)} {d.communities === 1 ? 'community' : 'communities'} · {count(d.beds)} beds · {d.savedVersions} {d.savedVersions === 1 ? 'version' : 'versions'}
                  </span>
                  {d.ownerName && <span className="block text-xs text-teton-ui-gray mt-0.5">{d.ownerName}</span>}
                  <Perms d={d} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block card p-0 overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-teton-almost-white text-left text-xs text-teton-dark-gray">
                <tr>
                  <th className="px-4 py-2.5 font-medium w-[34%]">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
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
                      <Perms d={d} />
                    </td>
                    <td className="px-4 py-3 text-teton-dark-gray">{d.ownerName ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(d.communities)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(d.beds)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.savedVersions}</td>
                    <td className="px-4 py-3 text-teton-ui-gray">{dateLabel(d.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default async function DealsPage() {
  const user = await requirePageUser();
  const deals = await listDeals(await getDb(), user.id);
  // Deals you own, then ones you collaborate on, then everything else (most recently changed first throughout).
  const mine = deals.filter((d) => d.ownerId === user.id);
  const shared = deals.filter((d) => d.ownerId !== user.id && d.myPerms);
  const others = deals.filter((d) => d.ownerId !== user.id && !d.myPerms);
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
        <>
          <DealGroup title="Your deals" deals={mine} empty="You haven’t created a deal yet. Start one with New deal." />
          {shared.length > 0 && <DealGroup title="Shared with you" note="you’re a collaborator" deals={shared} />}
          <DealGroup title="All deals" note={`most recently changed first${user.role === 'admin' ? '' : ' · view only'}`} deals={others} empty="No other deals." />
        </>
      )}
    </div>
  );
}

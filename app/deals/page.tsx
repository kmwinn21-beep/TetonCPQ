import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { listDeals, type DealSummary } from '@/lib/data/quotes';
import { count, dateLabel } from '@/lib/format';
import { NewDealButton } from '@/components/quote/NewDealButton';
import { DealTasksBadge } from '@/components/quote/DealTasksBadge';
import { requirePageUser } from '@/lib/auth/server';
import { ArchivedToast } from '@/components/quote/ArchivedToast';
import { REASON_LABELS, REASON_TONE, reasonLabel } from '@/components/quote/archiveReasons';

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

/** A deal's open tasks: a round count (blue when there are some, red when any is overdue, grey at 0); hover lists them. */
const TaskCount = ({ d }: { d: DealSummary }) => <DealTasksBadge quoteId={d.quoteId} open={d.openTasks} overdue={d.overdueTasks} />;
const eyebrow = 'text-[9.5px] font-extrabold uppercase tracking-[1px] text-teton-ui-gray';

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
                  {/* Top: the deal's name, and Open Tasks with its count on the right. Bottom: owner and date. */}
                  <span className="flex items-start gap-3">
                    <span className="block min-w-0 flex-1">
                      <span className="block font-semibold text-base leading-snug">{d.customerName}</span>
                      <AgreementTag d={d} />
                      <Perms d={d} />
                    </span>
                    <span className="flex flex-col items-center gap-1 flex-shrink-0">
                      <span className={`${eyebrow} whitespace-nowrap leading-6`}>Open Tasks</span>
                      <TaskCount d={d} />
                    </span>
                  </span>
                  <span className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-teton-ui-gray">
                    <span className="truncate">{d.ownerName ?? ''}</span>
                    <span className="whitespace-nowrap">{dateLabel(d.updatedAt)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden sm:block card p-0 overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-teton-almost-white text-left text-xs text-teton-dark-gray">
                <tr>
                  <th className="px-4 py-2.5 font-medium w-[28%]">Customer</th>
                  <th className="px-4 py-2.5 font-medium">Owner</th>
                  <th className="px-4 py-2.5 font-medium text-right">Communities</th>
                  <th className="px-4 py-2.5 font-medium text-right">Beds</th>
                  <th className="px-4 py-2.5 font-medium text-right">Saved versions</th>
                  <th className="px-4 py-2.5 font-medium w-32">Last change</th>
                  <th className={`px-4 py-2.5 w-28 text-center ${eyebrow}`}>Open Tasks</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.dealId} className="border-t border-teton-off-white hover:bg-teton-almost-white">
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${d.quoteId}`} className="font-medium hover:underline">
                        {d.customerName}
                      </Link>
                      <AgreementTag d={d} />
                      <Perms d={d} />
                    </td>
                    <td className="px-4 py-3 text-teton-dark-gray">{d.ownerName ?? '—'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(d.communities)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{count(d.beds)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.savedVersions}</td>
                    <td className="px-4 py-3 text-teton-ui-gray">{dateLabel(d.updatedAt)}</td>
                    <td className="px-4 py-2 text-center">
                      <TaskCount d={d} />
                    </td>
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

export default async function DealsPage({ searchParams }: { searchParams: { view?: string; reason?: string; archived?: string } }) {
  const user = await requirePageUser();
  const all = await listDeals(await getDb(), user.id);
  const archivedDeals = all.filter((d) => d.archived);
  const viewArchived = searchParams.view === 'archived';
  const deals = all.filter((d) => !d.archived);
  const justArchived = searchParams.archived ? archivedDeals.find((d) => String(d.quoteId) === searchParams.archived) : undefined;
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
        <div className="flex flex-wrap items-center gap-3">
          <ViewTabs archived={viewArchived} active={deals.length} archivedCount={archivedDeals.length} />
          <NewDealButton />
        </div>
      </div>
      {justArchived && <ArchivedToast quoteId={justArchived.quoteId} name={justArchived.customerName} reason={reasonLabel(justArchived.archived!.reason)} />}
      {viewArchived ? (
        <ArchivedList deals={archivedDeals} reason={searchParams.reason} />
      ) : deals.length === 0 ? (
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

/** A prospect asked for the agreement and it hasn't been marked sent. */
function AgreementTag({ d }: { d: DealSummary }) {
  if (!d.agreementRequested) return null;
  return (
    <span className="mt-1 flex w-fit items-center gap-1 rounded-full bg-[#FDE3DD] px-2 py-0.5 text-[10.5px] font-bold text-[#B23A26] whitespace-nowrap">
      <span className="w-[7px] h-[7px] rounded-full bg-[#E5484D] animate-[agPulse_1.6s_ease-out_infinite] motion-reduce:animate-none" aria-hidden="true" />
      Agreement requested
    </span>
  );
}

/** Active | Archived, with counts (links, so the view survives a reload and the back button). */
function ViewTabs({ archived, active, archivedCount }: { archived: boolean; active: number; archivedCount: number }) {
  const tab = (on: boolean) => `h-8 px-3.5 inline-flex items-center gap-1.5 rounded-[8px] text-[13px] transition-colors duration-200 ${on ? 'bg-white text-teton-ink font-semibold shadow-sm' : 'text-teton-dark-gray hover:text-teton-ink'}`;
  const cnt = (on: boolean) => `min-w-[20px] h-[18px] px-1.5 rounded-full text-[11px] font-bold grid place-items-center ${on ? 'bg-teton-ink text-white' : 'bg-[#DAD6CE] text-[#4E5562]'}`;
  return (
    <nav aria-label="Deal views" className="inline-flex rounded-[11px] bg-[#E7E5E0] p-[3px]">
      <Link href="/deals" aria-current={!archived ? 'page' : undefined} className={tab(!archived)}>
        Active <span className={cnt(!archived)}>{active}</span>
      </Link>
      <Link href="/deals?view=archived" aria-current={archived ? 'page' : undefined} className={tab(archived)}>
        Archived <span className={cnt(archived)}>{archivedCount}</span>
      </Link>
    </nav>
  );
}

const archivedOn = (at: string) => dateLabel(at.slice(0, 10));

/** Archived deals: why and when, filterable by reason. */
function ArchivedList({ deals, reason }: { deals: DealSummary[]; reason?: string }) {
  const counts = new Map<string, number>();
  deals.forEach((d) => counts.set(d.archived!.reason, (counts.get(d.archived!.reason) ?? 0) + 1));
  const shown = reason ? deals.filter((d) => d.archived!.reason === reason) : deals;
  const chip = (on: boolean) => `h-8 px-3 inline-flex items-center rounded-full border text-[12.5px] transition-colors ${on ? 'bg-teton-ink text-white border-teton-ink' : 'bg-white border-[#D3D6DA] hover:bg-teton-almost-white'}`;
  const Pill = ({ r }: { r: string }) => <span className={`inline-flex h-[22px] items-center rounded-[7px] px-2 text-[11.5px] font-semibold whitespace-nowrap ${REASON_TONE[r] ?? REASON_TONE.other}`}>{reasonLabel(r)}</span>;
  if (!deals.length)
    return (
      <div className="card text-center py-12">
        <p className="font-medium">No archived deals</p>
        <p className="text-sm text-teton-ui-gray mt-1">Archive a deal from its ⋮ menu when it’s won, lost or done with. It moves here, read-only.</p>
      </div>
    );
  return (
    <section>
      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by reason">
        <Link href="/deals?view=archived" className={chip(!reason)}>All reasons</Link>
        {Object.keys(REASON_LABELS)
          .filter((r) => counts.get(r))
          .map((r) => (
            <Link key={r} href={`/deals?view=archived&reason=${r}`} className={chip(reason === r)}>
              {REASON_LABELS[r]} · {counts.get(r)}
            </Link>
          ))}
      </div>
      <ul className="sm:hidden space-y-2">
        {shown.map((d) => (
          <li key={d.dealId}>
            <Link href={`/quotes/${d.quoteId}`} className="block rounded-xl border border-teton-off-white bg-white px-4 py-3 shadow-sm active:bg-teton-almost-white">
              <span className="flex items-start justify-between gap-3">
                <span className="font-semibold leading-snug">{d.customerName}</span>
                <Pill r={d.archived!.reason} />
              </span>
              {d.archived!.note && <span className="block mt-1 text-[13px] text-teton-dark-gray">{d.archived!.note}</span>}
              <span className="block mt-1.5 text-xs text-teton-ui-gray">Archived {archivedOn(d.archived!.at)}{d.archived!.by ? ` · ${d.archived!.by}` : ''}</span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block card p-0 overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <thead className="bg-teton-almost-white text-left text-xs text-teton-dark-gray">
            <tr>
              <th className="px-4 py-2.5 font-medium w-[26%]">Customer</th>
              <th className="px-4 py-2.5 font-medium w-[13%]">Owner</th>
              <th className="px-4 py-2.5 font-medium w-[15%]">Reason</th>
              <th className="px-4 py-2.5 font-medium">Note</th>
              <th className="px-4 py-2.5 font-medium w-[12%] text-right">Saved versions</th>
              <th className="px-4 py-2.5 font-medium w-[17%]">Archived</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.dealId} className="border-t border-teton-off-white hover:bg-teton-almost-white text-teton-dark-gray">
                <td className="px-4 py-3">
                  <Link href={`/quotes/${d.quoteId}`} className="font-medium text-teton-ink hover:underline">{d.customerName}</Link>
                </td>
                <td className="px-4 py-3">{d.ownerName ?? '—'}</td>
                <td className="px-4 py-3"><Pill r={d.archived!.reason} /></td>
                <td className="px-4 py-3 truncate" title={d.archived!.note ?? undefined}>{d.archived!.note ?? '—'}</td>
                <td className="px-4 py-3 text-right tabular-nums">{d.savedVersions}</td>
                <td className="px-4 py-3 text-teton-ui-gray">{archivedOn(d.archived!.at)}{d.archived!.by ? ` · ${d.archived!.by}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

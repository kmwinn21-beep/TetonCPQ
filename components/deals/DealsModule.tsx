'use client';

/**
 * The Deals page in the price book's layout: views and groups on the left, the deals in collapsible groups in the
 * middle (scrolling without a scrollbar, with section dots), and a collapsible quick-look panel on the right. Deal and
 * owner show as initials (the owner's name on hover, or tap on phones); a blue bubble on the deal's initials counts
 * comments by others since you last opened it. Phones get chips and cards instead of the side panels.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { DealSummary } from '@/lib/data/quotes';
import type { DealGlance } from '@/lib/data/dealGlance';
import { count, dateLabel } from '@/lib/format';
import { ScrollPanel } from '@/components/share/ProspectNovelty';
import { usePhone } from '@/components/form/SwipeSheet';
import { Collapse } from '@/components/form/fields';
import { NewDealButton } from '@/components/quote/NewDealButton';
import { ArchivedToast } from '@/components/quote/ArchivedToast';
import { REASON_LABELS, REASON_TONE, reasonLabel } from '@/components/quote/archiveReasons';

type Group = 'mine' | 'shared' | 'others';
const TINTS = ['bg-[#EEEBFB] text-[#6E5BD0]', 'bg-[#E4F4EC] text-[#2F8F5B]', 'bg-[#E6F1FC] text-[#2F78C8]', 'bg-[#F7EEDC] text-[#A7741E]', 'bg-[#FDECE8] text-[#D0563D]', 'bg-[#E0F3F2] text-[#23847E]', 'bg-[#FCE7F0] text-[#B8457A]'];
const tint = (s: string) => TINTS[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % TINTS.length];
const initials = (s: string | null | undefined) =>
  (s ?? '?')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?';
const when = (iso: string) => {
  const d = iso.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  return d === today ? 'Today' : dateLabel(d).replace(/, \d{4}$/, (m) => (d.slice(0, 4) === today.slice(0, 4) ? '' : m));
};

export function DealsModule({ deals, userId, archivedView, reason, justArchived }: { deals: DealSummary[]; userId: number; archivedView: boolean; reason?: string; justArchived?: DealSummary }) {
  const phone = usePhone();
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [sel, setSel] = useState<number | null>(null);
  // Starts collapsed on every visit; picking a deal opens it.
  const [panelOpen, setPanelOpen] = useState(false);
  const [shut, setShut] = useState<Set<Group>>(new Set());
  const active = deals.filter((d) => !d.archived);
  const archived = deals.filter((d) => d.archived);
  const groupOf = (d: DealSummary): Group => (d.ownerId === userId ? 'mine' : d.myPerms ? 'shared' : 'others');
  const match = (d: DealSummary) => !q || d.customerName.toLowerCase().includes(q.trim().toLowerCase());
  const list = (archivedView ? archived : active).filter(match);
  const groups: Array<{ key: Group; title: string; note: string; deals: DealSummary[] }> = [
    { key: 'mine' as const, title: 'Your deals', note: 'you own these' },
    { key: 'shared' as const, title: 'Shared with you', note: 'you’re a collaborator' },
    { key: 'others' as const, title: 'All deals', note: 'other reps’ deals · view only' },
  ]
    .map((g) => ({ ...g, deals: list.filter((d) => groupOf(d) === g.key) }))
    .filter((g) => (group === 'all' ? g.deals.length || g.key === 'mine' : g.key === group));
  const selected = deals.find((d) => d.quoteId === sel) ?? null;
  const counts = { mine: active.filter((d) => groupOf(d) === 'mine').length, shared: active.filter((d) => groupOf(d) === 'shared').length, others: active.filter((d) => groupOf(d) === 'others').length };
  const newTotal = active.reduce((s, d) => s + d.newComments.count, 0);
  const newDeals = active.filter((d) => d.newComments.count).length;
  const agreements = active.filter((d) => d.agreementRequested);

  const tiles = (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 mb-5">
      <Tile label="Active deals" value={String(active.length)} note={`${counts.mine} yours · ${counts.shared} shared · ${counts.others} other`} />
      <Tile label="Beds in play" value={count(active.reduce((s, d) => s + d.beds, 0))} note={`across ${count(active.reduce((s, d) => s + d.communities, 0))} communities`} />
      <Tile label="New comments" value={String(newTotal)} note={newTotal ? `on ${newDeals} ${newDeals === 1 ? 'deal' : 'deals'}` : 'you’re caught up'} />
      <Tile label="Agreements requested" value={String(agreements.length)} note={agreements.length ? agreements.map((d) => d.customerName).slice(0, 2).join(', ') : 'none open'} tone={agreements.length ? 'red' : undefined} />
    </div>
  );

  const body = archivedView ? (
    <ArchivedTable deals={list} reason={reason} />
  ) : (
    <>
      {groups.map((g) => {
        const open = !shut.has(g.key);
        return (
          <section key={g.key} className="mb-3.5 rounded-[14px] border border-[#ECE8DF] bg-white overflow-hidden">
            <button
              type="button"
              data-nv-sec
              aria-expanded={open}
              onClick={() => setShut((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}
              className={`w-full flex items-center gap-2.5 h-[42px] px-4 bg-[#FBFAF7] text-left ${open ? 'border-b border-[#ECE8DF]' : ''}`}
            >
              <svg className={`w-3 h-3 text-[#8A919C] transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7 4l7 6-7 6z" /></svg>
              <span className="text-[11px] font-bold uppercase tracking-[.14em] text-[#4E5562]">{g.title}</span>
              <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-[#E9E5DC] text-[11px] font-semibold text-[#4E5562] grid place-items-center">{g.deals.length}</span>
              <span className="max-sm:hidden text-[12px] text-[#6B7380]">{g.note}</span>
            </button>
            <Collapse open={open}>
              {g.deals.length === 0 ? (
                <p className="px-4 py-4 text-[13px] text-[#6B7380]">{g.key === 'mine' ? 'You haven’t created a deal yet. Start one with New deal.' : 'None.'}</p>
              ) : phone ? (
                <ul>{g.deals.map((d) => <DealCard key={d.dealId} d={d} />)}</ul>
              ) : (
                <div role="table" aria-label={g.title}>
                  <div role="row" className="grid grid-cols-[36px_minmax(0,1fr)_64px_80px_96px_56px] gap-3.5 items-center px-4 h-9 border-b border-[#F1EEE7] text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#8A919C]">
                    <span /><span>Deal</span><span>Owner</span><span className="text-right">Beds</span><span>Last change</span><span className="text-center">Tasks</span>
                  </div>
                  {g.deals.map((d) => (
                    <DealRow key={d.dealId} d={d} selected={sel === d.quoteId} onSelect={() => (setSel(d.quoteId), setPanelOpen(true))} />
                  ))}
                </div>
              )}
            </Collapse>
          </section>
        );
      })}
      {!list.length && q && <p className="text-[13px] text-[#6B7380]">No deals match “{q}”.</p>}
    </>
  );

  const header = (
    <div data-nv-sec>
      <h1 className="text-[22px] font-bold tracking-tight">{archivedView ? 'Archived deals' : 'Active deals'}</h1>
      <p className="text-[13px] text-[#6B7380] mt-0.5">{archivedView ? 'Read-only, with why and when they were archived.' : 'Every proposal, with every version that was saved. Most recently changed first.'}</p>
      {!archivedView && tiles}
    </div>
  );

  if (phone)
    return (
      <div className="-m-4 bg-[#FBF8F3] min-h-full text-teton-ink">
        <div className="flex items-center gap-2 px-4 pt-4 pb-2">
          <b className="text-[19px] flex-1">Deals</b>
          <NewDealButton />
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-4 py-2.5 bg-[#F6F3EE] border-y border-[#ECE8DF] no-scrollbar">
          <Chip href="/deals" on={!archivedView && group === 'all'} onClick={() => setGroup('all')}>Active · {active.length}</Chip>
          {!archivedView && <Chip on={group === 'mine'} onClick={() => setGroup('mine')}>Yours · {counts.mine}</Chip>}
          {!archivedView && <Chip on={group === 'shared'} onClick={() => setGroup('shared')}>Shared · {counts.shared}</Chip>}
          <Chip href="/deals?view=archived" on={archivedView}>Archived · {archived.length}</Chip>
        </div>
        <div className="px-4 pt-3 pb-10">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals…" aria-label="Search deals" className="mb-3 h-10 w-full rounded-[10px] border border-[#E4E0D6] bg-white px-3 text-[14px] outline-none focus:border-[#3F8CEA]" />
          {header}
          {body}
        </div>
        {justArchived && <ArchivedToast quoteId={justArchived.quoteId} name={justArchived.customerName} reason={reasonLabel(justArchived.archived!.reason)} />}
      </div>
    );

  const navRow = (on: boolean) => `w-full flex items-center gap-2.5 h-9 px-2.5 rounded-[10px] text-[13px] text-left transition-colors ${on ? 'bg-white shadow-[0_0_0_1px_#E4E0D6] font-semibold' : 'hover:bg-white/70'}`;
  return (
    <div className="-m-4 lg:-m-6 flex h-[calc(100%+2rem)] lg:h-[calc(100%+3rem)] bg-[#FBF8F3] text-teton-ink">
      {/* Left: views and groups */}
      <aside className="w-[244px] flex-shrink-0 border-r border-[#ECE8DF] bg-[#F6F3EE] px-3.5 pt-5">
        <p className="text-[17px] font-bold px-1">Deals</p>
        <p className="text-[12px] text-[#6B7380] px-1 mt-0.5">{active.length} active · {archived.length} archived</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search deals…" aria-label="Search deals" className="mt-3.5 h-9 w-full rounded-[10px] border border-[#E4E0D6] bg-white px-3 text-[12.5px] outline-none focus:border-[#3F8CEA]" />
        <p className="mt-5 mb-2 px-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C]">View</p>
        <Link href="/deals" className={navRow(!archivedView)}>
          <NavTile cls="bg-[#E6F1FC] text-[#2F78C8]">≡</NavTile>
          <span className="flex-1">Active</span>
          <Count dark={!archivedView}>{active.length}</Count>
        </Link>
        <Link href="/deals?view=archived" className={`${navRow(archivedView)} mt-0.5`}>
          <NavTile cls="bg-[#EFEDE8] text-[#6B6458]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" /></svg>
          </NavTile>
          <span className="flex-1">Archived</span>
          <Count dark={archivedView}>{archived.length}</Count>
        </Link>
        {!archivedView && (
          <>
            <p className="mt-5 mb-2 px-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C]">Groups</p>
            {(
              [
                ['mine', 'Your deals', counts.mine, 'bg-[#EEEBFB] text-[#6E5BD0]', 'Me'],
                ['shared', 'Shared with you', counts.shared, 'bg-[#E0F3F2] text-[#23847E]', '⇄'],
                ['others', 'All deals', counts.others, 'bg-[#F7EEDC] text-[#A7741E]', '◎'],
              ] as const
            ).map(([k, l, n, cls, ic]) => (
              <button key={k} type="button" onClick={() => setGroup(group === k ? 'all' : k)} aria-pressed={group === k} className={`${navRow(group === k)} mt-0.5`}>
                <NavTile cls={cls}>{ic}</NavTile>
                <span className="flex-1">{l}</span>
                <Count>{n}</Count>
              </button>
            ))}
            {group !== 'all' && (
              <button type="button" onClick={() => setGroup('all')} className="mt-2 px-2.5 text-[12px] font-semibold text-[#2F78C8]">Show all groups</button>
            )}
          </>
        )}
      </aside>

      {/* Middle: the deals */}
      <main className="flex-1 min-w-0 flex flex-col">
        <div className="h-[60px] flex-shrink-0 flex items-center gap-3 px-6 border-b border-[#ECE8DF]">
          <p className="flex-1 text-[12.5px] text-[#6B7380]">Sales / <b className="text-teton-ink">Deals</b></p>
          <NewDealButton />
        </div>
        <div className="flex-1 min-h-0">
          <ScrollPanel names={['Overview', ...groups.map((g) => g.title)]} fade="#FBF8F3">
            <div className="pl-6 pr-12 pt-5 pb-12">
              {header}
              {body}
            </div>
          </ScrollPanel>
        </div>
      </main>

      {/* Right: the quick look (collapsible) */}
      {!archivedView && (panelOpen ? <Glance d={selected} onCollapse={() => setPanelOpen(false)} /> : <PanelStrip d={selected} onExpand={() => setPanelOpen(true)} />)}
      {justArchived && <ArchivedToast quoteId={justArchived.quoteId} name={justArchived.customerName} reason={reasonLabel(justArchived.archived!.reason)} />}
    </div>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: 'red' }) {
  return (
    <div className="rounded-[14px] border border-[#ECE8DF] bg-white px-3.5 py-3">
      <p className="text-[11.5px] text-[#6B7380]">{label}</p>
      <b className="block text-[20px] font-bold mt-1.5 tabular-nums">{value}</b>
      <small className={`block text-[11.5px] mt-0.5 truncate ${tone === 'red' ? 'text-[#B4442C]' : 'text-[#8A919C]'}`}>{note}</small>
    </div>
  );
}
const NavTile = ({ cls, children }: { cls: string; children: React.ReactNode }) => <span className={`w-6 h-6 rounded-[7px] grid place-items-center text-[10px] font-bold flex-shrink-0 ${cls}`} aria-hidden="true">{children}</span>;
const Count = ({ dark, children }: { dark?: boolean; children: React.ReactNode }) => <span className={`min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-semibold grid place-items-center ${dark ? 'bg-teton-ink text-white' : 'bg-[#E9E5DC] text-[#4E5562]'}`}>{children}</span>;

function Chip({ on, href, onClick, children }: { on: boolean; href?: string; onClick?: () => void; children: React.ReactNode }) {
  const cls = `flex-shrink-0 h-8 px-3 inline-flex items-center rounded-full border text-[12.5px] whitespace-nowrap transition-colors ${on ? 'bg-teton-ink text-white border-teton-ink' : 'bg-white border-[#E4E0D6]'}`;
  return href ? <Link href={href} onClick={onClick} className={cls}>{children}</Link> : <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

/** The deal's initials, with the new-comments bubble (hover: how many, and who). */
function DealAvatar({ d, size = 'w-8 h-8 text-[11px]' }: { d: DealSummary; size?: string }) {
  const n = d.newComments.count;
  return (
    <span className={`group/av relative ${size} rounded-[9px] grid place-items-center font-bold flex-shrink-0 ${tint(d.customerName)}`}>
      {initials(d.customerName)}
      {n > 0 && (
        <>
          <span className="absolute -top-1.5 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-[#3F8CEA] text-white text-[10px] font-bold grid place-items-center shadow-[0_0_0_2px_#fff]" aria-label={`${n} new ${n === 1 ? 'comment' : 'comments'}`}>
            {n > 9 ? '9+' : n}
          </span>
          <span role="tooltip" className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-20 whitespace-nowrap rounded-[7px] bg-teton-ink px-2.5 py-1.5 text-[11.5px] font-medium text-white opacity-0 transition-opacity duration-150 group-hover/av:opacity-100">
            {n} new {n === 1 ? 'comment' : 'comments'}
            <span className="text-[#AEB4BD]"> · {d.newComments.authors.join(', ')}</span>
          </span>
        </>
      )}
    </span>
  );
}

/** The owner's initials; the name on hover (desktop) or tap (phones). */
function OwnerBadge({ name, small = false }: { name: string | null; small?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const off = () => setShown(false);
    const t = setTimeout(() => document.addEventListener('click', off), 0);
    return () => (clearTimeout(t), document.removeEventListener('click', off));
  }, [shown]);
  return (
    <span className="group/ow relative inline-flex">
      <button
        type="button"
        aria-label={`Owner: ${name ?? 'nobody'}`}
        onClick={(e) => (e.preventDefault(), e.stopPropagation(), setShown((s) => !s))}
        className={`${small ? 'w-[22px] h-[22px] text-[8.5px]' : 'w-[26px] h-[26px] text-[9.5px]'} rounded-full grid place-items-center font-bold ${tint(name ?? '?')}`}
      >
        {initials(name)}
      </button>
      <span role="tooltip" className={`pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-[7px] bg-teton-ink px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-opacity duration-150 ${shown ? 'opacity-100' : 'opacity-0 group-hover/ow:opacity-100'}`}>
        {name ?? 'No owner'}
        <span className="block text-[10.5px] text-[#AEB4BD]">Owner</span>
      </span>
    </span>
  );
}

const AgreementPill = () => (
  <span className="inline-flex items-center gap-1.5 h-[19px] px-2 rounded-full bg-[#FDE3DD] text-[#B23A26] text-[10.5px] font-bold whitespace-nowrap">
    <span className="w-1.5 h-1.5 rounded-full bg-[#E5484D] animate-[agPulse_1.6s_ease-out_infinite] motion-reduce:animate-none" aria-hidden="true" />
    Agreement requested
  </span>
);
const TaskBadge = ({ d }: { d: DealSummary }) => (
  <span className={`w-6 h-6 rounded-full grid place-items-center text-[11px] font-bold mx-auto ${d.overdueTasks ? 'bg-[#FDECE8] text-[#B4442C]' : d.openTasks ? 'bg-[#E6F1FC] text-[#2F78C8]' : 'bg-[#EFEDE8] text-[#6B6458]'}`} title={d.overdueTasks ? `${d.overdueTasks} overdue` : undefined}>
    {d.openTasks}
  </span>
);

function DealRow({ d, selected, onSelect }: { d: DealSummary; selected: boolean; onSelect: () => void }) {
  return (
    <div
      role="row"
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      className={`grid grid-cols-[36px_minmax(0,1fr)_64px_80px_96px_56px] gap-3.5 items-center px-4 min-h-[56px] py-2 border-b border-[#F1EEE7] last:border-b-0 cursor-pointer transition-colors ${selected ? 'bg-[#F3F8FE] shadow-[inset_3px_0_0_#3F8CEA]' : 'hover:bg-[#FBFAF7]'}`}
    >
      <DealAvatar d={d} />
      <span className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={`/quotes/${d.quoteId}`} onClick={(e) => e.stopPropagation()} className="text-[13.5px] font-semibold hover:underline truncate">
          {d.customerName}
        </Link>
        {d.agreementRequested && <AgreementPill />}
      </span>
      <span><OwnerBadge name={d.ownerName} /></span>
      <span className="text-right text-[13px] font-semibold tabular-nums">{count(d.beds)}</span>
      <span className="text-[12px] text-[#6B7380]">{when(d.updatedAt)}</span>
      <TaskBadge d={d} />
    </div>
  );
}

function DealCard({ d }: { d: DealSummary }) {
  return (
    <li className="relative border-b border-[#F1EEE7] last:border-b-0">
      <Link href={`/quotes/${d.quoteId}`} className="flex items-center gap-3 px-4 py-3 pr-14 active:bg-[#FBFAF7]">
        <DealAvatar d={d} />
        <span className="min-w-0 flex-1">
          <b className="block text-[14px] font-semibold leading-snug">{d.customerName}</b>
          <small className="block text-[12px] text-[#6B7380] mt-0.5">{count(d.beds)} beds · {when(d.updatedAt)}{d.openTasks ? ` · ${d.openTasks} open ${d.openTasks === 1 ? 'task' : 'tasks'}` : ''}</small>
          {d.agreementRequested && <span className="block mt-1.5"><AgreementPill /></span>}
        </span>
      </Link>
      <span className="absolute right-4 top-1/2 -translate-y-1/2"><OwnerBadge name={d.ownerName} /></span>
    </li>
  );
}

/** The right panel: a quick look at the selected deal. */
function Glance({ d, onCollapse }: { d: DealSummary | null; onCollapse: () => void }) {
  const [data, setData] = useState<DealGlance | null>(null);
  const [tab, setTab] = useState<'overview' | 'comments'>('overview');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setErr(null);
    if (!d) return;
    let live = true;
    fetch(`/api/quotes/${d.quoteId}/glance`)
      .then((r) => (r.ok ? r.json() : r.json().then((j) => Promise.reject(new Error(j.error)))))
      .then((j) => live && setData(j as DealGlance))
      .catch((e) => live && setErr(e instanceof Error ? e.message : 'Could not load'));
    return () => {
      live = false;
    };
  }, [d?.quoteId]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = 'rounded-[12px] border border-[#ECE8DF] px-3.5 py-3 mb-2.5 text-[12.5px]';
  const h4 = 'text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C] mb-2';
  const fresh = data?.comments.filter((c) => c.isNew) ?? [];
  return (
    <div className="w-[360px] flex-shrink-0 border-l border-[#ECE8DF] bg-white flex flex-col drawer-in" aria-label="Deal quick look">
      <div className="px-[18px] pt-4 pb-2.5">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-[#5A6270]">{d ? `DEAL · DRAFT V${data?.versionNo ?? '…'}` : 'QUICK LOOK'}</span>
          <button type="button" onClick={onCollapse} aria-label="Collapse the panel" title="Collapse the panel" className="w-[30px] h-[30px] rounded-[9px] border border-[#E4E0D6] grid place-items-center text-[#5A6270] hover:bg-[#F6F3EE]">»</button>
        </div>
        {d ? (
          <>
            <div className="flex items-center gap-3 mt-2">
              <DealAvatar d={d} size="w-[42px] h-[42px] text-[14px]" />
              <div className="min-w-0">
                <p className="text-[16.5px] font-bold leading-snug">{d.customerName}</p>
                <p className="flex items-center gap-1.5 text-[12px] text-[#6B7380] mt-0.5">
                  <OwnerBadge name={d.ownerName} small />
                  Changed {when(d.updatedAt).toLowerCase() === 'today' ? 'today' : when(d.updatedAt)}
                </p>
              </div>
            </div>
            {d.agreementRequested && <div className="mt-2.5"><AgreementPill /></div>}
          </>
        ) : null}
      </div>
      {d ? (
        <>
          <div className="relative flex rounded-[11px] bg-[#F1EEE8] p-[3px] mx-[18px]" role="tablist">
            {(
              [
                ['overview', 'Overview'],
                ['comments', `Comments${data?.comments.length ? ` · ${data.comments.length}` : ''}`],
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)} className={`flex-1 h-[30px] rounded-[8px] text-[12px] transition-colors duration-200 ${tab === v ? 'bg-white font-semibold shadow-sm' : 'text-[#4E5562]'}`}>
                {l}
                {v === 'comments' && fresh.length > 0 && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[#3F8CEA] align-middle" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-[18px] py-3 no-scrollbar">
            {err && <p className="text-[12.5px] text-[#B4442C]">{err}</p>}
            {!data && !err && <p className="text-[12.5px] text-[#8A919C]">Loading…</p>}
            {data && tab === 'overview' && (
              <div className="[animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
                {data.agreement && (
                  <div className={`${box} bg-[#FFF6F3] border-[#F5D3CA]`}>
                    <b>Agreement requested</b> by {data.agreement.who}, {dateLabel(data.agreement.at.slice(0, 10))}.
                  </div>
                )}
                {fresh.length > 0 && (
                  <div className={box}>
                    <p className={h4}>New comments</p>
                    {fresh.slice(0, 2).map((c) => <CommentLine key={c.id} c={c} />)}
                    {fresh.length > 2 && <button type="button" onClick={() => setTab('comments')} className="mt-1 text-[12px] font-semibold text-[#2F78C8]">See all {fresh.length}</button>}
                  </div>
                )}
                <div className={box}>
                  <p className={h4}>Pricing</p>
                  {data.pricing.length ? (
                    <div className="grid grid-cols-[1fr_auto] gap-y-1.5">
                      {data.pricing.map(([k, v]) => (
                        <FragmentRow key={k} k={k} v={v} />
                      ))}
                      {data.contract && data.contract.value > 0 && <FragmentRow k={`Contract value · ${data.contract.months} months`} v={`$${data.contract.value.toLocaleString('en-US')}`} strong />}
                    </div>
                  ) : (
                    <p className="text-[#8A919C]">No products yet.</p>
                  )}
                </div>
                <div className={box}>
                  <p className={`${h4} flex justify-between`}>
                    <span>Communities</span>
                    <span className="normal-case tracking-normal">{data.communities.length} · {count(data.communities.reduce((s, c) => s + c.beds, 0))} beds</span>
                  </p>
                  {data.communities.slice(0, 5).map((c, i) => (
                    <p key={i} className="py-1 border-t border-[#F3F0EA] first:border-t-0">
                      <b className="font-semibold">{c.name}</b>
                      <span className="text-[#8A919C]"> · {[c.place, `${count(c.beds)} beds`, c.pilot ? 'pilot' : ''].filter(Boolean).join(' · ')}</span>
                    </p>
                  ))}
                  {data.communities.length > 5 && <p className="pt-1 text-[#8A919C]">+ {data.communities.length - 5} more</p>}
                </div>
              </div>
            )}
            {data && tab === 'comments' && (
              <div className="[animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
                {data.comments.length ? data.comments.map((c) => <CommentLine key={c.id} c={c} full />) : <p className="text-[12.5px] text-[#8A919C]">No comments yet.</p>}
              </div>
            )}
          </div>
          <div className="border-t border-[#ECE8DF] px-[18px] py-3 flex gap-2">
            {data?.activeVersionId ? (
              <Link href={`/proposal/${data.activeVersionId}`} className="btn-secondary flex-1 text-center">View proposal</Link>
            ) : (
              <button type="button" className="btn-secondary flex-1" disabled title="Save a version first">View proposal</button>
            )}
            <Link href={`/quotes/${d.quoteId}`} className="btn-primary flex-1 text-center">Open deal →</Link>
          </div>
        </>
      ) : (
        <div className="flex-1 grid place-items-center px-8 text-center text-[13px] text-[#8A919C]">
          <p>Select a deal for a quick look at its pricing, communities and new comments.</p>
        </div>
      )}
    </div>
  );
}

const FragmentRow = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
  <>
    <span className={strong ? 'font-semibold border-t border-[#ECE8DF] pt-1.5' : 'text-[#6B7380]'}>{k}</span>
    <b className={`text-right tabular-nums ${strong ? 'border-t border-[#ECE8DF] pt-1.5' : ''}`}>{v}</b>
  </>
);

function CommentLine({ c, full = false }: { c: DealGlance['comments'][number]; full?: boolean }) {
  return (
    <div className="flex gap-2.5 py-2 border-t border-[#F3F0EA] first:border-t-0">
      <span className={`w-6 h-6 rounded-full grid place-items-center text-[8.5px] font-bold flex-shrink-0 ${tint(c.who)}`}>{initials(c.who)}</span>
      <div className="min-w-0 text-[12.5px] leading-snug">
        <p>
          {c.isNew && <span className="inline-block w-[7px] h-[7px] rounded-full bg-[#3F8CEA] mr-1.5 align-[1px]" aria-label="New" />}
          <b className="font-semibold">{c.who}</b>
          {c.prospect && <span className="text-[#8A919C]"> (prospect)</span>}
          <span className="text-[#8A919C]"> on {c.label}</span>
        </p>
        <p className={`mt-0.5 text-[#3F4753] ${full ? '' : 'line-clamp-2'}`}>“{c.body}”</p>
        <small className="block mt-0.5 text-[11px] text-[#8A919C]">{dateLabel(c.at.slice(0, 10))}</small>
      </div>
    </div>
  );
}

/** The panel folded away: a slim strip with the selected deal, and « to open it again. */
function PanelStrip({ d, onExpand }: { d: DealSummary | null; onExpand: () => void }) {
  return (
    <div className="w-11 flex-shrink-0 border-l border-[#ECE8DF] bg-white flex flex-col items-center gap-3.5 pt-4 drawer-in">
      <button type="button" onClick={onExpand} aria-label="Expand the panel" title="Expand the panel" className="w-[30px] h-[30px] rounded-[9px] border border-[#E4E0D6] grid place-items-center text-[#5A6270] hover:bg-[#F6F3EE]">«</button>
      {d && (
        <>
          <DealAvatar d={d} size="w-[30px] h-[30px] text-[10px]" />
          <span className="[writing-mode:vertical-rl] rotate-180 text-[11px] font-semibold uppercase tracking-[.14em] text-[#8A919C] max-h-[60vh] truncate">{d.customerName}</span>
        </>
      )}
    </div>
  );
}

/** Archived deals: reason, note, when and who; filterable by reason. */
function ArchivedTable({ deals, reason }: { deals: DealSummary[]; reason?: string }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    deals.forEach((d) => m.set(d.archived!.reason, (m.get(d.archived!.reason) ?? 0) + 1));
    return m;
  }, [deals]);
  const shown = reason ? deals.filter((d) => d.archived!.reason === reason) : deals;
  const chip = (on: boolean) => `h-8 px-3 inline-flex items-center rounded-full border text-[12.5px] transition-colors ${on ? 'bg-teton-ink text-white border-teton-ink' : 'bg-white border-[#D3D6DA] hover:bg-[#FBFAF7]'}`;
  const Pill = ({ r }: { r: string }) => <span className={`inline-flex h-[22px] items-center rounded-[7px] px-2 text-[11.5px] font-semibold whitespace-nowrap ${REASON_TONE[r] ?? REASON_TONE.other}`}>{reasonLabel(r)}</span>;
  const on = (d: DealSummary) => `${dateLabel(d.archived!.at.slice(0, 10))}${d.archived!.by ? ` · ${d.archived!.by}` : ''}`;
  if (!deals.length)
    return (
      <div className="mt-4 rounded-[14px] border border-[#ECE8DF] bg-white text-center py-12 px-4">
        <p className="font-medium">No archived deals</p>
        <p className="text-sm text-[#6B7380] mt-1">Archive a deal from its ⋮ menu when it’s won, lost or done with. It moves here, read-only.</p>
      </div>
    );
  return (
    <section className="mt-4" data-nv-sec>
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
      <div className="rounded-[14px] border border-[#ECE8DF] bg-white overflow-hidden">
        <div className="max-sm:hidden grid grid-cols-[36px_minmax(0,1.3fr)_64px_130px_minmax(0,1fr)_170px] gap-3.5 items-center px-4 h-9 border-b border-[#ECE8DF] text-[10.5px] font-semibold uppercase tracking-[.12em] text-[#8A919C]">
          <span /><span>Deal</span><span>Owner</span><span>Reason</span><span>Note</span><span>Archived</span>
        </div>
        {shown.map((d) => (
          <Link key={d.dealId} href={`/quotes/${d.quoteId}`} className="grid grid-cols-[36px_minmax(0,1fr)_auto] sm:grid-cols-[36px_minmax(0,1.3fr)_64px_130px_minmax(0,1fr)_170px] gap-x-3.5 gap-y-1 items-center px-4 py-2.5 border-b border-[#F1EEE7] last:border-b-0 hover:bg-[#FBFAF7]">
            <DealAvatar d={d} />
            <span className="min-w-0">
              <b className="block truncate text-[13.5px] font-semibold">{d.customerName}</b>
              <small className="sm:hidden block text-[12px] text-[#6B7380]">{on(d)}</small>
            </span>
            <span className="max-sm:hidden"><OwnerBadge name={d.ownerName} /></span>
            <span><Pill r={d.archived!.reason} /></span>
            <span className="max-sm:col-span-3 max-sm:pl-[50px] truncate text-[12.5px] text-[#4E5562]" title={d.archived!.note ?? undefined}>{d.archived!.note ?? ''}</span>
            <span className="max-sm:hidden text-[12px] text-[#6B7380]">{on(d)}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

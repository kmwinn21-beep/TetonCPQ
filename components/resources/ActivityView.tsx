'use client';

/**
 * Who on the shared link looked at what: a few numbers up top, a grid of resources (and the proposal) by person —
 * darker for more time, with downloads, link clicks and video watched — a feed of recent opens, downloads and clicks,
 * and a few things worth a follow-up. All from the prospects being signed in with their email.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Activity, ActivityCell } from '@/lib/data/dealRooms';
import { PersonPhoto } from './Person';

export const fmtDur = (sec: number) => {
  const s = Math.round(sec);
  if (s < 60) return `${s} sec`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} m`;
};
const when = (iso: string) => {
  const t = Date.parse(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const nameOf = (a: Activity, email: string) => a.people.find((p) => p.email === email)?.name || email;

/** A card's activity in a few words, for the editor's list ("👁 2 people · 9 min · ⤓ Dana"). */
export function engagementLine(a: Activity, key: string): { text: string; hot: boolean } | null {
  const cells = a.people.map((p) => ({ p, c: a.cells[`${key}|${p.email}`] })).filter((x) => x.c);
  if (!cells.length) return { text: 'Not opened yet', hot: false };
  const time = cells.reduce((s, x) => s + x.c.time + x.c.video, 0);
  const dl = cells.filter((x) => x.c.downloads).map((x) => (x.p.name || x.p.email).split(/[\s@]/)[0]);
  const clicks = cells.reduce((s, x) => s + x.c.clicks, 0);
  const bits = [`👁 ${cells.length === 1 ? (cells[0].p.name || cells[0].p.email).split(/[\s@]/)[0] : `${cells.length} people`}`, time >= 30 ? fmtDur(time) : null, dl.length ? `⤓ ${dl.join(', ')}` : null, clicks ? `↗ ${clicks} click${clicks === 1 ? '' : 's'}` : null];
  return { text: bits.filter(Boolean).join(' · '), hot: time >= 120 || dl.length > 0 };
}

const level = (c: ActivityCell | undefined) => {
  if (!c) return 0;
  const t = c.time + c.video;
  return t >= 600 ? 3 : t >= 120 || c.downloads ? 2 : 1;
};
const LEVEL = ['bg-[#F6F4F0] text-[#B9BFC7]', 'bg-[#E3F3E8] text-[#256B41]', 'bg-[#BFE6CB] text-[#1E5A36]', 'bg-[#2E9E5B] text-white'];

export function ActivityView({ quoteId, customer, onClose, onPick }: { quoteId: number; customer: string; onClose: () => void; onPick?: (key: string) => void }) {
  const [days, setDays] = useState(30);
  const [who, setWho] = useState<string>('all');
  const [a, setA] = useState<Activity | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    void fetch(`/api/quotes/${quoteId}/resources/activity?days=${days}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { activity?: Activity }) => j.activity && setA(j.activity));
  }, [quoteId, days]);
  const close = () => (setLeaving(true), setTimeout(onClose, 180));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopImmediatePropagation(), close());
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Proposal page names and numbers, from the business case on this screen.
  const pages = useMemo(() => {
    const m = new Map<string, { title: string; n: number }>();
    if (typeof document !== 'undefined') document.querySelectorAll<HTMLElement>('article#proposal [data-bc-page][data-bc-title]').forEach((el, i) => m.set(el.dataset.bcPage!, { title: el.dataset.bcTitle!, n: i + 1 }));
    return m;
  }, []);
  if (typeof document === 'undefined') return null;
  const people = a ? a.people.filter((p) => who === 'all' || p.email === who) : [];
  const visited = a ? a.people.filter((p) => p.firstOpenedAt || Object.keys(a.cells).some((k) => k.endsWith(`|${p.email}`))) : [];
  const rows = a ? a.rows.filter((r) => !r.hidden) : [];
  const opened = a ? rows.filter((r) => r.key.startsWith('r') && a.people.some((p) => a.cells[`${r.key}|${p.email}`])).length : 0;
  const resourceCount = rows.filter((r) => r.key.startsWith('r')).length;
  const newest = a ? [...a.people].filter((p) => p.firstOpenedAt).sort((x, y) => (y.firstOpenedAt! > x.firstOpenedAt! ? 1 : -1))[0] : null;
  const cellText = (key: string, c: ActivityCell | undefined, duration: number | null) => {
    if (!c) return '—';
    if (key === 'proposal' && c.topPage && c.topPage.count >= 2) {
      const pg = pages.get(c.topPage.id);
      return `${fmtDur(c.time)} · p.${pg?.n ?? '?'} ×${c.topPage.count}`;
    }
    if (c.video) return duration ? `${fmtDur(Math.min(c.video, duration))} of ${fmtDur(duration)}` : `${fmtDur(c.video)} watched`;
    const parts = [c.time >= 30 ? fmtDur(c.time) : c.opens ? 'opened' : null, c.downloads ? '⤓' : null, c.clicks ? '↗ clicked' : null].filter(Boolean);
    return parts.join(' · ') || 'opened';
  };
  // Worth a follow-up.
  const hints: Array<{ icon: string; text: React.ReactNode; sub: string }> = [];
  if (a) {
    for (const p of a.people) {
      const c = a.cells[`proposal|${p.email}`];
      if (c?.topPage && c.topPage.count >= 3) {
        const pg = pages.get(c.topPage.id);
        hints.push({ icon: '🔥', text: <><b>{p.name || p.email}</b> keeps coming back to <b>{pg?.title ?? 'one page'}</b> (proposal p.{pg?.n ?? '?'}, {c.topPage.count} times).</>, sub: /invest|pric|cost|financ|cash/i.test(pg?.title ?? '') ? 'Maybe offer a pricing call or another option.' : 'Worth asking what questions they have about it.' });
      }
    }
    for (const p of a.people) if (!p.firstOpenedAt && !Object.keys(a.cells).some((k) => k.endsWith(`|${p.email}`))) hints.push({ icon: '👀', text: <><b>{p.name || p.email}</b> hasn’t opened the link.</>, sub: p.emailedAt ? `Emailed ${when(p.emailedAt)} · send it again from the Share dialog` : 'Not emailed yet · email it from the Share dialog' });
    for (const r of rows) if (r.key.startsWith('r') && !a.people.some((p) => a.cells[`${r.key}|${p.email}`])) hints.push({ icon: '📭', text: <>No one has opened <b>{r.title}</b>.</>, sub: 'Mention it, or move it higher on the tab.' });
  }
  const sel = 'h-8 rounded-[9px] border border-[#D5D9DE] bg-white px-2 text-[12.5px] font-semibold';
  return createPortal(
    <div data-res-modal className={`fixed inset-0 z-[110] flex flex-col bg-[#FBF8F3] text-teton-ink ${leaving ? 'opacity-0 transition-opacity duration-150' : '[animation:fadeIn_.18s_ease-out]'} motion-reduce:[animation:none]`} role="dialog" aria-modal="true" aria-label="Activity" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="flex items-center gap-3 min-h-[64px] px-4 sm:px-5 bg-[#16181D] text-white">
        <div className="min-w-0">
          <b className="text-[15px]">Activity</b>
          <span className="block text-[12px] text-[#A9ADB4] truncate">{customer} · resources and proposal</span>
        </div>
        <span className="flex-1" />
        <button type="button" onClick={close} className="h-9 px-4 rounded-[10px] bg-white text-teton-ink text-[13px] font-semibold">
          Done
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
        <div className="max-w-[1180px] mx-auto">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[2px] text-teton-ui-gray">Engagement</p>
              <h2 className="mt-1 text-[22px] font-semibold tracking-[-.3px]">Who’s looked at what</h2>
              <p className="mt-1 text-[13px] text-teton-ui-gray">From the people signed in to this deal’s link. Times are time on the page, or time watched.</p>
            </div>
            <select className={sel} value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
            <select className={sel} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
              <option value="all">Everyone</option>
              {a?.people.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name || p.email}
                </option>
              ))}
            </select>
          </div>
          {!a ? (
            <p className="py-16 text-center text-sm text-teton-ui-gray">Loading…</p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 grid-cols-2 lg:grid-cols-4">
                {[
                  [`${visited.length} of ${a.people.length}`, 'people on the link have visited', newest?.firstOpenedAt ? `${newest.name || newest.email} first visited ${when(newest.firstOpenedAt)}` : null],
                  [fmtDur(a.totalTime), 'total time spent', a.weekTime ? `${fmtDur(a.weekTime)} in the last 7 days` : null],
                  [`${opened} of ${resourceCount}`, 'resources opened', resourceCount - opened ? `${resourceCount - opened} not opened yet` : resourceCount ? 'All opened' : null],
                  [a.lastVisit ? when(a.lastVisit.at) : '—', a.lastVisit ? `last visit · ${nameOf(a, a.lastVisit.email)}` : 'no visits yet', null],
                ].map(([big, label, note], i) => (
                  <div key={i} className="rounded-[14px] border border-[#E8E4DC] bg-white px-4 py-3.5">
                    <b className="block text-[22px] sm:text-[24px] font-bold tracking-[-.5px]">{big}</b>
                    <span className="text-[12px] text-[#6B7380]">{label}</span>
                    {note && <small className="block mt-1 text-[11.5px] font-semibold text-[#256B41]">{note}</small>}
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
                <div className="rounded-[15px] border border-[#E8E4DC] bg-white px-4 py-3.5 overflow-x-auto">
                  <p className="mb-2.5 flex text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]">
                    By resource and person<span className="ml-auto normal-case tracking-normal font-medium text-[11.5px] text-[#6B7380]">darker = more time</span>
                  </p>
                  {people.length ? (
                    <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
                      <thead>
                        <tr>
                          <th />
                          {people.map((p) => (
                            <th key={p.email} className="px-1 pb-2.5 align-bottom text-[10.5px] font-bold text-[#6B7380]">
                              <span className="flex flex-col items-center gap-1">
                                <PersonPhoto name={p.name || p.email} photoUrl={null} size={30} />
                                <span className="max-w-[110px] truncate">{p.name || p.email}</span>
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.key} className="border-t border-[#F1EEE7]">
                            <td className="py-1.5 pr-2">
                              <button type="button" className="text-left hover:underline" onClick={() => onPick?.(r.key)} disabled={!onPick || r.key === 'proposal'}>
                                <b className="block text-[12.5px]">{r.title}</b>
                              </button>
                            </td>
                            {people.map((p) => {
                              const c = a.cells[`${r.key}|${p.email}`];
                              return (
                                <td key={p.email} className="px-1 py-1.5 text-center">
                                  <span className={`inline-grid place-items-center min-w-[64px] h-[30px] px-2.5 rounded-lg text-[11.5px] font-semibold whitespace-nowrap ${LEVEL[level(c)]}`}>{cellText(r.key, c, r.duration)}</span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="py-6 text-center text-[13px] text-teton-ui-gray">No one is on the link yet.</p>
                  )}
                  <p className="mt-2.5 text-[11.5px] text-teton-ui-gray">“p.6 ×3”: the proposal page they came back to most. Uploaded videos show how much was watched; embedded ones, time on the card.</p>
                </div>
                <div className="space-y-4">
                  <div className="rounded-[15px] border border-[#E8E4DC] bg-white px-4 py-3.5">
                    <p className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]">Recent</p>
                    {!a.recent.length && <p className="py-3 text-[12.5px] text-teton-ui-gray">Nothing yet.</p>}
                    {a.recent
                      .filter((e) => who === 'all' || e.email === who)
                      .slice(0, 12)
                      .map((e, i) => (
                        <div key={i} className="grid grid-cols-[30px_1fr] gap-2.5 py-2 border-t border-[#F1EEE7] first-of-type:border-0 text-[12.5px] leading-snug">
                          <PersonPhoto name={nameOf(a, e.email)} photoUrl={null} size={30} />
                          <div>
                            <b>{nameOf(a, e.email)}</b> {e.kind === 'download' ? 'downloaded' : e.kind === 'click' ? 'clicked' : 'opened'} <b>{e.title}</b>
                            <small className="block mt-0.5 text-[11px] text-[#8A919C]">{when(e.at)}</small>
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="rounded-[15px] border border-[#E8E4DC] bg-white px-4 py-3.5">
                    <p className="mb-1 text-[10.5px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]">Worth a follow-up</p>
                    {!hints.length && <p className="py-3 text-[12.5px] text-teton-ui-gray">Nothing stands out yet.</p>}
                    {hints.slice(0, 6).map((h, i) => (
                      <div key={i} className="grid grid-cols-[24px_1fr] gap-2 py-2 border-t border-[#F1EEE7] first-of-type:border-0 text-[12.5px] leading-snug">
                        <span>{h.icon}</span>
                        <div>
                          {h.text}
                          <small className="block mt-0.5 text-[11px] text-[#8A919C]">{h.sub}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

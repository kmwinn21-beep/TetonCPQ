'use client';

/**
 * The deal page's "agreement requested" alert, under the header: hard to miss, and it stays until someone marks the
 * agreement sent (or snoozes it for a day). After two days waiting it turns red and can't be snoozed. Review request
 * opens what the prospect confirmed or changed, their note, and what's left before sending. Once marked sent, a
 * short green line (with Undo) stays for a few days.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import type { AgreementPayload, DealAgreement } from '@/lib/data/agreements';

export const AGREEMENT_OPEN = 'teton:agreement-open';

export function useDealAgreement(quoteId: number) {
  const [data, setData] = useState<DealAgreement | null>(null);
  const load = useCallback(async () => {
    const r = await fetch(`/api/quotes/${quoteId}/agreement`, { cache: 'no-store' }).catch(() => null);
    if (r?.ok) setData((await r.json()) as DealAgreement);
  }, [quoteId]);
  useEffect(() => {
    void load();
    const f = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, [load]);
  const act = useCallback(
    async (action: 'sent' | 'undo' | 'snooze') => {
      const r = await fetch(`/api/quotes/${quoteId}/agreement`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
      if (r.ok) setData((await r.json()) as DealAgreement);
      return r.ok;
    },
    [quoteId],
  );
  return { data, act };
}

const when = (at: string) => {
  const d = new Date(`${at.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const ago = (at: string) => {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(`${at.replace(' ', 'T')}Z`)) / 60000));
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} hour${h === 1 ? '' : 's'} ago` : when(at);
};
export const firstOf = (who: string) => (who.includes('@') ? who : who.split(/\s+/)[0]);

/** One chip per part: confirmed, updated or not confirmed. */
export function partChips(p: AgreementPayload, short = false) {
  const tone = (s: string) => (s === 'confirmed' ? 'bg-teton-pale-green text-[#256B41]' : s === 'updated' ? 'bg-[#E4EFFD] text-[#1F5FB5]' : 'bg-[#EEF0F2] text-[#5A6270]');
  const word = (s: string, label: string) => (s === 'confirmed' ? `✓ ${label}${short ? '' : ' confirmed'}` : s === 'updated' ? `✎ ${label}${short ? '' : ' updated'}` : `${label} not confirmed`);
  const coms = p.communities.pilot ? 'Communities' : 'Communities';
  return [
    { k: 'e', cls: tone(p.entity.status), t: word(p.entity.status, 'Entity') },
    { k: 's', cls: tone(p.signatory.status), t: word(p.signatory.status, 'Signatory') },
    ...(p.communities.list.length ? [{ k: 'c', cls: tone(p.communities.status), t: word(p.communities.status, coms) }] : []),
  ];
}

export function AgreementAlert({ ag, act, canEdit }: { ag: DealAgreement | null; act: (a: 'sent' | 'undo' | 'snooze') => Promise<boolean>; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const f = () => {
      setOpen(true);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener(AGREEMENT_OPEN, f);
    return () => window.removeEventListener(AGREEMENT_OPEN, f);
  }, []);
  if (!ag) return null;
  const run = async (a: 'sent' | 'undo' | 'snooze') => {
    setBusy(true);
    await act(a);
    setBusy(false);
    setOpen(false);
  };
  const o = ag.open;
  const snoozed = !!o && !ag.late && !!ag.snoozedUntil && Date.parse(`${ag.snoozedUntil.replace(' ', 'T')}Z`) > Date.now();
  if (!o || snoozed) {
    const s = ag.lastSent;
    const recent = s?.sentAt && Date.now() - Date.parse(`${s.sentAt.replace(' ', 'T')}Z`) < 3 * 86_400_000;
    if (o || !s || !recent) return null;
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#BFE3CC] bg-[#F5FBF7] px-4 py-2.5 text-[13px] text-[#256B41] drawer-in" role="status">
        <span>
          ✓ Agreement marked sent to {s.who}
          {s.sentAt ? ` · ${when(s.sentAt)}` : ''}
          {s.sentByName ? ` by ${s.sentByName}` : ''}
        </span>
        {canEdit && (
          <button type="button" className="ml-auto font-semibold text-[#1F5FB5] hover:underline disabled:opacity-50" disabled={busy} onClick={() => void run('undo')}>
            Undo
          </button>
        )}
      </div>
    );
  }
  const p = o.payload;
  const first = firstOf(o.who);
  const sig = p.signatory.value;
  const noPlan = p.communities.list.filter((c) => !c.hasPlan);
  const todo = [
    ...(p.entity.status === 'skipped' ? [`Confirm the legal entity name with ${first}`] : []),
    ...(p.signatory.status === 'skipped' ? [`Confirm the signatory with ${first}`] : []),
    ...(p.communities.list.length && p.communities.status === 'skipped' ? [`Confirm the ${p.communities.pilot ? 'pilot ' : ''}communities with ${first}`] : []),
    ...(p.communities.change ? [`Update the communities: “${p.communities.change}”`] : []),
    ...noPlan.map((c) => `Get a floor plan for ${c.name}`),
    `Send the agreement${sig?.email ? ` to ${sig.email}` : ''}`,
  ];
  const late = ag.late;
  return (
    <div
      ref={ref}
      role="alert"
      className={`relative mb-4 overflow-hidden rounded-2xl border shadow-[0_10px_30px_rgba(217,85,63,.12)] drawer-in ${late ? 'border-[#E8A193] bg-gradient-to-r from-[#FFE9E5] to-[#FFF6F4]' : 'border-[#F3C9BF] bg-gradient-to-r from-[#FFF4F1] to-white'}`}
    >
      <span className={`absolute inset-y-0 left-0 w-[5px] ${late ? 'bg-[#C4371F]' : 'bg-[#D9553F]'}`} aria-hidden="true" />
      <div className="flex flex-wrap sm:flex-nowrap items-start sm:items-center gap-3 sm:gap-4 pl-5 sm:pl-6 pr-4 sm:pr-5 py-4">
        <span className="relative w-10 h-10 sm:w-[46px] sm:h-[46px] flex-shrink-0 rounded-[13px] bg-[#D9553F] text-white text-[18px] sm:text-[20px] grid place-items-center shadow-[0_6px_14px_rgba(217,85,63,.35)]" aria-hidden="true">
          ✍
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#E5484D] border-[2.5px] border-white animate-[agPulse_1.6s_ease-out_infinite] motion-reduce:animate-none" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[1.8px] text-[#C4371F]">{late ? `Waiting on you · ${ag.waitingDays} days` : 'Agreement requested'}</p>
          <p className="mt-0.5 text-[16px] sm:text-[16.5px] font-bold leading-snug text-teton-ink">{late ? `${o.who} is still waiting for the agreement` : `${o.who} asked for the ${p.communities.pilot ? 'pilot ' : ''}agreement`}</p>
          <p className="mt-0.5 text-[12.5px] text-[#6B7380]">
            {late ? (
              <>
                Requested <b className="text-[#C4371F]">{when(o.createdAt)}</b> from the shared link
              </>
            ) : (
              <>{ago(o.createdAt)} from the shared link{o.versionNo ? ` (v${o.versionNo})` : ''} · they’re expecting it within a business day</>
            )}
            {ag.others.length > 0 && ` · also asked: ${ag.others.join(', ')}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {partChips(p).map((c) => (
              <span key={c.k} className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${c.cls}`}>
                {c.t}
              </span>
            ))}
            {noPlan.length > 0 && <span className="rounded-full bg-teton-red/30 px-2.5 py-0.5 text-[11.5px] font-semibold text-[#9A2E1C]">{noPlan.length} {noPlan.length === 1 ? 'community needs' : 'communities need'} floor plans</span>}
          </div>
        </div>
        <div className="flex w-full sm:w-auto flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
          {canEdit && !late && (
            <button type="button" className="text-[12px] font-semibold text-[#6B7380] hover:text-teton-ink px-1 py-1 disabled:opacity-50" disabled={busy} onClick={() => void run('snooze')}>
              Snooze 1 day
            </button>
          )}
          <button type="button" aria-expanded={open} className="h-10 sm:h-[38px] px-3.5 rounded-[10px] border border-[#D5D9DE] bg-white text-[13px] font-semibold text-teton-ink hover:bg-teton-almost-white" onClick={() => setOpen(!open)}>
            {open ? 'Hide details ▴' : 'Review request ▾'}
          </button>
          {canEdit && (
            <button type="button" className={`order-first sm:order-none h-10 sm:h-[38px] px-3.5 rounded-[10px] text-[13px] font-semibold text-white disabled:opacity-50 ${late ? 'bg-[#D9553F] hover:bg-[#C4371F]' : 'bg-teton-ink hover:opacity-90'}`} disabled={busy} onClick={() => void run('sent')}>
              ✓ Mark agreement sent
            </button>
          )}
        </div>
      </div>
      <Collapse open={open}>
        <div className="grid gap-4 md:grid-cols-[1.5fr_1fr] border-t border-[#F3DDD7] bg-white/70 px-5 sm:px-6 py-4">
          <table className="w-full text-[13px] text-[#3A3F47]">
            <tbody>
              <Row k="Legal entity" st={p.entity.status}>
                {p.entity.value || '—'}
                {p.entity.status === 'updated' && p.entity.was && <span className="block text-[12px] text-teton-ui-gray line-through">{p.entity.was}</span>}
              </Row>
              <Row k="Signatory" st={p.signatory.status}>
                {sig ? (
                  <>
                    {[`${sig.first} ${sig.last}`.trim(), sig.title].filter(Boolean).join(' · ')}
                    {sig.email && <span className="block">{sig.email}</span>}
                  </>
                ) : (
                  '—'
                )}
                {p.signatory.status === 'updated' && p.signatory.was && (
                  <span className="block text-[12px] text-teton-ui-gray line-through">{[`${p.signatory.was.first} ${p.signatory.was.last}`.trim(), p.signatory.was.title, p.signatory.was.email].filter(Boolean).join(' · ')}</span>
                )}
              </Row>
              {p.communities.list.length > 0 && (
                <Row k={p.communities.pilot ? 'Pilot communities' : 'Communities'} st={p.communities.status}>
                  {p.communities.list.map((c) => (
                    <span key={c.name} className="block">
                      {c.name}
                      {c.beds ? ` · ${c.beds} beds` : ''}{' '}
                      <span className={`ml-1 rounded-full px-2 py-px text-[11px] font-semibold ${c.hasPlan ? 'bg-teton-pale-green text-[#256B41]' : 'bg-teton-red/30 text-[#9A2E1C]'}`}>{c.hasPlan ? '✓ Floor plan' : 'Floor plans needed'}</span>
                    </span>
                  ))}
                  {p.communities.change && <span className="block mt-1 text-[12.5px]">“{p.communities.change}”</span>}
                </Row>
              )}
            </tbody>
          </table>
          <div>
            {p.note && (
              <p className="rounded-[10px] border-l-[3px] border-[#D9553F] bg-[#FBF8F3] px-3 py-2.5 text-[13px] leading-relaxed text-[#2A2F36] whitespace-pre-wrap">
                <span className="block text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray mb-0.5">Note from {first}</span>
                {p.note}
              </p>
            )}
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[.8px] text-teton-ui-gray">Before you send</p>
            <Checklist items={todo} />
          </div>
        </div>
      </Collapse>
    </div>
  );
}

function Row({ k, st, children }: { k: string; st: string; children: React.ReactNode }) {
  const chip = st === 'confirmed' ? ['bg-teton-pale-green text-[#256B41]', '✓ Confirmed'] : st === 'updated' ? ['bg-[#E4EFFD] text-[#1F5FB5]', '✎ Updated'] : ['bg-[#EEF0F2] text-[#5A6270]', 'Not confirmed'];
  return (
    <tr className="border-t border-[#F0EDE7] first:border-t-0 align-top">
      <td className="w-[120px] sm:w-[150px] py-2.5 pr-3 text-[10.5px] font-bold uppercase tracking-[1px] text-teton-ui-gray">{k}</td>
      <td className="py-2 leading-relaxed">{children}</td>
      <td className="py-2 pl-2 text-right whitespace-nowrap">
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${chip[0]}`}>{chip[1]}</span>
      </td>
    </tr>
  );
}

/** What's left: tick as you go (just for this visit). */
function Checklist({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<number>>(new Set());
  return (
    <ul className="mt-1.5 space-y-1.5">
      {items.map((t, i) => (
        <li key={t}>
          <label className="flex items-start gap-2 text-[13px] text-[#3A3F47] cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[#2E9A5B]" checked={done.has(i)} onChange={() => setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />
            <span className={done.has(i) ? 'line-through text-teton-ui-gray' : ''}>{t}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

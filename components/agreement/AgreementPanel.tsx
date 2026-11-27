'use client';

/**
 * Right panel on the deal page: the agreement at a glance (whose turn, rounds, open changes) and the button that
 * opens the workspace. Shown to people who can see the agreement (roles & permissions); ?agreement=1 opens it.
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AgreementWorkspace } from './AgreementWorkspace';

interface Glance {
  view: { status: string; turn: string; title: string | null; rounds: Array<{ no: number; side: string; sent: boolean; changes: Array<{ decision: string | null }> }> };
  caps: { view: boolean; upload: boolean };
}

export function AgreementPanel({ quoteId, dealName }: { quoteId: number; dealName: string }) {
  const [g, setG] = useState<Glance | null | false>(null);
  const [open, setOpen] = useState(false);
  const params = useSearchParams();
  const router = useRouter();
  const load = () =>
    fetch(`/api/quotes/${quoteId}/agreement-doc`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : false))
      .then((j) => setG(j as Glance | false))
      .catch(() => setG(false));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId]);
  useEffect(() => {
    if (params.get('agreement') === '1') setOpen(true);
  }, [params]);
  if (!g) return null;
  const last = g.view.rounds[g.view.rounds.length - 1];
  const open_ = last && last.side === 'prospect' && last.sent ? last.changes.filter((c) => !c.decision).length : 0;
  const tone = g.view.status === 'signed' || g.view.status === 'final' ? 'bg-[#E3F4E8] text-[#1F6B3A]' : g.view.status === 'with_teton' ? 'bg-[#FDE3DD] text-[#B23A26]' : g.view.rounds.length ? 'bg-[#E8F1FD] text-[#1F5FB5]' : 'bg-[#F1EEE8] text-teton-ui-gray';
  return (
    <section className="card" aria-label="Agreement">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Agreement</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{g.view.rounds.length ? g.view.turn : 'Not started'}</span>
        <span className="flex-1" />
        <button type="button" className="btn-secondary py-1 px-2.5 text-xs" onClick={() => setOpen(true)}>Open</button>
      </div>
      {g.view.rounds.length > 0 && (
        <p className="mt-1.5 text-[12px] text-teton-ui-gray">
          {g.view.title ? `${g.view.title} · ` : ''}Round {last.no} · {last.side === 'teton' ? 'Teton' : 'prospect'}{open_ ? ` · ${open_} change${open_ === 1 ? '' : 's'} to decide` : ''}
        </p>
      )}
      {open && (
        <AgreementWorkspace
          quoteId={quoteId}
          dealName={dealName}
          onClose={() => {
            setOpen(false);
            void load();
            if (params.get('agreement')) router.replace(`/quotes/${quoteId}`, { scroll: false });
          }}
        />
      )}
    </section>
  );
}

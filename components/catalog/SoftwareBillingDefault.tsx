'use client';

/**
 * Price book setting, in the Software & services item drawer: how new equipment-purchase deals bill software &
 * services (monthly per bed, or once upfront). Each deal starts with this and can change it.
 */
import { useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';

export function SoftwareBillingDefault({ initial, canEdit, onSaved }: { initial: 'monthly' | 'upfront'; canEdit: boolean; onSaved?: (v: 'monthly' | 'upfront') => void }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (next: 'monthly' | 'upfront') => {
    if (next === v) return;
    const prev = v;
    setV(next);
    setMsg(null);
    try {
      const res = await fetch('/api/catalog/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ softwareBilling: next }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Could not save');
      onSaved?.(next);
      setMsg('Saved');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setV(prev);
      setMsg(e instanceof Error ? e.message : 'Could not save');
    }
  };
  return (
    <div className="rounded-[12px] border border-[#ECE8DF] p-3.5 mb-3">
      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C]">Default billing for new deals</p>
      <div className="flex flex-wrap items-center gap-3">
        <SegGroup className="relative inline-flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Default software billing">
          {(['monthly', 'upfront'] as const).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={v === o} disabled={!canEdit} onClick={() => save(o)} className={`relative z-[1] h-8 px-4 rounded-[8px] text-[13px] font-semibold transition-colors duration-200 disabled:cursor-default ${v === o ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>
              {o === 'monthly' ? 'Monthly' : 'Upfront'}
            </button>
          ))}
        </SegGroup>
        {msg && <span className="text-[12px] text-teton-ui-gray">{msg}</span>}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-[#6B7380]">
        Monthly per bed, or once upfront at install. The four-year total is the same. New equipment-purchase deals start with this; reps can change it on each deal.
      </p>
    </div>
  );
}

'use client';

/**
 * Price book setting: how new equipment-purchase deals bill software & services (monthly, or once upfront).
 * Each deal starts with this and can change it.
 */
import { useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';

export function SoftwareBillingDefault({ initial, canEdit }: { initial: 'monthly' | 'upfront'; canEdit: boolean }) {
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
      setMsg('Saved');
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setV(prev);
      setMsg(e instanceof Error ? e.message : 'Could not save');
    }
  };
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Equipment purchase: software &amp; services billing</h2>
          <p className="text-sm text-teton-ui-gray mt-1">
            How new deals bill software &amp; services: monthly per bed, or once upfront at install (the upfront prices above). The total over four years is the same. Reps can change it on each deal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg && <span className="text-xs text-teton-ui-gray">{msg}</span>}
          <SegGroup className="relative inline-flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Default software billing">
            {(['monthly', 'upfront'] as const).map((o) => (
              <button key={o} type="button" role="radio" aria-checked={v === o} disabled={!canEdit} onClick={() => save(o)} className={`relative z-[1] h-8 px-4 rounded-[8px] text-[13px] font-semibold transition-colors duration-200 disabled:cursor-default ${v === o ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>
                {o === 'monthly' ? 'Monthly' : 'Upfront'}
              </button>
            ))}
          </SegGroup>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * Price book item → Details: how it bills (monthly, one-time, every N years), what one unit is, and for items priced
 * from their details, what the quantity is and how pilots treat it. Built-in items keep their pricing rules (a few can
 * switch to being priced from their details). Saving refreshes the core products' copy of the item.
 */
import { useEffect, useRef, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { Collapse } from '@/components/form/fields';
import { SwitchButton } from '@/components/quote/sections';
import { BILLING_LABEL, BUILTIN_DETAILS, COUNT_BASES, COUNT_LABEL, PER_LABEL, billingOf, type Billing, type CountBasis, type PerUnit, type PilotRule } from '@/lib/pricing/catalog';
import { CATEGORIES, placeFor } from '@/lib/pricing/markets';
import { CONVERTIBLE } from '@/lib/pricing/lineup';
import type { PriceBookRow } from '@/lib/data/priceBook';
import type { LineupInfo } from '@/lib/data/lineup';

/** What one unit is, for each quantity (the wording follows the quantity unless changed after). */
const PER_OF: Record<CountBasis, PerUnit> = { monitoredBeds: 'bed', ecallBeds: 'bed', ecallOnlyBeds: 'bed', monitoredEcallBeds: 'bed', snfBeds: 'bed', rooms: 'room', commonAreaSensors: 'sensor', additionalSensors: 'sensor', perCommunity: 'community' };
export const PILOT_LABEL: Record<PilotRule, string> = { free: 'Free during the pilot', charged: 'Billed during the pilot too', credited: 'Credited on pilot sites', none: 'No pilot credit' };
const PERS = Object.keys(PER_LABEL) as PerUnit[];
const h4 = 'mb-2 text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#8A919C]';
const box = 'rounded-[14px] border border-[#E8E4DC] px-3.5 py-3 mb-3';
const input = 'h-9 w-full rounded-[10px] border border-[#E4E0D6] bg-white px-3 text-[13px] outline-none focus:border-[#3F8CEA]';
const label = 'block mb-1 text-[11.5px] font-semibold text-[#4E5562]';

export interface DetailsForm {
  billing: Billing;
  everyYears: number;
  per: PerUnit;
  counted: CountBasis;
  pilotRule: PilotRule;
  category: string;
  sub: string;
  description: string;
}

export const formOf = (r: PriceBookRow): DetailsForm => {
  const billing = billingOf(r);
  return {
    billing,
    everyYears: r.everyYears ?? 1,
    per: r.per ?? 'bed',
    counted: r.counted ?? CONVERTIBLE[r.sku]?.counted ?? 'monitoredBeds',
    pilotRule: r.pilotRule ?? CONVERTIBLE[r.sku]?.pilot ?? (billing === 'monthly' ? 'free' : 'credited'),
    category: placeFor(r).category,
    sub: placeFor(r).sub,
    description: r.description,
  };
};

/** The billing, unit, quantity and pilot fields (shared with the new item drawer). */
export function DetailFields({ f, set, disabled, pricing }: { f: DetailsForm; set: (p: Partial<DetailsForm>) => void; disabled?: boolean; pricing: boolean }) {
  const pilots: PilotRule[] = f.billing === 'monthly' ? ['free', 'charged'] : ['credited', 'none'];
  return (
    <div className="space-y-3">
      {pricing && (
        <>
          <div>
            <span className={label}>Billing</span>
            <SegGroup label="Billing" className="inline-flex flex-wrap rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]">
              {(['monthly', 'once', 'years'] as const).map((b) => (
                <button key={b} type="button" role="radio" aria-checked={f.billing === b} disabled={disabled} onClick={() => set({ billing: b, pilotRule: b === 'monthly' ? (f.pilotRule === 'charged' ? 'charged' : 'free') : f.pilotRule === 'none' ? 'none' : 'credited' })} className={`h-9 sm:h-8 px-3 rounded-[8px] text-[12.5px] transition-colors duration-200 ${f.billing === b ? 'font-semibold text-teton-ink' : 'text-[#5A6270]'}`}>
                  {BILLING_LABEL[b]}
                </button>
              ))}
            </SegGroup>
          </div>
          <Collapse open={f.billing === 'years'}>
            <label className="block">
              <span className={label}>Every how many years?</span>
              <input type="number" min={1} max={20} value={f.everyYears} disabled={disabled} onChange={(e) => set({ everyYears: Math.max(1, Math.min(20, Math.floor(Number(e.target.value) || 1))) })} className={`${input} w-[120px]`} />
              <small className="mt-1 block text-[11px] text-[#8A919C]">Charged with the one-time charges, then again every {f.everyYears} {f.everyYears === 1 ? 'year' : 'years'}.</small>
            </label>
          </Collapse>
          <label className="block">
            <span className={label}>Quantity on a deal</span>
            <select value={f.counted} disabled={disabled} onChange={(e) => set({ counted: e.target.value as CountBasis, per: PER_OF[e.target.value as CountBasis] })} className={input}>
              {COUNT_BASES.map((c) => (
                <option key={c} value={c}>
                  {COUNT_LABEL[c].replace(/^per /, 'One per ').replace(/^one per/, 'One per')}
                </option>
              ))}
            </select>
            <small className="mt-1 block text-[11px] text-[#8A919C]">From Communities and Scope; reps never type it.</small>
          </label>
          <div>
            <span className={label}>Pilots</span>
            <SegGroup label="Pilots" className="inline-flex flex-wrap rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]">
              {pilots.map((p) => (
                <button key={p} type="button" role="radio" aria-checked={f.pilotRule === p} disabled={disabled} onClick={() => set({ pilotRule: p })} className={`h-9 sm:h-8 px-3 rounded-[8px] text-[12.5px] transition-colors duration-200 ${f.pilotRule === p ? 'font-semibold text-teton-ink' : 'text-[#5A6270]'}`}>
                  {PILOT_LABEL[p]}
                </button>
              ))}
            </SegGroup>
          </div>
        </>
      )}
      <label className="block">
        <span className={label}>Priced per (wording)</span>
        <select value={f.per} disabled={disabled} onChange={(e) => set({ per: e.target.value as PerUnit })} className={input}>
          {PERS.map((p) => (
            <option key={p} value={p}>
              {PER_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ItemDetailsTab({ r, canEdit, onSaved, onLineup, draft, onDraft }: { r: PriceBookRow; canEdit: boolean; onSaved: (r: PriceBookRow) => void; onLineup?: (l: LineupInfo) => void; draft?: DetailsForm | null; onDraft?: (f: DetailsForm | null) => void }) {
  // Unsaved edits kept by the price book (see onDraft) come back when the item is opened again.
  const [f, setF] = useState<DetailsForm>(() => draft ?? formOf(r));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [openDeals, setOpenDeals] = useState<number | null>(null);
  const seen = useRef(r);
  useEffect(() => {
    if (seen.current === r) return; // first render: keep the draft
    seen.current = r;
    setF(formOf(r));
  }, [r]);
  useEffect(() => {
    if (!canEdit) return;
    let live = true;
    fetch(`/api/catalog/${encodeURIComponent(r.sku)}/details`)
      .then((x) => (x.ok ? x.json() : null))
      .then((j) => live && j && setOpenDeals(Number(j.openDeals)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [r.sku, canEdit]);
  const builtin = !!BUILTIN_DETAILS[r.sku];
  const conv = CONVERTIBLE[r.sku];
  const generic = !!r.generic;
  const base = formOf(r);
  const changed = (Object.keys(f) as Array<keyof DetailsForm>).filter((k) => f[k] !== base[k] && (generic || k === 'per' || k === 'description'));
  const draftKey = changed.length ? JSON.stringify(f) : '';
  const report = useRef(onDraft);
  report.current = onDraft;
  useEffect(() => report.current?.(draftKey ? f : null), [draftKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const pricingChanged = changed.some((k) => k === 'billing' || k === 'everyYears' || k === 'counted' || k === 'pilotRule');
  const send = async (body: Record<string, unknown>) => {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(r.sku)}/details`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Could not save');
      onSaved(j.item as PriceBookRow);
      if (j.lineup) {
        onLineup?.(j.lineup as LineupInfo);
        setDone(`Saved. Core products are now version ${(j.lineup as LineupInfo).lineup.version}: new deals use it; open deals show “Update this deal”.`);
      } else setDone('Saved.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  const save = () => {
    const body: Record<string, unknown> = {};
    for (const k of changed) body[k] = f[k];
    if (body.billing && body.billing !== 'years') delete body.everyYears;
    if (f.billing === 'years' && (body.billing || body.everyYears !== undefined)) body.everyYears = f.everyYears;
    void send(body);
  };
  const where = placeFor(r);

  if (!canEdit)
    return (
      <div className={box}>
        <p className={h4}>Details</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[12.5px]">
          <dt className="text-[#6B7380]">Billing</dt>
          <dd>{base.billing === 'years' ? `Every ${base.everyYears} years` : BILLING_LABEL[base.billing]}</dd>
          <dt className="text-[#6B7380]">Priced per</dt>
          <dd>{PER_LABEL[base.per]}</dd>
          {generic && (
            <>
              <dt className="text-[#6B7380]">Quantity</dt>
              <dd>{COUNT_LABEL[base.counted]}</dd>
              <dt className="text-[#6B7380]">Pilots</dt>
              <dd>{PILOT_LABEL[base.pilotRule]}</dd>
            </>
          )}
          <dt className="text-[#6B7380]">In</dt>
          <dd>
            {where.category} · {where.sub}
          </dd>
        </dl>
      </div>
    );

  return (
    <>
      <div className={box}>
        <p className={h4}>How it’s priced</p>
        {builtin && !conv && !generic && (
          <p className="text-[12.5px] leading-relaxed text-[#4E5562]">
            <b>Built-in rules.</b> How this item bills is part of its pricing rules (pilot rates, credits, bundles), so it can’t change here. To bill it another way, add a new item and swap it into the core product.
          </p>
        )}
        {conv && (
          <div className="flex items-start gap-2.5">
            <SwitchButton label="Priced from these details" on={generic} disabled={busy} onChange={(on) => void send({ generic: on })} />
            <span className="text-[12.5px] leading-snug">
              <b>{generic ? 'Priced from these details' : 'Built-in rules'}</b>
              <small className="block text-[11.5px] text-[#6B7380]">{generic ? 'Turn off to go back to its built-in rules.' : `Turn on to edit how it bills. Drops: ${conv.drops}.`}</small>
            </span>
          </div>
        )}
        {!builtin && <p className="text-[12.5px] text-[#4E5562]">Priced from these details: quantity × the deal’s price × how often it bills.</p>}
        <div className="mt-3">
          <DetailFields f={f} set={(p) => setF((x) => ({ ...x, ...p }))} disabled={busy} pricing={generic} />
        </div>
        {!builtin && (
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Category</span>
              <select value={f.category} disabled={busy} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))} className={input}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Group</span>
              <input value={f.sub} disabled={busy} onChange={(e) => setF((x) => ({ ...x, sub: e.target.value }))} className={input} maxLength={40} />
            </label>
          </div>
        )}
        <label className="mt-3 block">
          <span className={label}>Description (shown in proposals)</span>
          <textarea value={f.description} disabled={busy} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} rows={3} maxLength={400} className="w-full rounded-[10px] border border-[#E4E0D6] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#3F8CEA]" />
        </label>
        <Collapse open={pricingChanged && openDeals != null}>
          <p className="mt-2 rounded-[10px] border border-[#F0D58A] bg-[#FFF6DD] px-3 py-2 text-[12px] leading-relaxed">
            <b>Changing how it bills</b>: {openDeals ? `${openDeals} open ${openDeals === 1 ? 'deal has' : 'deals have'} this item; they keep the current version until someone presses “Update this deal”.` : 'no open deals have this item yet.'} New deals use the change. Saved versions never change.
          </p>
        </Collapse>
        <Collapse open={!!err}>
          <p role="alert" className="mt-2 rounded-[10px] bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#B4442C]">{err}</p>
        </Collapse>
        <Collapse open={!!done && !changed.length}>
          <p role="status" className="mt-2 rounded-[10px] bg-[#EEF8F1] px-3 py-2 text-[12px] text-[#1E7A4C]">✓ {done}</p>
        </Collapse>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" disabled={!changed.length || busy} onClick={() => setF(base)} className="h-9 px-3 rounded-[10px] border border-[#E4E0D6] bg-white text-[12.5px] font-semibold disabled:opacity-40">
            Discard
          </button>
          <button type="button" disabled={!changed.length || busy} onClick={save} className="h-9 px-3 rounded-[10px] bg-teton-ink text-white text-[12.5px] font-semibold disabled:opacity-40">
            {busy ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </div>
    </>
  );
}

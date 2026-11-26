'use client';

/**
 * The price book, laid out like an inventory module: a catalog panel (categories, market, filters, saved views), the
 * items in the chosen market (or every market side by side), and a drawer with one item's prices, guardrails, usage and
 * history. US prices price deals; the other markets are reference prices from the official sheet. Admins can edit both.
 */
import { useEffect, useMemo, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { Collapse } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import { SwipeSheet, usePhone } from '@/components/form/SwipeSheet';
import { PackSvg } from '@/components/resources/CardIcon';
import { TINTS, packIcon } from '@/lib/resources/iconPack';
import { CATEGORIES, LIVE_MARKET, MARKETS, formatMarketPrice, placeOf } from '@/lib/pricing/markets';
import { POLICY, type PricingModel } from '@/lib/pricing/catalog';
import type { PriceBookRow } from '@/lib/data/priceBook';

type Billing = 'all' | 'monthly' | 'once';
type Avail = 'all' | 'everywhere' | 'some' | 'notHere';

const UNIT: Record<PricingModel, string> = {
  per_bed_month: 'per bed / month',
  per_bed_once: 'per bed, one-time',
  per_unit_once: 'each, one-time',
  per_unit_month: 'each / month',
  multiplier: '× rooms-only price',
};
const isMonthly = (m: PricingModel) => m === 'per_bed_month' || m === 'per_unit_month';
const isOnce = (m: PricingModel) => m === 'per_bed_once' || m === 'per_unit_once';

const CATEGORY_NOTE: Record<string, string> = {
  Platform: 'The subscription, skilled nursing, the Teton One + E-Call bundles and installation.',
  'Add-ons': 'E-Call, extra and replacement devices, common areas and additional sensors.',
  'Capital purchase': 'Equipment bought outright: room packages, sensors, software & services, E-Call and renewals.',
  'Installation finish': 'Concealed cabling, quoted as a range per room after the site survey.',
};

/** A product's price in a market: the list price in the US, else its reference price. */
function priceIn(r: PriceBookRow, market: string): { price: number | null; notSold: boolean } {
  if (market === LIVE_MARKET) return { price: r.list, notSold: false };
  return r.markets[market] ?? { price: null, notSold: false };
}
const soldCount = (r: PriceBookRow) => MARKETS.filter((m) => priceIn(r, m.code).price != null).length;
const notSoldCount = (r: PriceBookRow) => MARKETS.filter((m) => priceIn(r, m.code).notSold).length;
const fmt = (r: PriceBookRow, market: string, v: number) => (r.pricingModel === 'multiplier' ? `${v}×` : formatMarketPrice(market, v));

function Icon({ sku, size = 'w-[34px] h-[34px]' }: { sku: string; size?: string }) {
  const p = placeOf(sku);
  const icon = packIcon(p.icon) ?? packIcon('document')!;
  const t = TINTS[p.tint] ?? TINTS.stone;
  return (
    <span className={`${size} rounded-[9px] grid place-items-center flex-shrink-0`} style={{ background: t.bg, color: t.fg }} aria-hidden="true">
      <PackSvg icon={icon} className="w-[52%] h-[52%]" />
    </span>
  );
}

function Status({ r, market }: { r: PriceBookRow; market: string }) {
  const here = priceIn(r, market);
  const sold = soldCount(r);
  const [dot, color, text] =
    r.pricingModel === 'multiplier'
      ? ['bg-[#C9CDD3]', 'text-[#6B7380]', 'Older deals']
      : here.notSold
        ? ['bg-[#C9CDD3]', 'text-[#8A919C]', 'Not sold here']
        : here.price == null
          ? ['bg-[#C9CDD3]', 'text-[#8A919C]', 'No price']
          : sold === MARKETS.length
            ? ['bg-[#46A951]', 'text-[#256B41]', 'All markets']
            : sold === 1
              ? ['bg-[#E3A500]', 'text-[#8A5A00]', 'US only']
              : ['bg-[#E3A500]', 'text-[#8A5A00]', 'Some markets'];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold whitespace-nowrap ${color}`}>
      <span className={`w-[7px] h-[7px] rounded-full ${dot}`} aria-hidden="true" />
      {text}
    </span>
  );
}

function Dots({ r }: { r: PriceBookRow }) {
  return (
    <span className="flex items-center gap-[3px]" aria-label={`Priced in ${soldCount(r)} of ${MARKETS.length} markets`}>
      {MARKETS.map((m) => {
        const p = priceIn(r, m.code);
        return <i key={m.code} title={`${m.name}: ${p.notSold ? 'not sold' : p.price == null ? 'no price' : fmt(r, m.code, p.price)}`} className={`w-[11px] h-[11px] rounded-[3px] ${p.notSold ? 'bg-[#E9E5DE]' : p.price == null ? 'bg-[repeating-linear-gradient(45deg,#F1EEE7_0_2px,#fff_2px_4px)] shadow-[inset_0_0_0_1px_#E9E5DE]' : 'bg-[#46A951]'}`} />;
      })}
      <small className="ml-1.5 text-[11px] text-[#6B7380] tabular-nums">
        {soldCount(r)}/{MARKETS.length}
      </small>
    </span>
  );
}

export function PriceBookModule({ rows: initial, canEdit, policy }: { rows: PriceBookRow[]; canEdit: boolean; policy?: React.ReactNode }) {
  const phone = usePhone('(max-width: 1023px)');
  const [rows, setRows] = useState(initial);
  const [cat, setCat] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const [market, setMarket] = useState(LIVE_MARKET);
  const [billing, setBilling] = useState<Billing>('all');
  const [avail, setAvail] = useState<Avail>('all');
  const [view, setView] = useState<'list' | 'compare'>('list');
  const [group, setGroup] = useState<'sub' | 'none'>('sub');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [shut, setShut] = useState<Set<string>>(() => new Set());
  // The drawer keeps showing its item while it slides away.
  const [shown, setShown] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (sel) {
      setShown(sel);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const t = setTimeout(() => (setShown(null), setLeaving(false)), 200);
    return () => clearTimeout(t);
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = MARKETS.find((x) => x.code === market) ?? MARKETS[0];
  const inCat = (r: PriceBookRow) => (!cat || placeOf(r.sku).category === cat) && (!sub || placeOf(r.sku).sub === sub);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!inCat(r)) return false;
      if (s && !`${r.name} ${r.sku} ${r.description}`.toLowerCase().includes(s)) return false;
      if (billing === 'monthly' && !isMonthly(r.pricingModel)) return false;
      if (billing === 'once' && !isOnce(r.pricingModel)) return false;
      if (avail === 'everywhere' && soldCount(r) !== MARKETS.length) return false;
      if (avail === 'some' && (soldCount(r) === MARKETS.length || soldCount(r) === 0)) return false;
      if (avail === 'notHere' && priceIn(r, market).price != null) return false;
      return true;
    });
  }, [rows, cat, sub, q, billing, avail, market]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    if (group === 'none') return [{ key: 'all', title: '', items: list }];
    const out: Array<{ key: string; title: string; items: PriceBookRow[] }> = [];
    for (const r of list) {
      const p = placeOf(r.sku);
      const key = `${p.category} · ${p.sub}`;
      const g = out.find((x) => x.key === key) ?? (out.push({ key, title: cat ? p.sub : key, items: [] }), out[out.length - 1]);
      g.items.push(r);
    }
    return out;
  }, [list, group, cat]);

  const title = sub ?? cat ?? 'All items';
  const hereSold = list.filter((r) => priceIn(r, market).price != null).length;
  const gaps = list.reduce((n, r) => n + notSoldCount(r), 0);
  const preset = (p: 'us' | 'capex' | 'gaps') => {
    setSub(null);
    setQ('');
    if (p === 'us') (setCat('Platform'), setMarket('US'), setBilling('monthly'), setAvail('all'), setView('list'));
    if (p === 'capex') (setCat('Capital purchase'), setMarket('US'), setBilling('all'), setAvail('all'), setView('list'));
    if (p === 'gaps') (setCat(null), setBilling('all'), setAvail('some'), setView('compare'));
  };

  const exportCsv = () => {
    const head = ['SKU', 'Item', 'Category', 'Subcategory', 'Unit', ...MARKETS.map((x) => `${x.code} (${x.currency})`)];
    const lines = list.map((r) => {
      const p = placeOf(r.sku);
      return [r.sku, r.name, p.category, p.sub, UNIT[r.pricingModel], ...MARKETS.map((x) => {
        const v = priceIn(r, x.code);
        return v.notSold ? 'not sold' : v.price == null ? '' : String(v.price);
      })];
    });
    const csv = [head, ...lines].map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `teton-price-book-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const replace = (row: PriceBookRow) => setRows((rs) => rs.map((x) => (x.sku === row.sku ? row : x)));
  const shownRow = rows.find((r) => r.sku === shown) ?? null;
  const pill = (on: boolean) => `relative z-[1] h-8 px-3.5 rounded-[8px] text-[12.5px] font-semibold whitespace-nowrap transition-colors duration-200 ${on ? 'text-teton-ink' : 'text-teton-ui-gray'}`;
  const chip = (on: boolean) => `relative z-[1] h-[26px] px-2.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap transition-colors duration-200 ${on ? 'text-white' : 'text-[#5A6270]'}`;

  // ---------------------------------------------------------------- catalog panel
  const count = (c?: string, s?: string) => rows.filter((r) => (!c || placeOf(r.sku).category === c) && (!s || placeOf(r.sku).sub === s)).length;
  const subsOf = (c: string) => Array.from(new Set(rows.filter((r) => placeOf(r.sku).category === c).map((r) => placeOf(r.sku).sub)));
  const node = (on: boolean) => `w-full flex items-center gap-2 px-2 py-1.5 rounded-[9px] text-left text-[13px] transition-colors duration-150 ${on ? 'bg-white shadow-[0_0_0_1px_#E3DFD8] font-semibold text-teton-ink' : 'text-[#3F4753] hover:bg-white/70'}`;
  const n = (on: boolean, v: number) => <span className={`ml-auto min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold grid place-items-center ${on ? 'bg-teton-ink text-white' : 'bg-[#E9E5DE] text-[#5A6270]'}`}>{v}</span>;
  const eb = 'mt-4 mb-1.5 mx-1.5 text-[10px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]';
  const catIcon: Record<string, string> = { Platform: 'TETON-PLATFORM', 'Add-ons': 'COMMON-AREA-SETUP', 'Capital purchase': 'CAPEX-BASE', 'Installation finish': 'FINISH-CONCEALED-LOW' };

  const panel = (
    <aside className="w-[268px] flex-shrink-0 border-r border-[#ECE8DF] bg-[#F6F3EE] overflow-y-auto overscroll-contain px-3 pt-5 pb-8">
      <div className="px-1.5">
        <b className="block text-[16px]">Price Book</b>
        <small className="text-[12px] text-[#6B7380]">US prices deals · 8 markets for reference</small>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, SKUs…" aria-label="Search the price book" className="mt-3 w-full h-9 rounded-[10px] border border-[#E3DFD8] bg-white px-3 text-[13px] outline-none focus:border-[#3F8CEA] focus:ring-[3px] focus:ring-[#3F8CEA]/15" />
      <p className={eb}>Catalog</p>
      <button type="button" className={node(!cat)} onClick={() => (setCat(null), setSub(null))}>
        <span className="w-6 h-6 rounded-[7px] grid place-items-center bg-[#F1EEE7] text-[#3F4753] text-[12px]" aria-hidden="true">▦</span>
        All items
        {n(!cat, rows.length)}
      </button>
      {CATEGORIES.map((c) => {
        const on = cat === c;
        return (
          <div key={c}>
            <button type="button" aria-expanded={on} className={node(on && !sub)} onClick={() => (setCat(on && !sub ? null : c), setSub(null))}>
              <span className={`w-2.5 text-[8px] text-[#8A919C] transition-transform duration-300 motion-reduce:transition-none ${on ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
              <Icon sku={catIcon[c]} size="w-6 h-6" />
              {c}
              {n(on && !sub, count(c))}
            </button>
            <Collapse open={on}>
              <div className="pl-7 py-0.5">
                {subsOf(c).map((s) => (
                  <button key={s} type="button" className={`${node(sub === s)} py-1 text-[12.5px]`} onClick={() => setSub(sub === s ? null : s)}>
                    {s}
                    {n(sub === s, count(c, s))}
                  </button>
                ))}
              </div>
            </Collapse>
          </div>
        );
      })}
      <p className={eb}>Market</p>
      <div role="radiogroup" aria-label="Market">
        {MARKETS.map((x) => (
          <button key={x.code} type="button" role="radio" aria-checked={market === x.code} onClick={() => setMarket(x.code)} className={`w-full flex items-center gap-2 px-2 py-[5px] rounded-[8px] text-[12.5px] text-left transition-colors duration-150 ${market === x.code ? 'bg-white shadow-[0_0_0_1px_#E3DFD8] text-teton-ink font-semibold' : 'text-[#3F4753] hover:bg-white/70'}`}>
            <span className={`w-7 h-5 rounded-[5px] border text-[10px] font-bold grid place-items-center ${market === x.code ? 'bg-teton-ink border-teton-ink text-white' : 'bg-white border-[#E3DFD8]'}`}>{x.code}</span>
            {x.name}
            <span className="ml-auto text-[11px] text-[#8A919C]">{x.code === LIVE_MARKET ? 'Live' : x.currency}</span>
          </button>
        ))}
      </div>
      <p className={eb}>Billing</p>
      <SegGroup className="relative inline-flex flex-wrap gap-1 px-1" thumbClass="bg-teton-ink rounded-full" label="Billing">
        {(
          [
            ['all', 'All'],
            ['monthly', 'Monthly'],
            ['once', 'One-time'],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={billing === v} onClick={() => setBilling(v)} className={`${chip(billing === v)} ${billing === v ? '' : 'bg-white shadow-[inset_0_0_0_1px_#E3DFD8]'}`}>
            {l}
          </button>
        ))}
      </SegGroup>
      <p className={eb}>Availability</p>
      <SegGroup className="relative inline-flex flex-wrap gap-1 px-1" thumbClass="bg-teton-ink rounded-full" label="Availability">
        {(
          [
            ['all', 'All'],
            ['everywhere', 'Every market'],
            ['some', 'Some markets'],
            ['notHere', `Not in ${m.code}`],
          ] as const
        ).map(([v, l]) => (
          <button key={v} type="button" role="radio" aria-checked={avail === v} onClick={() => setAvail(v)} className={`${chip(avail === v)} ${avail === v ? '' : 'bg-white shadow-[inset_0_0_0_1px_#E3DFD8]'}`}>
            {l}
          </button>
        ))}
      </SegGroup>
      <p className={eb}>Saved views</p>
      {(
        [
          ['us', 'US subscription prices'],
          ['capex', 'Equipment purchase kit'],
          ['gaps', 'Gaps by market'],
        ] as const
      ).map(([k, l]) => (
        <button key={k} type="button" className={node(false)} onClick={() => preset(k)}>
          <span className="text-[#B7791F]" aria-hidden="true">★</span> {l}
        </button>
      ))}
    </aside>
  );

  // ---------------------------------------------------------------- items
  const kpis = (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5 my-4">
      {(
        [
          ['Items', String(list.length), `${new Set(list.map((r) => placeOf(r.sku).sub)).size} groups`],
          [`Priced in ${m.name}`, String(hereSold), `${list.length - hereSold} not offered or no price`],
          ['Monthly / one-time', `${list.filter((r) => isMonthly(r.pricingModel)).length} / ${list.filter((r) => isOnce(r.pricingModel)).length}`, 'recurring vs. upfront'],
          ['Market gaps', String(gaps), `“not sold” cells across ${MARKETS.length} markets`],
        ] as const
      ).map(([a, b, c]) => (
        <div key={a} className="rounded-[14px] border border-[#E8E4DC] bg-white px-3.5 py-3">
          <small className="block text-[11.5px] font-medium text-[#6B7380]">{a}</small>
          <b className="block mt-1 text-[20px] tracking-[-.3px] tabular-nums">{b}</b>
          <em className="not-italic text-[11.5px] text-[#8A919C]">{c}</em>
        </div>
      ))}
    </div>
  );

  const cols = 'grid grid-cols-[minmax(200px,2.4fr)_minmax(110px,.9fr)_92px_minmax(96px,.8fr)_172px_104px] gap-3 items-center px-4';
  const table = (
    <div className="rounded-2xl border border-[#E8E4DC] bg-white overflow-hidden">
      <div className={`${cols} h-10 bg-[#FAF8F4] border-b border-[#ECE8DF] text-[10px] font-extrabold uppercase tracking-[1px] text-[#8A919C]`}>
        <span>Item</span>
        <span>SKU</span>
        <span>Billing</span>
        <span className="text-right">{m.code} price</span>
        <span>Priced in</span>
        <span>Status</span>
      </div>
      {groups.map((g) => {
        const open = !shut.has(g.key);
        return (
          <div key={g.key}>
            {g.title && (
              <button type="button" aria-expanded={open} onClick={() => setShut((s) => { const x = new Set(s); if (x.has(g.key)) x.delete(g.key); else x.add(g.key); return x; })} className="w-full flex items-center gap-2 px-4 py-2 bg-[#FCFBF8] border-b border-[#F1EEE7] text-left text-[10.5px] font-extrabold uppercase tracking-[1.2px] text-[#5A6270]">
                <span className={`text-[8px] text-[#8A919C] transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} aria-hidden="true">▶</span>
                {g.title}
                <span className="min-w-[20px] h-[18px] px-1.5 rounded-full bg-[#E9E5DE] text-[10.5px] tracking-normal grid place-items-center">{g.items.length}</span>
              </button>
            )}
            <Collapse open={open}>
              {g.items.map((r) => {
                const here = priceIn(r, market);
                return (
                  <button key={r.sku} type="button" onClick={() => setSel(sel === r.sku ? null : r.sku)} aria-current={sel === r.sku ? 'true' : undefined} className={`${cols} w-full min-h-[56px] py-2 border-b border-[#F1EEE7] text-left transition-colors duration-150 ${sel === r.sku ? 'bg-[#F3F7FD] shadow-[inset_3px_0_#3F8CEA]' : 'hover:bg-[#FCFBF8]'}`}>
                    <span className="flex items-center gap-2.5 min-w-0">
                      <Icon sku={r.sku} />
                      <span className="min-w-0">
                        <b className="block truncate text-[13px] font-semibold">{r.name}</b>
                        <small className="block truncate text-[11.5px] text-[#6B7380]">{UNIT[r.pricingModel]}</small>
                      </span>
                    </span>
                    <span className="truncate font-mono text-[11px] text-[#5A6270]">{r.sku}</span>
                    <span>
                      <span className={`inline-flex h-[22px] items-center px-2 rounded-full text-[11px] font-semibold ${isMonthly(r.pricingModel) ? 'bg-[#EAF2FD] text-[#1F5FB5]' : isOnce(r.pricingModel) ? 'bg-[#FFF4D6] text-[#8A5A00]' : 'bg-[#F1EEE7] text-[#5A6270]'}`}>{isMonthly(r.pricingModel) ? 'Monthly' : isOnce(r.pricingModel) ? 'One-time' : 'Multiplier'}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      {here.notSold ? <span className="text-[12px] font-semibold text-[#A9ADB4]">Not sold</span> : here.price == null ? <span className="text-[12px] text-[#A9ADB4]">—</span> : <b className="text-[14px]">{fmt(r, market, here.price)}</b>}
                    </span>
                    <Dots r={r} />
                    <Status r={r} market={market} />
                  </button>
                );
              })}
            </Collapse>
          </div>
        );
      })}
      {!list.length && <p className="px-4 py-10 text-center text-[13px] text-[#6B7380]">Nothing matches these filters.</p>}
    </div>
  );

  const matrix = (
    <div className="rounded-2xl border border-[#E8E4DC] bg-white overflow-x-auto">
      <table className="w-full min-w-[920px] text-[12.5px] tabular-nums border-collapse">
        <thead>
          <tr className="bg-[#FAF8F4] text-[10px] font-extrabold uppercase tracking-[1px] text-[#8A919C]">
            <th className="text-left px-4 py-2.5 sticky left-0 bg-[#FAF8F4]">Item</th>
            {MARKETS.map((x) => (
              <th key={x.code} className={`text-right px-3 py-2.5 ${x.code === market ? 'text-teton-ink' : ''}`}>
                {x.code}
                <small className="block font-semibold normal-case tracking-normal text-[#A9ADB4]">{x.code === LIVE_MARKET ? 'Live' : x.currency}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => [
            g.title ? (
              <tr key={`${g.key}-h`}>
                <td colSpan={MARKETS.length + 1} className="px-4 py-2 bg-[#FCFBF8] border-y border-[#F1EEE7] text-[10.5px] font-extrabold uppercase tracking-[1.2px] text-[#5A6270]">{g.title}</td>
              </tr>
            ) : null,
            ...g.items.map((r) => (
              <tr key={r.sku} className={`border-b border-[#F1EEE7] cursor-pointer ${sel === r.sku ? 'bg-[#F3F7FD]' : 'hover:bg-[#FCFBF8]'}`} onClick={() => setSel(r.sku)}>
                <td className="px-4 py-2.5 sticky left-0 bg-inherit">
                  <span className="flex items-center gap-2.5 min-w-[220px]">
                    <Icon sku={r.sku} size="w-7 h-7" />
                    <span>
                      <b className="block text-[12.5px] font-semibold">{r.name}</b>
                      <small className="text-[11px] text-[#6B7380]">{UNIT[r.pricingModel]}</small>
                    </span>
                  </span>
                </td>
                {MARKETS.map((x) => {
                  const p = priceIn(r, x.code);
                  return (
                    <td key={x.code} className={`px-3 py-2.5 text-right font-semibold ${p.notSold ? 'bg-[#FEF6F4] text-[#C2412D] text-[11.5px]' : p.price == null ? 'text-[#C9CDD3]' : ''}`}>
                      {p.notSold ? 'Not sold' : p.price == null ? '—' : fmt(r, x.code, p.price)}
                    </td>
                  );
                })}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );

  // ---------------------------------------------------------------- phone
  const phoneList = (
    <div>
      <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[null, ...CATEGORIES].map((c) => (
          <button key={c ?? 'all'} type="button" aria-pressed={cat === c} onClick={() => (setCat(c), setSub(null))} className={`flex-shrink-0 h-8 px-3 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors duration-200 ${cat === c ? 'bg-teton-ink text-white' : 'bg-white text-[#5A6270] shadow-[inset_0_0_0_1px_#E3DFD8]'}`}>
            {c ?? 'All'} <span className="opacity-70">{count(c ?? undefined)}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" aria-label="Search the price book" className="flex-1 min-w-0 h-10 rounded-[10px] border border-[#D5D9DE] bg-white px-3 text-[14px]" />
        <select value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Market" className="h-10 rounded-[10px] border border-[#D5D9DE] bg-white px-2 text-[13px] font-semibold">
          {MARKETS.map((x) => (
            <option key={x.code} value={x.code}>
              {x.code} · {x.currency}
            </option>
          ))}
        </select>
      </div>
      {groups.map((g) => (
        <div key={g.key}>
          {g.title && <p className="mt-4 mb-2 mx-0.5 text-[10px] font-extrabold uppercase tracking-[1.6px] text-[#8A919C]">{g.title}</p>}
          {g.items.map((r) => {
            const p = priceIn(r, market);
            return (
              <button key={r.sku} type="button" onClick={() => setSel(r.sku)} className="w-full mb-2 flex gap-3 rounded-[14px] border border-[#E8E4DC] bg-white p-3 text-left">
                <Icon sku={r.sku} />
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px] font-semibold">{r.name}</b>
                  <small className="block text-[11.5px] text-[#6B7380]">
                    {r.sku} · {UNIT[r.pricingModel]}
                  </small>
                  <span className="block mt-1.5">
                    <Dots r={r} />
                  </span>
                </span>
                <span className="text-right tabular-nums">{p.notSold ? <span className="text-[12px] font-semibold text-[#A9ADB4]">Not sold</span> : p.price == null ? <span className="text-[#A9ADB4]">—</span> : <b className="text-[14px]">{fmt(r, market, p.price)}</b>}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const header = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="text-[22px] font-semibold tracking-[-.3px]">{title}</h1>
        <p className="mt-1 text-[13px] text-[#6B7380]">
          {(cat && CATEGORY_NOTE[cat]) || 'Every product the proposals price, by category.'}{' '}
          {market === LIVE_MARKET ? 'Prices shown are the US list prices that new deals start from.' : `Prices shown are ${m.name} reference prices (${m.currency}) from the official sheet; deals are priced in the US.`}
        </p>
      </div>
    </div>
  );

  const body = (
    <div className="flex-1 min-w-0 flex flex-col lg:overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 lg:px-6 py-3 border-b border-[#ECE8DF] bg-white">
        <span className="text-[12px] text-[#8A919C] hidden sm:inline">
          Settings / <b className="text-teton-ink">Price Book</b>
        </span>
        <span className="flex-1" />
        <SegGroup className="relative inline-flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="View">
          <button type="button" role="radio" aria-checked={view === 'list'} onClick={() => setView('list')} className={pill(view === 'list')}>
            List
          </button>
          <button type="button" role="radio" aria-checked={view === 'compare'} onClick={() => setView('compare')} className={pill(view === 'compare')}>
            Compare markets
          </button>
        </SegGroup>
        <button type="button" onClick={exportCsv} className="h-9 px-3 rounded-[10px] border border-[#D5D9DE] bg-white text-[12.5px] font-semibold hover:bg-teton-almost-white">
          ⤓ Export
        </button>
      </div>
      <div className="flex-1 lg:overflow-y-auto px-4 lg:px-6 pt-5 pb-12">
        {phone && view === 'list' ? (
          <>
            {header}
            <div className="mt-3">{phoneList}</div>
          </>
        ) : (
          <>
            {header}
            {view === 'list' && kpis}
            {view === 'list' ? (
              <>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-[12px] text-[#6B7380] ml-auto">Group by</span>
                  <SegGroup className="relative inline-flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Group by">
                    <button type="button" role="radio" aria-checked={group === 'sub'} onClick={() => setGroup('sub')} className={pill(group === 'sub')}>
                      Subcategory
                    </button>
                    <button type="button" role="radio" aria-checked={group === 'none'} onClick={() => setGroup('none')} className={pill(group === 'none')}>
                      None
                    </button>
                  </SegGroup>
                </div>
                {table}
              </>
            ) : (
              <div className="mt-4">
                <p className="mb-2 text-[12px] text-[#6B7380]">
                  Local currency. <span className="font-semibold text-[#C2412D]">Not sold</span> = not offered in that market; — = no price on the sheet.
                </p>
                {matrix}
              </div>
            )}
          </>
        )}
        {policy && <div className="mt-8 space-y-4">{policy}</div>}
      </div>
    </div>
  );

  return (
    <div className="-m-4 lg:-m-6 flex lg:h-[calc(100%+3rem)] bg-[#FBF8F3] text-teton-ink" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {!phone && panel}
      {body}
      {!phone && shownRow && (
        <div className={`w-[384px] flex-shrink-0 border-l border-[#ECE8DF] bg-white overflow-hidden ${leaving ? 'drawer-out' : 'drawer-in'}`}>
          <ItemDetail key={shownRow.sku} r={shownRow} canEdit={canEdit} market={market} onClose={() => setSel(null)} onSaved={replace} />
        </div>
      )}
      {phone && (
        <SwipeSheet open={!!sel} onClose={() => setSel(null)} eyebrow={shownRow?.sku} title={shownRow?.name ?? ''}>
          {shownRow && <ItemDetail key={shownRow.sku} r={shownRow} canEdit={canEdit} market={market} onClose={() => setSel(null)} onSaved={replace} bare />}
        </SwipeSheet>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one item

type Tab = 'pricing' | 'guardrails' | 'used' | 'history';

function guardrailsFor(r: PriceBookRow): Array<[string, string, string]> {
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  if (r.sku === 'TETON-PLATFORM')
    return [
      ['List', money(r.list), 'bg-[#F6F3EE]'],
      ['Post-pilot floor (warning)', money(POLICY.postPilotFloor), 'bg-[#EEF8F1] text-[#1E7A4C]'],
      [`Service term below ${POLICY.serviceTermFloorPct * 100}% of list`, 'Warning', 'bg-[#FFF6E5] text-[#8A5A00]'],
      [`Below ${POLICY.hardFloorPct * 100}% of list`, 'Deal Desk', 'bg-[#FDF0EE] text-[#C2412D]'],
      ['Standard pilot', `${money(POLICY.standardPilotRate)} × ${POLICY.standardPilotMonths} months`, 'bg-[#F3F7FD] text-[#1F5FB5]'],
    ];
  if (r.sku === 'TETON-INSTALL')
    return [
      ['List', money(r.list), 'bg-[#F6F3EE]'],
      ['Pilot install credit', 'None, 50%, 100% or custom', 'bg-[#F3F7FD] text-[#1F5FB5]'],
      ['Clawback', 'Optional, if the pilot doesn’t convert', 'bg-[#F6F3EE]'],
    ];
  if (r.sku === 'TETON-SNF') return [['List', money(r.list), 'bg-[#F6F3EE]'], ['Never above', 'the deal’s subscription rate', 'bg-[#EEF8F1] text-[#1E7A4C]']];
  if (r.sku.startsWith('BUNDLE-')) return [['Bundle price', money(r.list), 'bg-[#F6F3EE]'], ['Applied as', 'a discount per bed with both, after the pilot', 'bg-[#F3F7FD] text-[#1F5FB5]']];
  if (r.pricingModel === 'multiplier') return [['Usual range', `${POLICY.fullFacilityRange[0]}–${POLICY.fullFacilityRange[1]}×`, 'bg-[#F6F3EE]'], ['Outside it', 'Warning', 'bg-[#FFF6E5] text-[#8A5A00]']];
  return [
    ['List', money(r.list), 'bg-[#F6F3EE]'],
    ['On a deal', 'Reps can change it; the pricing check flags any difference from list', 'bg-[#F3F7FD] text-[#1F5FB5]'],
  ];
}

function ItemDetail({ r, canEdit, market, onClose, onSaved, bare = false }: { r: PriceBookRow; canEdit: boolean; market: string; onClose: () => void; onSaved: (r: PriceBookRow) => void; bare?: boolean }) {
  const [tab, setTab] = useState<Tab>('pricing');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [typed, setTyped] = useState<Record<string, number | null>>({});
  const p = placeOf(r.sku);
  const save = async (code: string, value: number | null | 'default' | 'not_sold') => {
    setErr(null);
    setBusy(code);
    try {
      const live = code === LIVE_MARKET;
      const res = await fetch(live ? `/api/catalog/${encodeURIComponent(r.sku)}` : `/api/catalog/${encodeURIComponent(r.sku)}/markets`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(live ? { list: value } : { market: code, value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Could not save');
      onSaved(j as PriceBookRow);
      setTyped(({ [code]: _d, ...rest }) => rest);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };
  const when = (s: string) => {
    const d = new Date(s.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const pillCls = (on: boolean) => `relative z-[1] h-8 px-3 rounded-[8px] text-[12.5px] font-semibold whitespace-nowrap transition-colors duration-200 ${on ? 'text-teton-ink' : 'text-teton-ui-gray'}`;
  const box = 'rounded-[14px] border border-[#E8E4DC] px-3.5 py-3 mb-3';
  const h4 = 'mb-2 text-[10px] font-extrabold uppercase tracking-[1.5px] text-[#8A919C]';

  return (
    <div className={`flex flex-col ${bare ? '' : 'h-full'}`}>
      {!bare && (
        <div className="px-[18px] pt-4 pb-3 border-b border-[#F1EEE7]">
          <div className="flex items-start gap-2">
            <span className="font-mono text-[11px] text-[#5A6270]">{r.sku}</span>
            <button type="button" onClick={onClose} aria-label="Close" className="ml-auto w-8 h-8 rounded-full bg-[#F1EEE8] text-[#5A6270] grid place-items-center hover:bg-[#E9E4DB]">
              ✕
            </button>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <Icon sku={r.sku} size="w-11 h-11" />
            <span className="min-w-0">
              <b className="block text-[16.5px] font-semibold">{r.name}</b>
              <small className="text-[12px] text-[#6B7380]">{UNIT[r.pricingModel]}</small>
            </span>
          </div>
        </div>
      )}
      <div className={`flex flex-wrap gap-1.5 ${bare ? 'mb-3' : 'px-[18px] pt-3'}`}>
        <span className={`inline-flex h-[22px] items-center px-2 rounded-full text-[11px] font-semibold ${isMonthly(r.pricingModel) ? 'bg-[#EAF2FD] text-[#1F5FB5]' : isOnce(r.pricingModel) ? 'bg-[#FFF4D6] text-[#8A5A00]' : 'bg-[#F1EEE7] text-[#5A6270]'}`}>{isMonthly(r.pricingModel) ? 'Monthly' : isOnce(r.pricingModel) ? 'One-time' : 'Multiplier'}</span>
        <span className="inline-flex h-[22px] items-center px-2 rounded-full text-[11px] font-semibold bg-[#EEF8F1] text-[#1E7A4C]">
          {p.category} · {p.sub}
        </span>
      </div>
      <div className={bare ? 'mb-3' : 'px-[18px] pt-3'}>
        <SegGroup className="relative flex rounded-[10px] bg-[#F1EEE8] p-[3px] gap-0.5" thumbClass="bg-white shadow-sm rounded-[8px]" label="Item details">
          {(
            [
              ['pricing', 'Pricing'],
              ['guardrails', 'Guardrails'],
              ['used', 'Used in'],
              ['history', 'History'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={tab === v} onClick={() => setTab(v)} className={`${pillCls(tab === v)} flex-1`}>
              {l}
            </button>
          ))}
        </SegGroup>
      </div>
      <div className={`${bare ? '' : 'flex-1 overflow-y-auto px-[18px] pt-3 pb-6'} [animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]`} key={tab}>
        <p className="mb-3 text-[12.5px] leading-relaxed text-[#3F4753]">{r.description}</p>
        {err && <p className="mb-3 rounded-lg bg-[#FDF0EE] px-3 py-2 text-[12px] text-[#B4442C]">{err}</p>}
        {tab === 'pricing' && (
          <div className={box}>
            <p className={h4}>Price by market</p>
            {MARKETS.map((x) => {
              const v = priceIn(r, x.code);
              const live = x.code === LIVE_MARKET;
              const value = x.code in typed ? typed[x.code] : v.price;
              return (
                <div key={x.code} className={`flex items-center gap-2.5 py-1.5 border-t border-[#F4F1EB] first-of-type:border-t-0 text-[12.5px] ${x.code === market ? 'font-semibold' : ''}`}>
                  <span className={`w-7 h-5 rounded-[5px] border text-[10px] font-bold grid place-items-center flex-shrink-0 ${x.code === market ? 'bg-teton-ink border-teton-ink text-white' : 'border-[#E3DFD8]'}`}>{x.code}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {x.name}
                    {live && <small className="ml-1.5 text-[10.5px] font-semibold text-[#1E7A4C]">Live</small>}
                  </span>
                  {canEdit && !(r.pricingModel === 'multiplier' && !live) ? (
                    <span className="flex items-center gap-1.5">
                      {!live && (
                        <button type="button" disabled={busy === x.code} onClick={() => save(x.code, v.notSold ? 'default' : 'not_sold')} className={`h-7 px-2 rounded-md text-[11px] font-semibold ${v.notSold ? 'bg-[#FEF6F4] text-[#C2412D]' : 'text-[#8A919C] hover:bg-[#F6F3EE]'}`} title={v.notSold ? 'Back to the sheet’s price' : 'Mark as not sold here'}>
                          {v.notSold ? 'Not sold' : '⊘'}
                        </button>
                      )}
                      {!v.notSold && (
                        <span className="w-[112px]">
                          <NumInput
                            value={value}
                            onChange={(n) => setTyped((t) => ({ ...t, [x.code]: n }))}
                            onBlur={() => x.code in typed && save(x.code, live ? typed[x.code] : typed[x.code])}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            nullable={!live}
                            placeholder="—"
                            min={0}
                            disabled={busy === x.code}
                            aria-label={`${x.name} price`}
                            className="text-right h-8"
                          />
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className={`tabular-nums ${v.notSold ? 'text-[#C2412D] text-[11.5px] font-semibold' : v.price == null ? 'text-[#C9CDD3]' : 'font-semibold'}`}>{v.notSold ? 'Not sold' : v.price == null ? '—' : fmt(r, x.code, v.price)}</span>
                  )}
                </div>
              );
            })}
            <p className="mt-2 text-[11px] leading-snug text-[#8A919C]">US is the list price new deals start from. Other markets are reference prices from the official pricing sheet{canEdit ? '; ⊘ marks one as not sold there' : ''}.</p>
          </div>
        )}
        {tab === 'guardrails' && (
          <div className={box}>
            <p className={h4}>Guardrails · US</p>
            <div className="flex flex-col gap-1.5">
              {guardrailsFor(r).map(([a, b, cls]) => (
                <div key={a} className={`flex items-center gap-3 rounded-[10px] px-3 py-2 text-[12.5px] ${cls}`}>
                  <span className="min-w-0 flex-1">{a}</span>
                  <b className="text-right tabular-nums">{b}</b>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === 'used' && (
          <div className={box}>
            <p className={h4}>Used in</p>
            {r.usage.versions > 0 ? (
              <div className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[12.5px]">
                <span className="text-[#6B7380]">Saved versions with this line</span>
                <b className="tabular-nums">{r.usage.versions}</b>
                <span className="text-[#6B7380]">Deals</span>
                <b className="tabular-nums">{r.usage.deals}</b>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#6B7380]">{p.category === 'Capital purchase' || p.category === 'Installation finish' ? 'Equipment purchases and the finish are priced on the proposal, not as order lines, so they aren’t counted here.' : 'Not on any saved version’s price lines yet.'}</p>
            )}
          </div>
        )}
        {tab === 'history' && (
          <div className={box}>
            <p className={h4}>History</p>
            <div className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[12.5px]">
              <span className="text-[#6B7380]">Current list (US)</span>
              <b className="tabular-nums">{fmt(r, 'US', r.list)}</b>
              <span className="text-[#6B7380]">Standard price</span>
              <b className="tabular-nums">{r.defaultList == null ? '—' : fmt(r, 'US', r.defaultList)}</b>
              <span className="text-[#6B7380]">Last changed</span>
              <b>
                {when(r.updatedAt)}
                {r.updatedByName ? ` · ${r.updatedByName}` : ''}
              </b>
            </div>
            {canEdit && r.defaultList != null && r.list !== r.defaultList && (
              <button type="button" onClick={() => save(LIVE_MARKET, 'default')} disabled={busy === LIVE_MARKET} className="mt-3 h-8 px-3 rounded-[9px] border border-[#D5D9DE] text-[12px] font-semibold hover:bg-teton-almost-white">
                Reset to {fmt(r, 'US', r.defaultList)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

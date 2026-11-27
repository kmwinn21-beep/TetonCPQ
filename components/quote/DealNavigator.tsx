'use client';

/**
 * The deal page's left panel (wide screens): each section with its count or status, then what's still needed
 * before the deal is ready. And the page's section dots: the page scrolls without a scrollbar, with a dot per
 * section and up / down chevrons (like the deal room's panels).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import type { QuoteDraft } from '@/lib/quote/draft';
import { dealProducts, hasImplementation } from '@/lib/quote/products';
import { normalizeResources } from '@/lib/quote/resources';
import { normalizePlan } from '@/lib/quote/implementationPlan';
import { PackSvg } from '@/components/resources/CardIcon';
import { TINTS, packIcon } from '@/lib/resources/iconPack';
import { Collapse } from '@/components/form/fields';
import { useFloorPlans } from './FloorPlans';

type Item = { id: string; label: string; icon: string; tint: string; count?: number | null; dot?: 'ok' | 'warn' | 'bad' | null };

function Tile({ icon, tint }: { icon: string; tint: string }) {
  const t = TINTS[tint] ?? TINTS.stone;
  const ic = packIcon(icon) ?? packIcon('document')!;
  return (
    <span className="w-6 h-6 rounded-[7px] grid place-items-center flex-shrink-0" style={{ background: t.bg, color: t.fg }} aria-hidden="true">
      <PackSvg icon={ic} className="w-[14px] h-[14px]" />
    </span>
  );
}
const dotCls = { ok: 'bg-[#3BA66B]', warn: 'bg-[#E0A43A]', bad: 'bg-[#D9573E]' } as const;

export function DealNavigator({
  isOpen,
  onGo,
  assumptions,
  assumptionsOpen,
  onToggleAssumptions,
  onGoAssumption,
}: {
  isOpen: (id: string) => boolean;
  onGo: (id: string) => void;
  assumptions: ReadonlyArray<readonly [string, string]>;
  assumptionsOpen: boolean;
  onToggleAssumptions: () => void;
  onGoAssumption: (id: string) => void;
}) {
  const d = useWatch<QuoteDraft>() as QuoteDraft;
  const fp = useFloorPlans();
  const ps = dealProducts(d);
  // Core products added in the price book count too (their items are on the deal).
  const extra = (d.extraCores ?? []).length;
  const cs = d.communities ?? [];
  const roles = normalizeResources(d.resources).filter((r) => r.role).length;
  const stages = normalizePlan(d.implementationPlan).order.length;
  const withPlan = fp ? cs.filter((c) => fp.plans.some((p) => p.communityId === c.id)).length : null;
  const items: Item[] = [
    { id: 'pricing', label: 'Products & pricing', icon: 'pricing', tint: 'lilac', count: ps.length + extra ? ps.length + extra + (hasImplementation(ps) ? 1 : 0) : null, dot: ps.length + extra ? null : 'bad' },
    { id: 'communities', label: 'Communities', icon: 'building', tint: 'sky', count: cs.length || null, dot: cs.length ? null : 'bad' },
    { id: 'implplan', label: 'Implementation', icon: 'checklist', tint: 'mint', count: stages || null },
    { id: 'resources', label: 'Resource allocation', icon: 'community', tint: 'teal', count: roles || null },
    { id: 'terms', label: 'Terms / notes', icon: 'document', tint: 'sand' },
  ];
  const ready: Array<[string, 'ok' | 'warn' | 'bad', string]> = [
    ['Products', ps.length + extra ? 'ok' : 'bad', ps.length + extra ? String(ps.length + extra + (hasImplementation(ps) ? 1 : 0)) : 'none yet'],
    ['Communities', cs.length ? 'ok' : 'bad', cs.length ? `${cs.length}${cs.some((c) => c.pilot) ? ` · ${cs.filter((c) => c.pilot).length} pilot` : ''}` : 'none yet'],
    ...(withPlan != null && cs.length ? [['Floor plans', withPlan === cs.length ? 'ok' : withPlan ? 'warn' : 'bad', `${withPlan} of ${cs.length}`] as [string, 'ok' | 'warn' | 'bad', string]] : []),
  ];
  const row = (on: boolean) =>
    `w-full flex items-center gap-2.5 h-9 px-2.5 rounded-[10px] text-[13px] text-left transition-colors ${on ? 'bg-white shadow-[0_0_0_1px_#E4E0D6] font-semibold' : 'hover:bg-white/70'}`;
  return (
    <div className="text-teton-ink">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C] mb-1.5 px-1.5">Inputs</p>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.id}>
            <button type="button" onClick={() => onGo(it.id)} className={row(isOpen(it.id))}>
              <Tile icon={it.icon} tint={it.tint} />
              <span className="flex-1 min-w-0 truncate">{it.label}</span>
              {it.count != null && <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-[#E9E5DC] text-[11px] font-semibold text-[#4E5562] grid place-items-center">{it.count}</span>}
              {it.dot && <span className={`w-2 h-2 rounded-full ${dotCls[it.dot]}`} aria-label={it.dot === 'bad' ? 'Needed' : undefined} />}
            </button>
          </li>
        ))}
        <li>
          <button type="button" onClick={onToggleAssumptions} aria-expanded={assumptionsOpen} aria-controls="nav-assumptions" className={row(false)}>
            <Tile icon="dashboard" tint="stone" />
            <span className="flex-1 min-w-0 truncate">Assumptions</span>
            <svg className={`w-3.5 h-3.5 text-[#8A919C] transition-transform duration-300 motion-reduce:transition-none ${assumptionsOpen ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M7.2 4.2a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L11.92 10 7.2 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          <Collapse open={assumptionsOpen} id="nav-assumptions">
            <ul className="py-0.5">
              {assumptions.map(([id, label]) => (
                <li key={id}>
                  <button type="button" onClick={() => onGoAssumption(id)} className={`w-full h-8 pl-[46px] pr-2 rounded-[8px] text-left text-[12.5px] truncate ${isOpen(id) ? 'text-teton-ink font-semibold' : 'text-[#4E5562]'} hover:bg-white/70`}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </Collapse>
        </li>
      </ul>
      <p className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-[#8A919C] mt-5 mb-1.5 px-1.5">Readiness</p>
      <ul className="space-y-1">
        {ready.map(([label, tone, note]) => (
          <li key={label} className="flex items-center gap-2.5 px-2 py-1 text-[12.5px]">
            <span className={`w-2 h-2 rounded-full ${dotCls[tone]}`} aria-hidden="true" />
            {label}
            <small className="ml-auto text-[11px] text-[#8A919C]">{note}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The scrolling element the page sits in (the app's main column). */
function scroller(from: HTMLElement | null): HTMLElement | null {
  let el = from?.parentElement ?? null;
  while (el) {
    const o = getComputedStyle(el).overflowY;
    if (o === 'auto' || o === 'scroll') return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Section dots and chevrons for the deal page (wide screens). Hides the page's scrollbar while mounted; the dots sit
 * at the right edge of the inputs column and follow the page.
 */
export function PageDots({ ids }: { ids: ReadonlyArray<readonly [string, string]> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState({ cur: 0, top: true, bottom: false });
  const measure = useCallback(() => {
    const el = scroller(ref.current);
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    let cur = 0;
    ids.forEach(([id], i) => {
      const s = document.getElementById(id);
      if (s && s.getBoundingClientRect().top - top < el.clientHeight * 0.35) cur = i;
    });
    const bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    if (bottom) cur = ids.length - 1;
    setSt({ cur, top: el.scrollTop <= 4, bottom });
  }, [ids]);
  useEffect(() => {
    const el = scroller(ref.current);
    if (!el) return;
    el.classList.add('no-scrollbar');
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    measure();
    return () => {
      el.classList.remove('no-scrollbar');
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [measure]);
  const go = (i: number) => {
    const k = Math.max(0, Math.min(ids.length - 1, i));
    const s = document.getElementById(ids[k][0]);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (k === 0) scroller(ref.current)?.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    else s?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const chev = (dir: 'up' | 'down', show: boolean) => (
    <button
      type="button"
      aria-label={dir === 'up' ? 'Scroll up a section' : 'Scroll down a section'}
      tabIndex={show ? 0 : -1}
      onClick={() => go(dir === 'up' ? st.cur - 1 : st.cur + 1)}
      className={`pointer-events-auto w-[46px] h-[30px] rounded-full border border-[#E4E4E7] bg-white/95 shadow-[0_4px_12px_rgba(24,24,27,.12)] grid place-items-center text-teton-ink hover:bg-teton-ink hover:border-teton-ink hover:text-white transition-[opacity,background-color,color] duration-200 motion-reduce:transition-none ${show ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" aria-hidden="true">
        <path d={dir === 'up' ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
  return (
    <>
      {/* Dots: pinned half-way down the screen, beside the inputs. */}
      <div ref={ref} className="hidden xl:block absolute top-0 bottom-0 -right-[18px] w-3 pointer-events-none">
        <div className={`sticky top-[50vh] flex flex-col items-center gap-2 transition-opacity duration-200 ${st.top && st.bottom ? 'opacity-0 pointer-events-none' : 'pointer-events-auto'}`} role="group" aria-label="Sections">
          {ids.map(([id, n], i) => (
            <button
              key={id}
              type="button"
              title={n}
              aria-label={`Go to ${n}`}
              aria-current={i === st.cur ? 'true' : undefined}
              onClick={() => go(i)}
              className={`w-2 rounded-full transition-[height,background-color] duration-200 motion-reduce:transition-none ${i === st.cur ? 'h-5 bg-teton-ink' : 'h-2 bg-[#D4CFC6] hover:bg-[#A8A196]'}`}
            />
          ))}
        </div>
      </div>
      {/* The bottom fade and the down chevron, pinned to the bottom of the screen over the inputs. */}
      <div className="hidden xl:flex sticky bottom-0 h-16 items-end justify-center pb-2.5 pointer-events-none z-20" style={{ marginTop: '-4rem' }}>
        <span className={`absolute inset-0 bg-gradient-to-t from-teton-almost-white to-transparent transition-opacity duration-200 ${st.bottom ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true" />
        <span className="relative">{chev('down', !st.bottom)}</span>
      </div>
    </>
  );
}

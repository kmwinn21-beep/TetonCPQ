'use client';

/**
 * The business case's floating "+ Add" button (bottom right, while editing): it opens a list of everything that can
 * be added (one pagers, removed pages, sections, table rows and columns, figures), searchable and grouped. Adding
 * one goes to it on the page and selects it, so its options are ready in the options panel.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { useProposalText } from './EditableText';
import { useInspector } from './inspectorContext';
import { useAddables, type Addable } from './ProposalSections';
import type { OnePagerInfo } from '@/lib/proposal/onePager';
import { useBcRegistry, type BcRegistry } from './bcRegistry';
import { addCopy, copyBlockId, hasCopy, newCopyKey } from '@/lib/proposal/bcCopies';
import type { ProposalLayout } from '@/lib/proposal/layout';

/** The page "here" is: the one selected in the options panel, else the one in the middle of the screen. */
function pageHere(selected: string | null | undefined): string | null {
  if (selected) return selected;
  if (typeof document === 'undefined') return null;
  const mid = window.innerHeight / 2;
  let best: { id: string; d: number } | null = null;
  document.querySelectorAll<HTMLElement>('[data-bc-page]').forEach((el) => {
    const r = el.getBoundingClientRect();
    const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    if (!best || d < best.d) best = { id: el.dataset.bcPage ?? '', d };
  });
  return (best as { id: string } | null)?.id || null;
}

/**
 * Sections from other pages that can be copied onto `here`: not its own sections, and not one already copied there
 * (a section appears once per page). Only sections the deal has are in the registry.
 */
export function copyAddables(reg: BcRegistry, layout: Pick<ProposalLayout, 'bcCopies'>, here: string): Addable[] {
  const bp = reg.blocksOf[here]?.[0];
  if (!bp) return [];
  const mine = reg.blocksOf[here] ?? [];
  const out: Addable[] = [];
  reg.sections.forEach((sec, src) => {
    if (sec.page === here || mine.some((b) => hasCopy(layout, b, src))) return;
    const key = newCopyKey();
    out.push({
      key: `copy-${src}`,
      group: 'copy',
      name: sec.label,
      sub: `From ${reg.titleOf(sec.page)}`,
      add: (l) => addCopy(l, bp, src, key),
      go: { page: here, blocksPage: bp, block: copyBlockId(key) },
    });
  });
  return out;
}

const GROUPS: Array<{ key: Addable['group']; title: string; note?: string; chip: string; icon: string; tone: string }> = [
  { key: 'onepager', title: 'One pagers', note: 'budgetary quotes', chip: 'One pagers', icon: '$', tone: 'bg-[#FDF0EE] text-[#A63A22]' },
  { key: 'page', title: 'Pages', chip: 'Pages', icon: '▤', tone: 'bg-[#EEF5FE] text-[#1F5FB5]' },
  { key: 'section', title: 'Sections', chip: 'Sections', icon: '▦', tone: 'bg-[#EEF8F1] text-[#1F6B3A]' },
  { key: 'copy', title: 'Sections from other pages', chip: 'From other pages', icon: '⧉', tone: 'bg-[#E9F6F6] text-[#0F6B6E]' },
  { key: 'row', title: 'Table rows & columns', chip: 'Rows', icon: '≡', tone: 'bg-[#F1F0FC] text-[#3F3A8A]' },
  { key: 'figure', title: 'Figures', chip: 'Figures', icon: '#', tone: 'bg-[#FFF6DE] text-[#8A5A00]' },
];

const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s);

export function AddMenu({ bothPricing, ecallOnly, onePagers }: { bothPricing: boolean; ecallOnly: boolean; onePagers: OnePagerInfo | null }) {
  const { editable, setLayout } = useProposalText();
  const insp = useInspector();
  const base = useAddables({ bothPricing, ecallOnly, onePagers });
  const { layout } = useProposalText();
  const reg = useBcRegistry();
  // Where "Sections from other pages" go: picked when the menu opens.
  const [here, setHere] = useState<string | null>(null);
  const copies = useMemo(() => (reg && here && layout.format === 'businessCase' ? copyAddables(reg, layout, here) : []), [reg, here, layout]);
  const items = useMemo(() => [...base, ...copies], [base, copies]);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<Addable['group'] | 'all'>('all');
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const root = useRef<HTMLDivElement>(null);
  const close = () => {
    if (!open) return;
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 180);
  };
  // Esc or a click elsewhere closes it.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const down = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
    window.addEventListener('keydown', key);
    document.addEventListener('pointerdown', down);
    return () => {
      window.removeEventListener('keydown', key);
      document.removeEventListener('pointerdown', down);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((it) => (chip === 'all' || it.group === chip) && (!t || `${it.name} ${it.sub}`.toLowerCase().includes(t)));
  }, [items, q, chip]);
  if (!editable) return null;

  // Add it, then go to it on the page and select it.
  const add = (it: Addable) => {
    setLayout(it.add);
    close();
    setTimeout(() => {
      const g = it.go;
      const pageEl = g.page ? document.querySelector<HTMLElement>(`[data-bc-page="${esc(g.page)}"]`) : null;
      const target =
        (g.fig && document.querySelector<HTMLElement>(`[data-fig="${esc(g.fig)}"]`)) ||
        (g.table && document.querySelector<HTMLElement>(`table[data-rtable="${esc(g.table)}"]`)) ||
        (g.block && pageEl?.querySelector<HTMLElement>(`[data-bc-blocks="${esc(g.blocksPage ?? '')}"][data-bc-block="${esc(g.block)}"]`)) ||
        pageEl;
      if (!target) return;
      target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: g.page && !g.block && !g.table && !g.fig ? 'start' : 'center' });
      const slot = target.closest<HTMLElement>('[data-bc-page]');
      if (!slot) return;
      const blockEl = target.closest<HTMLElement>('[data-bc-block]');
      const tableEl = g.table ? target : null;
      insp.select({
        tab: tableEl ? 'table' : blockEl ? 'section' : 'page',
        page: slot.dataset.bcPage ?? null,
        pageTitle: slot.dataset.bcTitle ?? 'Page',
        block: blockEl?.dataset.bcBlock ?? null,
        blocksPage: blockEl?.dataset.bcBlocks ?? null,
        blockLabel: blockEl?.dataset.bcLabel ?? null,
        table: tableEl?.dataset.rtable ?? null,
        tableName: tableEl ? (tableEl.dataset.rtableName && tableEl.dataset.rtableName !== slot.dataset.bcTitle ? tableEl.dataset.rtableName : 'Table') : null,
      });
    }, 220);
  };

  const counts = Object.fromEntries(GROUPS.map((g) => [g.key, items.filter((i) => i.group === g.key).length])) as Record<Addable['group'], number>;
  const isOpen = open && !closing;
  return (
    <div ref={root} data-edit-ui className="no-print bc-addmenu" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {open && (
        <div
          role="dialog"
          aria-label="Add to this proposal"
          className={`bc-addpop fixed z-[36] bg-white text-teton-ink flex flex-col overflow-hidden border border-teton-off-white shadow-[0_18px_48px_rgba(15,23,32,.22)] ${closing ? 'bc-addpop-out' : 'bc-addpop-in'}`}
        >
          <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-teton-pale-gray" aria-hidden="true" />
          <div className="px-4 pt-3.5">
            <div className="flex items-center gap-2">
              <h3 className="flex-1 text-[15px] font-bold">Add to this proposal</h3>
              <span className="text-[11.5px] text-teton-ui-gray">{items.length} available</span>
              <button type="button" className="sm:hidden w-7 h-7 rounded-lg border border-teton-pale-gray text-teton-ui-gray text-xs" onClick={close} aria-label="Close">
                ✕
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 h-[34px] rounded-[9px] border border-teton-pale-gray px-2.5 text-[12.5px] focus-within:border-[#3F8CEA]">
              <svg className="w-3.5 h-3.5 text-teton-light-gray" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" strokeLinecap="round" /></svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pages, sections, rows…" className="flex-1 min-w-0 outline-none bg-transparent placeholder:text-teton-light-gray" aria-label="Search what can be added" />
            </label>
            <div className="mt-2.5 flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Show">
              {[['all', 'All', items.length] as const, ...GROUPS.filter((g) => counts[g.key] > 0).map((g) => [g.key, g.chip, counts[g.key]] as const)].map(([k, label, n]) => (
                <button key={k} type="button" aria-pressed={chip === k} onClick={() => setChip(k)} className={`flex-shrink-0 rounded-full border px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap transition-colors duration-200 ${chip === k ? 'bg-teton-ink border-teton-ink text-white' : 'border-teton-pale-gray text-teton-dark-gray hover:bg-teton-almost-white'}`}>
                  {label} {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {items.length === 0 && <p className="py-8 text-center text-[13px] text-teton-ui-gray">Everything is in: nothing to add.</p>}
            {items.length > 0 && shown.length === 0 && <p className="py-8 text-center text-[13px] text-teton-ui-gray">Nothing matches “{q}”.</p>}
            {GROUPS.map((g) => {
              const list = shown.filter((i) => i.group === g.key);
              if (!list.length) return null;
              const isFolded = !!folded[g.key];
              return (
                <section key={g.key} className="py-2.5 border-b border-teton-off-white last:border-b-0">
                  <button type="button" className="w-full flex items-center gap-1.5 text-left text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray" aria-expanded={!isFolded} onClick={() => setFolded((f) => ({ ...f, [g.key]: !isFolded }))}>
                    {g.title}
                    {g.note && <span className="normal-case tracking-normal font-semibold text-teton-light-gray">{g.note}</span>}
                    {g.key === 'copy' && here && reg && <span className="normal-case tracking-normal font-semibold text-teton-light-gray truncate">adds to {reg.titleOf(here)}</span>}
                    <svg className={`ml-auto w-3 h-3 text-teton-light-gray transition-transform duration-300 motion-reduce:transition-none ${isFolded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M5.2 12.8a.75.75 0 001.06 0L10 9.06l3.74 3.74a.75.75 0 101.06-1.06l-4.27-4.27a.75.75 0 00-1.06 0L5.2 11.74a.75.75 0 000 1.06z" /></svg>
                  </button>
                  <Collapse open={!isFolded}>
                    <ul className="pt-1">
                      {list.map((it) => (
                        <li key={it.key} className="mt-1.5 flex items-center gap-2.5 rounded-[10px] border border-teton-off-white px-2.5 py-2">
                          <span className={`w-[30px] h-[30px] flex-shrink-0 rounded-lg grid place-items-center text-[13px] ${g.tone}`} aria-hidden="true">{g.icon}</span>
                          <span className="flex-1 min-w-0">
                            <b className="block truncate text-[12.5px] font-semibold">{it.name}</b>
                            {it.sub && <small className="block truncate text-[11px] text-teton-ui-gray" title={it.sub}>{it.sub}</small>}
                          </span>
                          <button type="button" className="flex-shrink-0 inline-flex items-center h-7 px-2.5 rounded-lg bg-teton-ink text-white text-[12px] font-semibold hover:bg-black" onClick={() => add(it)} aria-label={`Add ${it.name}${it.sub ? ` (${it.sub})` : ''}`}>
                            {it.group === 'copy' ? '+ Add here' : '+ Add'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Collapse>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => {
          if (open) return close();
          setHere(pageHere(insp.sel?.page));
          setOpen(true);
        }}
        className={`bc-addfab fixed z-[36] inline-flex items-center gap-2 h-[46px] pl-3.5 pr-4 rounded-full bg-teton-ink text-white text-[14px] font-semibold shadow-[0_10px_28px_rgba(15,23,32,.28),0_2px_6px_rgba(15,23,32,.18)] hover:bg-black ${isOpen ? 'max-sm:hidden' : ''}`}
        title="Add pages, sections, rows and figures"
      >
        <span className={`w-6 h-6 rounded-full bg-white text-teton-ink grid place-items-center text-[17px] leading-none transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-45' : ''}`} aria-hidden="true">+</span>
        Add
        {base.length > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#3F8CEA] text-[11px] font-bold grid place-items-center">{base.length}</span>}
      </button>
    </div>
  );
}

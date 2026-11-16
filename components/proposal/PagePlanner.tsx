'use client';

/**
 * Page planner: the proposal's printed pages side by side, with each section
 * drawn to scale. Drag a section onto a page (or "+ New page"), or pick its
 * page from the list on the section, to choose which sections print together.
 * The plan is part of this version's layout, so it saves and carries forward
 * like the wording and section order. Screen only.
 */
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  autoFit,
  estimateAutomatic,
  fillPct,
  groupPages,
  moveSection,
  orderFromPages,
  PAGE_HEIGHT_PX,
  pageHeight,
  startsOf,
  type SectionSize,
} from '@/lib/proposal/pages';
import { useProposalText } from './EditableText';

const COLORS: Record<string, string> = {
  scope: '#E3EEF0',
  terms: '#F3EBD9',
  implementation: '#DDEFE4',
  resources: '#E7E3F2',
  summary: '#F5E0DA',
  roi: '#DCE8F5',
  assumptions: '#ECEDEE',
};
const CUSTOM_COLOR = '#F1F0E6';
/** On-screen height of one page column. */
const COL_H = 300;

interface Measured {
  header: number;
  sizes: SectionSize[];
  titles: Record<string, string>;
}

/** Height an element takes in print: its box minus the screen-only controls laid out inside it. */
function printHeight(el: HTMLElement): number {
  let h = el.getBoundingClientRect().height;
  el.querySelectorAll<HTMLElement>('.no-print, [data-edit-ui]').forEach((n) => {
    if (n.parentElement?.closest('.no-print, [data-edit-ui]') && el.contains(n.parentElement.closest('.no-print, [data-edit-ui]'))) return;
    const cs = getComputedStyle(n);
    if (cs.position === 'absolute' || cs.position === 'fixed' || cs.display === 'none') return;
    h -= n.getBoundingClientRect().height + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
  });
  return Math.max(0, h);
}

function measure(): Measured | null {
  const art = document.getElementById('proposal');
  const root = art?.querySelector<HTMLElement>('[data-sections-root]');
  if (!art || !root) return null;
  const top = art.getBoundingClientRect().top + parseFloat(getComputedStyle(art).paddingTop);
  // The cover (logo, customer, intro) prints above the first section on page 1.
  const header = Math.max(0, root.getBoundingClientRect().top - top);
  const sizes: SectionSize[] = [];
  const titles: Record<string, string> = {};
  root.querySelectorAll<HTMLElement>('[data-section]').forEach((el) => {
    const id = el.dataset.section!;
    const auto = el.dataset.printAuto ?? '';
    sizes.push({ id, height: printHeight(el), splittable: !auto.includes('avoid-break') && !auto.includes('print-own-page'), ownPage: auto.includes('print-own-page') });
    titles[id] = el.querySelector('h2')?.textContent?.trim() || 'Section';
  });
  return { header, sizes, titles };
}

export function PagePlanner({ onClose }: { onClose: () => void }) {
  const { layout, setLayout } = useProposalText();
  const [m, setM] = useState<Measured | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ page: number; index: number } | null>(null);

  // Measure after every layout change (wording, sections and figures change heights too).
  useLayoutEffect(() => {
    const id = requestAnimationFrame(() => setM(measure()));
    return () => cancelAnimationFrame(id);
  }, [layout]);
  useEffect(() => {
    const onResize = () => setM(measure());
    window.addEventListener('resize', onResize);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);

  const planned = !!layout.pageStarts;
  const visible = m?.sizes.map((s) => s.id) ?? [];
  const heights = Object.fromEntries(m?.sizes.map((s) => [s.id, s.height]) ?? []);
  const pages = !m ? [] : planned ? groupPages(visible, layout.pageStarts!) : estimateAutomatic(m.sizes, m.header);

  const apply = useCallback(
    (next: string[][]) =>
      setLayout((l) => ({ ...l, order: orderFromPages(l.order, visible, next), pageStarts: startsOf(next) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setLayout, visible.join()],
  );
  const move = (id: string, page: number, index: number) => apply(moveSection(pages, id, page, index));

  const dropIndex = (e: React.DragEvent, page: number) => {
    const chips = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-chip]'));
    const i = chips.findIndex((c) => e.clientY < c.getBoundingClientRect().top + c.getBoundingClientRect().height / 2);
    return { page, index: i < 0 ? chips.length : i };
  };

  if (!m) return null;
  const fills = pages.map((p, i) => fillPct(pageHeight(p, heights, i === 0 ? m.header : 0)));
  // Over-full pages (in automatic mode only a single long section, since the browser handles the rest).
  const overfull = fills.map((f, i) => (f > 100 && (planned || pages[i].length === 1) ? i : -1)).filter((i) => i >= 0);
  const scale = COL_H / PAGE_HEIGHT_PX;

  return (
    <div data-edit-ui className="no-print border-b border-teton-pale-gray bg-[#FAFBFB] text-teton-ink shadow-md" role="region" aria-label="Arrange printed pages">
      <div className="max-h-[70vh] overflow-auto px-4 py-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
          <h2 className="text-sm font-semibold">Printed pages</h2>
          <span className="text-xs text-teton-ui-gray">
            {planned ? 'Your page plan.' : 'Automatic: where the browser will likely break pages.'} Drag a section onto a page, or pick its page from the list. Sizes are estimates from the proposal as laid out.
          </span>
          <span className="ml-auto flex items-center gap-2">
            <button type="button" className="btn-secondary py-1 text-xs" onClick={() => apply(autoFit(visible, heights, m.header))}>
              Auto-fit (fewest pages)
            </button>
            {planned && (
              <button type="button" className="btn-secondary py-1 text-xs" onClick={() => setLayout((l) => ({ ...l, pageStarts: null }))}>
                Reset to automatic
              </button>
            )}
            <button type="button" className="btn-ghost text-sm" onClick={onClose} aria-label="Close page planner">
              ✕
            </button>
          </span>
        </div>

        <div className="flex gap-4 overflow-x-auto pb-2">
          {[...pages, null].map((p, pi) => {
            const isNew = p === null;
            const fill = isNew ? 0 : fills[pi];
            const target = over?.page === pi;
            return (
              <div key={pi} className="flex-none w-56" data-page-col={isNew ? 'new' : pi + 1}>
                <div className="flex items-center justify-between mb-1.5 h-5">
                  <b className={`text-[12.5px] ${isNew ? 'text-teton-ui-gray font-medium' : ''}`}>{isNew ? 'New page' : `Page ${pi + 1}`}</b>
                  {!isNew && (
                    <span className="flex items-center gap-1.5 text-[11px] text-teton-ui-gray tabular-nums">
                      <span className="w-16 h-1.5 rounded-full bg-teton-off-white overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${Math.min(fill, 100)}%`, background: planned && fill > 100 ? '#D9472B' : '#2E9E64' }} />
                      </span>
                      {planned ? fill : Math.min(fill, 100)}%
                    </span>
                  )}
                </div>
                <div
                  className={`relative overflow-hidden rounded-[5px] p-2 flex flex-col gap-1.5 transition-colors ${
                    isNew ? 'border-2 border-dashed border-teton-pale-gray bg-white' : 'border border-teton-pale-gray bg-white shadow-sm'
                  } ${target ? 'ring-2 ring-[#2E9E64]' : ''}`}
                  style={{ height: COL_H }}
                  onDragOver={(e) => {
                    if (!drag) return;
                    e.preventDefault();
                    setOver(dropIndex(e, pi));
                  }}
                  onDragLeave={(e) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && setOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = drag ?? e.dataTransfer.getData('text/plain');
                    const at = dropIndex(e, pi);
                    setDrag(null);
                    setOver(null);
                    if (id) move(id, at.page, at.index);
                  }}
                >
                  {pi === 0 && m.header > 0 && (
                    <div className="rounded-[4px] border border-dashed border-teton-pale-gray px-2 text-[10.5px] text-teton-ui-gray flex-none" style={{ height: Math.max(18, m.header * scale) }}>
                      Cover
                    </div>
                  )}
                  {isNew && <p className="m-auto text-center text-xs text-teton-ui-gray px-3">+ Drop a section here to start a new page</p>}
                  {(p ?? []).map((id, ci) => (
                    <div key={id} className="flex-none">
                      {target && over!.index === ci && <div className="h-0.5 -mt-1 mb-0.5 rounded bg-[#2E9E64]" />}
                      <div
                        data-chip={id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDrag(id);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setOver(null);
                        }}
                        className={`rounded-[4px] px-2 py-1 text-[11px] font-semibold cursor-grab active:cursor-grabbing overflow-hidden flex flex-col ${drag === id ? 'opacity-40' : ''}`}
                        style={{ height: Math.max(44, heights[id] * scale), background: COLORS[id] ?? CUSTOM_COLOR }}
                        title={`${m.titles[id]}: about ${fillPct(heights[id])}% of a page`}
                      >
                        <span className="flex items-start gap-1.5">
                          <span className="text-teton-ui-gray font-normal" aria-hidden="true">⠿</span>
                          <span className="min-w-0 flex-1 leading-tight">{m.titles[id]}</span>
                          <span className="font-normal text-teton-dark-gray tabular-nums">{fillPct(heights[id])}%</span>
                        </span>
                        <select
                          className="mt-1 self-start rounded border border-black/10 bg-white/70 text-[10.5px] font-normal py-0 pl-1 pr-5"
                          value={pi}
                          aria-label={`Page for ${m.titles[id]}`}
                          onChange={(e) => {
                            const to = Number(e.target.value);
                            move(id, to, to === pi ? ci : (pages[to]?.length ?? 0));
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                        >
                          {pages.map((_, i) => (
                            <option key={i} value={i}>
                              Page {i + 1}
                            </option>
                          ))}
                          <option value={pages.length}>New page</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  {target && !isNew && over!.index === (p ?? []).length && <div className="h-0.5 rounded bg-[#2E9E64] flex-none" />}
                  {!isNew && planned && fill > 100 && (
                    <div className="absolute inset-x-0 bottom-0 h-1 rounded-b bg-[#D9472B]" title="Over a full page" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {overfull.length > 0 && (
          <div className="mt-2 rounded-md bg-[#FFF1CC] px-3 py-2 text-xs max-w-3xl space-y-0.5">
            {overfull.map((i) =>
              pages[i].length === 1 ? (
                <p key={i}>
                  <b>{m.titles[pages[i][0]]}</b> is longer than one page (about {fills[i]}%), so it runs onto the next printed page.
                </p>
              ) : (
                <p key={i}>
                  ⚠ <b>Page {i + 1} is about {fills[i]}% full.</b> What doesn’t fit continues on the next printed page. Move a section to another page, or use Auto-fit.
                </p>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}

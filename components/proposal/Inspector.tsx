'use client';

/**
 * The business case's options panel. While editing, click a page, a section or a table and everything that can be
 * done to it shows in a panel on the right (a sheet from the bottom on phones), instead of hover controls on the page.
 *
 * Each part of the page puts its own options in the panel: sections and pages render into the panel's slots through
 * portals (they already know how to move, remove and reset themselves), and a view switch inside a section shows
 * there as one of its display options. Tables are read from the page itself (their rows and columns).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { SegGroup } from '@/components/form/SegGroup';
import { hiddenColsOf, type ProposalLayout } from '@/lib/proposal/layout';
import { useProposalText } from './EditableText';
import { addBackCol, addBackRow, RemovedPanel } from './ProposalSections';

import { BlockDisplayCtx, InPanelCtx, InspectorCtx, type InspSel, type InspTab } from './inspectorContext';
export { BlockDisplayCtx, InPanelCtx, InspectorCtx, useInspector, type InspSel, type InspTab } from './inspectorContext';


const cssEsc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));

/** The element a selection points at (for its outline, and for reading a table). */
function targetOf(sel: InspSel): HTMLElement | null {
  if (!sel.page) return null;
  const page = document.querySelector<HTMLElement>(`[data-bc-page="${cssEsc(sel.page)}"]`);
  if (!page) return null;
  if (sel.tab === 'table' && sel.table) return page.querySelector<HTMLElement>(`table[data-rtable="${cssEsc(sel.table)}"]`);
  if (sel.tab === 'section' && sel.block) return page.querySelector<HTMLElement>(`[data-bc-blocks="${cssEsc(sel.blocksPage ?? '')}"][data-bc-block="${cssEsc(sel.block)}"]`);
  if (sel.tab === 'page') return page.querySelector<HTMLElement>('.bc-page') ?? page;
  return null;
}

export function InspectorProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [sel, setSel] = useState<InspSel | null>(null);
  // While the panel slides out it keeps showing what it showed.
  const [shown, setShown] = useState<InspSel | null>(null);
  const [closing, setClosing] = useState(false);
  const [main, setMain] = useState<HTMLElement | null>(null);
  const [sections, setSections] = useState<HTMLElement | null>(null);
  const [foot, setFoot] = useState<HTMLElement | null>(null);
  const [pageDisplay, setPageDisplay] = useState<HTMLElement | null>(null);
  const select = useCallback((s: InspSel | null) => setSel(s), []);

  useEffect(() => {
    if (sel) {
      setShown(sel);
      setClosing(false);
      return;
    }
    if (!shown) return;
    setClosing(true);
    const t = setTimeout(() => {
      setShown(null);
      setClosing(false);
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel]);
  useEffect(() => {
    if (!enabled) setSel(null);
  }, [enabled]);

  // Click to select: the table, section or page under the pointer (not buttons, links or figures, which act).
  useEffect(() => {
    if (!enabled) return;
    const click = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest('article#proposal')) return;
      if (t.closest('[data-edit-ui], [data-fig-value], button, a, input, select, textarea, label, [role="button"]')) return;
      const pageEl = t.closest<HTMLElement>('[data-bc-page]');
      if (!pageEl) return;
      const blockEl = t.closest<HTMLElement>('[data-bc-block]');
      const tableEl = t.closest<HTMLElement>('table[data-rtable]');
      const inBlock = blockEl && pageEl.contains(blockEl) ? blockEl : null;
      setSel({
        tab: tableEl ? 'table' : inBlock ? 'section' : 'page',
        page: pageEl.dataset.bcPage ?? null,
        pageTitle: pageEl.dataset.bcTitle ?? 'Page',
        block: inBlock?.dataset.bcBlock ?? null,
        blocksPage: inBlock?.dataset.bcBlocks ?? null,
        blockLabel: inBlock?.dataset.bcLabel ?? null,
        table: tableEl?.dataset.rtable ?? null,
        // A table named for its page (or not named) is just "Table".
        tableName: tableEl?.dataset.rtableName && tableEl.dataset.rtableName !== pageEl.dataset.bcTitle ? tableEl.dataset.rtableName.replace(/\s·\s.*$/, '') : 'Table',
      });
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const a = document.activeElement as HTMLElement | null;
      if (a?.isContentEditable) return;
      setSel(null);
    };
    const open = (e: Event) => {
      if ((e as CustomEvent).detail === 'removed') setSel({ tab: 'removed', page: null, pageTitle: '', block: null, blocksPage: null, blockLabel: null, table: null, tableName: null });
    };
    document.addEventListener('click', click);
    document.addEventListener('keydown', key);
    window.addEventListener('bc-inspector', open);
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('keydown', key);
      window.removeEventListener('bc-inspector', open);
    };
  }, [enabled]);

  // The selection's outline (and the document shifted left on wide screens while the panel is open).
  const { layout, edits } = useProposalText();
  useLayoutEffect(() => {
    document.querySelectorAll('[data-insp-sel]').forEach((el) => el.removeAttribute('data-insp-sel'));
    if (!sel) return;
    const el = targetOf(sel);
    el?.setAttribute('data-insp-sel', '');
  });
  useEffect(() => {
    document.documentElement.classList.toggle('bc-insp-open', !!sel);
    return () => document.documentElement.classList.remove('bc-insp-open');
  }, [sel]);
  // A selected section or table that's gone (removed): back to its page.
  useEffect(() => {
    if (!sel || sel.tab === 'removed' || sel.tab === 'page') return;
    const t = setTimeout(() => {
      if (!targetOf(sel)) setSel((s) => (s ? { ...s, tab: s.tab === 'table' && s.block ? 'section' : 'page', ...(s.tab === 'table' ? { table: null, tableName: null } : { block: null, blocksPage: null, blockLabel: null, table: null, tableName: null }) } : s));
    }, 60);
    return () => clearTimeout(t);
  }, [sel, layout, edits]);

  const value = useMemo(() => ({ on: enabled, sel: closing ? null : sel, select, main, sections, foot, pageDisplay }), [enabled, sel, closing, select, main, sections, foot, pageDisplay]);
  return (
    <InspectorCtx.Provider value={value}>
      {children}
      {enabled && shown && (
        <Panel sel={sel ?? shown} closing={closing} onClose={() => setSel(null)} onTab={(tab) => setSel((s) => (s ? { ...s, tab } : s))} setMain={setMain} setSections={setSections} setFoot={setFoot} setPageDisplay={setPageDisplay} />
      )}
    </InspectorCtx.Provider>
  );
}

function Panel({ sel, closing, onClose, onTab, setMain, setSections, setFoot, setPageDisplay }: { sel: InspSel; closing: boolean; onClose: () => void; onTab: (t: InspTab) => void; setMain: (e: HTMLElement | null) => void; setSections: (e: HTMLElement | null) => void; setFoot: (e: HTMLElement | null) => void; setPageDisplay: (e: HTMLElement | null) => void }) {
  const pageNo = useMemo(() => {
    if (!sel.page || typeof document === 'undefined') return null;
    const all = Array.from(document.querySelectorAll<HTMLElement>('[data-bc-page]')).map((e) => e.dataset.bcPage);
    const i = all.indexOf(sel.page);
    return i >= 0 ? i + 1 : null;
  }, [sel.page]);
  const tabs: Array<[InspTab, string]> =
    sel.tab === 'removed'
      ? []
      : [...(sel.table ? ([['table', 'Table']] as Array<[InspTab, string]>) : []), ...(sel.block ? ([['section', 'Section']] as Array<[InspTab, string]>) : []), ['page', 'Page']];
  const title = sel.tab === 'removed' ? 'Removed' : sel.tab === 'table' ? sel.tableName ?? 'Table' : sel.tab === 'section' ? sel.blockLabel ?? 'Section' : sel.pageTitle;
  const crumb = sel.tab === 'removed' ? ['Everything removed from this proposal'] : [pageNo ? `Page ${pageNo} · ${sel.pageTitle}` : sel.pageTitle, ...(sel.block && sel.tab !== 'page' ? [sel.blockLabel ?? 'Section'] : []), ...(sel.table && sel.tab === 'table' ? [sel.tableName ?? 'Table'] : [])];
  return (
    <aside
      data-edit-ui
      aria-label="Options"
      className={`no-print bc-insp fixed z-30 bg-white text-teton-ink flex flex-col shadow-[0_-8px_30px_rgba(0,0,0,0.15)] inset-x-0 bottom-0 max-h-[62dvh] rounded-t-2xl border-t border-teton-off-white sm:inset-x-auto sm:right-0 sm:bottom-0 sm:top-[var(--proposal-header-h,99px)] sm:w-[344px] sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l sm:shadow-[-8px_0_24px_rgba(15,23,32,.06)] ${closing ? 'drawer-out' : 'drawer-in'}`}
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-teton-pale-gray" aria-hidden="true" />
      <div className="px-4 pt-3 pb-3 border-b border-teton-off-white">
        <p className="text-[11px] text-teton-ui-gray flex flex-wrap items-center gap-1 min-w-0">
          {crumb.map((c, i) => (
            <span key={i} className={`truncate ${i === crumb.length - 1 ? 'text-[#1F5FB5] font-semibold' : ''}`}>
              {i > 0 && <span className="mr-1 text-teton-light-gray">›</span>}
              {c}
            </span>
          ))}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <h3 className="flex-1 min-w-0 truncate text-[15px] font-bold">{title}</h3>
          <button type="button" className="w-7 h-7 rounded-lg border border-teton-pale-gray text-teton-ui-gray hover:bg-teton-almost-white text-xs" onClick={onClose} aria-label="Close the options" title="Close (Esc)">
            ✕
          </button>
        </div>
        {tabs.length > 1 && (
          <SegGroup role="group" label="Options for" thumbClass="bg-white shadow-sm" className="mt-2.5 flex rounded-lg bg-teton-almost-white p-0.5 text-[12px]">
            {tabs.map(([t, label]) => (
              <button key={t} type="button" aria-pressed={sel.tab === t} className={`flex-1 py-1.5 rounded-md font-semibold transition-colors duration-200 ${sel.tab === t ? 'text-teton-ink' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => onTab(t)}>
                {label}
              </button>
            ))}
          </SegGroup>
        )}
      </div>
      <InPanelCtx.Provider value={true}>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {sel.tab === 'page' && (
            <InspGroup title="Display" hideEmpty>
              <div ref={setPageDisplay} className="insp-slot space-y-1" />
            </InspGroup>
          )}
          {sel.tab === 'table' && sel.table && sel.page && <TableOptions page={sel.page} table={sel.table} name={sel.tableName ?? 'Table'} />}
          <div ref={setMain} />
          {sel.tab === 'page' && (
            <InspGroup title="Sections" hideEmpty>
              <div ref={setSections} className="insp-slot space-y-2" />
            </InspGroup>
          )}
          {sel.tab === 'page' && sel.page && (
            <InspGroup title="Removed from this page">
              <RemovedPanel bare page={sel.page} />
            </InspGroup>
          )}
          {sel.tab === 'removed' && (
            <div className="pt-2">
              <RemovedPanel bare />
            </div>
          )}
        </div>
        <div ref={setFoot} className="insp-foot empty:hidden border-t border-teton-off-white px-4 py-3 flex gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]" />
      </InPanelCtx.Provider>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Panel pieces (also used by sections and pages for their options).   */
/* ------------------------------------------------------------------ */

export function InspGroup({ title, children, hideEmpty = false }: { title: string; children: React.ReactNode; /** Hidden while its slot (.insp-slot) is empty. */ hideEmpty?: boolean }) {
  return (
    <section className={`py-3 border-b border-teton-off-white last:border-b-0 ${hideEmpty ? 'insp-hide-empty' : ''}`}>
      <p className="text-[10.5px] font-bold uppercase tracking-[.8px] text-teton-ui-gray mb-2">{title}</p>
      {children}
    </section>
  );
}

export function InspRow({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-[34px] text-[13px]">
      <span className="min-w-0">
        {label}
        {sub != null && <small className="block text-[11px] text-teton-ui-gray">{sub}</small>}
      </span>
      {children && <span className="flex items-center gap-1.5 flex-shrink-0">{children}</span>}
    </div>
  );
}

export function InspSeg<T extends string>({ label, options, value, onChange }: { label: string; options: ReadonlyArray<readonly [T, string]>; value: T; onChange: (v: T) => void }) {
  return (
    <SegGroup role="group" label={label} thumbClass="bg-teton-ink" className="flex flex-wrap justify-end rounded-lg bg-teton-almost-white p-0.5 text-[12px] max-w-[200px]">
      {options.map(([v, text]) => {
        const on = value === v;
        return (
          <button key={v} type="button" aria-pressed={on} className={`px-2.5 py-1 rounded-md font-semibold whitespace-nowrap transition-colors duration-200 ${on ? 'text-white' : 'text-teton-ui-gray hover:text-teton-ink'}`} onClick={() => onChange(v)}>
            {text}
          </button>
        );
      })}
    </SegGroup>
  );
}

export function InspToggle({ on, label, onChange, disabled = false }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled} onClick={() => onChange(!on)} className={`relative w-8 h-[18px] flex-shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none disabled:opacity-40 ${on ? 'bg-[#3F8CEA]' : 'bg-[#D5D9DE]'}`}>
      <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 motion-reduce:transition-none ${on ? 'translate-x-[14px]' : ''}`} />
    </button>
  );
}

export const inspBtn = 'inline-flex items-center justify-center gap-1.5 h-[30px] px-2.5 rounded-lg border border-teton-pale-gray bg-white text-[12.5px] font-medium text-teton-ink hover:bg-teton-almost-white disabled:opacity-40 disabled:hover:bg-white';
export const inspIconBtn = 'inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg border border-teton-pale-gray bg-white text-[13px] text-teton-ink hover:bg-teton-almost-white disabled:opacity-40 disabled:hover:bg-white';
export const inspDanger = 'flex-1 inline-flex items-center justify-center gap-1.5 h-[32px] px-2.5 rounded-lg border border-[#F3D3CC] bg-white text-[12.5px] font-medium text-[#C2412D] hover:bg-[#FDF3F1]';
export const inspFootBtn = 'flex-1 inline-flex items-center justify-center gap-1.5 h-[32px] px-2.5 rounded-lg border border-teton-pale-gray bg-white text-[12.5px] font-medium text-teton-ink hover:bg-teton-almost-white';

export function InspStepper({ value, onLess, onMore, lessDisabled, moreDisabled, lessLabel, moreLabel }: { value: string; onLess: () => void; onMore: () => void; lessDisabled?: boolean; moreDisabled?: boolean; lessLabel: string; moreLabel: string }) {
  const b = 'w-[30px] h-[30px] flex items-center justify-center text-teton-ui-gray hover:bg-teton-almost-white disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <span className="inline-flex items-center rounded-lg border border-teton-pale-gray overflow-hidden">
      <button type="button" className={b} onClick={onLess} disabled={lessDisabled} aria-label={lessLabel} title={lessLabel}>−</button>
      <b className="min-w-[76px] px-1 text-center text-[12px] font-semibold leading-[30px] border-x border-teton-pale-gray tabular-nums">{value}</b>
      <button type="button" className={b} onClick={onMore} disabled={moreDisabled} aria-label={moreLabel} title={moreLabel}>+</button>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Table options: row height, rows and columns (read from the page).   */
/* ------------------------------------------------------------------ */

interface TableState {
  rows: Array<{ key: string; label: string }>;
  cols: Array<{ key: string; label: string; canMove: boolean; first: boolean }>;
}

function TableOptions({ page, table, name }: { page: string; table: string; name: string }) {
  const { layout, setLayout } = useProposalText();
  const [st, setSt] = useState<TableState>({ rows: [], cols: [] });
  const el = useRef<HTMLTableElement | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const t = document.querySelector<HTMLTableElement>(`[data-bc-page="${cssEsc(page)}"] table[data-rtable="${cssEsc(table)}"]`);
    el.current = t;
    if (!t) return;
    const text = (n: Element | null) => (n?.textContent ?? '').split('\n')[0].replace(/\s+/g, ' ').trim();
    const rows = Array.from(t.querySelectorAll<HTMLElement>('tr[data-rk]')).map((tr) => ({ key: tr.dataset.rk!, label: text(tr.querySelector('td, th')) || 'Row' }));
    const ths = Array.from(t.querySelectorAll<HTMLElement>('th[data-col]'));
    const cols = ths.map((th, i) => ({ key: th.dataset.col!, label: text(th) || `Column ${i + 1}`, canMove: !!th.querySelector('[aria-label="Move this column left"]'), first: i === 0 }));
    setSt((prev) => (JSON.stringify(prev) === JSON.stringify({ rows, cols }) ? prev : { rows, cols }));
  });
  const prefix = `${table}.`;
  const hiddenRows = Object.entries(layout.hiddenRows ?? {}).filter(([k]) => k.startsWith(prefix));
  const hiddenCols = Object.entries(hiddenColsOf(layout)).filter(([k]) => k.startsWith(prefix));
  const press = (sel: string) => el.current?.querySelector<HTMLButtonElement>(sel)?.click();
  const compactable = layout.format === 'businessCase' && table !== 'site';
  const compact = !!layout.bcCompact?.[table];
  const stripName = (label: string) => label.replace(/\s·\s.*$/, '');
  return (
    <>
      {compactable && (
        <InspGroup title="Display">
          <InspRow label="Row height">
            <InspSeg
              label="Row height"
              options={[['full', 'Full'], ['compact', 'Compact']] as const}
              value={compact ? 'compact' : 'full'}
              onChange={(v) =>
                setLayout((l) => {
                  const next = { ...(l.bcCompact ?? {}) };
                  if (v === 'compact') next[table] = true;
                  else delete next[table];
                  return { ...l, bcCompact: Object.keys(next).length ? next : undefined };
                })
              }
            />
          </InspRow>
        </InspGroup>
      )}
      {(st.rows.length > 0 || hiddenRows.length > 0) && (
        <InspGroup title="Rows">
          <ul className="rounded-xl border border-teton-off-white overflow-hidden">
            {st.rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] border-t border-teton-off-white first:border-t-0">
                <span className="flex-1 min-w-0 truncate">{r.label}</span>
                <InspToggle on label={`Remove the row ${r.label}`} onChange={() => press(`tr[data-rk="${cssEsc(r.key)}"] button[aria-label="Remove this row"]`)} />
              </li>
            ))}
            {hiddenRows.map(([k, label]) => (
              <li key={k} className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] border-t border-teton-off-white first:border-t-0">
                <span className="flex-1 min-w-0 truncate text-teton-light-gray line-through">{stripName(label)}</span>
                <InspToggle on={false} label={`Add back the row ${stripName(label)}`} onChange={() => setLayout((l) => addBackRow(l, k))} />
              </li>
            ))}
          </ul>
        </InspGroup>
      )}
      {(st.cols.length > 1 || hiddenCols.length > 0) && (
        <InspGroup title="Columns">
          <ul className="rounded-xl border border-teton-off-white overflow-hidden">
            {st.cols.map((c, i) => (
              <li key={c.key} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] border-t border-teton-off-white first:border-t-0">
                <span className="flex-1 min-w-0 truncate">{c.label}</span>
                {c.first ? (
                  <span className="text-[11px] text-teton-ui-gray">always shown</span>
                ) : (
                  <>
                    {c.canMove && (
                      <>
                        <button type="button" className="w-6 h-6 rounded-md text-teton-ui-gray hover:bg-teton-almost-white disabled:opacity-30" disabled={i <= 1} aria-label={`Move ${c.label} left`} title="Move left" onClick={() => press(`th[data-col="${cssEsc(c.key)}"] [aria-label="Move this column left"]`)}>
                          ←
                        </button>
                        <button type="button" className="w-6 h-6 rounded-md text-teton-ui-gray hover:bg-teton-almost-white disabled:opacity-30" disabled={i === st.cols.length - 1} aria-label={`Move ${c.label} right`} title="Move right" onClick={() => press(`th[data-col="${cssEsc(c.key)}"] [aria-label="Move this column right"]`)}>
                          →
                        </button>
                      </>
                    )}
                    <InspToggle on label={`Remove the ${c.label} column`} onChange={() => press(`th[data-col="${cssEsc(c.key)}"] [aria-label="Remove this column"]`)} />
                  </>
                )}
              </li>
            ))}
            {hiddenCols.map(([k, label]) => (
              <li key={k} className="flex items-center gap-2 px-2.5 py-1.5 text-[12.5px] border-t border-teton-off-white first:border-t-0">
                <span className="flex-1 min-w-0 truncate text-teton-light-gray line-through">{stripName(label).replace(/ column$/, '')}</span>
                <InspToggle on={false} label={`Add back the ${stripName(label)}`} onChange={() => setLayout((l) => addBackCol(l, k))} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11.5px] leading-snug text-teton-ui-gray">Click any cell’s text in {name.toLowerCase().startsWith('the ') ? name : 'the table'} to reword it.</p>
        </InspGroup>
      )}
    </>
  );
}

export type { ProposalLayout };

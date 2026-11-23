'use client';

/**
 * The business-case format: an alternative to the standard proposal with a
 * cover page and one full page per topic (the investment, the return, year 1,
 * cash flow, implementation, the customer's team, terms and assumptions), in
 * the style of a capital-request business case.
 *
 * Same figures as the standard proposal (buildProposalData); wording is
 * editable (<T>, keys prefixed "bc."), figures can be clicked to change their
 * inputs or removed (<V>, the same keys as the standard format). Pages follow
 * the sections the rep keeps: a removed section drops its page.
 */
import { Children, Fragment, isValidElement, useContext, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { basePackageRows, conversionCreditOf, grossBaseRows, partsOf, grossSensorRow, perUnitText, sensorRows, unitPriceText } from '@/lib/pricing/capex';
import { capexCashFlow } from '@/lib/pricing/capexCashFlow';
import { rangeText } from '@/lib/pricing/finish';
import { SKU } from '@/lib/pricing/catalog';
import type { StoredOutputs } from '@/lib/data/quotes';
import { hasEcall, monitors, productsOf, scopeOf, type QuoteDraft } from '@/lib/quote/draft';
import { count, dateLabel, monthName, multiple, usd } from '@/lib/format';
import { weekLabel } from '@/lib/quote/implementationPlan';
import { allocationTable } from '@/lib/quote/resources';
import { stageColor, longDate } from '@/components/implementation/ImplementationGantt';
import { buildCashFlow } from '@/lib/model';
import { bedKeyOf, CARE_SHORT, careLabel, monitoredTypes, normalizeAllowance, normalizeRoomTypes, roomScope } from '@/lib/quote/roomTypes';
import { DealVarsContext, T, useProposalText } from './EditableText';
import { CustomTitle, RichBody, RTable, RTbody, V } from './ProposalSections';
import { paginate, textRowHeight } from '@/lib/proposal/paginate';
import { dealVars } from '@/lib/proposal/templates';
import { CommentHere, CommentPageContext, CommentPin, useComments } from './Comments';
import { BC_PAGE_TITLES, bcPagesOf, insertBcPage, moveBcPage, removeBcPage } from '@/lib/proposal/bcPages';
import { BC_GAP_STEP, MAX_BC_GAP, type ProposalLayout } from '@/lib/proposal/layout';
import { QuarterlyWaterfall } from './QuarterlyWaterfall';
import { TermsList } from './TermControls';
import { resolveTerms } from '@/lib/quote/terms';
import { renderText } from '@/lib/proposal/text';
import { installColumns, installMath, sensorColumns, sensorMath } from '@/lib/proposal/costMath';
import { buildProposalData } from './proposalData';
import { useWhatIf } from './WhatIf';
import { MissingPlanPill } from './FloorPlanStatus';
import { CallOut } from './CallOut';
import { ViewSwitch } from './ViewSwitch';
import { CompareChart } from './CompareChart';
import { ImplementationTimeline } from './ImplementationTimeline';
import { ImplementationWeeks } from './ImplementationWeeks';
import { canAutoFocus } from '@/lib/client/focus';

const Logo = () => (
  <span className="bc-logo">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/teton-logo.png" alt="" aria-hidden="true" />
    Teton
  </span>
);

/** "four" for 4 (small whole numbers in words, as written in a sentence). */
const numberWord = (n: number) => ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ?? String(n);
const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const pctOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–');

function Page({ crumb, no, children }: { crumb: React.ReactNode; no: number; children: React.ReactNode }) {
  return (
    <section className="bc-page">
      <div className="bc-pad">
        <div className="bc-top">
          <Logo />
          <span className="bc-crumb">{crumb}</span>
        </div>
        {children}
      </div>
      <div className="bc-foot">
        <span>TETON.AI</span>
        <span>{String(no).padStart(2, '0')}</span>
      </div>
    </section>
  );
}

function Stat({ value, children, ck }: { value: React.ReactNode; children: React.ReactNode; /** Names the figure for a custom value (else its figure key). */ ck?: string }) {
  // A figure (V) or a named value can be replaced with a custom one; wording (T) is already editable.
  const k = ck ?? (isValidElement(value) && value.type === V ? (value.props as { k: string }).k : null);
  return (
    <div className="bc-dark">
      <b>{k ? <CallOut k={k}>{value}</CallOut> : value}</b>
      <span>{children}</span>
    </div>
  );
}

/** A movable section of a business-case page (rendered by Blocks, in the page's saved order). */
interface BProps {
  id: string;
  /** Names the section in its move controls. */
  label: string;
  /** Spans both columns (sections laid out in a two-column grid). */
  wide?: boolean;
  /** Adds a ⇔ to the controls that toggles `wide`. */
  onWide?: () => void;
  /** Adds a "+" to the section's controls (e.g. add a community). */
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}
function B(_props: BProps): null {
  return null;
}

/**
 * The sections of one page, in the order the rep chose (new sections go after the saved ones, in their
 * default order). Hover a section for ↑ / ↓ to move it within the page.
 */
function Blocks({ page, children }: { page: string; children: React.ReactNode }) {
  const { editable, layout, setLayout, set } = useProposalText();
  const slot = useContext(CommentPageContext);
  const comments = useComments();
  const items = Children.toArray(children).filter((c): c is ReactElement<BProps> => isValidElement(c) && c.type === B);
  const ids = items.map((c) => c.props.id);
  const hidden = layout.bcHiddenBlocks?.[page] ?? {};
  const saved = (layout.bcBlocks?.[page] ?? []).filter((id) => ids.includes(id));
  // Sections not in the saved order (new ones, or ones added back) go to their usual place: after the nearest section before them.
  const merged = [...saved];
  ids.forEach((id, k) => {
    if (merged.includes(id)) return;
    let at = 0;
    for (let j = k - 1; j >= 0; j--) {
      const i = merged.indexOf(ids[j]);
      if (i >= 0) {
        at = i + 1;
        break;
      }
    }
    merged.splice(at, 0, id);
  });
  const order = merged.filter((id) => !(id in hidden));
  const byId = new Map(items.map((c) => [c.props.id, c]));
  const move = (id: string, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setLayout((l) => ({ ...l, bcBlocks: { ...(l.bcBlocks ?? {}), [page]: next } }));
  };
  const remove = (id: string, label: string) =>
    setLayout((l) => ({ ...l, bcHiddenBlocks: { ...(l.bcHiddenBlocks ?? {}), [page]: { ...(l.bcHiddenBlocks?.[page] ?? {}), [id]: label } } }));
  const btn = 'w-6 h-6 flex items-center justify-center rounded-md text-[12px] hover:bg-white/15 disabled:opacity-30';
  const gaps = layout.bcGaps?.[page] ?? {};
  const setGap = (id: string, px: number) =>
    setLayout((l) => {
      const all = { ...(l.bcGaps ?? {}) };
      const mine = { ...(all[page] ?? {}) };
      if (px > 0) mine[id] = Math.min(MAX_BC_GAP, px);
      else delete mine[id];
      if (Object.keys(mine).length) all[page] = mine;
      else delete all[page];
      return { ...l, bcGaps: Object.keys(all).length ? all : undefined };
    });
  return (
    <>
      {order.map((id, i) => {
        const c = byId.get(id)!;
        const gap = gaps[id] ?? 0;
        return (
          <div
            key={id}
            className={`bc-block group/bcb ${c.props.wide ? 'bc-wide' : ''} transition-[padding] duration-200 motion-reduce:transition-none`}
            data-bc-block={id}
            style={gap ? { paddingTop: gap } : undefined}
          >
            {editable && <GapControl gap={gap} label={c.props.label} onChange={(px) => setGap(id, px)} />}
            {slot && <CommentPin page={slot.id} block={id} kind="block" />}
            {!editable && comments.enabled && slot && (
              <div data-edit-ui className="no-print bc-block-controls opacity-0 group-hover/bcb:opacity-100 focus-within:opacity-100 transition-opacity">
                <CommentHere className={btn} target={{ page: slot.id, block: id, label: `${slot.title} · ${c.props.label}` }} />
              </div>
            )}
            {editable && (
              <div data-edit-ui className="no-print bc-block-controls opacity-0 group-hover/bcb:opacity-100 focus-within:opacity-100 transition-opacity">
                {slot && <CommentHere className={btn} target={{ page: slot.id, block: id, label: `${slot.title} · ${c.props.label}` }} />}
                {c.props.onAdd && (
                  <button type="button" className={`${btn} text-[15px]`} onClick={c.props.onAdd} aria-label={c.props.addLabel ?? 'Add'} title={c.props.addLabel ?? 'Add'}>
                    +
                  </button>
                )}
                <button type="button" className={btn} disabled={i === 0} onClick={() => move(id, -1)} aria-label={`Move ${c.props.label} up`} title={`Move ${c.props.label} up`}>
                  ↑
                </button>
                <button type="button" className={btn} disabled={i === order.length - 1} onClick={() => move(id, 1)} aria-label={`Move ${c.props.label} down`} title={`Move ${c.props.label} down`}>
                  ↓
                </button>
                {c.props.onWide && (
                  <button type="button" className={`${btn} ${c.props.wide ? 'bg-white/20' : ''}`} onClick={c.props.onWide} aria-pressed={!!c.props.wide} aria-label={`${c.props.wide ? 'Narrow' : 'Widen'} ${c.props.label}`} title={c.props.wide ? 'One column' : 'Span both columns'}>
                    ⇔
                  </button>
                )}
                <button
                  type="button"
                  className={btn}
                  onClick={(e) => {
                    const el = e.currentTarget.closest<HTMLElement>('[data-bc-block]');
                    if (!el || !window.confirm(`Reset ${c.props.label} to its standard wording and layout?`)) return;
                    const parts = customisedIn(el);
                    for (const k of parts.edits) set(k, null);
                    setLayout((l) => resetLayoutParts(l, parts));
                    setGap(id, 0);
                  }}
                  aria-label={`Reset ${c.props.label}`}
                  title={`Reset ${c.props.label} to its standard wording and layout`}
                >
                  <ResetIcon />
                </button>
                <button type="button" className={btn} onClick={() => remove(id, c.props.label)} aria-label={`Remove ${c.props.label}`} title={`Remove ${c.props.label} (you can add it back)`}>
                  ✕
                </button>
              </div>
            )}
            {c.props.children}
          </div>
        );
      })}
    </>
  );
}

/**
 * Hover the space above a section for − / + to change it. The standard spacing is the minimum (extra 0);
 * + stops when the page has no room left above its footer.
 */
function GapControl({ gap, label, onChange }: { gap: number; label: string; onChange: (px: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(true);
  // Free space at the bottom of the page: footer top less the lowest content (scaled pages compared in page px).
  const measure = () => {
    const page = ref.current?.closest<HTMLElement>('.bc-page');
    const foot = page?.querySelector<HTMLElement>('.bc-foot');
    if (!page || !foot) return setRoom(true);
    const scale = page.getBoundingClientRect().width / (page.offsetWidth || 1) || 1;
    let bottom = 0;
    page.querySelectorAll<HTMLElement>('.bc-block, .bc-lede, .bc-h1').forEach((el) => (bottom = Math.max(bottom, el.getBoundingClientRect().bottom)));
    const free = (foot.getBoundingClientRect().top - bottom) / scale;
    setRoom(free >= BC_GAP_STEP + 12 && gap < MAX_BC_GAP);
  };
  const btn = 'w-6 h-6 flex items-center justify-center rounded-full text-[14px] leading-none hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div ref={ref} data-edit-ui className="no-print bc-gap group/gap" style={{ top: -12, height: gap + 12 }} onPointerEnter={measure}>
      <div className="bc-gap-pill opacity-0 group-hover/gap:opacity-100 focus-within:opacity-100 transition-opacity duration-150">
        <button type="button" className={btn} disabled={gap <= 0} onClick={() => onChange(Math.max(0, gap - BC_GAP_STEP))} aria-label={`Less space above ${label}`} title={gap <= 0 ? 'Standard spacing (the minimum)' : 'Less space'}>
          −
        </button>
        <span className="px-1 tabular-nums">{gap ? `+${gap}px` : 'Space'}</span>
        <button
          type="button"
          className={btn}
          disabled={!room}
          onClick={() => {
            onChange(gap + BC_GAP_STEP);
            requestAnimationFrame(() => setTimeout(measure, 220));
          }}
          aria-label={`More space above ${label}`}
          title={room ? 'More space' : 'No room left on this page'}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** "+ Add page" in the gap before a page (or after the last one): inserts a page of formatted text. */
function AddPageZone({ at }: { at: string | null }) {
  const { editable, setLayout } = useProposalText();
  if (!editable) return null;
  return (
    <div data-edit-ui className="no-print bc-addzone group/add">
      <div className="bc-addband">
      <button
        type="button"
        className="opacity-0 group-hover/add:opacity-100 focus:opacity-100 transition-opacity rounded-full bg-white border border-teton-blue/60 text-teton-ink text-[11px] font-medium px-3 py-1 shadow-sm"
        onClick={() => {
          const id = `bcpage-${Date.now().toString(36)}`;
          setLayout((l) => {
            const pages = bcPagesOf(l);
            const i = at ? pages.indexOf(at) : -1;
            return { ...l, bcPages: insertBcPage(pages, i < 0 ? pages.length : i, id), bcCustom: { ...(l.bcCustom ?? {}), [id]: { title: 'New page', html: '' } } };
          });
          setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-custom-title="${id}"]`);
            if (!el) return;
            el.scrollIntoView({ block: 'center' });
            if (!canAutoFocus()) return;
            el.focus();
            const r = document.createRange();
            r.selectNodeContents(el);
            getSelection()?.removeAllRanges();
            getSelection()?.addRange(r);
          }, 60);
        }}
      >
        + Add page
      </button>
      </div>
    </div>
  );
}


/** Section-layout keys of a page (Blocks) that belong to a page slot (data-bc-page). */
const BLOCKS_PAGE_OF: Record<string, string> = { 'scope-capex': 'scope', 'scope-both': 'scope', 'roi-both': 'roi', 'cashflow-both': 'cashflow' };

/** What's been customised inside an element: edited wording, its tables, removed figures, view switches. */
function customisedIn(el: HTMLElement) {
  const q = (sel: string, attr: string) => Array.from(el.querySelectorAll<HTMLElement>(sel)).map((e) => e.getAttribute(attr) ?? '').filter(Boolean);
  return { edits: q('[data-edit-key]', 'data-edit-key'), tables: q('table[data-rtable]', 'data-rtable'), figs: q('[data-fig-hidden]', 'data-fig-hidden'), fields: q('[data-layout-field]', 'data-layout-field') };
}

/** The layout with those parts back to standard: table rows, columns (order, widths, shown), compact rows, figures, switches. */
function resetLayoutParts(l: ProposalLayout, p: ReturnType<typeof customisedIn>): ProposalLayout {
  const tables = new Set(p.tables);
  const inTable = (k: string) => tables.has(k.split('.')[0]);
  const keep = <V,>(m: Record<string, V> | undefined) => {
    if (!m) return m;
    const n = Object.fromEntries(Object.entries(m).filter(([k]) => !inTable(k)));
    return Object.keys(n).length ? n : undefined;
  };
  const n: ProposalLayout = {
    ...l,
    hiddenRows: keep(l.hiddenRows),
    hiddenCols: keep(l.hiddenCols),
    colWidths: keep(l.colWidths),
    colOrder: keep(l.colOrder),
    bcCompact: keep(l.bcCompact) as ProposalLayout['bcCompact'],
    shownCols: l.shownCols?.filter((k) => !inTable(k)),
    hiddenValues: l.hiddenValues.filter((k) => !p.figs.includes(k)),
  };
  const rec = n as unknown as Record<string, unknown>;
  for (const f of p.fields) {
    const [a, b] = f.split('.');
    if (!b) delete rec[a];
    else if (rec[a] && typeof rec[a] === 'object') {
      const m = { ...(rec[a] as Record<string, unknown>) };
      delete m[b];
      rec[a] = Object.keys(m).length ? m : undefined;
    }
  }
  return n;
}

const ResetIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 8a5 5 0 1 0 1.5-3.6" />
    <path d="M3 2.5v2.8h2.8" />
  </svg>
);

/** A page with its screen-only controls: move earlier / later, reset, remove. */
function PageSlot({ id, index, order, children }: { id: string; index: number; order: string[]; children: React.ReactNode }) {
  const { editable, layout, setLayout } = useProposalText();
  const custom = layout.bcCustom?.[id];
  const title = custom ? custom.title || 'Added page' : (BC_PAGE_TITLES as Record<string, string>)[id] ?? id;
  const move = (dir: -1 | 1) => setLayout((l) => ({ ...l, bcPages: moveBcPage(bcPagesOf(l), id, dir, order) }));
  const remove = () => {
    if (custom && (custom.html.replace(/<[^>]*>/g, '').trim() || (custom.title && custom.title !== 'New page')) && !window.confirm('Delete this page and its text?')) return;
    setLayout((l) => {
      const bcCustom = { ...(l.bcCustom ?? {}) };
      delete bcCustom[id];
      return { ...l, bcPages: removeBcPage(bcPagesOf(l), id), bcCustom };
    });
  };
  const btn = 'w-7 h-7 flex items-center justify-center rounded-md hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent';
  const { set } = useProposalText();
  // Back to standard: the page's wording, tables, figures and switches, and its sections (removed, order, spacing).
  const reset = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget.closest<HTMLElement>('[data-bc-page]');
    if (!el || !window.confirm(`Reset “${title}” to its standard wording and layout?`)) return;
    const parts = customisedIn(el);
    for (const k of parts.edits) set(k, null);
    const mine = (k: string) => (BLOCKS_PAGE_OF[k] ?? k) === id;
    const keep = <V,>(m: Record<string, V> | undefined) => {
      if (!m) return m;
      const n = Object.fromEntries(Object.entries(m).filter(([k]) => !mine(k)));
      return Object.keys(n).length ? n : undefined;
    };
    setLayout((l) => ({ ...resetLayoutParts(l, parts), bcHiddenBlocks: keep(l.bcHiddenBlocks) ?? {}, bcBlocks: keep(l.bcBlocks), bcGaps: keep(l.bcGaps) }));
    // Sections that were removed are back now: reset what's inside them too (their wording, tables and switches).
    setTimeout(() => {
      const again = customisedIn(el);
      for (const k of again.edits) set(k, null);
      setLayout((l) => resetLayoutParts(l, again));
    }, 150);
  };
  const comments = useComments();
  const slotCtx = useMemo(() => ({ id, title }), [id, title]);
  return (
    <CommentPageContext.Provider value={slotCtx}>
      <AddPageZone at={id} />
      <div className={`bc-slot group/bcp ${index === order.length - 1 ? 'bc-last' : ''}`} data-bc-page={id} data-bc-title={title}>
        <CommentPin page={id} block={null} kind="page" />
        {!editable && comments.enabled && (
          <div data-edit-ui className="no-print bc-controls opacity-0 group-hover/bcp:opacity-100 focus-within:opacity-100 transition-opacity">
            <span className="px-2 text-[11px] font-medium">
              Page {index + 1} · {title}
            </span>
            <CommentHere className={btn} target={{ page: id, block: null, label: title }} />
          </div>
        )}
        {editable && (
          <div data-edit-ui className="no-print bc-controls opacity-0 group-hover/bcp:opacity-100 focus-within:opacity-100 transition-opacity">
            <span className="px-2 text-[11px] font-medium">
              Page {index + 1} · {title}
            </span>
            <CommentHere className={btn} target={{ page: id, block: null, label: title }} />
            <button type="button" className={btn} disabled={index === 0} onClick={() => move(-1)} aria-label={`Move ${title} earlier`} title="Move earlier">
              ↑
            </button>
            <button type="button" className={btn} disabled={index === order.length - 1} onClick={() => move(1)} aria-label={`Move ${title} later`} title="Move later">
              ↓
            </button>
            {!custom && (
              <button type="button" className={btn} onClick={reset} aria-label={`Reset ${title}`} title="Reset this page to its standard wording and layout">
                <ResetIcon />
              </button>
            )}
            <button type="button" className={btn} onClick={remove} aria-label={`Remove page ${title}`} title={custom ? 'Delete this page' : 'Remove this page (you can add it back)'}>
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </CommentPageContext.Provider>
  );
}

/** What's in scope, as pills: filled when included, dimmed when not. */
function ScopePills({ ecall, rates, monitoring = true }: { ecall: boolean; rates?: { monitoring: string; ecall: string }; monitoring?: boolean }) {
  return (
    <div className="bc-pills">
      <span className="bc-pill-col">
        <span className={monitoring ? 'bc-pill-on bc-pill-lav' : 'bc-pill-off'}><T k="bc.scope.pill.monitoring" d="AI Resident Monitoring & Fall Prevention/Detection" /></span>
        {rates && monitoring && <span className="bc-pill-rate"><T k="bc.scope.pill.monitoringRate" d="({rate} per bed, per month)" v={{ rate: rates.monitoring }} /></span>}
      </span>
      <span className="bc-pill-col">
        <span className={ecall ? 'bc-pill-on bc-pill-coral' : 'bc-pill-off'}>
          <T k="bc.scope.pill.ecall" d="Teton E-Call / Nurse Call" />
        </span>
        {rates && ecall && <span className="bc-pill-rate"><T k="bc.scope.pill.ecallRate" d="({rate} per bed, per month)" v={{ rate: rates.ecall }} /></span>}
      </span>
    </div>
  );
}

function ScopeRow({ ecall, rates, monitoring = true }: { ecall: boolean; rates?: { monitoring: string; ecall: string }; monitoring?: boolean }) {
  return (
    <div className="bc-req-row">
      <div className="bc-req-name"><T k="bc.scope.scope" d="Scope" /></div>
      <div className="bc-req-span"><ScopePills ecall={ecall} rates={rates} monitoring={monitoring} /></div>
    </div>
  );
}

/** A cost line: a name with an optional "(one-time)" under it, the math, and the amount. */
function CostRow({ name, sub, desc, amount, pct, total }: { name: React.ReactNode; sub?: React.ReactNode; desc: React.ReactNode; amount: React.ReactNode; pct?: string; total?: boolean }) {
  // Removable like a table row, keyed by its name's text key.
  const { editable, layout, setLayout } = useProposalText();
  const tk = isValidElement(name) ? (name.props as { k?: string }).k : undefined;
  const rk = tk ? `cost.${tk.replace(/[^a-z0-9_.-]+/gi, '_')}`.slice(0, 80) : null;
  if (rk && layout.hiddenRows && rk in layout.hiddenRows) return null;
  return (
    <div className={`bc-req-row ${total ? 'bc-req-total' : ''} ${rk && editable ? 'relative group/row' : ''}`}>
      {rk && editable && (
        <button
          type="button"
          data-edit-ui
          className="no-print absolute -left-2 top-1/2 -translate-y-1/2 hidden group-hover/row:flex items-center justify-center w-4 h-4 rounded-full bg-teton-near-black text-white shadow"
          title="Remove this row"
          aria-label="Remove this row"
          onClick={(e) => {
            const text = (e.currentTarget.parentElement?.querySelector('.bc-req-name') as HTMLElement | null)?.innerText.trim().split('\n')[0].replace(/\s+/g, ' ').trim() || 'Row';
            setLayout((l) => ({ ...l, hiddenRows: { ...(l.hiddenRows ?? {}), [rk]: `${text.slice(0, 60)} · cost table` } }));
          }}
        >
          <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path d="M4 8h8" strokeLinecap="round" /></svg>
        </button>
      )}
      <div className="bc-req-name">
        {name}
        {sub && <span className="bc-req-sub">{sub}</span>}
      </div>
      <div className="bc-req-desc">{desc}</div>
      <div className="bc-req-amt">{amount}</div>
      <div className="bc-req-pct">{pct ?? ''}</div>
    </div>
  );
}

/** A community's name in a table: opens the community drawer when the proposal can be edited. */
function CommunityName({ index, children }: { index: number; children: React.ReactNode }) {
  const w = useWhatIf();
  const { editable } = useProposalText();
  if (!w || !editable) return <>{children}</>;
  return (
    <button type="button" className="bc-cname" onClick={() => w.editCommunity(index)} title="Edit this community">
      {children}
    </button>
  );
}

/** A community's priced beds by care type (beds with no product are left out). */
const bedsOf = (dc: QuoteDraft['communities'][number]) => scopeOf(dc).pricedByCare;
/** A community's monitored beds by care type (they get Edge units and sensors). */
const monBedsOf = (dc: QuoteDraft['communities'][number]) => scopeOf(dc).monitoredByCare;

/** A community's sensors: the one in each monitored room plus its additional sensors. */
const sensorsOf = (dc: QuoteDraft['communities'][number]) => {
  const n = scopeOf(dc).monitored;
  if (!n) return 0; // E-Call only: no sensors
  return n + Math.max(0, Number(dc.additionalSensors) || 0);
};

const ECALL_NAME = { ble: 'Teton E-Call', inovonics: 'Inovonics E-Call', none: '' } as const;

/** "p. 5": the sheet number of another business-case page, read from the document (blank when that page isn't in it). */
function PageRef({ page }: { page: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [no, setNo] = useState('');
  useEffect(() => {
    const doc = ref.current?.closest('.bc-doc');
    if (!doc) return;
    const read = () => {
      const t = doc.querySelector(`[data-bc-page="${page}"] .bc-foot span:last-child`)?.textContent?.trim() ?? '';
      setNo((prev) => (prev === t ? prev : t));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(doc, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [page]);
  return <span ref={ref} className="bc-exec-ref">{no ? `p. ${Number(no)}` : ''}</span>;
}

interface TocEntry { id: string; title: string; sub: string; pages: string }

/**
 * The contents list. It reads each page's eyebrow, heading and sheet numbers
 * from the rendered document, so it follows removed, added, reordered and
 * reworded pages without keeping its own copy.
 */
function ContentsList() {
  const ref = useRef<HTMLOListElement>(null);
  const [entries, setEntries] = useState<TocEntry[]>([]);
  useEffect(() => {
    const doc = ref.current?.closest('.bc-doc');
    if (!doc) return;
    const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const read = () => {
      const next: TocEntry[] = [];
      doc.querySelectorAll<HTMLElement>('[data-bc-page]').forEach((slot) => {
        const id = slot.dataset.bcPage!;
        if (id === 'cover' || id === 'contents') return;
        const eyebrow = text(slot.querySelector('.bc-eyebrow:not(.bc-gray)'));
        const h1 = text(slot.querySelector('.bc-h1'));
        const nos = Array.from(slot.querySelectorAll('.bc-foot span:last-child')).map((s) => text(s));
        if (!nos.length) return;
        next.push({ id, title: eyebrow || h1 || 'Untitled page', sub: eyebrow ? h1 : '', pages: nos.length > 1 ? `${nos[0]}–${nos[nos.length - 1]}` : nos[0] });
      });
      setEntries((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(doc, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, []);
  return (
    <ol ref={ref} className={`bc-toc ${entries.length > 11 ? 'bc-toc-tight' : ''}`}>
      {entries.map((e, i) => (
        <li key={e.id}>
          <span className="bc-toc-i">{String(i + 1).padStart(2, '0')}</span>
          <span className="bc-toc-t">
            {e.title}
            {e.sub && <small>{e.sub}</small>}
          </span>
          <span className="bc-toc-p">{e.pages}</span>
        </li>
      ))}
    </ol>
  );
}

type BcProps = { draft: QuoteDraft; outputs: StoredOutputs; lines: PriceLine[]; versionNo: number; savedAt: string | null };
/** The business case; wording placeholders from templates ({customer}, {communities}, {beds}) show this deal's values. */
export function BusinessCaseDocument(props: BcProps) {
  const vars = useMemo(() => dealVars(props.draft), [props.draft]);
  return (
    <DealVarsContext.Provider value={vars}>
      <BusinessCaseBody {...props} />
    </DealVarsContext.Provider>
  );
}

function BusinessCaseBody({ draft, outputs, lines, versionNo, savedAt }: BcProps) {
  const { layout, editable, setLayout } = useProposalText();
  const whatIf = useWhatIf();
  // "+" on the community tables: add a community in the drawer (a pilot site from the pilot table).
  const addCommunity = whatIf && editable ? (pilot: boolean) => () => whatIf.addCommunity(pilot) : null;
  const d = buildProposalData(draft, outputs, lines);
  const { finish, kp, cf, sel, capex, inputs, units, anyPilot, pilots, hasResources, costOfMoney, capRate, caseName, term } = d;
  // Until the rep arranges the pages, a removed standard section also drops its part of a page.
  const shown = (id: string) => !!layout.bcPages || !layout.hiddenSections.includes(id);
  const customer = draft.customerName || 'Customer';
  const site = inputs.communities.length === 1 ? inputs.communities[0].name || customer : customer;
  const sites = inputs.communities.length === 1 ? site : `${inputs.communities.length} communities`;
  const capexShown = draft.presentation !== 'opex';
  const vars = { customer, site, sites, beds: `${count(units)} beds`, case: caseName, costOfMoney, capRate };

  // Equipment purchase split: the AI platform (base package, sensors, software) and E-Call (its price premium and renewals).
  const basePrice = capex.pricing.basePrice;
  const ecallEquipment = sum(capex.communities.flatMap(partsOf).map((p) => (!p.monitoring ? p.total : p.ecall === 'none' ? 0 : (p.perBed - basePrice) * p.beds)));
  const platformEquipment = capex.equipment - ecallEquipment;
  const platform = platformEquipment + capex.software;
  const ecall = ecallEquipment + capex.renewals;

  // The cash flow page covers the pilot plus the hardware's useful life (equipment purchase) or the service term
  // (subscription), so its last bar is the total value over the term.
  const pilotMonths = anyPilot ? inputs.schedule.pilotLengthMonths : 0;
  const termMonths = capexShown ? capex.ownershipMonths : term;
  const CHART_MONTHS = pilotMonths + termMonths;
  const cfAll = buildCashFlow(inputs, outputs.annual[outputs.roiCase], CHART_MONTHS);
  // An equipment purchase has its own cash flow: equipment paid at install (so it starts below zero), then software monthly.
  const capexCf = capexShown ? capexCashFlow(cfAll, capex) : null;
  const net = capexCf ? capexCf.discountedNet : cfAll.discountedNet;
  const horizon = net.length;
  // Year 1 figures on the business case, from whichever pricing it shows. Figure keys differ so their inputs drawers stay right.
  const y1 = capexCf
    ? { investment: capexCf.equipment12, net: capexCf.net12, gross: capexCf.grossReturn12, payback: capexCf.discountedPaybackMonth, horizon, key: (k: string) => `bc.capex.${k}` }
    : { investment: kp.totalInvestment12, net: kp.netBenefit12, gross: kp.grossReturnPerDollar12, payback: kp.discountedPaybackMonth, horizon: kp.horizonMonths, key: (k: string) => `card.${k}` };
  const pilotLen = anyPilot ? inputs.schedule.pilotLengthMonths : 0;

  // Annual cost of Teton: equipment purchase spread over its useful life, or the run-rate subscription (so gross − cost = the Stabilized Net Benefit).
  const tetonAnnual = capexShown ? capex.ownershipTotal / (capex.ownershipMonths / 12) : sel.annualRoi - kp.runRateAnnualNetBenefit;
  // Stabilized net benefit: gross − the annual cost of Teton. Equals the model's run rate on a subscription; on an equipment purchase it
  // uses the cost of ownership, so the Year 1 page and the returns page show the same figure.
  const stabilizedNet = sel.annualRoi - tetonAnnual;
  // Stabilized return on cost: yearly gross benefit ÷ the annual cost of Teton (the cost of ownership per year on an equipment purchase).
  const stabilizedReturn = capexShown ? (tetonAnnual > 0 ? sel.annualRoi / tetonAnnual : 0) : sel.returnOnCost;
  const benefitRows: Array<{ key: string; label: string; value: number; means: string; sub: string; v?: Record<string, string> }> = [
    { key: 'roi.benefit.care', label: 'Care Revenue Capture', value: sel.recapturedCareRevenue, means: 'Identifying & correcting residents who are receiving care/services outside of their assessed LOC, earlier', sub: '' },
    { key: 'roi.benefit.moveIn', label: 'Move-in impact', value: sel.moveInImpact, means: 'Total annual move-ins attributed to Teton’s community presence', sub: '' },
    { key: 'roi.benefit.staffing', label: 'Staffing Alignment', value: sel.nightShiftSavings, means: 'Better visibility into the acuity and care needs of a resident, alongside increased caregiver capacity', sub: '' },
    { key: 'roi.benefit.los', label: 'Increased Length of Stay', value: sel.revenueFromLosIncrease, means: 'Preventing & reacting quicker to falls, resulting in less hospitalizations and increased Length of Stay', sub: '' },
    { key: 'roi.benefit.tech', label: 'Tech replacement', value: sel.techReplacement, means: 'Systems Teton replaces, and spend that no longer recurs', sub: '' },
    { key: 'roi.benefit.falls', label: 'Fall cost avoidance', value: sel.fallCostAvoidance, means: 'Overall reduction in falls with injury resulting in a decrease in ER visits and risk/litigation costs', sub: '' },
  ]
    .filter((b) => b.value !== 0)
    .sort((a, b) => b.value - a.value);

  const team = allocationTable(draft.resources ?? [], draft.implementationPlan);
  const stages = pilots[0]?.schedule.stages.filter((s) => s.weeks > 0) ?? [];
  const goLive = pilots[0] ? longDate(pilots[0].goLive) : null;
  const contractEnd = stages.find((s) => s.id === 'evaluation');

  // Each page, by id; a page with nothing to show (no implementation plan, no roles) has no entry.
  const defs: Record<string, (no: number) => React.ReactNode> = {};
  // Pages that print on more than one sheet, and how many (for page numbers).
  const spans: Record<string, number> = {};

  // ---------- Scope (from the floor plans) ----------
  // Shown when at least one community has room types.
  // Only room types whose care type has resident monitoring get Edge units and sensors; those with E-Call only
  // are listed as such, and room types with no product are left out.
  const scoped = draft.communities
    .map((c, i) => {
      const all = normalizeRoomTypes(c.roomTypes);
      const p = productsOf(c);
      const ecallOn = draft.commercial.ecall !== 'none';
      return { c, i, types: monitoredTypes(all, c), eoTypes: all.filter((t) => !p[bedKeyOf(t)].monitoring && ecallOn && p[bedKeyOf(t)].ecall) };
    })
    .filter((x) => x.types.length);
  // E-Call-only communities: listed in the table, outside the room, sensor and Edge unit counts.
  const ecallOnlySites = draft.communities.map((c, i) => ({ c, i })).filter((x) => !monitors(x.c) && scopeOf(x.c).priced > 0);
  if (scoped.length) {
    const all = draft.communities.filter((c) => monitors(c));
    const roomsTotal = sum(all.map((c) => scopeOf(c).monitored));
    const extraTotal = sum(all.map((c) => Number(c.additionalSensors) || 0));
    const sensorsTotal = roomsTotal + extraTotal;
    const perSite = scoped.map((x) => ({ ...x, s: roomScope(x.types, normalizeAllowance(x.c.sensorAllowancePct)) }));
    const planTotal = sum(perSite.map((x) => x.s.planSensors));
    const allowanceTotal = sum(perSite.map((x) => x.s.allowance));
    const pctText = Array.from(new Set(perSite.map((x) => `${Math.round(normalizeAllowance(x.c.sensorAllowancePct) * 1000) / 10}%`))).join(' / ');
    const careMix = (['al', 'mc', 'il', 'snf'] as const)
      .map((k) => [k, sum(all.map((c) => monBedsOf(c)[k]))] as const)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${count(n)} ${CARE_SHORT[k].toLowerCase()}`);
    const multi = draft.communities.length > 1;
    // The scope figure cards removed from the scope page (frees room for full-height table rows).
    const siteCardsHidden = !!layout.bcHiddenBlocks?.sitescope?.cards;
    defs.sitescope = (no) => (
      <Page key="sitescope" no={no} crumb={<T k="bc.site.crumb" d="Scope" />}>
        <p className="bc-eyebrow"><T k="bc.site.eyebrow" d="Scope" /></p>
        <h1 className="bc-h1">
          <T k="bc.site.title" d="Scoped from your floor plans: {rooms} rooms, {sensors} sensors." v={{ rooms: count(roomsTotal), sensors: count(sensorsTotal) }} />
        </h1>
        <p className="bc-lede">
          <T k="bc.site.lede" d="One sensor for each room or living area a resident uses. Quantities are confirmed at the site survey and trued up to what is installed." />
        </p>
        <Blocks page="sitescope">
          <B id="cards" label="Scope figures">
            <div className="bc-four">
              <Stat ck="site.rooms" value={count(roomsTotal)}>
                <T k="bc.site.rooms" d="resident rooms: {mix}" v={{ mix: careMix.join(' and ') }} />
              </Stat>
              <Stat ck="site.edge" value={count(roomsTotal)}>
                <T k="bc.site.edge" d="Edge units, one in every resident room" />
              </Stat>
              <div className="bc-dark bc-dark-hot">
                <b><CallOut k="site.sensors">{count(sensorsTotal)}</CallOut></b>
                <span><T k="bc.site.sensors" d="sensors: {plan} from the plan, plus a {pct} allowance for site conditions" v={{ plan: count(planTotal), pct: pctText }} /></span>
              </div>
              <Stat ck="site.extra" value={count(extraTotal)}>
                <T k="bc.site.extra" d="additional sensors beyond the first in each room, including the allowance of {allowance}" v={{ allowance: count(allowanceTotal) }} />
              </Stat>
            </div>
          </B>
          <B id="types" label="Rooms by type">
            <div className="relative group/view">
            {/* With the scope cards removed there's room for full-height rows: a hover switch picks them. */}
            {editable && siteCardsHidden && (
              <ViewSwitch
                field="bcSiteRows"
                position="absolute right-0 -top-1"
                label="Table rows"
                options={[['compact', 'Compact rows'], ['full', 'Full rows']] as const}
                value={layout.bcSiteRows ?? 'compact'}
                onChange={(v) => setLayout((l) => ({ ...l, bcSiteRows: v === 'full' ? 'full' : undefined }))}
              />
            )}
            <p className="bc-eyebrow bc-gray"><T k="bc.site.byType" d="Rooms by type" /></p>
            <div className={`bc-card bc-tbl bc-pilot-tbl bc-site-tbl ${siteCardsHidden && layout.bcSiteRows === 'full' ? 'bc-site-full' : ''}`}>
              <RTable>
                <thead>
                  <tr>
                    <th>Room type</th>
                    <th>Care</th>
                    <th className="bc-r">Rooms</th>
                    <th className="bc-r">Sensors per room</th>
                    <th className="bc-hl bc-r">Sensors</th>
                    <th className="bc-hl2 bc-r">Edge units</th>
                  </tr>
                </thead>
                <RTbody id="site" name="Rooms by type">
                  {perSite.map(({ c, i, types, eoTypes, s: st }) => (
                    <Fragment key={c.id}>
                      {multi && (
                        <tr className="bc-site-group" data-fixed>
                          <td colSpan={6}>{d.perCommunity[i]?.name || c.name}</td>
                        </tr>
                      )}
                      {types.map((t) => (
                        <tr key={t.id}>
                          <td className="bc-m">{t.name || 'Room type'}</td>
                          <td><span className={`bc-care bc-care-${t.care}`}>{careLabel(t)}</span></td>
                          <td className="bc-r">{count(t.rooms)}</td>
                          <td className="bc-r"><span className="bc-dots" aria-hidden="true">{'●'.repeat(Math.min(t.sensors, 6))}</span> {t.sensors}</td>
                          <td className="bc-hl bc-big bc-r">{count(t.rooms * t.sensors)}</td>
                          <td className="bc-hl2 bc-big bc-r">{count(t.rooms)}</td>
                        </tr>
                      ))}
                      {st.allowance > 0 && (
                        <tr>
                          <td className="bc-m bc-quiet">Site-conditions allowance</td>
                          <td><small>{Math.round(normalizeAllowance(c.sensorAllowancePct) * 1000) / 10}% of {count(st.planSensors)}, rounded up</small></td>
                          <td className="bc-r">–</td>
                          <td className="bc-r">–</td>
                          <td className="bc-hl bc-big bc-r">{count(st.allowance)}</td>
                          <td className="bc-hl2 bc-r">–</td>
                        </tr>
                      )}
                      {eoTypes.map((t) => (
                        <tr key={t.id} className="bc-site-ecall">
                          <td colSpan={6}>
                            <T k={`bc.site.ecallOnlyType.${t.id}`} d="{name} ({care}) · E-Call only · {rooms} rooms" v={{ name: t.name || 'Room type', care: careLabel(t), rooms: count(t.rooms) }} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {ecallOnlySites.map(({ c, i }) => (
                    <Fragment key={c.id}>
                      <tr className="bc-site-group" data-fixed>
                        <td colSpan={6}>{d.perCommunity[i]?.name || c.name}</td>
                      </tr>
                      <tr className="bc-site-ecall">
                        <td colSpan={6}><T k="bc.site.ecallOnly" d="E-Call only · {beds} beds" v={{ beds: count(scopeOf(c).priced) }} /></td>
                      </tr>
                    </Fragment>
                  ))}
                  <tr className="bc-tot">
                    <td className="bc-m">Total</td>
                    <td />
                    <td className="bc-r">{count(sum(perSite.map((x) => x.s.rooms)))}</td>
                    <td />
                    <td className="bc-hl bc-big bc-r">{count(sum(perSite.map((x) => x.s.totalSensors)))}</td>
                    <td className="bc-hl2 bc-big bc-r">{count(sum(perSite.map((x) => x.s.rooms)))}</td>
                  </tr>
                </RTbody>
              </RTable>
            </div>
            </div>
          </B>
          <B id="hardware" label="What gets installed">
            <p className="bc-eyebrow bc-gray"><T k="bc.site.hardware" d="What gets installed" /></p>
            {/* The hardware, each photo shown whole beside its caption. */}
            <div className="bc-hw">
              {(
                [
                  ['sensor', '/Teton_Sensor.png', 'Teton Sensor', 'One per room or living area, more where a room needs it'],
                  ['edge', '/Teton_ComputeUnit.png', 'Teton Edge Unit', 'One per resident room'],
                ] as const
              ).map(([k, src, name, desc]) => (
                <figure key={k} className="bc-hw-card">
                  <div className="bc-hw-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={name} />
                  </div>
                  <figcaption>
                    <b><T k={`bc.site.hw.${k}`} d={name} /></b>
                    <span><T k={`bc.site.hw.${k}.desc`} d={desc} /></span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- The pilot ----------
  // Pilot sites' costs from the price lines: pilot fees for the pilot months, and their installation net of credits.
  const pilotSites = draft.communities
    .map((dc, i) => ({ dc, i, row: d.perCommunity[i] }))
    .filter((x) => x.row?.pilot);
  // The pilot in brief, for the Executive Summary.
  let execPilot: { name: string; beds: number; total: number; months: number } | null = null;
  if (pilotSites.length) {
    const pos = new Set(pilotSites.map((x) => x.i));
    const siteLines = lines.filter((l) => l.communityPosition != null && pos.has(l.communityPosition));
    const pilotFeeLines = siteLines.filter((l) => l.billing === 'monthly' && l.description.includes('— pilot'));
    const pilotFees = sum(pilotFeeLines.map(lineTotal));
    const pilotMonthlyTotal = sum(pilotFeeLines.map((l) => l.qty * l.unitNet));
    const pIns = installMath(siteLines);
    const pSen = sensorMath(siteLines, (pos) => pos != null && !!d.perCommunity[pos]?.pilot);
    const install = pIns.gross - pIns.credit;
    const pilotTotal = pilotFees + install + pSen.total;
    const pilotEcall = draft.commercial.ecall !== 'none' && pilotSites.some((x) => hasEcall(x.dc));
    const months = inputs.schedule.pilotLengthMonths;
    const beds = bedsOf;
    const pilotName = pilotSites.length === 1 ? d.perCommunity[pilotSites[0].i].name || customer : `${pilotSites.length} pilot communities`;
    execPilot = { name: pilotName, beds: sum(pilotSites.map((x) => { const b = beds(x.dc); return b.il + b.al + b.mc + b.snf; })), total: pilotTotal, months };
    const pvars = { ...vars, pilot: pilotName, months: String(months), term: String(term) };
    defs.pilot = (no) => (
      <Page key="pilot" no={no} crumb={<T k="bc.pilot.crumb" d="The pilot" />}>
        <p className="bc-eyebrow"><T k="bc.pilot.eyebrow" d="The pilot" /></p>
        <h1 className="bc-h1">
          <T k="bc.pilot.title" d="{days}-Day Pilot Overview" v={{ ...pvars, days: String(months * 30) }} />
        </h1>
        <p className="bc-lede">
          <T k="bc.pilot.lede" d="Teton will provide a low-risk, {months}-month pilot to prove value & outcomes." v={pvars} />
        </p>
        <Blocks page="pilot">
        <B id="costs" label="Pilot costs">
        {pilotTotal <= 0 ? (
          // A free pilot: what's included, and that nothing is billed. Rows full or compact (hover switch), like the tables.
          <div className={`bc-card bc-req relative group/tbl ${layout.bcCompact?.pilotfree ? 'bc-req-compact' : ''}`}>
            {editable && (
              <ViewSwitch
                field="bcCompact.pilotfree"
                position="absolute right-2 top-1.5"
                hover="group-hover/tbl:opacity-100"
                label="Table rows"
                options={[['full', 'Full rows'], ['compact', 'Compact rows']] as const}
                value={layout.bcCompact?.pilotfree ? 'compact' : 'full'}
                onChange={(v) =>
                  setLayout((l) => {
                    const next = { ...(l.bcCompact ?? {}) };
                    if (v === 'compact') next.pilotfree = true;
                    else delete next.pilotfree;
                    return { ...l, bcCompact: Object.keys(next).length ? next : undefined };
                  })
                }
              />
            )}
            <ScopeRow ecall={pilotEcall} monitoring={pilotSites.some((x) => monitors(x.dc))} />
            <CostRow
              name={<T k="bc.pilot.install" d="Installation" />}
              sub={<T k="bc.oneTime" d="(one-time)" />}
              desc={<T k="bc.pilot.free.install" d="Installation + Additional Sensors" />}
              amount={<V k="bc.pilot.install.value" label="Pilot installation amount">{usd(install + pSen.total)}</V>}
              pct="–"
            />
            <CostRow
              name={<T k="bc.pilot.fees" d="Monthly Fees" />}
              desc={<T k="bc.pilot.free.fees" d="No monthly fees during pilot period" />}
              amount={<V k="bc.pilot.fees.value" label="Pilot fees amount">{usd(pilotFees)}</V>}
              pct="–"
            />
            <div className="bc-req-row bc-req-total">
              <div className="bc-req-name"><T k="bc.pilot.total" d="Total pilot cost" /></div>
              <div className="bc-req-desc"><T k="bc.pilot.free.total" d="No one-time or monthly fees during pilot period" /></div>
              <div className="bc-req-amt"><V k="bc.pilot.total.value" label="Total pilot cost">{usd(pilotTotal)}</V></div>
              <div className="bc-req-pct">100%</div>
            </div>
          </div>
        ) : (
          (() => {
            // A paid pilot: the same columns as the investment table.
            const ins = installColumns(siteLines);
            const sen = sensorColumns(siteLines);
            const money = (n: number) => usd(n, { cents: !Number.isInteger(Math.round(n * 100) / 100) });
            const range = (a: number, b: number) => (a === b ? money(a) : `${money(a)}–${money(b)}`);
            const pilotBeds = sum(pilotFeeLines.filter((l) => l.sku === SKU.platform).map((l) => l.qty)) || ins.units;
            const perBed = pilotBeds > 0 ? pilotMonthlyTotal / pilotBeds : 0;
            const credit = (r: typeof ins, what: string) =>
              r.creditUnits > 0 ? (
                <td className="bc-neg">
                  {`−${range(r.creditMin, r.creditMax)}`}
                  <small>{`on ${count(r.creditUnits)} pilot ${what}`}</small>
                </td>
              ) : (
                <td>–</td>
              );
            return (
              <div className="bc-card bc-tbl bc-hrs bc-inv">
                <RTable>
                  <RTbody id="pilotinv" name="The pilot">
                    <tr className="bc-inv-scope">
                      <td className="bc-m"><T k="bc.scope.scope" d="Scope" /></td>
                      <td colSpan={4}><ScopePills ecall={pilotEcall} monitoring={pilotSites.some((x) => monitors(x.dc))} /></td>
                    </tr>
                    <tr className="bc-inv-head" data-fixed>
                      <th><T k="bc.inv.item" d="Item" /></th>
                      <th><T k="bc.inv.unitPrice" d="Unit price" /></th>
                      <th><T k="bc.inv.quantity" d="Quantity" /></th>
                      <th><T k="bc.inv.convCredits" d="Conv. credits" /></th>
                      <th className="bc-hl"><T k="bc.inv.total" d="Total" /></th>
                    </tr>
                    <tr>
                      <td className="bc-m"><T k="bc.pilot.install" d="Installation" /><small><T k="bc.inv.oneTime" d="One-time" /></small></td>
                      <td>{range(ins.minPer, ins.maxPer)} per room, one-time</td>
                      <td>{count(ins.units)}</td>
                      {credit(ins, 'beds')}
                      <td className="bc-hl bc-big"><V k="bc.pilot.install.value" label="Pilot installation amount">{usd(ins.total)}</V></td>
                    </tr>
                    {sen.units > 0 && (
                      <tr>
                        <td className="bc-m"><T k="bc.sensors" d="Additional Sensors" /><small><T k="bc.inv.oneTime" d="One-time" /></small></td>
                        <td>{range(sen.minPer, sen.maxPer)} per sensor, one-time</td>
                        <td>{count(sen.units)}</td>
                        {credit(sen, 'sensors')}
                        <td className="bc-hl bc-big"><V k="bc.pilot.sensors.value" label="Pilot additional sensors amount">{usd(sen.total)}</V></td>
                      </tr>
                    )}
                    <tr>
                      <td className="bc-m">
                        <T k="bc.pilot.fees" d="Monthly Fees" />
                        <small><T k="bc.pilot.feesSub" d={pilotEcall ? 'Teton Resident Monitoring and E-Call' : 'Teton Resident Monitoring'} /></small>
                      </td>
                      <td>{money(perBed)} per room, per month</td>
                      <td>{count(months)} Months</td>
                      <td>–</td>
                      <td className="bc-hl bc-big">
                        {/* Per month by default; a hover switch shows the total over the pilot instead. */}
                        <div className="relative group/view">
                          {editable && (
                            <ViewSwitch
                field="bcPilotFees"
                              position="absolute right-0 bottom-full mb-1"
                              label="Monthly fees shown as"
                              options={[['monthly', 'Monthly'], ['total', 'Total']] as const}
                              value={layout.bcPilotFees ?? 'monthly'}
                              onChange={(v) => setLayout((l) => ({ ...l, bcPilotFees: v === 'total' ? 'total' : undefined }))}
                            />
                          )}
                          {layout.bcPilotFees === 'total' ? (
                            <V k="bc.pilot.fees.value" label="Pilot fees amount">{usd(pilotFees)}</V>
                          ) : (
                            <V k="bc.pilot.fees.monthly" label="Pilot fees per month">{usd(pilotMonthlyTotal)} / mo</V>
                          )}
                        </div>
                      </td>
                    </tr>
                    <tr className="bc-tot">
                      <td className="bc-m">
                        <T k="bc.pilot.total" d="Total pilot cost" />
                        <small><T k="bc.pilot.totalNote" d={pilotSites.length === 1 ? 'Everything paid during the {months}-month pilot. After it, the community converts to the {term}-month service term.' : 'Everything paid during the {months}-month pilot. After it, the communities convert to the {term}-month service term.'} v={pvars} /></small>
                      </td>
                      <td />
                      <td />
                      <td />
                      <td className="bc-hl bc-big"><V k="bc.pilot.total.value" label="Total pilot cost">{usd(pilotTotal)}</V></td>
                    </tr>
                  </RTbody>
                </RTable>
              </div>
            );
          })()
        )}
        </B>
        <B id="communities" label="Pilot communities" onAdd={addCommunity?.(true)} addLabel="Add a pilot community">
        <p className="bc-eyebrow bc-gray"><T k="bc.pilot.where" d={pilotSites.length === 1 ? 'Where the pilot runs' : 'Where the pilots run'} /></p>
        {/* Every pilot community in one table: beds by care type and what its pilot costs. */}
          <div className="bc-card bc-tbl bc-hrs bc-pilot-tbl">
            <RTable>
              <thead>
                <tr>
                  <th>Community</th>
                  <th>AL beds</th>
                  <th>MC beds</th>
                  <th>SNF beds</th>
                  <th>Pilot / month</th>
                  <th className="bc-hl">Pilot cost</th>
                </tr>
              </thead>
              <RTbody id="pilot" name="The pilot">
                {pilotSites.map(({ dc, i }) => {
                  const b = beds(dc);
                  const ls = siteLines.filter((l) => l.communityPosition === i);
                  const fees = ls.filter((l) => l.billing === 'monthly' && l.description.includes('— pilot'));
                  const cost = sum(fees.map(lineTotal)) + sum(ls.filter((l) => l.billing === 'one_time').map(lineTotal));
                  return (
                    <tr key={dc.id}>
                      <td className="bc-m">
                        <CommunityName index={i}>{d.perCommunity[i].name}</CommunityName>
                        <span className="bc-csub">{d.perCommunity[i].detail && <small>{d.perCommunity[i].detail}</small>}<MissingPlanPill communityId={dc.id} name={d.perCommunity[i].name} /></span>
                      </td>
                      <td>{count(b.al)}</td>
                      <td>{count(b.mc)}</td>
                      <td>{count(b.snf)}</td>
                      <td>{usd(sum(fees.map((l) => l.qty * l.unitNet)))}</td>
                      <td className="bc-hl bc-big">{usd(cost)}</td>
                    </tr>
                  );
                })}
                <tr className="bc-tot">
                  <td className="bc-m">{pilotSites.length === 1 ? 'Total' : `${pilotSites.length} communities`}</td>
                  <td>{count(sum(pilotSites.map((x) => beds(x.dc).al)))}</td>
                  <td>{count(sum(pilotSites.map((x) => beds(x.dc).mc)))}</td>
                  <td>{count(sum(pilotSites.map((x) => beds(x.dc).snf)))}</td>
                  <td>{usd(pilotMonthlyTotal)}</td>
                  <td className="bc-hl bc-big">{usd(pilotTotal)}</td>
                </tr>
              </RTbody>
            </RTable>
          </div>
        </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- The investment ----------
  // Investment page (subscription): the math behind each line, and all-in cost per bed per month over each community's pilot and term.
  const allIns = installMath(lines);
  const allSen = sensorMath(lines, (pos) => pos != null && !!d.perCommunity[pos]?.pilot);
  const anyEcall = draft.commercial.ecall !== 'none' && draft.communities.some((c) => hasEcall(c));
  // Resident monitoring is in scope unless every community is E-Call only.
  const anyMonitoring = draft.communities.some((c) => monitors(c));
  const perBed = units > 0 ? d.serviceMonthly / units : 0;
  const perBedMonthly = usd(perBed, { cents: !Number.isInteger(Math.round(perBed * 100) / 100) });
  const money = (n: number) => usd(n, { cents: !Number.isInteger(Math.round(n * 100) / 100) });
  // Year 1: one-time charges and monthly fees billed in the first 12 months (they add up to the Year 1 investment).
  const y1OneTime = sum(cf.install.slice(0, 12));
  const y1Monthly = kp.totalInvestment12 - y1OneTime;

  // Concealed installation: an optional add-on range per room (after the standard credit), outside the totals above.
  const finishRow = finish.concealed ? (
    <CostRow
      name={<T k="bc.finish" d="Concealed finish" />}
      sub={<T k="bc.finish.sub" d="(optional)" />}
      desc={
        <T
          k="bc.finish.math"
          d="{rooms} rooms × {net} after the {credit} standard credit. Pending site survey."
          v={{ rooms: count(finish.rooms), net: rangeText(finish.netLow, finish.netHigh, usd), price: rangeText(finish.low, finish.high, usd), credit: usd(finish.credit) }}
        />
      }
      amount={<V k="finish.total.value" label="Concealed installation total"><span className="bc-range">{finish.totalLow === finish.totalHigh ? usd(finish.totalLow) : `${usd(finish.totalLow)}–${usd(finish.totalHigh)}`}</span></V>}
    />
  ) : null;

  /** Every community: beds by care type, and its total cost (a main figure with a smaller one under it). */
  const communityTable = (cell: (i: number) => { main: string; sub: string }, total: { main: string; sub: string }) => (
    <>
      <p className="bc-eyebrow bc-gray"><T k="bc.scope.where" d={draft.communities.length === 1 ? 'The community' : 'By community'} /></p>
      <div className="bc-card bc-tbl bc-hrs bc-pilot-tbl">
        <RTable>
          <thead>
            <tr>
              <th>Community</th>
              <th>AL beds</th>
              <th>MC beds</th>
              <th>SNF beds</th>
              <th>Sensors</th>
              <th className="bc-hl">Total cost</th>
            </tr>
          </thead>
          <RTbody id="comm" name="By community">
            {draft.communities.map((dc, i) => {
              const b = bedsOf(dc);
              const c = cell(i);
              return (
                <tr key={dc.id}>
                  <td className="bc-m">
                    <CommunityName index={i}>{d.perCommunity[i].name}</CommunityName>
                    <span className="bc-csub">{d.perCommunity[i].detail && <small>{d.perCommunity[i].detail}</small>}<MissingPlanPill communityId={dc.id} name={d.perCommunity[i].name} /></span>
                  </td>
                  <td>{count(b.al)}</td>
                  <td>{count(b.mc)}</td>
                  <td>{count(b.snf)}</td>
                  <td>{count(sensorsOf(dc))}</td>
                  <td className="bc-hl bc-big">
                    {c.main}
                    <small>{c.sub}</small>
                  </td>
                </tr>
              );
            })}
            {draft.communities.length > 1 && (
              <tr className="bc-tot">
                <td className="bc-m">{`${draft.communities.length} communities`}</td>
                <td>{count(sum(draft.communities.map((c) => bedsOf(c).al)))}</td>
                <td>{count(sum(draft.communities.map((c) => bedsOf(c).mc)))}</td>
                <td>{count(sum(draft.communities.map((c) => bedsOf(c).snf)))}</td>
                <td>{count(sum(draft.communities.map(sensorsOf)))}</td>
                <td className="bc-hl bc-big">
                  {total.main}
                  <small>{total.sub}</small>
                </td>
              </tr>
            )}
          </RTbody>
        </RTable>
      </div>
    </>
  );
  {
    defs.scope = (no) => (
      <Page key="scope" no={no} crumb={<T k="bc.crumb" d="{customer} · Proposal" v={vars} />}>
        <p className="bc-eyebrow"><T k="bc.scope.eyebrow" d="The investment" /></p>
        {capexShown ? (
          <>
            <h1 className="bc-h1">
              <T k="bc.scope.title.capex" d="Post-Pilot Overview" />
            </h1>
            <p className="bc-lede">
              <T k="bc.scope.lede.capex" d="Cost breakdown of Teton post-pilot" />
            </p>
          </>
        ) : (
          <>
            <h1 className="bc-h1">
              <T k="bc.scope.title.opex" d="Post-Pilot Overview" />
            </h1>
            <p className="bc-lede">
              <T k="bc.scope.lede.opex" d="Cost breakdown of Teton post-pilot" />
            </p>
          </>
        )}
        {capexShown ? (
          <Blocks page="scope-capex">
            <B id="overview" label="Overview">
            <div className="relative group/view">
              {editable && (
                <ViewSwitch
                field="bcInvCards"
                  position="absolute right-0 -top-1"
                  label="Overview cards"
                  options={[['overview', 'Overview'], ['units', 'Unit prices']] as const}
                  value={layout.bcInvCards ?? 'overview'}
                  onChange={(v) => setLayout((l) => ({ ...l, bcInvCards: v === 'units' ? 'units' : undefined }))}
                />
              )}
              {layout.bcInvCards === 'units' ? (
                <>
                  <p className="bc-eyebrow bc-gray"><T k="bc.scope.unitPrices" d="Unit prices" /></p>
                  <div className="bc-unit-cards">
                    {(() => {
                      const base = grossBaseRows(capex);
                      const baseRange = { minPer: Math.min(...base.map((r) => r.minPer), Infinity), maxPer: Math.max(...base.map((r) => r.maxPer), 0) };
                      const sensor = grossSensorRow(capex);
                      const card = (k: string, name: string, price: string, freq: string, desc: string) => (
                        <div className="bc-dark" key={k}>
                          <span className="bc-unit-k"><T k={`bc.unit.${k}`} d={name} /></span>
                          <b><CallOut k={`bc.unit.${k}`}><V k={`bc.unit.${k}.value`} label={`${name} unit price`}>{price}</V></CallOut></b>
                          <span className="bc-unit-f"><T k={`bc.unit.${k}.freq`} d={freq} /></span>
                          <span className="bc-unit-e"><T k={`bc.unit.${k}.desc`} d={desc} /></span>
                        </div>
                      );
                      return [
                        card('base', 'Base package', base.length ? perUnitText(baseRange, (n) => usd(n)) : usd(capex.pricing.basePrice), 'per room · one-time', 'Edge unit and first sensor, installed in each resident room'),
                        card('sensors', 'Additional sensors', sensor ? perUnitText(sensor, (n) => usd(n)) : usd(capex.pricing.sensorPrice), 'per sensor · one-time', 'For rooms that need more than one sensor (bedrooms, living areas)'),
                        card('software', 'Software & services', usd(capex.pricing.softwareRate, { cents: !Number.isInteger(capex.pricing.softwareRate) }), 'per room · per month', 'Platform, staff app, updates and support'),
                      ];
                    })()}
                  </div>
                </>
              ) : (
              <>
              <p className="bc-eyebrow bc-gray"><T k="bc.scope.overview" d="Overview" /></p>
              <div className="bc-two bc-three-compact bc-stat-inline">
                <Stat value={<V k="capex.share.value" label="Share of the cost that is capitalized">{Math.round(capex.equipmentShare * 100)}%</V>}>
                  <T k="bc.overview.capitalized" d="of the total cost is capitalized & treated as a capital expenditure" />
                </Stat>
                <Stat value={<V k="capex.perUnit.value" label="Total cost per unit">{usd(capex.beds ? capex.ownershipTotal / capex.beds : 0)}</V>}>
                  <T k="bc.overview.perUnit" d="Total Cost per Unit ({years}-year cost of ownership ÷ {units} units)" v={{ years: String(capex.ownershipMonths / 12), units: count(capex.beds) }} />
                </Stat>
              </div>
              </>
              )}
            </div>
            </B>
            <B id="costs" label="Equipment purchase">
            <div className="bc-card bc-tbl bc-hrs bc-inv">
              <RTable>
                <RTbody id="inv" name="The investment">
                  <tr className="bc-inv-scope">
                    <td className="bc-m"><T k="bc.scope.scope" d="Scope" /></td>
                    <td colSpan={3}><ScopePills ecall={anyEcall} monitoring={anyMonitoring} /></td>
                  </tr>
                  <tr className="bc-inv-head" data-fixed>
                    <th><T k="bc.inv.item" d="Item" /></th>
                    <th><T k="bc.inv.unitPrice" d="Unit price" /></th>
                    <th><T k="bc.inv.quantity" d="Quantity" /></th>
                    <th className="bc-hl"><T k="bc.inv.total" d="Total" /></th>
                  </tr>
                  {grossBaseRows(capex).map((r) => (
                    <tr key={r.key}>
                      <td className="bc-m">
                        <T k={`bc.capex.base.${r.key}`} d={r.key === 'ecallonly' ? 'E-Call equipment' : 'Base packages'} />
                        <small>
                          <T
                            k={`bc.capex.base.${r.key}.desc`}
                            d={r.key === 'ecallonly' ? 'One-time · beds with E-Call only: 48 months of E-Call paid up front' : r.key === 'none' ? 'One-time · Edge unit + sensor, installed' : r.key === 'ble' ? 'One-time · Edge unit + sensor, installed, with E-Call pendant and wall-mount pendant' : 'One-time · Edge unit + sensor, installed, with Inovonics E-Call pendant and wall-mount pull cord'}
                          />
                        </small>
                      </td>
                      <td>{perUnitText(r, (n) => usd(n))} per room, one-time</td>
                      <td>{count(r.units)}</td>
                      <td className="bc-hl bc-big"><V k={`capex.base.${r.key}.value`} label="Base packages amount">{usd(r.total)}</V></td>
                    </tr>
                  ))}
                  {grossSensorRow(capex) && (() => {
                    const r = grossSensorRow(capex)!;
                    return (
                      <tr>
                        <td className="bc-m"><T k="bc.sensors" d="Additional Sensors" /><small><T k="bc.inv.oneTime" d="One-time" /></small></td>
                        <td>{perUnitText(r, (n) => usd(n))} per sensor, one-time</td>
                        <td>{count(r.units)}</td>
                        <td className="bc-hl bc-big"><V k="capex.sensors.value" label="Additional sensors amount">{usd(r.total)}</V></td>
                      </tr>
                    );
                  })()}
                  <tr className="bc-tot">
                    <td className="bc-m"><T k="capex.price" d="One-time equipment cost" /><small><T k="bc.capex.equipmentNote" d="Paid at install. No separate installation charge and no license fee." /></small></td>
                    <td />
                    <td />
                    <td className="bc-hl bc-big"><V k="capex.price.value" label="One-time equipment cost">{usd(capex.equipment)}</V></td>
                  </tr>
                  <tr>
                    <td className="bc-m"><T k="bc.capex.software" d={'Software & services'} /><small><T k="bc.inv.billedMonthly" d="Billed monthly" /></small></td>
                    <td>{usd(capex.pricing.softwareRate, { cents: !Number.isInteger(capex.pricing.softwareRate) })} per room, per month</td>
                    <td>{count(capex.ownershipMonths)} Months</td>
                    <td className="bc-hl bc-big"><V k="capex.software.value" label="Software and services per month">{usd(capex.softwareMonthly)} / mo</V></td>
                  </tr>
                  {capex.renewals > 0 && (
                    <tr>
                      <td className="bc-m"><T k="capex.renewals" d="E-Call renewals" /><small><T k="bc.capex.renewalsNote" d="Renewals that fall within the {years} years." v={{ years: String(capex.ownershipMonths / 12) }} /></small></td>
                      <td />
                      <td />
                      <td className="bc-hl bc-big"><V k="capex.renewals.value" label="E-Call renewals amount">{usd(capex.renewals)}</V></td>
                    </tr>
                  )}
                  <tr className="bc-tot">
                    <td className="bc-m">
                      <T k="bc.capex.ownership" d="{years}-year cost of ownership" v={{ years: capex.ownershipMonths === 48 ? 'Four' : String(capex.ownershipMonths / 12) }} />
                      <small><T k="bc.capex.ownershipNote" d="Equipment plus software over the hardware’s useful life." /></small>
                    </td>
                    <td />
                    <td />
                    <td className="bc-hl bc-big"><V k="capex.ownership.value" label="Cost of ownership">{usd(capex.ownershipTotal)}</V></td>
                  </tr>
                  {finish.concealed && (
                    <tr>
                      <td className="bc-m"><T k="bc.finish" d="Concealed finish" /><small><T k="bc.inv.finish.sub" d="Optional · after the {credit} standard credit. Pending site survey." v={{ credit: usd(finish.credit) }} /></small></td>
                      <td>{rangeText(finish.netLow, finish.netHigh, usd)} per room, one-time</td>
                      <td>{count(finish.rooms)}</td>
                      <td className="bc-hl bc-big"><V k="finish.total.value" label="Concealed installation total"><span className="bc-range">{finish.totalLow === finish.totalHigh ? usd(finish.totalLow) : `${usd(finish.totalLow)}–${usd(finish.totalHigh)}`}</span></V></td>
                    </tr>
                  )}
                </RTbody>
              </RTable>
            </div>
            {conversionCreditOf(capex) > 0 && (
              <p className="bc-note bc-conv-note">
                <T k="bc.inv.conversionNote" d="Unit prices are after a {credit} conversion credit on each base package and additional sensor at pilot communities." v={{ credit: usd(conversionCreditOf(capex)) }} />
              </p>
            )}
            {ecall > 0 && capex.ownershipTotal > 0 && (
              <div className="bc-split">
                <div style={{ flex: platform, background: 'var(--bc-lav)' }}>
                  <T k="bc.split.platform" d="AI Resident Monitoring & Fall Prevention/Detection" /> · {pctOf(platform, capex.ownershipTotal)} of four-year cost
                </div>
                <div style={{ flex: Math.max(ecall, capex.ownershipTotal * 0.12), background: '#F08D79', color: '#fff' }}>E-Call · {pctOf(ecall, capex.ownershipTotal)}</div>
              </div>
            )}
            {draft.presentation === 'both' && (
              <p className="bc-note">
                <T k="bc.scope.orSubscription" d="Or by subscription: {oneTime} one-time installation, then {monthly} a month, {total} over the {term}-month service term." v={{ oneTime: usd(d.oneTime), monthly: usd(d.serviceMonthly), total: usd(d.termTotal), term: String(term) }} />
              </p>
            )}
            </B>
            <B id="communities" label="Communities" onAdd={addCommunity?.(false)} addLabel="Add a community">
              {communityTable(
                (i) => ({ main: usd(capex.communities[i]?.equipment ?? 0), sub: `(${usd(capex.communities[i]?.softwareMonthly ?? 0)} / mo)` }),
                { main: usd(capex.equipment), sub: `(${usd(capex.softwareMonthly)} / mo)` },
              )}
            </B>
          </Blocks>
        ) : (
          <Blocks page="scope">
            <B id="overview" label="Overview">
            <div className="relative group/view">
            {editable && (
              <ViewSwitch
                field="bcOpexCards"
                position="absolute right-0 -top-1"
                label="Overview cards"
                options={[['overview', 'Overview'], ['units', 'Unit prices']] as const}
                value={layout.bcOpexCards ?? 'units'}
                onChange={(v) => setLayout((l) => ({ ...l, bcOpexCards: v === 'overview' ? 'overview' : undefined }))}
              />
            )}
            {layout.bcOpexCards !== 'overview' ? (
              <>
                <p className="bc-eyebrow bc-gray"><T k="bc.scope.unitPrices" d="Unit prices" /></p>
                <div className="bc-unit-cards">
                  {(() => {
                    const card = (k: string, name: string, price: React.ReactNode, freq: string, desc: string, v?: Record<string, string>) => (
                      <div className="bc-dark" key={k}>
                        <span className="bc-unit-k"><T k={`bc.opunit.${k}`} d={name} /></span>
                        <b><CallOut k={`unit.${k}`}>{price}</CallOut></b>
                        <span className="bc-unit-f"><T k={`bc.opunit.${k}.freq`} d={freq} /></span>
                        <span className="bc-unit-e"><T k={`bc.opunit.${k}.desc`} d={desc} v={v} /></span>
                      </div>
                    );
                    // The products in scope, by name.
                    const products = [...(anyMonitoring ? ['Teton AI Resident Monitoring & Fall Prevention/Detection'] : []), ...(anyEcall ? ['Teton Nurse / E-Call'] : [])].join(' and ');
                    const k = draft.commercial;
                    return [
                      card('recurring', 'Recurring Costs', <V k="bc.overview.perBed.value" label="Total cost per bed per month">{perBedMonthly}</V>, 'per bed · per month', 'Monthly Costs for {products}', { products }),
                      card('install', 'Installation', <V k="bc.opunit.install.value" label="Installation per bed">{money(k.installRate)}</V>, 'per bed · one-time', 'Edge unit and first sensor, installed in each resident room'),
                      card('sensors', 'Additional Sensors', <V k="bc.opunit.sensors.value" label="Price per additional sensor">{money(k.sensorPrice)}</V>, 'per sensor · per room', 'For rooms that need more than one sensor (multiple bedrooms, living areas)'),
                    ];
                  })()}
                </div>
              </>
            ) : (
            <>
            <p className="bc-eyebrow bc-gray"><T k="bc.scope.overview" d="Overview" /></p>
            <div className="bc-three bc-three-compact">
              <Stat value={<V k="scope.total.value" label="Total cost over the term">{usd(d.termTotal)}</V>}>
                <T k="bc.overview.total" d="Total Cost Over {term}-month Term" v={{ term: String(term) }} />
              </Stat>
              <Stat value={<V k="bc.overview.perBed.value" label="Total cost per bed per month">{perBedMonthly}</V>}>
                <T k="bc.overview.perBed" d="Total Cost per Bed, Per Month" />
              </Stat>
              <Stat ck="bc.overview.term" value={<>{term} months</>}>
                <T k="bc.overview.term" d="Post-Pilot Term Length" />
              </Stat>
            </div>
            </>
            )}
            </div>
            </B>
            <B id="costs" label="Costs">
            {(() => {
              const ins = installColumns(lines);
              const sen = sensorColumns(lines);
              const range = (a: number, b: number) => (a === b ? money(a) : `${money(a)}–${money(b)}`);
              // Conversion credits: per unit, in red, with how many pilot units they cover; a dash when no pilot site gets one.
              const credit = (r: typeof ins, what: string) =>
                r.creditUnits > 0 ? (
                  <td className="bc-neg">
                    {`−${range(r.creditMin, r.creditMax)}`}
                    <small>{`on ${count(r.creditUnits)} pilot ${what}`}</small>
                  </td>
                ) : (
                  <td>–</td>
                );
              return (
                <>
                  <div className="bc-card bc-tbl bc-hrs bc-inv">
                    <RTable>
                      <RTbody id="opinv" name="The investment">
                        <tr className="bc-inv-scope">
                          <td className="bc-m"><T k="bc.scope.scope" d="Scope" /></td>
                          <td colSpan={4}><ScopePills ecall={anyEcall} monitoring={anyMonitoring} rates={{ monitoring: money(draft.commercial.platformRate), ecall: money(draft.commercial.ecallRate) }} /></td>
                        </tr>
                        <tr className="bc-inv-head" data-fixed>
                          <th><T k="bc.inv.item" d="Item" /></th>
                          <th><T k="bc.inv.unitPrice" d="Unit price" /></th>
                          <th><T k="bc.inv.quantity" d="Quantity" /></th>
                          <th><T k="bc.inv.convCredits" d="Conv. credits" /></th>
                          <th className="bc-hl"><T k="bc.inv.total" d="Total" /></th>
                        </tr>
                        <tr>
                          <td className="bc-m"><T k="bc.scope.install" d="Installation" /><small><T k="bc.inv.oneTime" d="One-time" /></small></td>
                          <td>{range(ins.minPer, ins.maxPer)} per room, one-time</td>
                          <td>{count(ins.units)}</td>
                          {credit(ins, 'beds')}
                          <td className="bc-hl bc-big"><V k="scope.install.value" label="Installation amount">{usd(ins.total)}</V></td>
                        </tr>
                        <tr>
                          <td className="bc-m"><T k="bc.sensors" d="Additional Sensors" /><small><T k="bc.inv.oneTime" d="One-time" /></small></td>
                          <td>{sen.units ? range(sen.minPer, sen.maxPer) : money(draft.commercial.sensorPrice)} per sensor, one-time</td>
                          <td>{count(sen.units)}</td>
                          {credit(sen, 'sensors')}
                          <td className="bc-hl bc-big"><V k="scope.sensors.value" label="Additional sensors amount">{usd(sen.total)}</V></td>
                        </tr>
                        <tr>
                          <td className="bc-m">
                            <T k="bc.scope.subscription" d="Monthly Cost" />
                            <small><T k="bc.inv.monthlySub" d={anyPilot ? 'After the {pilot}-month pilot' : 'Billed monthly'} v={{ pilot: String(inputs.schedule.pilotLengthMonths) }} /></small>
                          </td>
                          <td>{perBedMonthly} per room, per month</td>
                          <td>{count(term)} Months</td>
                          <td>–</td>
                          <td className="bc-hl bc-big"><V k="scope.serviceMonthly.value" label="Monthly once in service amount">{usd(d.serviceMonthly)} / mo</V></td>
                        </tr>
                        <tr className="bc-tot">
                          <td className="bc-m">
                            <T k="bc.scope.year1" d="Total Year 1 Investment" />
                            <small><T k="bc.scope.year1Note" d="{oneTime} one-time + {monthly} in monthly fees over the first 12 months." v={{ oneTime: usd(y1OneTime), monthly: usd(y1Monthly) }} /></small>
                          </td>
                          <td />
                          <td />
                          <td />
                          <td className="bc-hl bc-big"><V k="card.investment.value" label="Total Investment — Year 1 figure">{usd(kp.totalInvestment12)}</V></td>
                        </tr>
                        {finish.concealed && (
                          <tr>
                            <td className="bc-m"><T k="bc.finish" d="Concealed finish" /><small><T k="bc.inv.finish.sub" d="Optional · after the {credit} standard credit. Pending site survey." v={{ credit: usd(finish.credit) }} /></small></td>
                            <td>{rangeText(finish.netLow, finish.netHigh, usd)} per room, one-time</td>
                            <td>{count(finish.rooms)}</td>
                            <td>–</td>
                            <td className="bc-hl bc-big"><V k="finish.total.value" label="Concealed installation total"><span className="bc-range">{finish.totalLow === finish.totalHigh ? usd(finish.totalLow) : `${usd(finish.totalLow)}–${usd(finish.totalHigh)}`}</span></V></td>
                          </tr>
                        )}
                      </RTbody>
                    </RTable>
                  </div>
                  {(ins.creditUnits > 0 || sen.creditUnits > 0) && (
                    <p className="bc-note bc-conv-note">
                      <T k="bc.inv.convNote" d="Conversion Credits - If a community converts after the pilot, any additional sensor and installation credits applied during the pilot will be applied to the cost upon conversion." />
                    </p>
                  )}
                </>
              );
            })()}
            </B>
            <B id="communities" label="Communities" onAdd={addCommunity?.(false)} addLabel="Add a community">
              {communityTable(
                (i) => ({ main: `${usd(d.perCommunity[i].monthly)} / mo`, sub: `(${usd(d.perCommunity[i].oneTime)} one-time)` }),
                { main: `${usd(d.serviceMonthly)} / mo`, sub: `(${usd(d.oneTime)} one-time)` },
              )}
            </B>
          </Blocks>
        )}
      </Page>
    );
  }

  // The asset value / fall risk callout under the returns table (single and Both pages), with its screen-only switches.
  const roiCallout = () => (
        <div className="relative group/view">
          {editable && (
            // Screen only: asset value (default) or fall risk; saved with the proposal.
            <div className="no-print absolute right-3 top-3 z-[5] flex gap-1.5">
              <ViewSwitch
                field="bcRoiCallout"
                position="relative"
                label="Callout"
                options={[['asset', 'Asset Value'], ['fall', 'Fall Risk']] as const}
                value={layout.bcRoiCallout ?? 'asset'}
                onChange={(v) => setLayout((l) => ({ ...l, bcRoiCallout: v === 'fall' ? 'fall' : undefined }))}
              />
              <ViewSwitch
                field="bcRoiQuote"
                position="relative"
                label="Quote"
                options={[['off', 'No quote'], ['on', 'Quote']] as const}
                value={layout.bcRoiQuote ? 'on' : 'off'}
                onChange={(v) => setLayout((l) => ({ ...l, bcRoiQuote: v === 'on' ? true : undefined }))}
              />
            </div>
          )}
          {layout.bcRoiCallout === 'fall' ? (
            <div className="bc-fall">
              <div className="bc-fall-head">
                <span className="bc-chip"><T k="bc.roi.fall.chip" d="Decreased fall risk exposure" /></span>
                <p><T k="bc.roi.fall.lead" d="Falls are 41.0% of closed professional liability claims in aging services, the largest single category. Sagora Senior Living has seen:" /></p>
              </div>
              <div className="bc-fall-three">
                <div>
                  <b><T k="bc.roi.fall.v1" d="72.5%" /></b>
                  <span><T k="bc.roi.fall.l1" d="lower fall rate" /></span>
                </div>
                <div>
                  <b><T k="bc.roi.fall.v2" d="94%" /></b>
                  <span><T k="bc.roi.fall.l2" d="faster response to a fall" /></span>
                </div>
                <div>
                  <b><T k="bc.roi.fall.v3" d="88%" /></b>
                  <span><T k="bc.roi.fall.l3" d="less time on the floor" /></span>
                </div>
              </div>
              {layout.bcRoiQuote && (
                <div className="bc-quote">
                  <span className="bc-quote-mark" aria-hidden="true">“</span>
                  <div>
                    <p><T k="bc.roi.quote.text" d="We’re seeing real quality-of-life changes. It’s not just fall prevention. These tools give us the ability to help residents live longer and stay in the community longer, and they actually make our jobs easier once you start using them." /></p>
                    <div className="bc-quote-who">
                      <span className="bc-quote-av"><T k="bc.roi.quote.initials" d="MC" /></span>
                      <span>
                        <b><T k="bc.roi.quote.name" d="Michelle Cortez" /></b>
                        <small><T k="bc.roi.quote.title" d="Resident Services Director, Bristol Park at Cleburne" /></small>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={`bc-callout ${layout.bcRoiQuote ? 'bc-callout-q' : ''}`}>
              <div className="bc-callout-row">
              <b><CallOut k="roi.outcome.valuation.value"><V k="roi.outcome.valuation.value" label="Asset Value Impact figure">{usd(sel.valuationImpact, { compact: true })}</V></CallOut></b>
                <div>
                  <span className="bc-chip"><T k="bc.roi.chip" d="Asset value · {capRate} cap" v={vars} /></span>
                  <p><T k="bc.roi.callout" d="of asset value from {noi} a year of added net operating income, capitalized once at a {capRate} cap rate: the figure an owner or REIT partner sees on the community’s valuation." v={{ ...vars, noi: usd(sel.annualNetNoiImpact, { compact: true }) }} /></p>
                </div>
              </div>
              {layout.bcRoiQuote && (
                <div className="bc-quote">
                  <span className="bc-quote-mark" aria-hidden="true">“</span>
                  <div>
                    <p><T k="bc.roi.quote.text" d="We’re seeing real quality-of-life changes. It’s not just fall prevention. These tools give us the ability to help residents live longer and stay in the community longer, and they actually make our jobs easier once you start using them." /></p>
                    <div className="bc-quote-who">
                      <span className="bc-quote-av"><T k="bc.roi.quote.initials" d="MC" /></span>
                      <span>
                        <b><T k="bc.roi.quote.name" d="Michelle Cortez" /></b>
                        <small><T k="bc.roi.quote.title" d="Resident Services Director, Bristol Park at Cleburne" /></small>
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
  );

  // ---------- The return ----------
  {
    defs.roi = (no) => (
      <Page key="roi" no={no} crumb={<T k="bc.roi.crumb" d="What the program returns" />}>
        <p className="bc-eyebrow"><T k="bc.roi.eyebrow" d="What the program returns" /></p>
        <h1 className="bc-h1"><T k="bc.roi.title" d="Projected Return on Teton Investment" /></h1>
        <p className="bc-lede">
          <T k="bc.roi.lede" d="The sources of value, modeled for {customer}, based on real outcomes from existing Teton customers" v={vars} />
        </p>
        <Blocks page="roi">
        <B id="table" label="Sources of value">
        <div className="bc-card bc-tbl bc-roi-tbl">
          <RTable>
            <thead>
              <tr>
                <th>Source of value</th>
                <th>What it means each year</th>
                <th>Share of the benefit</th>
                <th className="bc-hl bc-r">Annual benefit</th>
              </tr>
            </thead>
            <RTbody id="roi" name="Sources of value">
              {benefitRows.map((b) => (
                <tr key={b.key}>
                  <td className="bc-m"><T k={`bc.${b.key}.label`} d={b.label} /></td>
                  <td>
                    <T k={`bc.${b.key}.means`} d={b.means} v={b.v} />
                    {b.sub && <small><T k={`bc.${b.key}.sub`} d={b.sub} /></small>}
                  </td>
                  <td>
                    {pctOf(b.value, sel.annualRoi)}
                    <div className="bc-bar"><i style={{ width: pctOf(Math.max(0, b.value), sel.annualRoi) }} /></div>
                  </td>
                  <td className="bc-hl bc-big bc-r"><V k={`${b.key}.value`} label={`${b.label} amount`}>{usd(b.value)}</V></td>
                </tr>
              ))}
              <tr className="bc-tot">
                <td className="bc-m"><T k="bc.roi.gross" d="Gross Annual Benefit" /></td>
                <td />
                <td>100%</td>
                <td className="bc-hl bc-big bc-r"><V k="roi.total.value" label="Total annual benefit amount">{usd(sel.annualRoi)}</V></td>
              </tr>
              <tr>
                <td className="bc-m"><T k="bc.roi.cost" d="Cost of Teton" /></td>
                <td>
                  <T
                    k={capexShown ? 'bc.roi.costNote.capex' : 'bc.roi.costNote.opex'}
                    d={capexShown ? '{years}-year cost of ownership ÷ {years} years' : 'Annual subscription once every community is live'}
                    v={{ years: String(capex.ownershipMonths / 12) }}
                  />
                </td>
                <td />
                <td className="bc-hl bc-big bc-r"><V k="bc.roi.cost.value" label="Annual cost of Teton">−{usd(tetonAnnual)}</V></td>
              </tr>
              <tr className="bc-tot">
                <td className="bc-m"><T k="bc.roi.net" d="Net Annual Benefit" /></td>
                <td />
                <td />
                <td className="bc-hl bc-big bc-r"><V k="bc.roi.net.value" label="Net annual benefit">{usd(stabilizedNet)}</V></td>
              </tr>
            </RTbody>
          </RTable>
        </div>
        </B>
        <B id="callout" label="Asset value / Fall risk">
        {roiCallout()}
        </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- Year 1 and cash flow ----------
  {
    const basis = capexShown ? (
      <p className="bc-note"><T k="bc.y1.basis3" d="Year 1 figures and the cash flow use the equipment purchase: equipment paid at install, then software & services monthly after the pilot." /></p>
    ) : null;
    // The Year 1 table; the cash flow page shows it without the Net Benefit row.
    const y1Table = (withNet: boolean) => (
        <div className={`bc-card bc-tbl ${withNet ? '' : 'bc-tbl-tight'}`} style={{ marginTop: withNet ? 16 : 12 }}>
          <RTable>
            <thead>
              <tr>
                <th>Measure</th>
                <th>What it means</th>
                <th className="bc-hl bc-r">{withNet ? <T k="bc.y1.col" d="Year 1" /> : <T k="bc.cf.col" d="Totals" />}</th>
              </tr>
            </thead>
            <RTbody id={`y1${withNet ? 'n' : ''}`} name="Cash flow totals">
              <tr>
                <td className="bc-m"><T k="bc.y1.investment" d="Total investment" /></td>
                <td>
                  {capexCf ? (
                    <T k="bc.y1.investment.note.capex" d="The one-time equipment purchase, paid at install. Software & services ({software} a month) are counted in the net benefit." v={{ software: usd(capex.softwareMonthly) }} />
                  ) : (
                    <T k="card.investment.note" d="Everything paid to Teton in the first 12 months: installation plus monthly subscription." />
                  )}
                </td>
                <td className="bc-hl bc-big bc-r"><V k={y1.key('investment.value')} label="Total Investment — Year 1 figure">{withNet ? usd(y1.investment) : <span className="bc-cost">{y1.investment > 0 ? '−' : ''}{usd(y1.investment)}</span>}</V></td>
              </tr>
              {withNet && (
              <tr>
                <td className="bc-m"><T k="bc.y1.netRow" d="Net Benefit (Year 1)" /></td>
                <td><T k="card.net.note" d="How much better off your communities are in year one after paying for everything." /></td>
                <td className="bc-hl bc-big bc-r"><V k={y1.key('net.value')} label="Net Benefit — Year 1 figure">{usd(y1.net)}</V></td>
              </tr>
              )}
              <tr>
                <td className="bc-m"><T k="bc.y1.runRate" d="Stabilized Net Benefit" /></td>
                <td>{capexShown ? <T k="bc.y1.runRateNote.capex" d="The yearly value once every community is live and fully ramped, after the annual cost of Teton (four-year cost of ownership ÷ 4)." /> : <T k="card.runRate.note" d="The yearly value once every community is live and fully ramped, after subscription fees." />}</td>
                <td className="bc-hl bc-big bc-r"><V k="card.runRate.value" label="Run-Rate Annual Net Benefit figure">{usd(stabilizedNet)}</V></td>
              </tr>
              <tr>
                <td className="bc-m"><T k="bc.y1.perUnit" d="REVPOR Impact" /></td>
                <td>
                  <T k="bc.y1.perUnitNote" d="Impact on Revenue Per Occupied Room" />
                  <small>{usd(d.perUnit.perUnitMonth)} per unit across all {count(inputs.cfo.portfolioUnits)} units</small>
                </td>
                <td className="bc-hl bc-big bc-r"><V k={y1.key('perUnit.value')} label="Net Benefit per Unit per Month figure">{usd(d.perUnit.perOccupiedUnitMonth)}</V></td>
              </tr>
            </RTbody>
          </RTable>
        </div>
    );
    defs.summary = (no) => (
      <Page key="summary" no={no} crumb={<T k="bc.y1.crumb" d="Year 1 financial summary" />}>
        <p className="bc-eyebrow"><T k="bc.y1.eyebrow" d="Year 1 financial summary" /></p>
        <h1 className="bc-h1"><T k="bc.y1.title" d="Teton - Year 1" /></h1>
        <p className="bc-lede"><T k="bc.y1.lede" d="The first twelve months at {site}: what goes in, what comes back, and how quickly it pays for itself, discounted at {customer}’s {costOfMoney} cost of money." v={vars} /></p>
        <Blocks page="summary">
        <B id="stats" label="Key figures">
        <div className="bc-three">
          <Stat value={<V k={y1.key('net.value')} label="Net Benefit — Year 1 figure">{usd(y1.net)}</V>}>
            <T k="bc.y1.net" d="net benefit in year one, after everything paid to Teton" />
          </Stat>
          <Stat value={<V k={y1.key('gross.value')} label="Gross Return per $1 Invested (Year 1) figure">{multiple(y1.gross)}</V>}>
            <T k="bc.y1.gross" d="gross return per $1 invested in year one; {stabilized} once fully ramped" v={{ stabilized: multiple(stabilizedReturn, 1) }} />
          </Stat>
          <Stat value={<V k={y1.key('payback.value')} label="Discounted Payback figure">{y1.payback ? `Month ${y1.payback}` : `> ${y1.horizon} mo`}</V>}>
            <T k="bc.y1.payback" d="discounted payback: when the program has paid for itself and stays paid for" />
          </Stat>
        </div>
        </B>
        <B id="table" label="Year 1 table">
        {y1Table(true)}
        </B>
        <B id="callout" label="Run-rate callout">
        {y1.investment > 0 && (
          <div className="bc-callout">
            <b><CallOut k="card.runRate.value"><V k="card.runRate.value" label="Run-Rate Annual Net Benefit figure">{usd(stabilizedNet)}</V></CallOut></b>
            <div>
              <span className="bc-chip"><T k="bc.y1.chip" d="Every year at run rate" /></span>
              <p><T k="bc.y1.callout" d="Once {site} is fully ramped, the program returns this much a year after Teton’s fees: about {ratio} times the first year’s total investment." v={{ ...vars, ratio: (stabilizedNet / y1.investment).toFixed(1) }} /></p>
            </div>
          </div>
        )}
        </B>
        {basis && <B id="note" label="Pricing note">{basis}</B>}
        </Blocks>
      </Page>
    );
    defs.cashflow = (no) => (
      <Page key="cashflow" no={no} crumb={<T k="bc.cf.crumb" d="Cash flow summary" />}>
        <p className="bc-eyebrow"><T k="bc.cf.eyebrow" d="Cash flow summary" /></p>
        <h1 className="bc-h1">
          <T k="bc.cf.title" d="Teton Cost / Benefit Summary" />
        </h1>
        <p className="bc-lede"><T k="bc.cf.lede" d="Net discounted benefit after Teton fees." /></p>
        <Blocks page="cashflow">
        <B id="payback" label="Discounted payback">
          <div className="bc-two bc-stat-inline bc-three-compact bc-cf-cards">
            <Stat value={<V k={y1.key('payback.value')} label="Discounted Payback figure">{y1.payback ? `Month ${y1.payback}` : `> ${y1.horizon} mo`}</V>}>
              <T k="bc.cf.payback" d="discounted payback: paid for itself and stays paid for" />
            </Stat>
            <Stat value={<V k={capexShown ? 'bc.capex.returnOnCost.value' : 'bc.cf.returnOnCost.value'} label="Stabilized return on cost figure">{multiple(stabilizedReturn, 1)}</V>}>
              <T k="bc.cf.returnOnCost" d="stabilized return on cost: yearly gross benefit per $1 of {cost}" v={{ cost: capexShown ? 'annual cost of ownership' : 'subscription fees' }} />
            </Stat>
          </div>
        </B>
        <B id="table" label="Year 1 table">{y1Table(false)}</B>
        <B id="chart" label="Chart">
        <div className="bc-card bc-chart relative group/view">
          {editable && (
            // Screen only: pick the chart style; saved with the proposal.
            <ViewSwitch
                field="bcChart"
              label="Chart style"
              options={[['bar', 'Standard Bar'], ['stacked', 'Stacked Bar']] as const}
              value={layout.bcChart ?? 'bar'}
              onChange={(v) => setLayout((l) => ({ ...l, bcChart: v === 'stacked' ? 'stacked' : undefined }))}
            />
          )}
          <QuarterlyWaterfall
            cumulative
            stacked={layout.bcChart === 'stacked'}
            discountedNet={net}
            startDate={inputs.schedule.startDate}
            paybackMonth={y1.payback}
            pilotEndMonth={d.pilotEndMonth}
            labels={
              layout.bcChart === 'stacked'
                ? { gain: <T k="bc.cf.leg.gainToDate.stacked" d="Net Gain to Date" />, gainQ: <T k="bc.cf.leg.gainQ" d="90-day Net Gain" />, cost: <T k="bc.cf.leg.costToDate.stacked" d="Net Cost to Date" />, costQ: <T k="bc.cf.leg.costQ" d="90-Day Net Cost" /> }
                : { gain: <T k="bc.cf.leg.gainToDate" d="Net Gain to date" />, cost: <T k="bc.cf.leg.costToDate" d="Net Cost to date" /> }
            }
          />
        </div>
        </B>
        <B id="total" label="Total value callout">
          <div className="bc-callout bc-cf-total">
            <b><CallOut k="bc.cf.total.callout"><V k="bc.cf.total.value" label="Total value added over the term">{usd(sum(net), { compact: true })}</V></CallOut></b>
            <div>
              <span className="bc-chip"><T k="bc.cf.total.chip" d="Total Value Added Over Term" /></span>
              <p>
                <T
                  k={capexShown ? 'bc.cf.total.text.capex' : 'bc.cf.total.text.opex'}
                  d={capexShown ? 'Discounted Cumulative Net Benefit over the pilot and the {years} year useful life' : 'Discounted Cumulative Net Benefit over the pilot and the {months} month term'}
                  v={{ years: numberWord(capex.ownershipMonths / 12), months: String(term) }}
                />
              </p>
            </div>
          </div>
        </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- Implementation ----------
  // Several pilot go-lives ("waves"): the same plan at each, shifted to its go-live. One pilot keeps the single-plan views.
  const waves = pilots.length > 1 ? pilots : [];
  const shortDate = (iso: string) => longDate(iso).replace(/, \d{4}$/, '');
  const waveName = (w: (typeof pilots)[number]) => w.names.join(' · ');
  const WaveNo = ({ n }: { n: number }) => <span className="bc-wave-no">{n}</span>;
  const stageIn = (w: (typeof pilots)[number], id: string) => w.schedule.stages.find((x) => x.id === id && x.weeks > 0);
  const timingText = (st: (typeof stages)[number]) => `${st.weeks} ${st.weeks === 1 ? 'week' : 'weeks'} · ${weekLabel(st, true)}`;
  /** A stage card for several waves; with `dates`, a line per wave (Evaluation & Contracting: one line, a single agreement). */
  const waveCard = (st: (typeof stages)[number], i: number, dates: boolean | 'chips') => (
    <div key={st.id} className="bc-card bc-num bc-wave-card">
      <span className="bc-n">{String(i + 1).padStart(2, '0')}</span>
      <div>
        <h3>{st.name}</h3>
        <p className="bc-when">
          <V k={`impl.${st.id}.weeks`} label={`${st.name} timing`}>{timingText(st)}</V>
        </p>
        {st.description && <p><T k={`impl.${st.id}.note`} d={st.description} /></p>}
        {dates === 'chips' && (
          // Gantt view: the key under the chart names the waves, so each wave's dates are a numbered chip.
          <p className="bc-wave-chips">
            {st.standard === 'evaluation' ? (
              <span><T k="bc.impl.waves.allShort" d="All communities" />: {shortDate(st.start)} – {shortDate(st.end)}</span>
            ) : (
              waves.map((w, k) => {
                const ws = stageIn(w, st.id);
                return ws ? (
                  <span key={w.goLive}>
                    <WaveNo n={k + 1} />
                    {shortDate(ws.start)} – {shortDate(ws.end)}
                  </span>
                ) : null;
              })
            )}
          </p>
        )}
        {dates === true && (
          <RTable className="bc-wave-tbl">
            <RTbody id="waves" name="Go-live waves">
              {st.standard === 'evaluation' ? (
                <tr>
                  <td><T k="bc.impl.waves.allComm" d="All communities (one agreement)" /></td>
                  <td>{shortDate(st.start)} – {shortDate(st.end)}</td>
                </tr>
              ) : (
                waves.map((w, k) => {
                  const ws = stageIn(w, st.id);
                  return ws ? (
                    <tr key={w.goLive}>
                      <td><WaveNo n={k + 1} />{waveName(w)}</td>
                      <td>{shortDate(ws.start)} – {shortDate(ws.end)}</td>
                    </tr>
                  ) : null;
                })
              )}
            </RTbody>
          </RTable>
        )}
      </div>
    </div>
  );
  const kickoffOf = (w: (typeof pilots)[number]) => w.schedule.stages.find((x) => x.weeks > 0 && x.fromWeek <= 1 && x.toWeek >= 1) ?? null;
  const baselineOf = (w: (typeof pilots)[number]) => w.schedule.stages.find((x) => x.standard === 'baseline' && x.weeks > 0) ?? null;
  const waveSchedule = (
    <div className="bc-card bc-tbl bc-wave-sched">
      <RTable>
        <thead>
          <tr>
            <th><T k="bc.impl.waves.colWave" d="Wave" /></th>
            <th><T k="bc.impl.waves.colComm" d="Communities" /></th>
            <th><T k="bc.impl.waves.colKick" d="Kick-off" /></th>
            {waves.some(baselineOf) && <th><T k="bc.impl.waves.colBase" d="Baseline starts" /></th>}
            <th><T k="bc.impl.waves.colGo" d="Go-live" /></th>
          </tr>
        </thead>
        <RTbody id="wavesched" name="Go-live schedule">
          {waves.map((w, k) => {
            const ko = kickoffOf(w);
            const bl = baselineOf(w);
            return (
              <tr key={w.goLive}>
                <td className="bc-m"><WaveNo n={k + 1} />{waveName(w)}</td>
                <td>{w.names.length === 1 ? '1 community' : `${w.names.length} communities`}</td>
                <td>{ko ? shortDate(ko.start) : '–'}</td>
                {waves.some(baselineOf) && <td>{bl ? shortDate(bl.start) : '–'}</td>}
                <td className="bc-wave-go">{longDate(w.goLive)}</td>
              </tr>
            );
          })}
        </RTbody>
      </RTable>
    </div>
  );
  const waveKey = (
    <p className="bc-wave-key">
      {waves.map((w, k) => (
        <span key={w.goLive}>
          <WaveNo n={k + 1} />
          {waveName(w)} goes live {shortDate(w.goLive)}
          {k < waves.length - 1 ? ' · ' : '. '}
        </span>
      ))}
      <T k="bc.impl.waves.key" d="Every community follows this plan, counted back from its own go-live." />
    </p>
  );
  if (stages.length) {
    defs.implementation = (no) => (
      <Page key="implementation" no={no} crumb={<T k="bc.impl.crumb" d="Implementation · {site}" v={vars} />}>
        <p className="bc-eyebrow"><T k="bc.impl.eyebrow" d="Implementation" /></p>
        {waves.length ? (
          <>
            <h1 className="bc-h1"><T k="bc.impl.title.waves" d="Live in {n} waves, {first} to {last}." v={{ n: numberWord(waves.length), first: shortDate(waves[0].goLive), last: longDate(waves[waves.length - 1].goLive) }} /></h1>
            <p className="bc-lede"><T k="bc.impl.lede.waves" d="The same path at every pilot community, counted back from each one’s go-live. Teton’s implementation and customer success team leads each stage." /></p>
          </>
        ) : (
          <>
            <h1 className="bc-h1"><T k="bc.impl.title" d="Live at {site} on {goLive}." v={{ ...vars, goLive: goLive ?? '' }} /></h1>
            <p className="bc-lede"><T k="bc.impl.lede" d="A preliminary path from a signed order form to go-live. Teton’s implementation and customer success team leads each stage." /></p>
          </>
        )}
        <Blocks page="implementation">
        <B id="stages" label="Stages">
        <div className="relative group/view">
          {editable && (
            // Screen only: cards (default) or a Gantt chart; with several waves, the cards can also put the dates in one table.
            <div className="no-print absolute right-3 top-3 z-[5] flex gap-1.5">
              {waves.length > 0 && layout.bcImpl !== 'gantt' && (
                <ViewSwitch
                field="bcImplWaves"
                  position="relative"
                  label="Wave dates"
                  options={[['dates', 'Dates in cards'], ['schedule', 'Schedule table']] as const}
                  value={layout.bcImplWaves ?? 'dates'}
                  onChange={(v) => setLayout((l) => ({ ...l, bcImplWaves: v === 'schedule' ? 'schedule' : undefined }))}
                />
              )}
              <ViewSwitch
                field="bcImpl"
                position="relative"
                label="Stages view"
                options={[['cards', 'Cards'], ['gantt', 'Gantt']] as const}
                value={layout.bcImpl ?? 'cards'}
                onChange={(v) => setLayout((l) => ({ ...l, bcImpl: v === 'gantt' ? 'gantt' : undefined }))}
              />
            </div>
          )}
          {waves.length > 0 ? (
            layout.bcImpl === 'gantt' ? (
              <>
                <div className="bc-card bc-gantt-card bc-wk-card">
                  <ImplementationWeeks
                    stages={stages}
                    order={draft.implementationPlan.order}
                    timing={(st) => <V k={`impl.${st.id}.weeks`} label={`${st.name} timing`}>{timingText(st)}</V>}
                  />
                </div>
                {waveKey}
                <p className="bc-eyebrow bc-gray"><T k="bc.impl.waves.cardsHead" d="The stages, with each wave’s dates" /></p>
                <div className="bc-grid2 bc-wave-grid">{stages.map((st, i) => waveCard(st, i, 'chips'))}</div>
              </>
            ) : layout.bcImplWaves === 'schedule' ? (
              <>
                {waveSchedule}
                <p className="bc-eyebrow bc-gray"><T k="bc.impl.waves.sameHead" d="The stages, the same at every community" /></p>
                <div className="bc-grid2 bc-wave-grid">{stages.map((st, i) => waveCard(st, i, false))}</div>
              </>
            ) : (
              <div className="bc-grid2 bc-wave-grid bc-wave-grid-top">{stages.map((st, i) => waveCard(st, i, true))}</div>
            )
          ) : layout.bcImpl === 'gantt' ? (
            <>
              <div className="bc-card bc-gantt-card">
                <ImplementationTimeline
                  stages={stages}
                  order={draft.implementationPlan.order}
                  goLive={pilots[0]?.goLive ?? null}
                  timing={(st) => (
                    <V k={`impl.${st.id}.weeks`} label={`${st.name} timing`}>
                      {st.weeks} {st.weeks === 1 ? 'week' : 'weeks'} · {weekLabel(st, true)}
                    </V>
                  )}
                />
              </div>
              <p className="bc-eyebrow bc-gray"><T k="bc.impl.descHead" d="What happens in each stage" /></p>
              <div className="bc-desc">
                {stages.map((st, i) =>
                  st.description ? (
                    <div key={st.id}>
                      <span className="bc-n">{String(i + 1).padStart(2, '0')}</span>
                      <span>
                        <b>{st.name}.</b> <T k={`impl.${st.id}.note`} d={st.description} />
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
            </>
          ) : (
        <div className="bc-grid2">
            {stages.map((st, i) => (
              <div key={st.id} className="bc-card bc-num">
                <span className="bc-n">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{st.name}</h3>
                  <p className="bc-when">
                    <V k={`impl.${st.id}.weeks`} label={`${st.name} timing`}>
                      {st.weeks} {st.weeks === 1 ? 'week' : 'weeks'} · {weekLabel(st, true)} · {longDate(st.start).replace(/, \d{4}$/, '')} – {longDate(st.end).replace(/, \d{4}$/, '')}
                    </V>
                  </p>
                  {st.description && <p><T k={`impl.${st.id}.note`} d={st.description} /></p>}
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
        </B>
        {waves.length === 0 && (
        <B id="band" label="Where the pilot sits">
        <p className="bc-eyebrow bc-gray"><T k="bc.impl.band" d="Where the pilot sits in the project" /></p>
        <div className="bc-phase">
          <div>
            <span className="bc-k"><T k="bc.impl.p1k" d="Pre-Kick Off" /></span>
            <h4><T k="bc.impl.p1" d="Order form signed" /></h4>
            <p><T k="bc.impl.p1note" d="Dates assume the order form is signed by {date}." v={{ date: contractEnd ? longDate(contractEnd.end) : 'the end of contracting' }} /></p>
          </div>
          <div>
            <span className="bc-k">{goLive}</span>
            <h4><T k="bc.impl.p2" d={anyPilot ? 'Go-live and pilot' : 'Go-live'} /></h4>
            <p>
              <T k="bc.impl.p2note" d={anyPilot ? 'A {pilot}-month pilot before the service term.' : 'Teton is live in every bed from day one.'} v={{ pilot: String(inputs.schedule.pilotLengthMonths) }} />
            </p>
          </div>
          <div>
            <span className="bc-k"><T k="bc.impl.p3k" d={anyPilot ? 'After the pilot' : 'After go-live'} /></span>
            <h4><T k="bc.impl.p3" d="{term}-month service term" v={{ term: String(term) }} /></h4>
            <p><T k="bc.impl.p3note" d="Results are measured against the baseline collected before go-live." /></p>
          </div>
        </div>
        </B>
        )}
        </Blocks>
      </Page>
    );
  }

  // ---------- The customer's team ----------
  if (hasResources) {
    defs.resources = (no) => (
      <Page key="resources" no={no} crumb={<T k="bc.team.crumb" d="Your team" />}>
        <p className="bc-eyebrow"><T k="bc.team.eyebrow" d="Estimated resource allocation" /></p>
        <h1 className="bc-h1"><T k="bc.team.title" d="{hours} hours from {customer}’s team." v={{ ...vars, hours: count(team.total) }} /></h1>
        <p className="bc-lede"><T k="resources.intro" d="Estimated hours from your team by stage. Teton’s implementation and customer success team leads each stage." /></p>
        <div className="bc-card bc-tbl bc-hrs">
          <RTable>
            <thead>
              <tr>
                <th>Role</th>
                {team.stages.map((s) => (
                  <th key={s.id}>
                    <span className="bc-dot" style={{ background: stageColor(s.id, draft.implementationPlan.order) }} />
                    {s.name}
                  </th>
                ))}
                <th className="bc-hl">Total</th>
              </tr>
            </thead>
            <RTbody id="res" name="Resource allocation">
              {team.rows.map((r) => (
                <tr key={r.id}>
                  <td className="bc-m">
                    {r.role}
                    {!layout.hiddenValues.includes('roleNotes') && !bcPagesOf(layout).includes('roledesc') && r.notes.some((n) => n.note) && (
                      <small className="bc-clamp">{r.notes.filter((n) => n.note).map((n) => `${n.stage}: ${n.note}`).join(' · ')}</small>
                    )}
                  </td>
                  {team.stages.map((s) => (
                    <td key={s.id}>{s.id in r.hours ? count(r.hours[s.id]) : '–'}</td>
                  ))}
                  <td className="bc-hl bc-big">{count(r.total)}</td>
                </tr>
              ))}
              <tr className="bc-tot">
                <td className="bc-m">Total hours</td>
                {team.stages.map((s) => (
                  <td key={s.id}>{count(team.stageTotals[s.id])}</td>
                ))}
                <td className="bc-hl bc-big">{count(team.total)}</td>
              </tr>
            </RTbody>
          </RTable>
        </div>
      </Page>
    );
  }

  // ---------- Contents: built from the pages shown, read back from the document ----------
  defs.contents = (no) => (
    <Page key="contents" no={no} crumb={<T k="bc.toc.crumb" d="Contents" />}>
      <p className="bc-eyebrow"><T k="bc.toc.eyebrow" d="Contents" /></p>
      <h1 className="bc-h1"><T k="bc.toc.title" d="Proposal Contents" /></h1>
      <ContentsList />
    </Page>
  );

  // ---------- What each role does, by stage (may run over several sheets) ----------
  {
    const stageIds = new Map(team.stages.map((st) => [st.name, st.id]));
    const items = team.stages.flatMap((st) =>
      team.rows.flatMap((r) => r.notes.filter((n) => n.stage === st.name).map((n) => ({ stageId: stageIds.get(n.stage) ?? st.id, stage: n.stage, role: r.role, hours: n.hours, note: n.note }))),
    );
    if (items.some((x) => x.note.trim())) {
      // Height budgets per sheet: the first holds the page heading; later sheets only the eyebrow.
      const hrs = (h: number) => `${count(h)} ${h === 1 ? 'hr' : 'hrs'}`;
      const chunks = paginate(items, (x) => textRowHeight(x.note, 42, 19, 28, 2), 640, 800);
      spans.roledesc = chunks.length;
      const order = draft.implementationPlan.order;
      defs.roledesc = (no) => (
        <>
          {chunks.map((chunk, ci) => (
            <Page key={`roledesc-${ci}`} no={no + ci} crumb={<T k="bc.roles.crumb" d="Your team · by stage" />}>
              <p className="bc-eyebrow"><T k="bc.roles.eyebrow" d="Estimated resource allocation – Descriptions" /></p>
              {ci === 0 && (
                <>
                  <h1 className="bc-h1"><T k="bc.roles.title" d="What your team does in each stage." /></h1>
                  <p className="bc-lede"><T k="bc.roles.lede" d="The hours from {customer}’s team, with what each role does in each stage. Teton’s implementation and customer success team leads every stage." v={vars} /></p>
                </>
              )}
              <div className="bc-card bc-tbl bc-roles-tbl" style={ci === 0 ? undefined : { marginTop: 8 }}>
                <RTable>
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Role</th>
                      <th>What they do</th>
                      <th className="bc-hl bc-r">Hours</th>
                    </tr>
                  </thead>
                  <RTbody id={`roles${ci}`} name="Role descriptions">
                    {chunk.map((x, k) => {
                      const firstOfStage = k === 0 || chunk[k - 1].stageId !== x.stageId;
                      const span = chunk.slice(k).findIndex((y) => y.stageId !== x.stageId);
                      const continued = k === 0 && ci > 0 && chunks[ci - 1][chunks[ci - 1].length - 1].stageId === x.stageId;
                      return (
                        <tr key={`${x.stageId}-${x.role}`}>
                          {firstOfStage && (
                            <td className="bc-m bc-roles-stage" rowSpan={span < 0 ? chunk.length - k : span}>
                              <span className="bc-dot" style={{ background: stageColor(x.stageId, order) }} />
                              {x.stage}
                              <small>{continued ? 'continued' : hrs(team.stageTotals[x.stageId] ?? 0)}</small>
                            </td>
                          )}
                          <td className="bc-m">{x.role}</td>
                          <td>{x.note || <span className="bc-quiet">–</span>}</td>
                          <td className="bc-hl bc-r" style={{ whiteSpace: 'nowrap' }}>{hrs(x.hours)}</td>
                        </tr>
                      );
                    })}
                  </RTbody>
                </RTable>
              </div>
            </Page>
          ))}
        </>
      );
    }
  }

  // ---------- Terms and next steps ----------
  {
    defs.terms = (no) => (
      <Page key="terms" no={no} crumb={<T k="bc.terms.crumb2" d="Terms" />}>
        <p className="bc-eyebrow"><T k="bc.terms.eyebrow2" d="Terms" /></p>
        <h1 className="bc-h1"><T k="bc.terms.title2" d="Key Terms and Next Steps" /></h1>
        <Blocks page="terms">
          <B id="terms" label="Terms and notes">
            <p className="bc-eyebrow bc-gray"><T k="bc.terms.terms" d="Terms and notes" /></p>
            <div className="bc-card bc-terms">
              <TermsList draft={draft} />
            </div>
          </B>
          <B id="nextSteps" label="Next steps">
            <p className="bc-eyebrow bc-gray"><T k="bc.terms.next" d="Next steps" /></p>
            <div className="bc-card bc-terms">
              <TermsList draft={draft} kind="nextSteps" />
            </div>
          </B>
          {capexShown && (
            <B id="callout" label="Cost of ownership">
              <div className="bc-callout">
                <b><CallOut k="capex.ownership.callout"><V k="capex.ownership.value" label="Cost of ownership">{usd(capex.ownershipTotal, { compact: capex.ownershipTotal >= 10_000_000 })}</V></CallOut></b>
                <div>
                  <span className="bc-chip"><T k="bc.terms.chip" d="Four-year cost of ownership" /></span>
                  <p><T k="bc.terms.callout" d="{equipment} of equipment paid once at install, plus {software} of software and services over four years, the useful life of the hardware. About {share} of it is equipment." v={{ equipment: usd(capex.equipment), software: usd(capex.software), share: `${Math.round(capex.equipmentShare * 100)}%` }} /></p>
                </div>
              </div>
            </B>
          )}
        </Blocks>
      </Page>
    );
  }

  // ---------- Assumptions ----------
  {
    defs.assumptions = (no) => (
      <Page key="assumptions" no={no} crumb={<T k="bc.assume.crumb" d="Assumptions" />}>
        <p className="bc-eyebrow"><T k="bc.assume.eyebrow" d="Assumptions" /></p>
        <h1 className="bc-h1"><T k="bc.assume.title" d="Key Assumptions" /></h1>
        <Blocks page="assumptions">
          <B id="assumptions" label="Assumptions">
            <div className="bc-card bc-assume" style={{ marginTop: 24 }}>
              {d.assumptions.map(([key, label, value]) => (
                <div key={key}>
                  <span><T k={key} d={label} /></span>
                  <b><V k={`${key}.value`} label={`${label} value`}>{value}</V></b>
                </div>
              ))}
            </div>
          </B>
          <B id="disclaimer" label="Disclaimer">
            <p className="bc-note">
              <T k="assume.disclaimer" d="Benefits are modeled estimates based on the assumptions above and the {case} case, not guaranteed results. Prices are in US dollars and exclude applicable taxes. Final pricing is set by the order form." v={{ case: caseName }} />
            </p>
          </B>
        </Blocks>
      </Page>
    );
  }

  defs.cover = () => (
    <section className="bc-page bc-cover">
      <div className="bc-blob1" />
      <div className="bc-blob2" />
      <div className="bc-cover-top">
        <Logo />
        <span className="bc-pill"><T k="bc.cover.pill" d="Prepared for {customer}" v={vars} /></span>
      </div>
      <div className="bc-cover-main">
        <p className="bc-kicker"><T k="bc.cover.kicker" d="Proposal" /></p>
        <h1 className="bc-title"><T k="customer" d={customer} /></h1>
        <p className="bc-sub">
          <T k="bc.cover.sub" d="Teton ambient monitoring for {site}’s {beds}: the investment, what it returns once live, and how quickly it pays for itself." v={vars} />
        </p>
      </div>
      <div className="bc-cover-bottom">
        <p className="bc-sig">
          <b>Proposal v{versionNo} · {sites}</b>
          <br />
          {dateLabel(savedAt)}
        </p>
        {/* The rep's own figure and caption (blank by default); the whole circle can be removed and added back. */}
        <V k="bc.cover.circle" label="Cover circle" block>
          <div className="bc-stat">
            <b><T k="bc.cover.circleValue" d="" placeholder="Add a figure" /></b>
            <span><T k="bc.cover.circleText" d="" placeholder="Add a caption" /></span>
          </div>
        </V>
      </div>
      <div className="bc-band"><T k="bc.cover.band" d="Prevention becomes measurable once the environment becomes observable." /></div>
    </section>
  );

  // ---------- Both pricing options: the investment, returns and cash flow pages compare OpEx and CapEx side by side ----------
  if (draft.presentation === 'both') {
    const annualCase = outputs.annual[outputs.roiCase];
    const opCf = buildCashFlow(inputs, annualCase, pilotMonths + term);
    const opNet = opCf.discountedNet;
    const cxNet = net; // capex: pilot + useful life
    const op = {
      upfront: d.oneTime,
      monthly: d.serviceMonthly,
      y1: kp.totalInvestment12,
      annualCost: sel.annualRoi - kp.runRateAnnualNetBenefit,
      netAnnual: kp.runRateAnnualNetBenefit,
      ret: sel.returnOnCost,
      payback: kp.discountedPaybackMonth,
      revpor: kp.netBenefitPerOccupiedUnitMonth,
      total: sum(opNet),
      months: opNet.length,
    };
    const cx = {
      upfront: capex.equipment,
      monthly: capex.softwareMonthly,
      y1: capexCf?.equipment12 ?? capex.equipment,
      annualCost: tetonAnnual,
      netAnnual: stabilizedNet,
      ret: stabilizedReturn,
      payback: y1.payback,
      revpor: d.perUnit.perOccupiedUnitMonth,
      total: sum(cxNet),
      months: cxNet.length,
    };
    // Four years from go-live, both ways: subscription fees and installation over the pilot + 48 months, against the cost of ownership.
    const years = capex.ownershipMonths / 12;
    const op4 = buildCashFlow(inputs, annualCase, pilotMonths + capex.ownershipMonths);
    const opFour = sum(op4.recurringFees) + sum(op4.install);
    const cxFour = capex.ownershipTotal;
    const perBed = (v: number) => (units > 0 ? v / units / capex.ownershipMonths : 0);
    const headRow = (first: string) => (
      <tr>
        <th>{first}</th>
        <th />
        <th className="bc-cmp-c">
          <div className="bc-cmp-pillrow"><span className="bc-cmp-pill bc-cmp-op">OpEx</span></div>
          <T k="bc.cmp.op" d="Subscription" />
        </th>
        <th className="bc-cmp-c">
          <div className="bc-cmp-pillrow"><span className="bc-cmp-pill bc-cmp-cx">CapEx</span></div>
          <T k="bc.cmp.cx" d="Purchase" />
        </th>
      </tr>
    );
    const head = headRow('Measure');
    const row = (k: string, name: string, means: string, a: React.ReactNode, b: React.ReactNode, cls = '', extra?: React.ReactNode) => (
      <tr className={cls}>
        <td className="bc-m">
          <T k={`bc.cmp.${k}`} d={name} />
          {extra}
        </td>
        <td>{means && <T k={`bc.cmp.${k}.note`} d={means} />}</td>
        <td className="bc-cmp-v bc-cmp-vop">{a}</td>
        <td className="bc-cmp-v bc-cmp-vcx">{b}</td>
      </tr>
    );
    const sec = (k: string, title: string) => (
      <tr className="bc-cmp-sec">
        <td colSpan={4}><T k={`bc.cmp.sec.${k}`} d={title} /></td>
      </tr>
    );
    const mo = <span className="bc-cmp-unit"> / mo</span>;
    const neg = (v: number) => <span className="bc-cost">−{usd(v)}</span>;

    defs.scope = (no) => (
      <Page key="scope" no={no} crumb={<T k="bc.crumb" d="{customer} · Proposal" v={vars} />}>
        <p className="bc-eyebrow"><T k="bc.scope.eyebrow" d="The investment" /></p>
        <h1 className="bc-h1"><T k="bc.cmp.inv.title" d="Two ways to pay for Teton" /></h1>
        <p className="bc-lede"><T k="bc.cmp.inv.lede" d="The same program priced as a subscription (OpEx) or as an equipment purchase (CapEx), side by side." /></p>
        <Blocks page="scope-both">
          <B id="compare" label="Comparison">
            <div className="bc-card bc-tbl bc-cmp">
              <RTable>
                <thead>{head}</thead>
                <RTbody id="cmp" name="Two ways to pay">
                  {sec('pay', 'What you pay')}
                  {row('upfront', 'Upfront', 'Installation and sensors (OpEx), or the equipment itself (CapEx), net of pilot credits', usd(op.upfront), usd(cx.upfront))}
                  {row('monthly', 'Monthly', `Subscription (OpEx) or software & services (CapEx), all ${count(units)} beds`, <>{usd(op.monthly)}{mo}</>, <>{usd(cx.monthly)}{mo}</>)}
                  {row('perBed', 'Per bed, per month', `Everything over ${numberWord(years)} years ÷ beds ÷ ${capex.ownershipMonths} months`, usd(Math.round(perBed(opFour))), usd(Math.round(perBed(cxFour))))}
                  {sec('time', 'Over time')}
                  {row('y1', 'Year 1 investment', 'Everything paid in the first 12 months', usd(op.y1), usd(cx.y1))}
                  {layout.bcFourYears &&
                    row(
                      'four',
                      'Four years from go-live',
                      `The pilot, then ${capex.ownershipMonths - pilotMonths} months of fees (OpEx, renewing at the same rate); equipment plus ${capex.ownershipMonths} months of software (CapEx)`,
                      usd(opFour),
                      usd(cxFour),
                      'bc-tot',
                      editable ? (
                        <button type="button" data-edit-ui className="no-print bc-cmp-x" onClick={() => setLayout((l) => ({ ...l, bcFourYears: undefined }))} aria-label="Remove Four years from go-live" title="Remove this row (you can add it back)">
                          ✕
                        </button>
                      ) : null,
                    )}
                  {sec('means', 'What it means')}
                  {row('own', 'Ownership', '', <T k="bc.cmp.own.op" d="Teton owns it" />, <T k="bc.cmp.own.cx" d="You own it" />, 'bc-cmp-text')}
                  {row('books', 'On the books', '', <T k="bc.cmp.books.op" d="Operating expense" />, <T k="bc.cmp.books.cx" d="{share} capitalized" v={{ share: `${Math.round(capex.equipmentShare * 100)}%` }} />, 'bc-cmp-text')}
                </RTbody>
              </RTable>
            </div>
          </B>
        </Blocks>
      </Page>
    );

    defs.roi = (no) => (
      <Page key="roi" no={no} crumb={<T k="bc.roi.crumb" d="What the program returns" />}>
        <p className="bc-eyebrow"><T k="bc.roi.eyebrow" d="What the program returns" /></p>
        <h1 className="bc-h1"><T k="bc.roi.title" d="Projected Return on Teton Investment" /></h1>
        <p className="bc-lede"><T k="bc.cmp.roi.lede" d="The sources of value, modeled for {site}. The benefit is the same under both pricing options; only the cost of Teton differs." v={vars} /></p>
        <Blocks page="roi-both">
          <B id="table" label="Returns">
            <div className="bc-card bc-tbl bc-cmp bc-roi-tbl">
              <RTable>
                <thead>
                  <tr>
                    <th>Source of value</th>
                    <th>What it means each year</th>
                    <th className="bc-r" colSpan={2}>Annual benefit</th>
                  </tr>
                </thead>
                <RTbody id="cmproi" name="Returns, both ways">
                  {benefitRows.map((b) => (
                    <tr key={b.key}>
                      <td className="bc-m"><T k={`${b.key}.label`} d={b.label} /></td>
                      <td colSpan={2}>
                        <T k={`${b.key}.means`} d={b.means} v={b.v} />
                      </td>
                      <td className="bc-cmp-v">{usd(b.value)}</td>
                    </tr>
                  ))}
                  <tr className="bc-tot">
                    <td className="bc-m"><T k="bc.roi.gross" d="Gross Annual Benefit" /></td>
                    <td colSpan={2}><T k="bc.cmp.gross.note" d="The benefit doesn’t depend on how Teton is paid for" /></td>
                    <td className="bc-cmp-v">{usd(sel.annualRoi)}</td>
                  </tr>
                  {headRow('')}
                  {row('cost', 'Cost of Teton', `OpEx: annual subscription once every community is live · CapEx: ${numberWord(years)}-year cost of ownership ÷ ${years}`, neg(op.annualCost), neg(cx.annualCost))}
                  {row('net', 'Net Annual Benefit', '', usd(op.netAnnual), usd(cx.netAnnual), 'bc-tot')}
                </RTbody>
              </RTable>
            </div>
          </B>
          <B id="callout" label="Asset value / Fall risk">
            {roiCallout()}
          </B>
        </Blocks>
      </Page>
    );

    defs.cashflow = (no) => (
      <Page key="cashflow" no={no} crumb={<T k="bc.cf.crumb" d="Cash flow summary" />}>
        <p className="bc-eyebrow"><T k="bc.cf.eyebrow" d="Cash flow summary" /></p>
        <h1 className="bc-h1"><T k="bc.cf.title" d="Teton Cost / Benefit Summary" /></h1>
        <p className="bc-lede"><T k="bc.cmp.cf.lede" d="Net discounted benefit after Teton fees, for each pricing option." /></p>
        <Blocks page="cashflow-both">
          <B id="cards" label="Payback and return">
            <div className="bc-cmp-cards">
              {(
                [
                  ['op', 'OpEx · Subscription', op],
                  ['cx', 'CapEx · Purchase', cx],
                ] as const
              ).map(([k, label, o]) => (
                <div key={k} className={`bc-cmp-side bc-cmp-side-${k}`}>
                  <span className={`bc-cmp-pill bc-cmp-${k}`}><T k={`bc.cmp.card.${k}`} d={label} /></span>
                  <div className="bc-cmp-side-row">
                    <div><b>{o.payback ? `Month ${o.payback}` : `> ${o.months} mo`}</b><span><T k="bc.cmp.card.payback" d="discounted payback" /></span></div>
                    <div><b>{multiple(o.ret, 1)}</b><span><T k="bc.cmp.card.ret" d="stabilized return on cost" /></span></div>
                  </div>
                </div>
              ))}
            </div>
          </B>
          <B id="table" label="Totals">
            <div className="bc-card bc-tbl bc-cmp" style={{ marginTop: 12 }}>
              <RTable>
                <thead>{head}</thead>
                <RTbody id="cmptot" name="Totals, both ways">
                  {row('cf.inv', 'Total investment', 'Year 1: OpEx installation plus fees; CapEx the equipment, paid at install', neg(op.y1), neg(cx.y1))}
                  {row('cf.net', 'Stabilized Net Benefit', 'Each year, fully ramped, after the cost of Teton', usd(op.netAnnual), usd(cx.netAnnual))}
                  {row('cf.revpor', 'REVPOR Impact', 'Per occupied room, per month', usd(op.revpor), usd(cx.revpor))}
                  {row(
                    'cf.total',
                    'Total value added',
                    `Discounted cumulative net benefit over the pilot and the term (OpEx: ${term}-month term · CapEx: ${numberWord(years)}-year useful life)`,
                    <>{usd(op.total, { compact: true })}<small>{op.months} months</small></>,
                    <>{usd(cx.total, { compact: true })}<small>{cx.months} months</small></>,
                    'bc-tot',
                  )}
                </RTbody>
              </RTable>
            </div>
          </B>
          <B id="chart" label="Chart">
            <div className="bc-card bc-chart relative group/view">
              {editable && (
                <ViewSwitch
                field="bcCompareChart"
                  label="Chart style"
                  options={[['line', 'Line'], ['bar', 'Bar']] as const}
                  value={layout.bcCompareChart ?? 'bar'}
                  onChange={(v) => setLayout((l) => ({ ...l, bcCompareChart: v === 'line' ? 'line' : undefined }))}
                />
              )}
              <CompareChart
                opex={opNet}
                capex={cxNet}
                opexPayback={op.payback}
                capexPayback={cx.payback}
                kind={layout.bcCompareChart ?? 'bar'}
                startLabel={monthName(inputs.schedule.startDate, 1)}
                labels={{
                  opex: <T k="bc.cmp.leg.op" d="OpEx: where you stand each quarter" />,
                  capex: <T k="bc.cmp.leg.cx" d="CapEx: where you stand each quarter" />,
                  note: <T k="bc.cmp.leg.note" d="Discounted at {rate} · OpEx ends with its term" v={{ rate: costOfMoney }} />,
                }}
              />
            </div>
          </B>
        </Blocks>
      </Page>
    );
  }

  // ---------- Executive summary: one page over the whole case; its cards move, widen and come off one by one ----------
  {
    const wide = new Set(layout.bcExecWide ?? []);
    const toggleWide = (id: string) => () =>
      setLayout((l) => {
        const w = new Set(l.bcExecWide ?? []);
        if (w.has(id)) w.delete(id);
        else w.add(id);
        return { ...l, bcExecWide: Array.from(w) };
      });
    const card = (id: string) => ({ wide: wide.has(id), onWide: editable ? toggleWide(id) : undefined });
    const company = customer;
    const structure = draft.presentation === 'both' ? 'OpEx or CapEx' : capexShown ? 'CapEx' : 'OpEx';
    const totalValue = sum(net);
    const allBeds = draft.communities.map(bedsOf);
    const careSplit = (
      [
        ['il', 'independent living'],
        ['al', 'assisted living'],
        ['mc', 'memory care'],
        ['snf', 'skilled nursing'],
      ] as const
    )
      .map(([k, label]) => [sum(allBeds.map((b) => b[k])), label] as const)
      .filter(([n]) => n > 0)
      .map(([n, label]) => `${count(n)} ${label}`);
    const careText = careSplit.length > 1 ? `${careSplit.slice(0, -1).join(', ')} and ${careSplit[careSplit.length - 1]}` : careSplit[0] ?? '';
    const sensorsTotal = sum(draft.communities.map(sensorsOf));
    const nComm = draft.communities.length;
    const head = (k: string, d0: string, page: string) => (
      <p className="bc-exec-lbl">
        <T k={k} d={d0} />
        <PageRef page={page} />
      </p>
    );
    const row = (label: React.ReactNode, value: React.ReactNode, cls = '') => (
      <tr className={cls}>
        <td>{label}</td>
        <td className="bc-r">{value}</td>
      </tr>
    );
    const gross = sel.annualRoi;
    // The terms in brief: the first sentence of each (the Terms page has them in full).
    const firstSentence = (t: string) => (t.match(/^.*?[.;](?=\s|$)/)?.[0] ?? t).trim();
    const termsText = resolveTerms(draft, 'terms').map((t) => firstSentence(renderText(t.template, t.vars))).filter(Boolean);
    const nextText = resolveTerms(draft, 'nextSteps').map((t) => renderText(t.template, t.vars).trim()).filter(Boolean);
    defs.execsum = (no) => (
      <Page key="execsum" no={no} crumb={<T k="bc.exec.crumb" d="Executive summary" />}>
        <p className="bc-eyebrow"><T k="bc.exec.eyebrow" d="Executive summary" /></p>
        <h1 className="bc-h1 bc-exec-h1"><T k="bc.exec.title" d="Teton at {company} – Executive Summary" v={{ company }} /></h1>
        <p className="bc-lede"><T k="bc.exec.lede" d="A summary of what Teton would look like at {company}." v={{ company }} /></p>
        <div className="bc-exec-grid">
          <Blocks page="execsum">
            <B id="kpis" label="Key figures" wide>
              <div className="bc-exec-kpis">
                <Stat value={<T k="bc.exec.k1" d={structure} />}><T k="bc.exec.k1note" d="proposed pricing structure" /></Stat>
                <Stat value={<V k={y1.key('payback.value')} label="Discounted Payback figure">{y1.payback ? `Month ${y1.payback}` : `> ${y1.horizon} mo`}</V>}><T k="bc.exec.k2note" d="discounted payback" /></Stat>
                <Stat value={<V k={capexShown ? 'bc.capex.returnOnCost.value' : 'bc.cf.returnOnCost.value'} label="Stabilized return on cost figure">{multiple(stabilizedReturn, 1)}</V>}><T k="bc.exec.k3note" d="stabilized return on cost" /></Stat>
                <Stat value={<V k="bc.cf.total.value" label="Total value added over the term">{usd(totalValue, { compact: true })}</V>}><T k="bc.exec.k4note" d="total value added over the term" /></Stat>
              </div>
            </B>
            <B id="scope" label="Scope" {...card('scope')}>
              <div className="bc-card bc-exec-card">
                {head('bc.exec.scope', 'Scope', 'sitescope')}
                <h4><T k="bc.exec.scope.h" d="{rooms} rooms across {n}" v={{ rooms: count(units), n: nComm === 1 ? '1 community' : `${nComm} communities` }} /></h4>
                <p>{careText ? <T k="bc.exec.scope.p" d="{split}, from your floor plans." v={{ split: careText.charAt(0).toUpperCase() + careText.slice(1) }} /> : null}</p>
                <div className="bc-exec-mini">
                  <div><b>{count(units)}</b><span>Edge units</span></div>
                  <div><b>{count(sensorsTotal)}</b><span>sensors</span></div>
                  <div><b>{nComm}</b><span>{nComm === 1 ? 'community' : 'communities'}</span></div>
                </div>
              </div>
            </B>
            {execPilot && (
              <B id="pilot" label="The pilot" {...card('pilot')}>
                <div className="bc-card bc-exec-card">
                  {head('bc.exec.pilot', 'The pilot', 'pilot')}
                  <h4><T k="bc.exec.pilot.h" d="{days} days at {name}, at {cost}" v={{ days: String(execPilot.months * 30), name: execPilot.name, cost: usd(execPilot.total) }} /></h4>
                  <p><T k="bc.exec.pilot.p" d="{beds} beds go live {goLive}. After the pilot, the service term is {term} months." v={{ beds: count(execPilot.beds), goLive: goLive ?? '', term: String(term) }} /></p>
                  <div className="bc-exec-mini">
                    <div><b>{usd(execPilot.total)}</b><span>pilot cost</span></div>
                    {pilots[0] && <div><b>{longDate(pilots[0].goLive).replace(/, \d{4}$/, '')}</b><span>go-live</span></div>}
                    <div><b>{execPilot.months} mo</b><span>pilot</span></div>
                  </div>
                </div>
              </B>
            )}
            <B id="investment" label="The investment" {...card('investment')}>
              <div className="bc-card bc-exec-card bc-exec-tbl">
                {head('bc.exec.inv', 'The investment', 'scope')}
                <RTable>
                  <RTbody id="exinv" name="Executive summary · investment">
                    {capexShown ? (
                      <>
                        {basePackageRows(capex).map((r) => row(`${r.label} · ${count(r.beds)} beds × ${unitPriceText(r, (n) => usd(n))}${r.credit ? '*' : ''}`, usd(r.total)))}
                        {sensorRows(capex).map((r) => row(`Additional sensors · ${count(r.units)} × ${unitPriceText(r, (n) => usd(n))}${r.credit ? '*' : ''}`, usd(r.total)))}
                        {row('One-time equipment, paid at install', usd(capex.equipment), 'bc-exec-tot')}
                        {row('Software & services', `${usd(capex.softwareMonthly)} / mo`)}
                        {row(`${numberWord(capex.ownershipMonths / 12).replace(/^./, (c) => c.toUpperCase())}-year cost of ownership`, usd(capex.ownershipTotal))}
                      </>
                    ) : (
                      <>
                        {row('One-time installation and sensors', usd(d.oneTime))}
                        {row('Monthly subscription, once in service', `${usd(d.serviceMonthly)} / mo`)}
                        {row('Per bed, per month', perBedMonthly)}
                        {row(`Total over the ${term}-month term`, usd(d.termTotal), 'bc-exec-tot')}
                      </>
                    )}
                  </RTbody>
                </RTable>
                {capexShown && conversionCreditOf(capex) > 0 && (
                  <p className="bc-exec-foot"><T k="bc.exec.conversionNote" d="*Includes a {credit} conversion credit per pilot bed and sensor." v={{ credit: usd(conversionCreditOf(capex)) }} /></p>
                )}
              </div>
            </B>
            <B id="returns" label="What the program returns" {...card('returns')}>
              <div className="bc-card bc-exec-card bc-exec-tbl">
                {head('bc.exec.roi', 'What the program returns', 'roi')}
                <div className="bc-exec-bars">
                  {benefitRows.map((b) => (
                    <div key={b.key}>
                      <span>{b.label}</span>
                      <i style={{ width: `${gross > 0 ? Math.max(2, (b.value / gross) * 100) : 0}%` }} />
                      <em>{usd(b.value, { compact: true })}</em>
                    </div>
                  ))}
                </div>
                <RTable>
                  <RTbody id="exroi" name="Executive summary">
                    {row('Gross annual benefit', usd(gross), 'bc-exec-tot')}
                    {row(capexShown ? 'Cost of Teton (ownership ÷ 4)' : 'Cost of Teton (subscription)', <span className="bc-cost">−{usd(tetonAnnual)}</span>)}
                    {row('Net annual benefit', usd(stabilizedNet), 'bc-exec-tot')}
                  </RTbody>
                </RTable>
              </div>
            </B>
            <B id="cashflow" label="Cash flow summary" {...card('cashflow')}>
              <div className="bc-card bc-exec-card bc-exec-tbl">
                {head('bc.exec.cf', 'Cash flow summary', 'cashflow')}
                <RTable>
                  <RTbody id="excf" name="Executive summary · cash flow">
                    {row(<><b>Total investment</b><small>{capexShown ? 'One-time equipment, paid at install' : 'Everything paid to Teton in the first 12 months'}</small></>, <span className="bc-cost">{y1.investment > 0 ? '−' : ''}{usd(y1.investment)}</span>)}
                    {row(<><b>Stabilized Net Benefit</b><small>Each year, fully ramped, after the cost of Teton</small></>, usd(stabilizedNet))}
                    {row(<><b>REVPOR Impact</b><small>Per occupied room, per month · {usd(d.perUnit.perUnitMonth)} across all {count(inputs.cfo.portfolioUnits)} units</small></>, usd(d.perUnit.perOccupiedUnitMonth))}
                  </RTbody>
                </RTable>
              </div>
            </B>
            <B id="terms" label="Key terms & next steps" {...card('terms')}>
              <div className="bc-card bc-exec-card">
                {head('bc.exec.terms', 'Key terms & next steps', 'terms')}
                <ul className="bc-exec-ul">
                  {termsText.slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}
                </ul>
                {nextText.length > 0 && (
                  <>
                    <p className="bc-exec-next"><T k="bc.exec.next" d="Next" /></p>
                    <ol className="bc-exec-ul bc-exec-ol">
                      {nextText.slice(0, 4).map((t, i) => <li key={i}>{t}</li>)}
                    </ol>
                  </>
                )}
              </div>
            </B>
          </Blocks>
        </div>
      </Page>
    );
  }

  const custom = layout.bcCustom ?? {};
  const order = bcPagesOf(layout).filter((id) => defs[id] || custom[id]);
  return (
    <article id="proposal" className="bc-doc" data-format="businessCase">
      {/* Each sheet is a full Letter page with its own margins. Setting the document's page (rather than a named page)
          keeps the browser from starting a fresh, empty sheet before the cover. */}
      <style>{'@page { size: Letter; margin: 0; }'}</style>
      {order.map((id, i) => {
        // Sheet number: one per page before this, more for pages that run over several sheets.
        const no = 1 + order.slice(0, i).reduce((n, p) => n + (spans[p] ?? 1), 0);
        return (
        <PageSlot key={id} id={id} index={i} order={order}>
          {custom[id] ? (
            <Page no={no} crumb={custom[id].title || 'Added page'}>
              <h1 className="bc-h1 bc-custom-title">
                <CustomTitle id={id} title={custom[id].title} store="bcCustom" />
              </h1>
              <RichBody id={id} html={custom[id].html} store="bcCustom" className="proposal-rich bc-rich" />
            </Page>
          ) : (
            defs[id](no)
          )}
        </PageSlot>
        );
      })}
      <AddPageZone at={null} />
    </article>
  );
}

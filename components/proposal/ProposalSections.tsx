'use client';

/**
 * Arranging the proposal on screen, per version: remove and add back the
 * standard sections, drag them into a different order (desktop), add blank
 * sections with formatted text between them, and remove individual figures.
 * Everything here is screen-only chrome (data-edit-ui): it never prints and
 * is stripped from the copy kept when a proposal is recorded as sent.
 */
import { Children, cloneElement, createContext, Fragment, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { renderText } from '@/lib/proposal/text';
import { addBackBcPage, BC_PAGE_TITLES, bcPagesOf, removedBcPages } from '@/lib/proposal/bcPages';
import { DEFAULT_HIDDEN_COLS, hiddenColsOf, isCustomId, type ProposalLayout, type StandardSection } from '@/lib/proposal/layout';
import { T, useProposalText } from './EditableText';
import { useFigure } from './WhatIf';
import { canAutoFocus } from '@/lib/client/focus';

/* ------------------------------------------------------------------ */
/* Labels of figures, so removed ones can be listed and added back.    */
/* ------------------------------------------------------------------ */

const LabelsCtx = createContext<{ labels: Record<string, string>; register: (k: string, label: string) => void }>({ labels: {}, register: () => {} });

export function ValueLabelsProvider({ children }: { children: React.ReactNode }) {
  const [labels, setLabels] = useState<Record<string, string>>({});
  const register = useCallback((k: string, label: string) => setLabels((l) => (l[k] === label ? l : { ...l, [k]: label })), []);
  const value = useMemo(() => ({ labels, register }), [labels, register]);
  return <LabelsCtx.Provider value={value}>{children}</LabelsCtx.Provider>;
}

const MinusIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
    <path d="M3.5 8h9" />
  </svg>
);
const PlusIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true">
    <path d="M8 3.5v9M3.5 8h9" />
  </svg>
);
const GripIcon = () => (
  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="currentColor" aria-hidden="true">
    {[3, 8, 13].flatMap((y) => [5.5, 10.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.3} />))}
  </svg>
);

/**
 * A calculated figure the rep may remove (never edit). `label` names it in the
 * Removed list so it can be added back.
 */
export function V({ k, label, children, block = false }: { k: string; label: string; children: React.ReactNode; block?: boolean }) {
  const { editable, layout, setLayout } = useProposalText();
  const { register } = useContext(LabelsCtx);
  const fig = useFigure(k, label);
  useEffect(() => register(k, label), [k, label, register]);
  // Removed: a hidden marker while editing, so resetting the page or section around it can find it.
  if (layout.hiddenValues.includes(k)) return editable ? <span hidden data-fig-hidden={k} /> : null;
  if (!editable && !fig.clickable) return <>{children}</>;
  const Tag = block ? 'div' : 'span';
  const open = fig.clickable ? fig.open : undefined;
  return (
    // Blocks get their own hover group, so hovering one doesn't reveal the controls of every figure inside it.
    <Tag ref={fig.ref as React.Ref<HTMLDivElement & HTMLSpanElement>} data-fig={k} className={`relative ${block ? 'group/blk' : 'group/v inline-block'}`}>
      {fig.clickable ? (
        <span
          data-fig-value
          role="button"
          tabIndex={0}
          title={`See and change the inputs behind ${label}`}
          onClick={open}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              open?.();
            }
          }}
          className={`cursor-pointer rounded-[4px] -mx-0.5 px-0.5 outline-none decoration-dotted decoration-teton-blue underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand-accent ${
            fig.selected ? 'bg-teton-blue/10 ring-2 ring-teton-blue' : fig.was ? 'bg-[#FFF1CC] ring-1 ring-[#E2A72B]' : ''
          }`}
        >
          {children}
        </span>
      ) : (
        <span data-fig-value>{children}</span>
      )}
      {fig.clickable && fig.was && (
        <span data-edit-ui className="no-print block text-[10px] font-medium leading-tight text-[#8A5A00] whitespace-nowrap">
          was {fig.was}
        </span>
      )}
      {editable && (
        <button
          type="button"
          data-edit-ui
          className={`no-print absolute hidden items-center justify-center rounded-full bg-teton-near-black text-white shadow ${block ? 'z-10 -top-3 -right-3 w-6 h-6 group-hover/blk:flex focus:flex' : '-top-2 -right-3 w-4 h-4 group-hover/v:flex'}`}
          title={`Remove ${label}`}
          aria-label={`Remove ${label}`}
          onClick={() => setLayout((l) => ({ ...l, hiddenValues: [...l.hiddenValues, k] }))}
        >
          <MinusIcon />
        </button>
      )}
    </Tag>
  );
}

/** Table rows, flattened out of fragments and arrays. */
function flatRows(nodes: React.ReactNode): React.ReactNode[] {
  return Children.toArray(nodes).flatMap((el) => (isValidElement(el) && el.type === Fragment ? flatRows((el.props as { children?: React.ReactNode }).children) : [el]));
}
type Cell = React.ReactElement<{ colSpan?: number; className?: string; children?: React.ReactNode }>;
const cellsOf = (tr: React.ReactElement) => flatRows((tr.props as { children?: React.ReactNode }).children);
const isCell = (c: React.ReactNode): c is Cell => isValidElement(c) && (c.type === 'td' || c.type === 'th');
/** A stable name for a column from its heading: the heading's text key, or its words. */
function headingKey(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(headingKey).join(' ');
  if (!isValidElement(node)) return '';
  const props = node.props as { k?: string; children?: React.ReactNode };
  if (typeof props.k === 'string') return props.k;
  return headingKey(props.children);
}
const slug = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 40);

const hash = (t: string) => {
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};
const isText = (n: React.ReactNode): n is string | number => typeof n === 'string' || typeof n === 'number';
/**
 * Plain text in a table cell becomes editable wording (figures and other
 * components are left as they are). Text split across expressions in one
 * element ("82", " ", "sensors") is one piece. `path` names the cell.
 */
function editableCell(node: React.ReactNode, path: string): React.ReactNode {
  const parts = Children.toArray(node);
  if (parts.length && parts.every(isText)) {
    const text = parts.join('');
    return text.trim() ? <T k={`tbl.${hash(path)}`} d={text} /> : node;
  }
  let n = 0;
  return parts.map((c) => {
    const here = `${path}.${n++}`;
    if (isText(c)) return String(c).trim() ? <T key={here} k={`tbl.${hash(here)}`} d={String(c)} /> : c;
    if (isValidElement(c) && typeof c.type === 'string' && !(c.props as Record<string, unknown>)['aria-hidden'] && (c.props as { children?: React.ReactNode }).children != null) {
      return cloneElement(c as React.ReactElement<{ children?: React.ReactNode }>, { children: editableCell((c.props as { children?: React.ReactNode }).children, here) });
    }
    return c;
  });
}

/**
 * A table whose columns the rep may remove from its column headings (all but
 * the first). Every row keeps its place: a removed column's cells are dropped
 * and cells spanning it get narrower, so a row with nothing in that column
 * (a subtotal, a group heading) stays as it is. Removed columns are listed to
 * add back. The id comes from the table's RTbody.
 */
export function RTable({ className, children }: { className?: string; children: React.ReactNode }) {
  const { editable, layout, setLayout } = useProposalText();
  const parts = Children.toArray(children);
  const body = parts.find((c) => isValidElement(c) && c.type === RTbody) as React.ReactElement<{ id: string; name: string }> | undefined;
  const id = body?.props.id;
  const name = body?.props.name ?? 'table';
  const rowsIn = (part: React.ReactNode) => (isValidElement(part) ? flatRows((part.props as { children?: React.ReactNode }).children).filter((r): r is React.ReactElement => isValidElement(r) && r.type === 'tr') : []);
  // The heading row: the first row made only of th cells.
  const head = parts.flatMap(rowsIn).find((r) => {
    const cs = cellsOf(r).filter(isCell);
    return cs.length > 1 && cs.every((c) => c.type === 'th');
  });
  if (!id) return <table className={className}>{children}</table>;
  // (data-rtable lets the Removed list show only the start-out-removed columns of tables on the page.)
  const columns: Array<{ key: string; start: number; span: number }> = [];
  let at = 0;
  for (const c of head ? cellsOf(head).filter(isCell) : []) {
    const span = Math.max(1, Number(c.props.colSpan) || 1);
    const k = slug(headingKey(c.props.children)) || `col${at}`;
    columns.push({ key: `${id}.${k}`.slice(0, 80), start: at, span });
    at += span;
  }
  // Column order: the first column stays put; the rest follow the saved order (new columns keep their place at the end).
  const allRows = parts.flatMap(rowsIn);
  const canMove =
    !!head && columns.length > 2 && columns.every((c) => c.span === 1) && !allRows.some((r) => cellsOf(r).some((c) => isCell(c) && Number((c.props as { rowSpan?: number }).rowSpan) > 1));
  // A saved order that doesn't cover every column (the table changed since) gives way to the standard order.
  const savedRaw = layout.colOrder?.[id] ?? [];
  const saved = columns.slice(1).every((c) => savedRaw.includes(c.key)) ? savedRaw : [];
  const rest = columns.map((_, i) => i).slice(1);
  const perm = canMove ? [0, ...[...rest].sort((x, y) => {
    const a = saved.indexOf(columns[x].key);
    const b = saved.indexOf(columns[y].key);
    return (a < 0 ? 1e6 + x : a) - (b < 0 ? 1e6 + y : b);
  })] : columns.map((_, i) => i);
  const hiddenCols = hiddenColsOf(layout);
  const hidden = new Set<number>();
  columns.forEach((c, i) => {
    if (i > 0 && c.key in hiddenCols) for (let x = c.start; x < c.start + c.span; x++) hidden.add(x);
  });
  // Totals columns (highlighted, or headed "Total") keep their width when other columns go; the rest share the room.
  const isTotal = (c: Cell) => /\bbc-hl2?\b/.test(c.props.className ?? '') || /total/i.test(headingKey(c.props.children));
  const headCells = head ? cellsOf(head).filter(isCell) : [];
  const widths = layout.colWidths ?? {};
  const remove = (col: { key: string }, e: React.MouseEvent<HTMLButtonElement>) => {
    const th = e.currentTarget.closest('th') as HTMLElement | null;
    const text = (th?.textContent ?? '').replace(/\s+/g, ' ').trim() || 'Column';
    // The first column removed from this table: note each totals column's share of the width as it is now.
    const keep: Record<string, number> = {};
    const table = th?.closest('table');
    if (table && hidden.size === 0) {
      const ths = Array.from(table.querySelectorAll('th')).filter((x) => x.closest('tr') === th?.closest('tr'));
      headCells.forEach((c, i) => {
        if (i > 0 && isTotal(c) && ths[i]) keep[columns[i].key] = Math.round(ths[i].getBoundingClientRect().width);
      });
    }
    setLayout((l) => {
      const colWidths = Object.keys(keep).length ? { ...(l.colWidths ?? {}), ...keep } : l.colWidths;
      // A column that starts out removed goes back to removed.
      if (col.key in DEFAULT_HIDDEN_COLS) {
        const shownCols = (l.shownCols ?? []).filter((k) => k !== col.key);
        return { ...l, shownCols: shownCols.length ? shownCols : undefined, colWidths };
      }
      return { ...l, hiddenCols: { ...(l.hiddenCols ?? {}), [col.key]: `${text.slice(0, 40)} column · ${name}` }, colWidths };
    });
  };
  // Move a column one place left or right, past any removed ones.
  const move = (i: number, dir: -1 | 1) => {
    const shownOrder = perm.slice(1).filter((x) => !(columns[x].key in hiddenCols));
    const at = shownOrder.indexOf(i);
    const to = at + dir;
    if (at < 0 || to < 0 || to >= shownOrder.length) return;
    const next = [...shownOrder];
    [next[at], next[to]] = [next[to], next[at]];
    // Removed columns keep their place relative to the start, so adding one back puts it where it was.
    const full = perm.slice(1).map((x) => (columns[x].key in hiddenCols ? x : next.shift()!));
    setLayout((l) => ({ ...l, colOrder: { ...(l.colOrder ?? {}), [id]: full.map((x) => columns[x].key) } }));
  };
  const visibleOrder = perm.slice(1).filter((x) => !(columns[x].key in hiddenCols));
  let rowNo = 0;
  const fixRow = (tr: React.ReactElement, isHead: boolean): React.ReactElement => {
    const out: React.ReactNode[] = [];
    const rowKey = tr.key != null ? `k${tr.key}` : `r${rowNo}`;
    rowNo++;
    // Each cell with the column position it was written at.
    let at0 = 0;
    let items = cellsOf(tr).map((raw) => {
      if (!isCell(raw)) return { raw, pos: -1, span: 0, idx: -1 };
      const span = Math.max(1, Number(raw.props.colSpan) || 1);
      const it = { raw, pos: at0, span, idx: columns.findIndex((x) => x.start === at0) };
      at0 += span;
      return it;
    });
    // A row with one cell per column follows the column order; rows with wider cells (a heading across the table) keep theirs.
    const cellsOnly = items.filter((x) => x.pos >= 0);
    if (canMove && cellsOnly.length === columns.length && cellsOnly.every((x) => x.span === 1)) items = perm.map((i) => cellsOnly[i]);
    for (const { raw, pos, span, idx } of items) {
      if (!isCell(raw)) {
        out.push(raw);
        continue;
      }
      // Its text is editable, named by table, row and column.
      const colAt = columns.find((x) => pos >= x.start && pos < x.start + x.span)?.key ?? `${id}.c${pos}`;
      const c = cloneElement(raw, { children: editableCell(raw.props.children, `${colAt}.${isHead ? 'head' : rowKey}`) });
      let shown = 0;
      for (let x = pos; x < pos + span; x++) if (!hidden.has(x)) shown++;
      const col = isHead && idx >= 0 ? columns[idx] : undefined;
      const ci = idx + 1;
      if (!shown) continue;
      const w = isHead && col && hidden.size && widths[col.key] ? { style: { width: widths[col.key], minWidth: widths[col.key] } } : {};
      if (isHead && editable && col && ci > 1) {
        out.push(
          cloneElement(c, {
            ...w,
            colSpan: shown > 1 ? shown : undefined,
            className: `${c.props.className ?? ''} relative group/col`,
            children: (
              <>
                {c.props.children}
                <span data-edit-ui className="no-print absolute left-0.5 top-1/2 -translate-y-1/2 hidden group-hover/col:flex items-center gap-0.5 rounded-full bg-teton-near-black p-0.5 text-white shadow z-10">
                  {canMove && (
                    <button type="button" className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/25 disabled:opacity-30" disabled={visibleOrder.indexOf(idx) <= 0} title="Move this column left" aria-label="Move this column left" onClick={() => move(idx, -1)}>
                      <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" /></svg>
                    </button>
                  )}
                  <button type="button" className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/25" title="Remove this column" aria-label="Remove this column" onClick={(e) => remove(col, e)}>
                    <MinusIcon />
                  </button>
                  {canMove && (
                    <button type="button" className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-white/25 disabled:opacity-30" disabled={visibleOrder.indexOf(idx) >= visibleOrder.length - 1} title="Move this column right" aria-label="Move this column right" onClick={() => move(idx, 1)}>
                      <svg viewBox="0 0 16 16" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" /></svg>
                    </button>
                  )}
                </span>
              </>
            ),
          }),
        );
      } else out.push(cloneElement(c, { ...w, colSpan: shown > 1 ? shown : undefined }));
    }
    return cloneElement(tr as React.ReactElement<{ children?: React.ReactNode }>, { children: out });
  };
  // Rows are changed in place (arrays and fragments kept), so their keys, and the removed-row keys built from them, stay the same.
  const mapRows = (node: React.ReactNode): React.ReactNode => {
    if (Array.isArray(node)) return node.map(mapRows);
    if (!isValidElement(node)) return node;
    if (node.type === Fragment) return cloneElement(node as React.ReactElement<{ children?: React.ReactNode }>, { children: mapRows((node.props as { children?: React.ReactNode }).children) });
    return node.type === 'tr' ? fixRow(node, !!head && node.props === head.props) : node;
  };
  const fixed = Children.map(children, (part) => {
    if (!isValidElement(part)) return part;
    if (part.type === 'thead' || part.type === 'tbody' || part.type === 'tfoot' || part.type === RTbody) {
      return cloneElement(part as React.ReactElement<{ children?: React.ReactNode }>, { children: mapRows((part.props as { children?: React.ReactNode }).children) });
    }
    return part;
  });
  // Business case tables: a hover switch between full and compact rows (the scope table has its own).
  const compactable = layout.format === 'businessCase' && id !== 'site';
  const compact = compactable && !!layout.bcCompact?.[id];
  return (
    <table className={`${className ?? ''} ${compactable ? 'group/tbl' : ''}`} data-rtable={id} data-compact={compact ? '' : undefined}>
      {/* Compact / full rows: a button in the section's hover controls (business case). */}
      {fixed}
    </table>
  );
}

/**
 * A table body whose rows the rep may remove (and add back from the Removed
 * list). Rows are keyed by the table's id and their place in the body, so a
 * removed row stays removed when figures change. A row with data-fixed (a
 * group heading, column labels) stays.
 */
export function RTbody({ id, name, className, outside = false, children }: { id: string; name: string; className?: string; /** Put the remove button left of the table (cells with no left padding). */ outside?: boolean; children: React.ReactNode }) {
  const { editable, layout, setLayout } = useProposalText();
  const hidden = layout.hiddenRows ?? {};
  const clean = (k: string) => k.replace(/[^a-z0-9_.-]+/gi, '_').replace(/^[_.-]+/, '').slice(0, 50);
  const walk = (nodes: React.ReactNode, prefix: string): React.ReactNode[] =>
    Children.toArray(nodes).flatMap((el) => {
      if (!isValidElement(el)) return [el];
      const key = `${prefix}${String(el.key ?? '')}`;
      if (el.type === Fragment) return walk((el.props as { children?: React.ReactNode }).children, `${key}-`);
      // Rows from different fragments (e.g. one per community) would repeat their local keys: give each its full one.
      const own = cloneElement(el, { key });
      if (el.type !== 'tr') return [own];
      const props = el.props as { className?: string; children?: React.ReactNode; 'data-fixed'?: boolean };
      if (props['data-fixed']) return [own];
      const rk = `${id}.${clean(key)}`.slice(0, 80);
      if (rk in hidden) return [];
      if (!editable) return [own];
      // The remove button sits in the row's first cell, shown on hover.
      const cells = Children.toArray(props.children);
      const first = cells.findIndex((c) => isValidElement(c));
      if (first < 0) return [el];
      const cell = cells[first] as React.ReactElement<{ className?: string; children?: React.ReactNode }>;
      const remove = (e: React.MouseEvent<HTMLButtonElement>) => {
        const tr = e.currentTarget.closest('tr');
        const text = (tr?.querySelector('td, th') as HTMLElement | null)?.innerText.trim().split('\n')[0].replace(/\s+/g, ' ').trim() || 'Row';
        setLayout((l) => ({ ...l, hiddenRows: { ...(l.hiddenRows ?? {}), [rk]: `${text.slice(0, 50)} · ${name}` } }));
      };
      cells[first] = cloneElement(cell, {
        className: `${cell.props.className ?? ''} relative`,
        children: (
          <>
            {cell.props.children}
            <button
              type="button"
              data-edit-ui
              className={`no-print absolute ${outside ? '-left-5' : 'left-px'} top-1/2 -translate-y-1/2 hidden group-hover/row:flex items-center justify-center w-3.5 h-3.5 rounded-full bg-teton-near-black text-white shadow`}
              title="Remove this row"
              aria-label="Remove this row"
              onClick={remove}
            >
              <MinusIcon />
            </button>
          </>
        ),
      });
      return [cloneElement(el as React.ReactElement<{ className?: string; children?: React.ReactNode }>, { key, className: `${props.className ?? ''} group/row`, children: cells })];
    });
  return <tbody className={className}>{walk(children, '')}</tbody>;
}

/* ------------------------------------------------------------------ */
/* Section titles (shared with the Removed list).                      */
/* ------------------------------------------------------------------ */

export const SECTION_TITLES: Record<StandardSection, { key: string; title: string }> = {
  summary: { key: 'summary.title', title: 'Year 1 Financial Summary' },
  scope: { key: 'scope.title', title: 'Scope & investment' },
  terms: { key: 'terms.title', title: 'Terms / Notes' },
  implementation: { key: 'impl.title', title: 'Implementation' },
  resources: { key: 'resources.title', title: 'Implementation – Estimated Resource Allocation' },
  roi: { key: 'roi.title', title: 'Return on investment' },
  assumptions: { key: 'assume.title', title: 'Assumptions' },
};

/** The proposal's section heading with its divider line. */
export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold border-b-2 border-teton-ink pb-1 mb-3">{children}</h2>;
}

/* ------------------------------------------------------------------ */
/* Rich text for added sections.                                       */
/* ------------------------------------------------------------------ */

const SIZES: Array<[string, string]> = [
  ['12px', 'Small'],
  ['14px', 'Normal'],
  ['16px', 'Large'],
  ['19px', 'Larger'],
];
const COLORS: Array<[string, string]> = [
  ['#1E1E1E', 'Ink'],
  ['#394147', 'Dark gray'],
  ['#656E77', 'Gray'],
  ['#3F8CEA', 'Blue'],
  ['#2E9E64', 'Green'],
  ['#D9472B', 'Red'],
];

function exec(cmd: string, value?: string) {
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand(cmd, false, value);
}

/** Size the selection: the browser only offers 7 fixed sizes, so mark with the largest and swap in pixels. */
function setFontSize(root: HTMLElement, px: string) {
  exec('fontSize', '7');
  root.querySelectorAll<HTMLElement>('[style*="xxx-large"], font[size="7"]').forEach((el) => {
    if (el.tagName === 'FONT') {
      const span = document.createElement('span');
      span.style.fontSize = px;
      span.append(...Array.from(el.childNodes));
      el.replaceWith(span);
    } else el.style.fontSize = px;
  });
}

function FormatBar({ editor }: { editor: React.RefObject<HTMLDivElement> }) {
  const [, force] = useState(0);
  const btn = (label: string, title: string, onClick: () => void, cls = '') => (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`min-w-[28px] h-7 px-1.5 rounded text-[13px] text-teton-ink hover:bg-teton-off-white ${cls}`}
      // Keep the text selection: act on mousedown without taking focus.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
        editor.current?.dispatchEvent(new Event('input', { bubbles: true }));
        force((n) => n + 1);
      }}
    >
      {label}
    </button>
  );
  return (
    <div data-edit-ui role="toolbar" aria-label="Text formatting" className="no-print absolute -top-11 left-0 z-20 flex flex-wrap items-center gap-0.5 rounded-lg border border-teton-pale-gray bg-white px-1.5 py-1 shadow-md">
      {btn('B', 'Bold', () => exec('bold'), 'font-bold')}
      {btn('I', 'Italic', () => exec('italic'), 'italic')}
      {btn('U', 'Underline', () => exec('underline'), 'underline')}
      <span className="w-px h-5 bg-teton-off-white mx-1" />
      {btn('•', 'Bulleted list', () => exec('insertUnorderedList'), 'text-base')}
      {btn('1.', 'Numbered list', () => exec('insertOrderedList'))}
      {btn('⇥', 'Indent', () => exec('indent'))}
      {btn('⇤', 'Outdent', () => exec('outdent'))}
      <span className="w-px h-5 bg-teton-off-white mx-1" />
      <select
        aria-label="Font size"
        className="h-7 rounded border border-teton-pale-gray bg-white text-[12px] px-1"
        defaultValue=""
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          if (editor.current && e.target.value) {
            editor.current.focus();
            setFontSize(editor.current, e.target.value);
            editor.current.dispatchEvent(new Event('input', { bubbles: true }));
          }
          e.target.value = '';
        }}
      >
        <option value="" disabled>
          Size
        </option>
        {SIZES.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span className="w-px h-5 bg-teton-off-white mx-1" />
      {COLORS.map(([c, name]) => (
        <button
          key={c}
          type="button"
          title={name}
          aria-label={`Text color ${name}`}
          className="w-5 h-5 rounded-full border border-white ring-1 ring-teton-pale-gray mx-0.5"
          style={{ background: c }}
          onMouseDown={(e) => {
            e.preventDefault();
            exec('foreColor', c);
            editor.current?.dispatchEvent(new Event('input', { bubbles: true }));
          }}
        />
      ))}
    </div>
  );
}

/** Which added-content store a section lives in: the standard format's sections, or the business case's pages. */
export type CustomStore = 'custom' | 'bcCustom';
const patchCustom = (store: CustomStore, id: string, patch: Partial<{ title: string; html: string }>) => (l: ProposalLayout): ProposalLayout => {
  const all = { ...(l[store] ?? {}) };
  if (!all[id]) return l;
  all[id] = { ...all[id], ...patch };
  return { ...l, [store]: all };
};

/** Formatted body of an added section. Uncontrolled while editing so the caret never jumps. */
export function RichBody({ id, html, store = 'custom', className: cls }: { id: string; html: string; store?: CustomStore; className?: string }) {
  const { editable, setLayout } = useProposalText();
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const initial = useRef(html);

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initial.current;
  }, []);

  const className = cls ?? 'proposal-rich text-[14px] leading-relaxed max-w-prose';
  if (!editable) return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className="relative">
      {focused && <FormatBar editor={ref} />}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Section text"
        data-placeholder="Type here…"
        className={`${className} min-h-[3rem] rounded-sm outline-none hover:bg-teton-pale-yellow/40 focus:bg-teton-pale-yellow/40 focus:ring-2 focus:ring-brand-accent/60 empty:before:content-[attr(data-placeholder)] empty:before:text-teton-light-gray print:empty:before:content-none`}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onInput={(e) => {
          const next = (e.currentTarget as HTMLDivElement).innerHTML;
          setLayout(patchCustom(store, id, { html: next }));
        }}
      />
    </div>
  );
}

/** Plain editable heading for an added section. */
export function CustomTitle({ id, title, store = 'custom' }: { id: string; title: string; store?: CustomStore }) {
  const { editable, setLayout } = useProposalText();
  if (!editable) return <>{title}</>;
  return (
    <span
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="Section heading"
      data-placeholder="Section heading"
      data-custom-title={id}
      className="proposal-editable rounded-sm outline-none hover:bg-teton-pale-yellow/60 focus:bg-teton-pale-yellow/60 focus:ring-2 focus:ring-brand-accent/60 empty:inline-block empty:min-w-[8rem] empty:before:content-[attr(data-placeholder)] empty:before:text-teton-light-gray print:empty:before:content-none"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).blur();
        }
      }}
      onBlur={(e) => {
        const next = (e.currentTarget.textContent ?? '').replace(/\s+/g, ' ').trim();
        if (next !== title) setLayout(patchCustom(store, id, { title: next }));
      }}
    >
      {title}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* The arranged document body.                                         */
/* ------------------------------------------------------------------ */

export interface StandardSectionContent {
  /** Body under the heading. */
  body: React.ReactNode;
  className?: string;
  /** Values for {tokens} in the section's title (e.g. the company name). */
  titleVars?: Record<string, string>;
}

/** "Add section" hover strip between sections. */
function AddZone({ at }: { at: number }) {
  const { setLayout } = useProposalText();
  return (
    // Zero height: it sits in the gap between sections and takes no room in the layout.
    <div data-edit-ui className="no-print relative h-0">
      <div className="group/add absolute inset-x-0 -top-7 h-10 flex items-center justify-center">
      <div className="absolute inset-x-0 top-1/2 h-px bg-teton-blue/50 opacity-0 group-hover/add:opacity-100 transition-opacity" />
      <button
        type="button"
        className="relative opacity-0 group-hover/add:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-1 rounded-full bg-white border border-teton-blue/60 text-teton-ink text-[11px] font-medium px-2.5 py-0.5 shadow-sm"
        onClick={() => {
          const id = `custom-${Date.now().toString(36)}`;
          setLayout((l) => {
            const order = [...l.order];
            order.splice(at, 0, id);
            return { ...l, order, custom: { ...l.custom, [id]: { title: 'New section', html: '' } } };
          });
          // Put the cursor in the new heading once it renders.
          setTimeout(() => {
            const el = document.querySelector<HTMLElement>(`[data-custom-title="${id}"]`);
            if (!el || !canAutoFocus()) return;
            el.focus();
            const r = document.createRange();
            r.selectNodeContents(el);
            const sel = getSelection();
            sel?.removeAllRanges();
            sel?.addRange(r);
          }, 50);
        }}
      >
        <PlusIcon /> Add section
      </button>
      </div>
    </div>
  );
}

export function ProposalSections({ sections }: { sections: Partial<Record<StandardSection, StandardSectionContent>> }) {
  const { editable, layout, setLayout, edits } = useProposalText();
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  // Pointer-driven drag (native drag can't start from editable text): press a heading and move to drag;
  // a plain click still puts the cursor in the heading to type.
  const press = useRef<{ id: string; x: number; y: number } | null>(null);
  const dropRef = useRef<{ id: string; after: boolean } | null>(null);
  const draggingRef = useRef<string | null>(null);
  const moveRef = useRef<(id: string, target: string, after: boolean) => void>(() => {});

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const pr = press.current;
      if (!pr) return;
      if (!draggingRef.current) {
        if (Math.hypot(e.clientX - pr.x, e.clientY - pr.y) < 6) return;
        draggingRef.current = pr.id;
        setDragging(pr.id);
        (document.activeElement as HTMLElement | null)?.blur();
        getSelection()?.removeAllRanges();
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      }
      e.preventDefault();
      const els = Array.from(document.querySelectorAll<HTMLElement>('#proposal [data-section]'));
      let best: { id: string; after: boolean } | null = null;
      let bestDist = Infinity;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const dist = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
        if (dist < bestDist) {
          bestDist = dist;
          best = { id: el.dataset.section!, after: e.clientY > r.top + r.height / 2 };
        }
      }
      dropRef.current = best;
      setDrop(best);
    };
    const onUp = () => {
      const id = draggingRef.current;
      if (id && dropRef.current) moveRef.current(id, dropRef.current.id, dropRef.current.after);
      press.current = null;
      draggingRef.current = null;
      dropRef.current = null;
      setDragging(null);
      setDrop(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  const visible = layout.order.filter((id) => (isCustomId(id) ? !!layout.custom[id] : !layout.hiddenSections.includes(id) && id in sections));

  const move = (id: string, target: string, after: boolean) => {
    if (id === target) return;
    setLayout((l) => {
      const order = l.order.filter((x) => x !== id);
      const i = order.indexOf(target);
      order.splice(after ? i + 1 : i, 0, id);
      return { ...l, order };
    });
  };
  moveRef.current = move;
  const remove = (id: string) => {
    if (isCustomId(id)) {
      const c = layout.custom[id];
      if ((c?.html.replace(/<[^>]*>/g, '').trim() || (c?.title && c.title !== 'New section')) && !window.confirm('Delete this section and its text?')) return;
      setLayout((l) => {
        const custom = { ...l.custom };
        delete custom[id];
        return { ...l, order: l.order.filter((x) => x !== id), custom };
      });
    } else setLayout((l) => ({ ...l, hiddenSections: [...l.hiddenSections, id] }));
  };

  // A page plan replaces the automatic print rules: its sections start pages where the rep chose, and a
  // section may run onto the next page rather than jump whole (its smaller parts still never split).
  const pageStarts = layout.pageStarts ? new Set(layout.pageStarts) : null;
  const printClass = (id: string, k: number, auto: string | undefined) => (pageStarts ? (k > 0 && pageStarts.has(id) ? 'print-break-before' : '') : (auto ?? ''));

  // Insert positions are indexes into the full order, so hidden sections keep their place.
  const insertAt = (k: number) => (k < visible.length ? layout.order.indexOf(visible[k]) : layout.order.length);

  return (
    <div data-sections-root>
      {editable && <AddZone at={insertAt(0)} />}
      {visible.map((id, k) => {
        const custom = isCustomId(id) ? layout.custom[id] : null;
        const std = custom ? null : sections[id as StandardSection];
        const title = custom ? null : SECTION_TITLES[id as StandardSection];
        const label = custom ? custom.title || 'Added section' : renderText(edits[title!.key] ?? title!.title, std?.titleVars);
        const heading = custom ? <CustomTitle id={id} title={custom.title} /> : <T k={title!.key} d={title!.title} v={std?.titleVars} />;
        const showDrop = drop?.id === id && dragging && dragging !== id;
        return (
          <div key={id}>
            <section
              data-section={id}
              data-print-auto={std?.className ?? ''}
              className={`group/sec relative mb-8 ${printClass(id, k, std?.className)} ${dragging === id ? 'opacity-40' : ''}`}
            >
              {showDrop && <div data-edit-ui className={`no-print absolute inset-x-0 h-0.5 rounded bg-teton-blue ${drop!.after ? '-bottom-3' : '-top-3'}`} />}
              <div
                // Press and drag the heading to move the section (desktop). Disarmed while typing in it.
                data-drag-handle={editable ? id : undefined}
                onPointerDown={(e) => {
                  if (!editable || e.button !== 0 || e.pointerType === 'touch') return;
                  const t = e.target as HTMLElement;
                  if (t.closest('button')) return;
                  // Already typing in this heading: let the press select text instead.
                  const a = document.activeElement;
                  if (a && a !== document.body && e.currentTarget.contains(a) && t.closest('[contenteditable="true"]') === a) return;
                  press.current = { id, x: e.clientX, y: e.clientY };
                }}
                className={editable ? 'cursor-grab' : ''}
              >
                {editable && (
                  <div data-edit-ui className="no-print absolute -left-9 top-0.5 hidden md:flex flex-col items-center gap-1 opacity-0 group-hover/sec:opacity-100 transition-opacity">
                    <span className="w-6 h-6 flex items-center justify-center rounded text-teton-ui-gray hover:bg-teton-off-white" title="Drag to move this section" aria-hidden="true">
                      <GripIcon />
                    </span>
                  </div>
                )}
                {editable && (
                  <button
                    type="button"
                    data-edit-ui
                    className="no-print absolute right-0 md:-right-9 top-0.5 w-6 h-6 flex items-center justify-center rounded-full bg-teton-near-black text-white opacity-0 group-hover/sec:opacity-100 focus:opacity-100 transition-opacity shadow"
                    title={custom ? 'Delete this section' : 'Remove this section (you can add it back)'}
                    aria-label={`Remove section ${label}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => remove(id)}
                  >
                    <MinusIcon />
                  </button>
                )}
                <H2>{heading}</H2>
              </div>
              {custom ? <RichBody id={id} html={custom.html} /> : std!.body}
            </section>
            {editable && <AddZone at={insertAt(k + 1)} />}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Removed sections and figures, with Add back.                        */
/* ------------------------------------------------------------------ */

/** `bothPricing`: the proposal shows both pricing options, so the comparison's optional rows can be added from here. */
export function RemovedPanel({ bothPricing = false, bare = false, onCount }: { bothPricing?: boolean; /** Without its card (inside the phone sheet). */ bare?: boolean; /** Reports how many things are removed. */ onCount?: (n: number) => void } = {}) {
  const { editable, layout, setLayout, edits } = useProposalText();
  const { labels } = useContext(LabelsCtx);
  // The tables on the page now (checked after each render).
  const [presentTables, setPresentTables] = useState<string[]>([]);
  const onCountRef = useRef(onCount);
  onCountRef.current = onCount;
  // Desktop: the page (and table) under the pointer narrows the list to what can be added back there. Moving
  // onto the panel keeps it; resting on the background for a moment shows everything again.
  const [focus, setFocus] = useState<{ page: string | null; table: string | null } | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (bare || typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let clear: ReturnType<typeof setTimeout> | null = null;
    const over = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || panelRef.current?.contains(el)) {
        if (clear) clearTimeout(clear);
        return;
      }
      const page = el.closest<HTMLElement>('[data-bc-page]')?.dataset.bcPage ?? null;
      const table = el.closest<HTMLElement>('table[data-rtable]')?.dataset.rtable ?? null;
      if (page || table) {
        if (clear) clearTimeout(clear);
        setFocus((f) => (f?.page === page && f?.table === table ? f : { page, table }));
      } else if (!clear) {
        clear = setTimeout(() => {
          clear = null;
          setFocus(null);
        }, 700);
      }
    };
    document.addEventListener('pointerover', over);
    return () => {
      document.removeEventListener('pointerover', over);
      if (clear) clearTimeout(clear);
    };
  }, [bare]);
  useEffect(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>('table[data-rtable]')).map((t) => t.dataset.rtable ?? '').sort();
    if (ids.join() !== presentTables.join()) setPresentTables(ids);
  }, [layout, edits, presentTables]);
  // (Counted after render; reported to the phone's Removed button.)
  const totalRef = useRef(0);
  useEffect(() => {
    onCountRef.current?.(totalRef.current);
  });
  if (!editable) return null;
  const businessCase = layout.format === 'businessCase';
  // The business-case format arranges pages instead of sections.
  const sections = businessCase ? [] : layout.hiddenSections.filter((id): id is StandardSection => id in SECTION_TITLES);
  const pages = businessCase ? removedBcPages(bcPagesOf(layout)) : [];
  const values = layout.hiddenValues;
  // Business case: sections removed from inside its pages, with their page's name.
  const PAGE_OF: Record<string, string> = { 'scope-capex': 'scope', 'scope-both': 'scope', 'roi-both': 'roi', 'cashflow-both': 'cashflow' };
  const blocks = businessCase
    ? Object.entries(layout.bcHiddenBlocks ?? {}).flatMap(([page, m]) =>
        Object.entries(m).map(([id, label]) => ({ page, id, label, where: (BC_PAGE_TITLES as Record<string, string>)[PAGE_OF[page] ?? page] ?? page })),
      )
    : [];
  // Optional rows that start out removed (shown in the Removed list until added).
  const optional: Array<{ key: string; label: string; page: string; add: (l: ProposalLayout) => ProposalLayout }> = businessCase
    ? [
        ...(bothPricing && !layout.bcFourYears ? [{ key: 'fourYears', label: 'Four years from go-live · The investment', page: 'scope', add: (l: ProposalLayout) => ({ ...l, bcFourYears: true as const }) }] : []),
        ...(!layout.bcExecHardware ? [{ key: 'execHardware', label: 'What gets installed · Executive summary', page: 'execsum', add: (l: ProposalLayout) => ({ ...l, bcExecHardware: true as const }) }] : []),
      ]
    : [];
  const rows = Object.entries(layout.hiddenRows ?? {});
  // Columns that start out removed are listed only when their table is on the page.
  const cols = Object.entries(hiddenColsOf(layout)).filter(([k]) => !(k in DEFAULT_HIDDEN_COLS) || presentTables.includes(k.split('.')[0]));
  const total = sections.length + values.length + pages.length + blocks.length + optional.length + rows.length + cols.length;
  totalRef.current = total;
  // What belongs to the hovered table, or else the hovered page (rows and columns go with their table's page).
  const pageOfTable = (key: string) => {
    if (typeof document === 'undefined') return null;
    const t = document.querySelector<HTMLElement>(`table[data-rtable="${CSS.escape(key.split('.')[0])}"]`);
    return t?.closest<HTMLElement>('[data-bc-page]')?.dataset.bcPage ?? null;
  };
  const filtered = (() => {
    if (!focus || bare) return null;
    const inTable = (k: string) => !!focus.table && k.split('.')[0] === focus.table;
    const onPage = (k: string) => !!focus.page && pageOfTable(k) === focus.page;
    let r = rows.filter(([k]) => inTable(k));
    let c = cols.filter(([k]) => inTable(k));
    let b: typeof blocks = [];
    let o: typeof optional = [];
    let where = focus.table ? 'this table' : '';
    if (!r.length && !c.length) {
      r = rows.filter(([k]) => onPage(k));
      c = cols.filter(([k]) => onPage(k));
      b = blocks.filter((x) => (PAGE_OF[x.page] ?? x.page) === focus.page);
      o = optional.filter((x) => focus.page === x.page);
      where = focus.page ? (BC_PAGE_TITLES as Record<string, string>)[focus.page] ?? 'this page' : '';
    }
    if (!r.length && !c.length && !b.length && !o.length) return null;
    return { rows: r, cols: c, blocks: b, optional: o, where };
  })();
  if (!total) return bare ? <p className="px-2 py-6 text-center text-sm text-teton-ui-gray">Nothing has been removed from this proposal.</p> : null;
  const showSections = filtered ? [] : sections;
  const showPages = filtered ? [] : pages;
  const showValues = filtered ? [] : values;
  const showBlocks = filtered ? filtered.blocks : blocks;
  const showOptional = filtered ? filtered.optional : optional;
  const showRows = filtered ? filtered.rows : rows;
  const showCols = filtered ? filtered.cols : cols;
  const item = (key: string, label: string, onClick: () => void) => (
    <li key={key}>
      <button type="button" onClick={onClick} className="w-full flex items-start gap-2 text-left rounded-md px-2 py-1.5 text-[13px] hover:bg-teton-off-white" title="Add back to the proposal">
        <span className="mt-0.5 w-4 h-4 flex-shrink-0 flex items-center justify-center rounded-full border border-teton-pale-gray text-teton-dark-gray">
          <PlusIcon />
        </span>
        <span className="min-w-0">{label}</span>
      </button>
    </li>
  );
  return (
    <aside ref={panelRef} data-edit-ui className={bare ? 'no-print' : 'no-print rounded-xl border border-teton-pale-gray bg-white p-3 shadow-sm'} aria-label="Removed from this proposal">
      {!bare && (
        <p className="flex items-baseline gap-1.5 text-xs font-semibold uppercase tracking-wider text-teton-ui-gray px-2 mb-1">
          Removed
          {filtered && (
            <span key={filtered.where} className="normal-case tracking-normal font-medium text-[11px] text-[#1F5FB5] truncate drawer-in">· {filtered.where}</span>
          )}
        </p>
      )}
      <div key={filtered ? `f:${filtered.where}` : 'all'} className="[animation:fadeIn_.2s_ease-out] motion-reduce:[animation:none]">
      {showSections.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Sections</p>
          <ul>
            {showSections.map((id) =>
              item(id, renderText(edits[SECTION_TITLES[id].key] ?? SECTION_TITLES[id].title).replace(/\{\w+\}\s*/g, ''), () => setLayout((l) => ({ ...l, hiddenSections: l.hiddenSections.filter((x) => x !== id) }))),
            )}
          </ul>
        </>
      )}
      {showPages.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Pages</p>
          <ul>
            {showPages.map((id) => item(`page-${id}`, BC_PAGE_TITLES[id], () => setLayout((l) => ({ ...l, bcPages: addBackBcPage(bcPagesOf(l), id) }))))}
          </ul>
        </>
      )}
      {showBlocks.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Page sections</p>
          <ul>
            {showBlocks.map((b) =>
              item(`block-${b.page}-${b.id}`, `${b.label} · ${b.where}`, () =>
                setLayout((l) => {
                  const all = { ...(l.bcHiddenBlocks ?? {}) };
                  const m = { ...(all[b.page] ?? {}) };
                  delete m[b.id];
                  if (Object.keys(m).length) all[b.page] = m;
                  else delete all[b.page];
                  return { ...l, bcHiddenBlocks: all };
                }),
              ),
            )}
          </ul>
        </>
      )}
      {showOptional.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Optional</p>
          <ul>{showOptional.map((o) => item(o.key, o.label, () => setLayout(o.add)))}</ul>
        </>
      )}
      {showRows.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Table rows</p>
          <ul>
            {showRows.map(([k, label]) =>
              item(`row-${k}`, label, () =>
                setLayout((l) => {
                  const m = { ...(l.hiddenRows ?? {}) };
                  delete m[k];
                  return { ...l, hiddenRows: Object.keys(m).length ? m : undefined };
                }),
              ),
            )}
          </ul>
        </>
      )}
      {showCols.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Table columns</p>
          <ul>
            {showCols.map(([k, label]) =>
              item(`col-${k}`, label, () =>
                setLayout((l) => {
                  if (k in DEFAULT_HIDDEN_COLS) return { ...l, shownCols: Array.from(new Set([...(l.shownCols ?? []), k])) };
                  const m = { ...(l.hiddenCols ?? {}) };
                  delete m[k];
                  const table = k.split('.')[0];
                  const w = { ...(l.colWidths ?? {}) };
                  if (!Object.keys(m).some((x) => x.split('.')[0] === table)) for (const x of Object.keys(w)) if (x.split('.')[0] === table) delete w[x];
                  return { ...l, hiddenCols: Object.keys(m).length ? m : undefined, colWidths: Object.keys(w).length ? w : undefined };
                }),
              ),
            )}
          </ul>
        </>
      )}
      {showValues.length > 0 && (
        <>
          <p className="text-[11px] text-teton-ui-gray px-2 mt-2">Figures</p>
          <ul>
            {showValues.map((k) => item(k, labels[k] ?? k, () => setLayout((l) => ({ ...l, hiddenValues: l.hiddenValues.filter((x) => x !== k) }))))}
          </ul>
        </>
      )}
      </div>
    </aside>
  );
}

/**
 * Phones: a Removed button for the toolbar; it opens a sheet from the bottom with everything removed from the
 * proposal, to add back (the side panel is hidden on phones).
 */
export function RemovedSheetButton({ bothPricing = false }: { bothPricing?: boolean }) {
  const { editable } = useProposalText();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 200);
  };
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);
  if (!editable) return null;
  return (
    <>
      {/* Counts what's removed even while closed (renders nothing visible). */}
      {!open && (
        <div className="hidden" aria-hidden="true">
          <RemovedPanel bothPricing={bothPricing} bare onCount={(n) => n !== count && setCount(n)} />
        </div>
      )}
      <button type="button" className="sm:hidden inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-white/30 hover:bg-white/10" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        Removed
        {count > 0 && <span className="inline-flex min-w-[18px] h-[18px] px-1 items-center justify-center rounded-full bg-white text-teton-ink text-[10.5px] font-bold">{count}</span>}
      </button>
      {open && (
        <div className="sm:hidden fixed inset-0 z-[80] no-print" role="dialog" aria-modal="true" aria-label="Removed from this proposal">
          <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${closing ? 'opacity-0' : 'opacity-100 [animation:fadeIn_.2s_ease-out]'}`} onClick={close} />
          <div
            className="absolute inset-x-0 bottom-0 max-h-[80dvh] flex flex-col rounded-t-2xl bg-white text-teton-ink shadow-[0_-12px_36px_rgba(0,0,0,.25)] transition-transform duration-200 ease-in motion-reduce:transition-none [animation:sheetUp_.25s_ease-out] motion-reduce:[animation:none]"
            style={closing ? { transform: 'translateY(100%)' } : undefined}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-teton-pale-gray" aria-hidden="true" />
            <div className="flex items-center gap-2 px-4 pt-2 pb-2 border-b border-teton-off-white">
              <p className="font-semibold">Removed</p>
              <span className="text-xs text-teton-ui-gray">Tap one to add it back</span>
              <button type="button" className="ml-auto w-8 h-8 rounded-md text-teton-ui-gray hover:bg-teton-almost-white" aria-label="Close" onClick={close}>✕</button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-2 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <RemovedPanel bothPricing={bothPricing} bare onCount={(n) => n !== count && setCount(n)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

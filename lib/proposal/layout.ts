/**
 * Proposal layout a rep can change for one version: section order, removed
 * standard sections, removed figures, and added free-form sections. Stored
 * next to the wording edits; the numbers themselves never change.
 */

/** Standard sections, in their default order. The header and intro always stay on top. */
export const STANDARD_SECTIONS = ['scope', 'terms', 'implementation', 'resources', 'summary', 'roi', 'assumptions'] as const;

/** The default order before Nov 2026 (summary first). Saved layouts still in it move to the new default once. */
const OLD_DEFAULT = ['summary', 'scope', 'terms', 'implementation', 'resources', 'roi', 'assumptions'];
const LAYOUT_VERSION = 2;
export type StandardSection = (typeof STANDARD_SECTIONS)[number];

export type ProposalFormat = 'standard' | 'businessCase';

export interface CustomSection {
  title: string;
  /** Sanitized rich text (bold, italic, underline, lists, indents, size, color). */
  html: string;
}

export interface ProposalLayout {
  /** Every section id in display order: standard ids and custom ids ("custom-…"). */
  order: string[];
  /** Standard sections the rep removed (can be added back). */
  hiddenSections: string[];
  /** Figures the rep removed, by key (can be added back). */
  hiddenValues: string[];
  custom: Record<string, CustomSection>;
  /**
   * Printed pages chosen by the rep: the sections that start a new page (the
   * first section always starts page 1). Null = the browser breaks pages itself.
   */
  pageStarts?: string[] | null;
  /** Document style: the standard proposal, or the business-case layout (cover page, stat cards). */
  format?: ProposalFormat;
  /**
   * Business-case format: its pages in order (built-in page ids and added
   * pages). Null = the standard set, following the sections kept above.
   */
  bcPages?: string[] | null;
  /** Business-case format: pages the rep added (formatted text), by id ("bcpage-…"). */
  bcCustom?: Record<string, CustomSection>;
  /** Business-case format: the order of the sections within each page, by page. */
  bcBlocks?: Record<string, string[]>;
  /** Business-case format: sections removed from each page (page → section id → its name, to list it for adding back). */
  bcHiddenBlocks?: Record<string, Record<string, string>>;
  /** Business-case format: the cash flow chart's style (standard bars by default). */
  bcChart?: 'bar' | 'stacked';
  /** Business-case format: the implementation stages as cards (default) or a Gantt chart with a description list. */
  bcImpl?: 'cards' | 'gantt';
  /** Business case, several pilot go-lives, cards view: dates in each card (default) or one schedule table above them. */
  bcImplWaves?: 'dates' | 'schedule';
  /** Business-case format: the callout under the returns table, asset value (default) or fall risk. */
  bcRoiCallout?: 'asset' | 'fall';
  /** Business-case format: a customer quote at the bottom of that callout. */
  bcRoiQuote?: boolean;
  /** Business-case format: Executive Summary cards that span both columns. */
  bcExecWide?: string[];
  /** Business case, both pricing options: show the 'Four years from go-live' row (off by default). */
  bcFourYears?: boolean;
  /** Business case, both pricing options: the cash flow comparison as bars (default) or lines. */
  bcCompareChart?: 'bar' | 'line';
  /** Business case, equipment purchase: the overview cards as the summary (default) or unit prices. */
  bcInvCards?: 'units';
  /** Table rows the rep removed (row key → its name, to list it for adding back). Both formats. */
  hiddenRows?: Record<string, string>;
  /** 2 = saved with the current default order in mind. */
  version?: number;
}

export const DEFAULT_LAYOUT: ProposalLayout = { order: [...STANDARD_SECTIONS], hiddenSections: [], hiddenValues: [], custom: {}, pageStarts: null, format: 'standard', bcPages: null, bcCustom: {}, version: LAYOUT_VERSION };

/** The business-case format's built-in pages, in their standard order. */
export const BC_PAGES = ['cover', 'execsum', 'contents', 'sitescope', 'pilot', 'scope', 'roi', 'summary', 'cashflow', 'implementation', 'resources', 'roledesc', 'terms', 'assumptions'] as const;
export const isBcCustomId = (id: string) => id.startsWith('bcpage-');

const ID = /^[a-z0-9][a-z0-9_.-]{0,79}$/i;
export const isCustomId = (id: string) => id.startsWith('custom-');
const MAX_HTML = 50_000;

/**
 * Validate a stored or submitted layout. `cleanHtml` sanitizes custom-section
 * bodies (sanitize-html on the server; the identity on trusted reads).
 */
export function sanitizeLayout(input: unknown, cleanHtml: (html: string) => string): ProposalLayout {
  if (input == null) return structuredClone(DEFAULT_LAYOUT);
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Layout must be an object');
  const raw = input as Record<string, unknown>;
  const ids = (v: unknown, max: number) => {
    if (v == null) return [];
    if (!Array.isArray(v) || v.length > max) throw new Error('Bad layout list');
    return Array.from(new Set(v.map((x) => {
      if (typeof x !== 'string' || !ID.test(x)) throw new Error('Bad layout id');
      return x;
    })));
  };

  const parseCustom = (v: unknown, isId: (id: string) => boolean): Record<string, CustomSection> => {
    const out: Record<string, CustomSection> = {};
    if (v == null) return out;
    if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Bad custom sections');
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length > 30) throw new Error('Too many added sections');
    for (const [id, e] of entries) {
      if (!isId(id) || !ID.test(id)) throw new Error('Bad section id');
      const c = e as Record<string, unknown>;
      if (!c || typeof c.title !== 'string' || typeof c.html !== 'string') throw new Error('Bad added section');
      if (c.title.length > 200 || c.html.length > MAX_HTML) throw new Error('Added section is too long');
      out[id] = { title: c.title, html: cleanHtml(c.html) };
    }
    return out;
  };
  const custom = parseCustom(raw.custom, isCustomId);
  const bcCustom = parseCustom(raw.bcCustom, isBcCustomId);
  const bcKnown = new Set<string>([...BC_PAGES, ...Object.keys(bcCustom)]);

  // Order: keep known ids once and drop unknown ones. A standard section missing from a saved order (e.g. one
  // added to the template later) goes in after the standard section it normally follows; custom ones go last.
  const known = new Set<string>([...STANDARD_SECTIONS, ...Object.keys(custom)]);
  const order = ids(raw.order, 60).filter((id) => known.has(id));
  STANDARD_SECTIONS.forEach((id, i) => {
    if (order.includes(id)) return;
    const before = STANDARD_SECTIONS.slice(0, i).reverse().find((p) => order.includes(p));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  });
  for (const id of Object.keys(custom)) if (!order.includes(id)) order.push(id);

  // A layout saved before the default order changed, and still in the old default order (never rearranged):
  // move it to the new default, keeping each added section after the standard section it followed.
  let finalOrder = order;
  if ((Number(raw.version) || 1) < LAYOUT_VERSION && order.filter((id) => !isCustomId(id)).join() === OLD_DEFAULT.join()) {
    const leading = order.slice(0, order.findIndex((id) => !isCustomId(id)));
    const after = (std: string) => {
      const i = order.indexOf(std);
      const out: string[] = [];
      for (let j = i + 1; j < order.length && isCustomId(order[j]); j++) out.push(order[j]);
      return out;
    };
    finalOrder = [...leading, ...STANDARD_SECTIONS.flatMap((id) => [id, ...after(id)])];
  }

  return {
    version: LAYOUT_VERSION,
    order: finalOrder,
    hiddenSections: ids(raw.hiddenSections, 10).filter((id) => (STANDARD_SECTIONS as readonly string[]).includes(id)),
    hiddenValues: ids(raw.hiddenValues, 200),
    custom,
    pageStarts: raw.pageStarts == null ? null : ids(raw.pageStarts, 60).filter((id) => finalOrder.includes(id)),
    format: raw.format === 'businessCase' ? 'businessCase' : 'standard',
    bcPages: raw.bcPages == null ? null : ids(raw.bcPages, 60).filter((id) => bcKnown.has(id)),
    bcCustom,
    bcBlocks: (() => {
      const v = raw.bcBlocks;
      if (v == null) return {};
      if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Bad page sections');
      const out: Record<string, string[]> = {};
      for (const [page, list] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
        if (!ID.test(page)) throw new Error('Bad page id');
        out[page] = ids(list, 20);
      }
      return out;
    })(),
    bcChart: raw.bcChart === 'stacked' ? 'stacked' : undefined,
    bcImpl: raw.bcImpl === 'gantt' ? 'gantt' : undefined,
    bcImplWaves: raw.bcImplWaves === 'schedule' ? 'schedule' : undefined,
    bcRoiCallout: raw.bcRoiCallout === 'fall' ? 'fall' : undefined,
    bcRoiQuote: raw.bcRoiQuote === true ? true : undefined,
    bcExecWide: raw.bcExecWide == null ? undefined : ids(raw.bcExecWide, 20),
    bcFourYears: raw.bcFourYears === true ? true : undefined,
    bcCompareChart: raw.bcCompareChart === 'line' ? 'line' : undefined,
    bcInvCards: raw.bcInvCards === 'units' ? 'units' : undefined,
    bcHiddenBlocks: (() => {
      const v = raw.bcHiddenBlocks;
      if (v == null) return {};
      if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Bad removed sections');
      const out: Record<string, Record<string, string>> = {};
      for (const [page, m] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
        if (!ID.test(page) || !m || typeof m !== 'object' || Array.isArray(m)) throw new Error('Bad removed sections');
        const inner: Record<string, string> = {};
        for (const [id, label] of Object.entries(m as Record<string, unknown>).slice(0, 20)) {
          if (!ID.test(id) || typeof label !== 'string') throw new Error('Bad removed section');
          inner[id] = label.slice(0, 80);
        }
        if (Object.keys(inner).length) out[page] = inner;
      }
      return out;
    })(),
    hiddenRows: (() => {
      const v = raw.hiddenRows;
      if (v == null) return undefined;
      if (typeof v !== 'object' || Array.isArray(v)) throw new Error('Bad removed rows');
      const out: Record<string, string> = {};
      for (const [id, label] of Object.entries(v as Record<string, unknown>).slice(0, 200)) {
        if (!ID.test(id) || typeof label !== 'string') throw new Error('Bad removed row');
        out[id] = label.slice(0, 80);
      }
      return Object.keys(out).length ? out : undefined;
    })(),
  };
}

/** Number of ways a layout differs from the standard one (for the toolbar). */
export function layoutChanges(l: ProposalLayout): number {
  const reordered = l.order.filter((id) => !isCustomId(id)).join() !== STANDARD_SECTIONS.join() ? 1 : 0;
  return reordered + l.hiddenSections.length + l.hiddenValues.length + Object.keys(l.custom).length + (l.pageStarts ? 1 : 0) + (l.bcPages ? 1 : 0) + Object.keys(l.bcCustom ?? {}).length + (Object.keys(l.bcBlocks ?? {}).length ? 1 : 0) + Object.values(l.bcHiddenBlocks ?? {}).reduce((n, m) => n + Object.keys(m).length, 0) + Object.keys(l.hiddenRows ?? {}).length;
}

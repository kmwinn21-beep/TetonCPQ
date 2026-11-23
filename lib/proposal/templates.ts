/**
 * Business case templates: a saved business-case layout and wording (never numbers). Saved from a deal's business
 * case or built on the Templates page; applied to any deal's business case, where its figures fill it in.
 */
import type { QuoteDraft } from '@/lib/quote/draft';
import type { TextEdits } from './text';
import type { ProposalLayout } from './layout';

export interface TemplateContent {
  /** Business case wording (keys "bc.…"), with deal names and counts as {placeholders}. */
  edits: TextEdits;
  /** Business case parts of the layout. */
  layout: Partial<ProposalLayout>;
}

/** Text placeholders a template's wording can use; each deal fills them in. */
export const PLACEHOLDERS = [
  ['customer', 'Customer name'],
  ['communities', 'Number of communities'],
  // Not {beds}: some built-in wording already has a {beds} value ("169 beds").
  ['bedCount', 'Number of beds'],
] as const;
export type DealVars = Record<(typeof PLACEHOLDERS)[number][0], string>;

const bedsOf = (c: QuoteDraft['communities'][number]) => (c.ilBeds ?? 0) + (c.alBeds ?? 0) + (c.mcBeds ?? 0) + (c.snfBeds ?? 0);
export function dealVars(draft: Pick<QuoteDraft, 'customerName' | 'communities'>): DealVars {
  return {
    customer: draft.customerName ?? '',
    communities: String(draft.communities?.length ?? 0),
    bedCount: draft.communities?.reduce((s, c) => s + bedsOf(c), 0).toLocaleString('en-US') ?? '0',
  };
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Swap a deal's name and counts for placeholders: "ABC Senior Living" → {customer}, "3 communities" →
 * "{communities} communities", "305 beds" → "{bedCount} beds". Counts only next to their word, so other numbers stay.
 */
export function toPlaceholders(text: string, v: DealVars): string {
  let out = text;
  if (v.customer.trim().length >= 3) out = out.replace(new RegExp(esc(v.customer.trim()), 'g'), '{customer}');
  if (v.communities) out = out.replace(new RegExp(`\\b${esc(v.communities)}(\\s+(?:communities|community))\\b`, 'gi'), '{communities}$1');
  if (v.bedCount && v.bedCount !== '0') out = out.replace(new RegExp(`(?<![\\d,.])${esc(v.bedCount)}(\\s+(?:[A-Za-z/]+\\s+)?beds?)\\b`, 'gi'), '{bedCount}$1');
  return out;
}

/** Layout parts that belong to page structure (pages, their order, sections). */
const PAGE_KEYS = ['bcPages', 'bcCustom', 'bcBlocks', 'bcHiddenBlocks', 'bcGaps', 'bcExecWide'] as const;
/** Layout parts for tables, figures and view switches. */
const TABLE_KEYS = [
  'hiddenRows', 'hiddenCols', 'shownCols', 'colWidths', 'colOrder', 'hiddenValues', 'bcCompact',
  'bcChart', 'bcImpl', 'bcImplWaves', 'bcRoiCallout', 'bcRoiQuote', 'bcFourYears', 'bcCompareChart', 'bcInvCards', 'bcExecInv', 'bcExecHardware', 'bcSiteCare', 'bcSiteAreas', 'bcSiteCards', 'bcHwLayout', 'bcExecComm', 'bcExecSystem', 'bcExecUnitsFor', 'bcExecNoPageRefs', 'bcCompareCosts', 'bcOpexCards', 'bcSiteRows', 'bcPilotFees',
] as const;
export const TEMPLATE_LAYOUT_KEYS = [...PAGE_KEYS, ...TABLE_KEYS] as const;

export interface Include {
  pages: boolean;
  tables: boolean;
  wording: boolean;
  /** Added pages keep their body text (their headings are always kept). */
  customText: boolean;
}
export const INCLUDE_ALL: Include = { pages: true, tables: true, wording: true, customText: true };

/** A template from a deal's business case: its business-case layout and wording, deal names swapped for placeholders. */
export function templateFrom(edits: TextEdits, layout: ProposalLayout, vars: DealVars, include: Include = INCLUDE_ALL): TemplateContent {
  const out: Partial<ProposalLayout> = {};
  const src = layout as unknown as Record<string, unknown>;
  const dst = out as unknown as Record<string, unknown>;
  const empty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && v !== null && !Array.isArray(v) && !Object.keys(v).length);
  for (const k of [...(include.pages ? PAGE_KEYS : []), ...(include.tables ? TABLE_KEYS : [])]) if (!empty(src[k])) dst[k] = structuredClone(src[k]);
  // Settings tied to this deal's own communities (e.g. a removed "floor plan missing" note) mean nothing elsewhere.
  if (out.hiddenValues) out.hiddenValues = out.hiddenValues.filter((k) => !k.startsWith('fp.'));
  if (out.hiddenValues && !out.hiddenValues.length) delete out.hiddenValues;
  if (out.bcCustom && !include.customText) out.bcCustom = Object.fromEntries(Object.entries(out.bcCustom).map(([id, c]) => [id, { ...c, html: '' }]));
  const wording: TextEdits = {};
  if (include.wording) for (const [k, t] of Object.entries(edits)) if (k.startsWith('bc.')) wording[k] = toPlaceholders(t, vars);
  return { edits: wording, layout: out };
}

export type ApplyMode = 'all' | 'layout';
/**
 * A deal's business case formatted from a template. 'all': the template's layout and wording replace the business
 * case's (the standard format's wording and layout are left alone). 'layout': only the layout; the deal's wording
 * stays.
 */
export function applyTemplate(current: { edits: TextEdits; layout: ProposalLayout }, tpl: TemplateContent, mode: ApplyMode, ref: { id: number; name: string }): { edits: TextEdits; layout: ProposalLayout } {
  const layout = { ...current.layout } as unknown as Record<string, unknown>;
  for (const k of TEMPLATE_LAYOUT_KEYS) delete layout[k];
  Object.assign(layout, structuredClone(tpl.layout));
  layout.format = 'businessCase';
  layout.bcTemplate = { id: ref.id, name: ref.name, wording: mode === 'all' ? true : undefined };
  if (layout.bcPages === undefined) layout.bcPages = null;
  if (layout.bcCustom === undefined) layout.bcCustom = {};
  if (layout.hiddenValues === undefined) layout.hiddenValues = [];
  let edits = current.edits;
  if (mode === 'all') {
    edits = Object.fromEntries(Object.entries(current.edits).filter(([k]) => !k.startsWith('bc.')));
    Object.assign(edits, tpl.edits);
  }
  return { edits, layout: layout as unknown as ProposalLayout };
}

/**
 * The standard business case: template and business-case layout changes removed (the standard format's own layout
 * and wording kept), with every field the page expects present.
 */
export function standardBusinessCase(current: { edits: TextEdits; layout: ProposalLayout }): { edits: TextEdits; layout: ProposalLayout } {
  const layout = { ...current.layout } as unknown as Record<string, unknown>;
  for (const k of TEMPLATE_LAYOUT_KEYS) delete layout[k];
  delete layout.bcTemplate;
  Object.assign(layout, { hiddenValues: [], bcPages: null, bcCustom: {}, bcBlocks: {}, bcHiddenBlocks: {}, bcGaps: {} });
  const edits = Object.fromEntries(Object.entries(current.edits).filter(([k]) => !k.startsWith('bc.')));
  return { edits, layout: layout as unknown as ProposalLayout };
}

/** Whether a business case still matches the template it was formatted from (layout and business case wording). */
export function matchesTemplate(current: { edits: TextEdits; layout: ProposalLayout }, tpl: TemplateContent): boolean {
  const norm = (v: unknown) => JSON.stringify(v ?? null, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined && !(Array.isArray(y) && y.length === 0) && !(y && typeof y === 'object' && !Array.isArray(y) && !Object.keys(y).length)).sort(([a], [b]) => a.localeCompare(b))) : x));
  const pick = (l: Partial<ProposalLayout>) => Object.fromEntries(TEMPLATE_LAYOUT_KEYS.map((k) => [k, (l as Record<string, unknown>)[k]]));
  const bcEdits = Object.fromEntries(Object.entries(current.edits).filter(([k]) => k.startsWith('bc.')));
  // Applied for its layout only: the deal's own wording doesn't count as a change.
  const sameWording = !current.layout.bcTemplate?.wording || norm(bcEdits) === norm(tpl.edits);
  return norm(pick(current.layout)) === norm(pick(tpl.layout)) && sameWording;
}

/** How many pages a template lays out (null: the standard set). */
export const templatePages = (t: TemplateContent) => (Array.isArray(t.layout.bcPages) ? t.layout.bcPages.length : null);

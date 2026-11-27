/**
 * Terms / Notes: the bullet points under the proposal's terms. The standard
 * terms are written from the deal (pilot length and rate, service term,
 * install credit, intro rate, billing); a rep can reword, remove, reorder
 * them, or add their own notes. Figures in the standard wording are {tokens}
 * filled from the deal, so they stay right when pricing changes, even in a
 * reworded term.
 *
 * Stored on the draft as `terms`: null means "standard terms".
 */
import { pricedDraft } from '@/lib/pricing/lineup';
import { POLICY } from '@/lib/pricing/catalog';
import { usd } from '@/lib/format';
import { renderText } from '@/lib/proposal/text';
import type { QuoteDraft } from './draft';

export const STANDARD_TERM_IDS = ['pilot', 'service', 'credit', 'intro', 'billing'] as const;
export type StandardTermId = (typeof STANDARD_TERM_IDS)[number];

/**
 * Two lists work the same way: the Terms / Notes, and the Next Steps (shown on
 * the business case). Each has its standard items, stored edits on the draft
 * (`terms` / `nextSteps`, null = standard) and the same reword / remove /
 * reorder / add operations.
 */
export type ListKind = 'terms' | 'nextSteps';
export const STANDARD_STEP_IDS = ['confirm', 'survey', 'finish', 'agreement'] as const;
export type StandardStepId = (typeof STANDARD_STEP_IDS)[number];
const FIELD: Record<ListKind, 'terms' | 'nextSteps'> = { terms: 'terms', nextSteps: 'nextSteps' };
const STD_IDS: Record<ListKind, readonly string[]> = { terms: STANDARD_TERM_IDS, nextSteps: STANDARD_STEP_IDS };

export interface TermsSetting {
  /** Display order (standard ids and "custom-…" ids). Standard terms missing from it go in their usual place. */
  order: string[];
  /** Reworded or custom text, by id. Standard terms without an entry use the standard wording. */
  text: Record<string, string>;
  /** Standard terms the rep removed. */
  removed: string[];
}

export interface ResolvedTerm {
  id: string;
  /** Wording with {tokens}. */
  template: string;
  /** Values for the tokens, from the deal. */
  vars: Record<string, string>;
  /** Standard wording (for standard terms), to reset one term. */
  standard: string | null;
  custom: boolean;
  edited: boolean;
}

export const TERM_LABEL: Record<StandardTermId, string> = {
  pilot: 'Pilot',
  service: 'Service term',
  credit: 'Installation credit',
  intro: 'Introductory rate',
  billing: 'Billing',
};
export const STEP_LABEL: Record<StandardStepId, string> = {
  confirm: 'Room list',
  survey: 'Site survey',
  finish: 'Installation finish',
  agreement: 'Agreement',
};
/** Label of a standard item in either list. */
export const itemLabel = (kind: ListKind, id: string): string => (kind === 'terms' ? TERM_LABEL[id as StandardTermId] : STEP_LABEL[id as StandardStepId]) ?? id;

const ID = /^[a-z][a-z0-9-]{0,40}$/;
const MAX_TERMS = 30;
const MAX_TEXT = 1000;
const isStandardId = (id: string, kind: ListKind = 'terms'): boolean => STD_IDS[kind].includes(id);

/** The deal has pilot sites (a pilot phase and at least one pilot community). */
const hasPilot = (d: QuoteDraft) => !!d.schedule?.withPilot && (d.communities ?? []).some((c) => c?.pilot);

/** Standard next steps for this deal, in their usual order. */
function standardSteps(d: QuoteDraft): Array<{ id: string; template: string; vars: Record<string, string> }> {
  const concealed = !!d.commercial?.finish?.concealed;
  return [
    { id: 'confirm', template: 'You confirm the room list.', vars: {} },
    { id: 'survey', template: `Site survey: confirms quantities${concealed ? ', the installation finish' : ''}, Wi-Fi and power in the rooms.`, vars: {} },
    ...(concealed ? [{ id: 'finish', template: 'You choose the installation finish.', vars: {} }] : []),
    { id: 'agreement', template: 'We send the agreement and a dated plan.', vars: {} },
  ];
}

/** Standard items of a list that apply to this deal, in their usual order, with wording and values. */
export function standardTerms(d: QuoteDraft, kind: ListKind = 'terms'): Array<{ id: string; template: string; vars: Record<string, string> }> {
  if (kind === 'nextSteps') return standardSteps(d);
  const term = POLICY.serviceTermMonths;
  const pilot = hasPilot(d);
  const k = pricedDraft(d).commercial;
  const ecallFree = k.ecall !== 'none' && k.ecallPilotRate === 0;
  const out: Array<{ id: string; template: string; vars: Record<string, string> }> = [];
  if (pilot)
    out.push({
      id: 'pilot',
      template: `Pilot: {pilotMonths} at {pilotRate} per bed per month${ecallFree ? ', with E-Call included at no charge' : ''}, converting to a {term} service term.`,
      vars: { pilotMonths: `${d.schedule.pilotLengthMonths} months`, pilotRate: usd(k.pilotRate), term: `${term}-month` },
    });
  out.push({
    id: 'service',
    template: `Service term of {termMonths} per community, starting ${pilot ? 'when its pilot ends' : 'at go-live'}. Either party may end it for convenience within the first three months of the service term.`,
    vars: { termMonths: `${term} months` },
  });
  if (pilot && k.installCreditPct > 0)
    out.push({
      id: 'credit',
      template: `Installation credit of {credit} on pilot beds${k.sensorCredit && (d.communities ?? []).some((c) => c?.pilot && Number(c.additionalSensors) > 0) ? ' and their additional sensors' : ''}${k.installClawback ? ', repayable if the pilot does not convert to the service term' : ''}.`,
      vars: { credit: `${Math.round(k.installCreditPct * 100)}%` },
    });
  if (k.specialRate != null && k.specialTermMonths > 0)
    out.push({
      id: 'intro',
      template: 'Introductory rate of {rate} per bed for the first {months} of the service term.',
      vars: { rate: usd(k.specialRate, { cents: true }), months: `${k.specialTermMonths} months` },
    });
  out.push({
    id: 'billing',
    template: pilot
      ? 'One-time charges (installation, additional sensors and devices) are billed at each community’s go-live, or at pilot completion for pilot sites; recurring fees are billed quarterly in advance from go-live.'
      : 'Each community’s installation is billed at its go-live; recurring fees are billed quarterly in advance from go-live.',
    vars: {},
  });
  return out;
}

/** Validate a stored or edited setting. Anything unusable becomes "standard terms" (null). */
export function normalizeTerms(input: unknown, kind: ListKind = 'terms'): TermsSetting | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const order = Array.isArray(raw.order) ? Array.from(new Set((raw.order as unknown[]).filter((x): x is string => typeof x === 'string' && ID.test(x)))).slice(0, MAX_TERMS) : [];
  const text: Record<string, string> = {};
  if (raw.text && typeof raw.text === 'object' && !Array.isArray(raw.text)) {
    for (const [id, v] of Object.entries(raw.text as Record<string, unknown>)) {
      if (!ID.test(id) || typeof v !== 'string') continue;
      text[id] = v.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    }
  }
  const removed = Array.isArray(raw.removed) ? Array.from(new Set((raw.removed as unknown[]).filter((x): x is string => typeof x === 'string' && isStandardId(x, kind)))) : [];
  // Custom terms exist only while they're in the order.
  for (const id of Object.keys(text)) if (!isStandardId(id, kind) && !order.includes(id)) delete text[id];
  return { order: order.filter((id) => isStandardId(id, kind) || id in text), text, removed };
}

/** The terms to show, in order: standard ones that apply (unless removed) and custom ones. */
export function resolveTerms(d: QuoteDraft, kind: ListKind = 'terms'): ResolvedTerm[] {
  const std = standardTerms(d, kind);
  const s = normalizeTerms(d[FIELD[kind]], kind);
  const visibleStd = std.filter((t) => !s?.removed.includes(t.id));
  const ids: string[] = (s?.order ?? []).filter((id) => (isStandardId(id, kind) ? visibleStd.some((t) => t.id === id) : true));
  // Standard terms not placed yet (e.g. one that just started to apply) go after the standard term they normally follow.
  visibleStd.forEach((t, i) => {
    if (ids.includes(t.id)) return;
    const before = visibleStd.slice(0, i).reverse().find((p) => ids.includes(p.id));
    ids.splice(before ? ids.indexOf(before.id) + 1 : 0, 0, t.id);
  });
  return ids.map((id) => {
    const st = std.find((t) => t.id === id);
    const text = s?.text[id];
    return {
      id,
      template: text ?? st?.template ?? '',
      vars: st?.vars ?? {},
      standard: st?.template ?? null,
      custom: !st,
      edited: !!st && text != null && text !== st.template,
    };
  });
}

/** Rendered plain text of each term, as shown on the proposal. */
export const termTexts = (d: QuoteDraft, kind: ListKind = 'terms') => resolveTerms(d, kind).map((t) => renderText(t.template, t.vars));

/* ------------------------------------------------------------------ */
/* Changes                                                             */
/* ------------------------------------------------------------------ */

/** Snapshot the current order (so edits keep the order the rep sees). */
function base(d: QuoteDraft, kind: ListKind): TermsSetting {
  const s = normalizeTerms(d[FIELD[kind]], kind) ?? { order: [], text: {}, removed: [] };
  return { ...s, order: resolveTerms(d, kind).map((t) => t.id) };
}

/** Reword a term. Standard wording again clears the edit. */
export function editTerm(d: QuoteDraft, id: string, template: string, kind: ListKind = 'terms'): TermsSetting {
  const s = base(d, kind);
  const st = standardTerms(d, kind).find((t) => t.id === id);
  const text = { ...s.text };
  const clean = template.replace(/\s+/g, ' ').trim();
  if (st && clean === st.template) delete text[id];
  else text[id] = clean;
  return normalizeTerms({ ...s, text }, kind)!;
}

export function removeTerm(d: QuoteDraft, id: string, kind: ListKind = 'terms'): TermsSetting {
  const s = base(d, kind);
  const text = { ...s.text };
  delete text[id];
  return normalizeTerms({ order: s.order.filter((x) => x !== id), text, removed: isStandardId(id, kind) ? [...s.removed, id] : s.removed }, kind)!;
}

/** Add a custom note at the end. Returns the setting and the new id. */
export function addTerm(d: QuoteDraft, text = '', kind: ListKind = 'terms'): { terms: TermsSetting; id: string } {
  const s = base(d, kind);
  const id = `custom-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  // An empty note is kept as a single space until typed in, so it survives normalizing.
  return { terms: normalizeTerms({ ...s, order: [...s.order, id], text: { ...s.text, [id]: text || ' ' } }, kind)!, id };
}

export function moveTerm(d: QuoteDraft, id: string, by: -1 | 1, kind: ListKind = 'terms'): TermsSetting {
  const s = base(d, kind);
  const i = s.order.indexOf(id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= s.order.length) return s;
  const order = [...s.order];
  [order[i], order[j]] = [order[j], order[i]];
  return normalizeTerms({ ...s, order }, kind)!;
}

/** Standard terms the rep removed that would apply to this deal (to add back). */
export function removedTerms(d: QuoteDraft, kind: ListKind = 'terms'): string[] {
  const s = normalizeTerms(d[FIELD[kind]], kind);
  return standardTerms(d, kind)
    .map((t) => t.id)
    .filter((id) => s?.removed.includes(id));
}

export function restoreTerm(d: QuoteDraft, id: string, kind: ListKind = 'terms'): TermsSetting {
  const s = base(d, kind);
  return normalizeTerms({ ...s, removed: s.removed.filter((x) => x !== id) }, kind)!;
}

/** The terms are exactly the standard ones. */
export function isStandardTerms(d: QuoteDraft, kind: ListKind = 'terms'): boolean {
  const r = resolveTerms(d, kind);
  const std = standardTerms(d, kind);
  return r.length === std.length && r.every((t, i) => t.id === std[i].id && !t.edited);
}

/** Plain-language differences between two drafts' terms. */
export function termsChanges(before: QuoteDraft, after: QuoteDraft, kind: ListKind = 'terms'): string[] {
  const a = resolveTerms(before, kind);
  const b = resolveTerms(after, kind);
  const noun = kind === 'terms' ? 'term' : 'step';
  const name = (t: ResolvedTerm) => (t.custom ? `“${renderText(t.template, t.vars).slice(0, 40)}${renderText(t.template, t.vars).length > 40 ? '…' : ''}”` : `${itemLabel(kind, t.id)}${new RegExp(`${noun}$`, 'i').test(itemLabel(kind, t.id)) ? '' : ` ${noun}`}`);
  const out: string[] = [];
  for (const t of a) if (!b.some((x) => x.id === t.id)) out.push(`removed ${name(t)}`);
  for (const t of b) {
    const was = a.find((x) => x.id === t.id);
    if (!was) out.push(`added ${name(t)}`);
    // Wording, not filled-in figures: a pricing change updates the figures but isn't a rewording.
    else if (was.template.trim() !== t.template.trim()) out.push(`reworded ${name(t)}`);
  }
  const keep = (xs: ResolvedTerm[], ys: ResolvedTerm[]) => xs.filter((x) => ys.some((y) => y.id === x.id)).map((x) => x.id).join();
  if (keep(a, b) !== keep(b, a)) out.push(kind === 'terms' ? 'terms reordered' : 'next steps reordered');
  return out;
}

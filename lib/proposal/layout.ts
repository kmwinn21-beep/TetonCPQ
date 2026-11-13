/**
 * Proposal layout a rep can change for one version: section order, removed
 * standard sections, removed figures, and added free-form sections. Stored
 * next to the wording edits; the numbers themselves never change.
 */

/** Standard sections, in their default order. The header and intro always stay on top. */
export const STANDARD_SECTIONS = ['summary', 'scope', 'roi', 'assumptions'] as const;
export type StandardSection = (typeof STANDARD_SECTIONS)[number];

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
}

export const DEFAULT_LAYOUT: ProposalLayout = { order: [...STANDARD_SECTIONS], hiddenSections: [], hiddenValues: [], custom: {} };

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

  const custom: Record<string, CustomSection> = {};
  if (raw.custom != null) {
    if (typeof raw.custom !== 'object' || Array.isArray(raw.custom)) throw new Error('Bad custom sections');
    const entries = Object.entries(raw.custom as Record<string, unknown>);
    if (entries.length > 30) throw new Error('Too many added sections');
    for (const [id, v] of entries) {
      if (!isCustomId(id) || !ID.test(id)) throw new Error('Bad section id');
      const s = v as Record<string, unknown>;
      if (!s || typeof s.title !== 'string' || typeof s.html !== 'string') throw new Error('Bad added section');
      if (s.title.length > 200 || s.html.length > MAX_HTML) throw new Error('Added section is too long');
      custom[id] = { title: s.title, html: cleanHtml(s.html) };
    }
  }

  // Order: keep known ids once, drop unknown ones, and append any standard or custom section missing from it.
  const known = new Set<string>([...STANDARD_SECTIONS, ...Object.keys(custom)]);
  const order = ids(raw.order, 60).filter((id) => known.has(id));
  for (const id of [...STANDARD_SECTIONS, ...Object.keys(custom)]) if (!order.includes(id)) order.push(id);

  return {
    order,
    hiddenSections: ids(raw.hiddenSections, 10).filter((id) => (STANDARD_SECTIONS as readonly string[]).includes(id)),
    hiddenValues: ids(raw.hiddenValues, 200),
    custom,
  };
}

/** Number of ways a layout differs from the standard one (for the toolbar). */
export function layoutChanges(l: ProposalLayout): number {
  const reordered = l.order.filter((id) => !isCustomId(id)).join() !== STANDARD_SECTIONS.join() ? 1 : 0;
  return reordered + l.hiddenSections.length + l.hiddenValues.length + Object.keys(l.custom).length;
}

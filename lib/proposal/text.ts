/**
 * Editable proposal text. Each piece of prose on the proposal has a key and a
 * default template; a rep's edit replaces the template for that one version.
 * Calculated values are {tokens} in the template: they render from the
 * version's stored numbers and can be deleted from a sentence, but not
 * retyped, so an edit can't change a figure.
 */

export type TextEdits = Record<string, string>;
export type Segment = { text: string } | { token: string; value: string };

const KEY = /^[a-z0-9][a-z0-9_.-]{0,79}$/i;
export const MAX_EDIT_LENGTH = 4000;
const MAX_KEYS = 400;

/** Split a template into literal text and {token} values. Unknown tokens stay as literal text. */
export function fillTemplate(template: string, vars: Record<string, string> = {}): Segment[] {
  const out: Segment[] = [];
  const re = /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template))) {
    if (!(m[1] in vars)) continue;
    if (m.index > last) out.push({ text: template.slice(last, m.index) });
    out.push({ token: m[1], value: vars[m[1]] });
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last) });
  return out;
}

/** Plain text of a template with its values filled in. */
export const renderText = (template: string, vars: Record<string, string> = {}) =>
  fillTemplate(template, vars)
    .map((s) => ('token' in s ? s.value : s.text))
    .join('');

/** Tidy typed text: collapse runs of whitespace and line breaks (proposal text is single-paragraph). */
export const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Validate edits from a request: string keys and values only, bounded in size. */
export function sanitizeEdits(input: unknown): TextEdits {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Edits must be an object');
  const out: TextEdits = {};
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_KEYS) throw new Error('Too many text edits');
  for (const [k, v] of entries) {
    if (!KEY.test(k)) throw new Error(`Bad text key: ${k.slice(0, 40)}`);
    if (typeof v !== 'string') throw new Error(`Text for ${k} must be a string`);
    if (v.length > MAX_EDIT_LENGTH) throw new Error(`Text for ${k} is too long`);
    out[k] = v;
  }
  return out;
}

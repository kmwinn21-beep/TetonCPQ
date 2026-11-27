/**
 * Word files for agreement rounds: read a .docx's paragraphs, tracked changes (insertions, deletions, and a deletion
 * followed by an insertion as one "replace") and comments; find edits made with Track Changes off by comparing with
 * the previous round; and write a .docx with accept / reject decisions applied (or a clean copy, every change decided
 * and comments removed).
 *
 * Limits (V1): automatic numbering ("1.", "a)") isn't part of the text Word stores, so it isn't shown; formatting-only
 * changes are kept as they are; edits made without Track Changes are found and listed, but rejecting one doesn't undo
 * it in the Word file (that's done in Word).
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { lcs, norm, wordDiff } from './diff';

type El = Element;
const W = 'w:';

export type ChangeKind = 'ins' | 'del' | 'replace' | 'untracked';

export interface Segment {
  text: string;
  /** Inside a tracked change: the change's id and whether this text is inserted or deleted. */
  change?: string;
  kind?: 'ins' | 'del';
}

export interface Paragraph {
  idx: number;
  segments: Segment[];
  heading: boolean;
  /** Inside a table cell. */
  table: boolean;
}

export interface Change {
  /** "c1", "c2"… in document order. */
  id: string;
  kind: ChangeKind;
  author: string;
  date: string | null;
  inserted: string;
  deleted: string;
  paragraph: number;
  before: string;
  after: string;
  /** The Word elements it is made of ("ins:12", "del:13"); empty for untracked edits. */
  parts: string[];
}

export interface Comment {
  id: string;
  author: string;
  date: string | null;
  text: string;
  paragraph: number | null;
  anchor: string;
}

export interface ParsedDoc {
  paragraphs: Paragraph[];
  changes: Change[];
  comments: Comment[];
}

const httpError = (message: string, status = 400) => Object.assign(new Error(message), { status });

function unzip(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    const files = unzipSync(bytes);
    if (!files['word/document.xml']) throw new Error('missing');
    return files;
  } catch {
    throw httpError('That isn’t a Word document (.docx). Save it as .docx in Word and upload it again.');
  }
}

const parseXml = (s: string) => new DOMParser().parseFromString(s, 'text/xml');
const els = (root: Document | El, tag: string): El[] => Array.from(root.getElementsByTagName(tag)) as El[];
const attr = (e: El, name: string) => e.getAttribute(name) ?? e.getAttribute(name.replace(/^w:/, '')) ?? '';

function ancestor(e: Node, tag: string, stop?: Node): El | null {
  let n = e.parentNode;
  while (n && n !== stop) {
    if ((n as El).nodeName === tag) return n as El;
    n = n.parentNode;
  }
  return null;
}

/** The tracked change an element sits in (the nearest w:ins / w:del below the paragraph). */
function changeOf(e: Node, p: El): El | null {
  let n = e.parentNode;
  while (n && n !== p) {
    const name = (n as El).nodeName;
    if (name === 'w:ins' || name === 'w:del' || name === 'w:moveFrom' || name === 'w:moveTo') return n as El;
    n = n.parentNode;
  }
  return null;
}

const partKey = (e: El, ordinal: number) => {
  const t = e.nodeName === 'w:del' || e.nodeName === 'w:moveFrom' ? 'del' : 'ins';
  return `${t}:${attr(e, 'w:id') || `n${ordinal}`}`;
};

interface Walked {
  paragraphs: Paragraph[];
  /** Per tracked element (in order): its key, kind, author, date, paragraph, text. */
  parts: Array<{ key: string; el: El; kind: 'ins' | 'del'; author: string; date: string | null; paragraph: number; text: string; seq: number }>;
  commentAt: Map<string, { paragraph: number; anchor: string }>;
}

function walk(doc: Document): Walked {
  const body = els(doc, 'w:body')[0];
  if (!body) throw httpError('That Word document has no text.');
  const allP = els(body, 'w:p');
  const paragraphs: Paragraph[] = [];
  const parts: Walked['parts'] = [];
  const partIndex = new Map<El, number>();
  const commentAt = new Map<string, { paragraph: number; anchor: string }>();
  const openComments = new Map<string, string[]>();
  let ordinal = 0;
  let seq = 0;
  for (const p of allP) {
    const idx = paragraphs.length;
    const style = els(p, 'w:pStyle')[0];
    const sv = style ? attr(style, 'w:val').toLowerCase() : '';
    const para: Paragraph = { idx, segments: [], heading: /heading|title/.test(sv), table: !!ancestor(p, 'w:tc') };
    const visit = (n: Node) => {
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        const e = c as El;
        const name = e.nodeName;
        if (name === 'w:p') continue; // a paragraph inside this one (a text box): it has its own row
        if (name === 'w:commentRangeStart') {
          openComments.set(attr(e, 'w:id'), []);
          commentAt.set(attr(e, 'w:id'), { paragraph: idx, anchor: '' });
          continue;
        }
        if (name === 'w:commentRangeEnd') {
          const id = attr(e, 'w:id');
          const got = commentAt.get(id);
          if (got) got.anchor = (openComments.get(id) ?? []).join('').trim().slice(0, 300);
          openComments.delete(id);
          continue;
        }
        if (name === 'w:commentReference') {
          const id = attr(e, 'w:id');
          if (!commentAt.has(id)) commentAt.set(id, { paragraph: idx, anchor: '' });
          continue;
        }
        if (name === 'w:pPr' || name === 'w:rPr' || name === 'w:instrText' || name === 'w:delInstrText') continue;
        let text = '';
        if (name === 'w:t' || name === 'w:delText') text = e.textContent ?? '';
        else if (name === 'w:tab') text = '\t';
        else if (name === 'w:br' || name === 'w:cr') text = '\n';
        else if (name === 'w:noBreakHyphen') text = '-';
        if (text) {
          const ch = changeOf(e, p);
          let seg: Segment = { text };
          if (ch) {
            if (!partIndex.has(ch)) {
              const kind = ch.nodeName === 'w:del' || ch.nodeName === 'w:moveFrom' ? 'del' : 'ins';
              partIndex.set(ch, parts.length);
              parts.push({ key: partKey(ch, ordinal++), el: ch, kind, author: attr(ch, 'w:author') || 'Someone', date: attr(ch, 'w:date') || null, paragraph: idx, text: '', seq: seq++ });
            }
            const part = parts[partIndex.get(ch)!];
            part.text += text;
            seg = { text, change: part.key, kind: part.kind };
          } else seq++;
          for (const buf of openComments.values()) if (seg.kind !== 'del') buf.push(text);
          const last = para.segments[para.segments.length - 1];
          if (last && last.change === seg.change && last.kind === seg.kind) last.text += text;
          else para.segments.push(seg);
          continue;
        }
        visit(e);
      }
    };
    visit(p);
    paragraphs.push(para);
  }
  return { paragraphs, parts, commentAt };
}

const accepted = (p: Paragraph) => p.segments.filter((s) => s.kind !== 'del').map((s) => s.text).join('');
const original = (p: Paragraph, keep?: (key: string) => boolean) => p.segments.filter((s) => (s.kind === 'ins' ? !!(s.change && keep?.(s.change)) : !(s.kind === 'del' && s.change && keep?.(s.change)))).map((s) => s.text).join('');

/** A paragraph's text with every change accepted (what it says once all is agreed). */
export const acceptedText = accepted;

function context(p: Paragraph, key: string) {
  const i = p.segments.findIndex((s) => s.change === key);
  const j = p.segments.length - 1 - [...p.segments].reverse().findIndex((s) => s.change === key);
  const before = p.segments.slice(0, i).filter((s) => s.kind !== 'del').map((s) => s.text).join('');
  const after = p.segments.slice(j + 1).filter((s) => s.kind !== 'del').map((s) => s.text).join('');
  return { before: before.slice(-80), after: after.slice(0, 80) };
}

function readComments(files: Record<string, Uint8Array>, at: Walked['commentAt']): Comment[] {
  const f = files['word/comments.xml'];
  if (!f) return [];
  const doc = parseXml(strFromU8(f));
  return els(doc, 'w:comment').map((c) => {
    const id = attr(c, 'w:id');
    const text = els(c, 'w:p')
      .map((p) => els(p, 'w:t').map((t) => t.textContent ?? '').join(''))
      .join('\n')
      .trim();
    const where = at.get(id);
    return { id: `k${id}`, author: attr(c, 'w:author') || 'Someone', date: attr(c, 'w:date') || null, text, paragraph: where?.paragraph ?? null, anchor: where?.anchor ?? '' };
  });
}

/** Group tracked parts into changes: a deletion right before an insertion by the same person is one "replace". */
function groupChanges(w: Walked): Change[] {
  const out: Change[] = [];
  const parts = w.parts;
  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    const b = parts[i + 1];
    const para = w.paragraphs[a.paragraph];
    if (a.kind === 'del' && b && b.kind === 'ins' && b.paragraph === a.paragraph && b.author === a.author && b.seq === a.seq + 1) {
      const ca = context(para, a.key);
      const cb = context(para, b.key);
      out.push({ id: '', kind: 'replace', author: a.author, date: a.date, deleted: a.text, inserted: b.text, paragraph: a.paragraph, before: ca.before, after: cb.after, parts: [a.key, b.key] });
      i++;
      continue;
    }
    // The other order (an insertion right before a deletion, as in a rejected replacement written back): one change too.
    if (a.kind === 'ins' && b && b.kind === 'del' && b.paragraph === a.paragraph && b.author === a.author && b.seq === a.seq + 1) {
      const ca = context(para, a.key);
      const cb = context(para, b.key);
      out.push({ id: '', kind: 'replace', author: a.author, date: a.date, deleted: b.text, inserted: a.text, paragraph: a.paragraph, before: ca.before, after: cb.after, parts: [b.key, a.key] });
      i++;
      continue;
    }
    const cx = context(para, a.key);
    out.push({ id: '', kind: a.kind, author: a.author, date: a.date, deleted: a.kind === 'del' ? a.text : '', inserted: a.kind === 'ins' ? a.text : '', paragraph: a.paragraph, before: cx.before, after: cx.after, parts: [a.key] });
  }
  return out;
}

/** Read a .docx: its paragraphs, tracked changes and comments. */
export function parseDocx(bytes: Uint8Array): ParsedDoc {
  const files = unzip(bytes);
  const doc = parseXml(strFromU8(files['word/document.xml']));
  const w = walk(doc);
  const changes = groupChanges(w).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  return { paragraphs: w.paragraphs, changes, comments: readComments(files, w.commentAt) };
}

// ---------------------------------------------------------------- edits made with Track Changes off

/**
 * Edits in `next` made with Track Changes off, compared with what the previous round left: the previous round with
 * every change accepted, against the next one with its own new tracked changes undone. Tracked changes that were
 * already in the previous round (same person, date and text) count as part of the text.
 */
export function untrackedChanges(prev: ParsedDoc, next: ParsedDoc, nextAuthor = 'Changed without Track Changes'): Change[] {
  const known = new Set<string>();
  const sig = (kind: string, author: string, date: string | null, text: string) => `${kind}|${author}|${date ?? ''}|${norm(text)}`;
  for (const c of prev.changes) {
    if (c.deleted) known.add(sig('del', c.author, c.date, c.deleted));
    if (c.inserted) known.add(sig('ins', c.author, c.date, c.inserted));
  }
  // Which of next's tracked parts were already there.
  const carried = new Set<string>();
  for (const c of next.changes) {
    const [delKey, insKey] = c.kind === 'replace' ? c.parts : c.kind === 'del' ? [c.parts[0], ''] : ['', c.parts[0]];
    if (c.deleted && known.has(sig('del', c.author, c.date, c.deleted))) carried.add(delKey);
    if (c.inserted && known.has(sig('ins', c.author, c.date, c.inserted))) carried.add(insKey);
  }
  const a = prev.paragraphs.map((p) => accepted(p));
  // Next with its new tracked changes undone (carried-over insertions kept, carried-over deletions applied).
  const b = next.paragraphs.map((p) => original(p, (k) => carried.has(k)));
  const pairs = lcs(a, b, (x, y) => norm(x) === norm(y));
  const out: Change[] = [];
  let i = 0;
  let j = 0;
  const gap = (i2: number, j2: number) => {
    const ai = a.slice(i, i2);
    const bj = b.slice(j, j2);
    const n = Math.max(ai.length, bj.length);
    for (let k = 0; k < n; k++) {
      const paragraph = Math.min(j + k, Math.max(0, next.paragraphs.length - 1));
      if (k >= bj.length) {
        if (norm(ai[k])) out.push({ id: '', kind: 'untracked', author: nextAuthor, date: null, deleted: ai[k].trim(), inserted: '', paragraph: Math.max(0, j2 - 1), before: '', after: '', parts: [] });
      } else if (k >= ai.length) {
        if (norm(bj[k])) out.push({ id: '', kind: 'untracked', author: nextAuthor, date: null, deleted: '', inserted: bj[k].trim(), paragraph, before: '', after: '', parts: [] });
      } else {
        for (const d of wordDiff(ai[k], bj[k])) out.push({ id: '', kind: 'untracked', author: nextAuthor, date: null, ...d, paragraph, parts: [] });
      }
    }
  };
  for (const [pi, pj] of pairs) {
    if (pi > i || pj > j) gap(pi, pj);
    i = pi + 1;
    j = pj + 1;
  }
  if (i < a.length || j < b.length) gap(a.length, b.length);
  return out;
}

// ---------------------------------------------------------------- writing

export type Decision = 'accepted' | 'rejected';

function unwrap(e: El) {
  const parent = e.parentNode!;
  while (e.firstChild) parent.insertBefore(e.firstChild, e);
  parent.removeChild(e);
}

/** Turn deleted text back into normal text (a rejected deletion). */
function restoreDeleted(e: El) {
  for (const t of els(e, 'w:delText')) {
    const n = e.ownerDocument!.createElement('w:t');
    n.setAttribute('xml:space', 'preserve');
    n.appendChild(e.ownerDocument!.createTextNode(t.textContent ?? ''));
    t.parentNode!.replaceChild(n, t);
  }
  for (const t of els(e, 'w:delInstrText')) {
    const n = e.ownerDocument!.createElement('w:instrText');
    n.appendChild(e.ownerDocument!.createTextNode(t.textContent ?? ''));
    t.parentNode!.replaceChild(n, t);
  }
}

/** Text runs inside a rejected insertion become deleted text (Teton strikes it out). */
function markDeleted(e: El) {
  for (const t of els(e, 'w:t')) {
    const n = e.ownerDocument!.createElement('w:delText');
    n.setAttribute('xml:space', 'preserve');
    n.appendChild(e.ownerDocument!.createTextNode(t.textContent ?? ''));
    t.parentNode!.replaceChild(n, t);
  }
}

/** Replace a w:ins / w:del with the other kind, authored by `by` (its children move across). */
function retag(e: El, tag: 'w:ins' | 'w:del', by: { author: string; date: string }, id: number) {
  const n = e.ownerDocument!.createElement(tag);
  n.setAttribute('w:id', String(id));
  n.setAttribute('w:author', by.author);
  n.setAttribute('w:date', by.date);
  while (e.firstChild) n.appendChild(e.firstChild);
  e.parentNode!.replaceChild(n, e);
}

/**
 * Writes decisions into the file. Accepted changes become plain text. Rejected ones are undone: silently in a clean
 * copy, or, with `counterAs`, as that author's own tracked change (a rejected insertion is struck out, a rejected
 * deletion is re-inserted), so the other side sees in Word what was turned down. Undecided changes stay as they are.
 * `clean`: every change must be decided, and comments and formatting-change marks are removed too.
 */
export function applyDecisions(bytes: Uint8Array, decisions: Record<string, Decision>, opts: { clean?: boolean; counterAs?: { author: string; date?: string } } = {}): Uint8Array {
  const files = unzip(bytes);
  const doc = parseXml(strFromU8(files['word/document.xml']));
  const w = walk(doc);
  const changes = groupChanges(w).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  const byPart = new Map<string, Decision | undefined>();
  for (const c of changes) for (const k of c.parts) byPart.set(k, decisions[c.id]);
  if (opts.clean) {
    const open = changes.filter((c) => !decisions[c.id]);
    if (open.length) throw httpError(`${open.length} change${open.length === 1 ? ' is' : 's are'} still open.`);
  }
  const counter = !opts.clean && opts.counterAs ? { author: opts.counterAs.author, date: opts.counterAs.date ?? new Date().toISOString().slice(0, 19) + 'Z' } : null;
  let nextId = 900000;
  for (const part of w.parts) {
    const d = byPart.get(part.key);
    if (!d || !part.el.parentNode) continue;
    if (d === 'rejected' && counter) {
      if (part.kind === 'ins') markDeleted(part.el);
      else restoreDeleted(part.el);
      retag(part.el, part.kind === 'ins' ? 'w:del' : 'w:ins', counter, nextId++);
      continue;
    }
    if (part.kind === 'ins') d === 'accepted' ? unwrap(part.el) : part.el.parentNode.removeChild(part.el);
    else if (d === 'accepted') part.el.parentNode.removeChild(part.el);
    else {
      restoreDeleted(part.el);
      unwrap(part.el);
    }
  }
  if (opts.clean) {
    // Tracked changes with no text (e.g. an inserted empty run) and paragraph-mark / formatting change records.
    for (const tag of ['w:ins', 'w:moveTo']) for (const e of els(doc, tag)) if (e.parentNode && e.parentNode.nodeName !== 'w:rPr') unwrap(e);
    for (const tag of ['w:del', 'w:moveFrom']) for (const e of els(doc, tag)) if (e.parentNode && e.parentNode.nodeName !== 'w:rPr') e.parentNode.removeChild(e);
    for (const tag of ['w:rPrChange', 'w:pPrChange', 'w:sectPrChange', 'w:tblPrChange', 'w:trPrChange', 'w:tcPrChange', 'w:numberingChange']) for (const e of els(doc, tag)) e.parentNode?.removeChild(e);
    for (const e of els(doc, 'w:rPr')) for (const m of Array.from(e.childNodes) as El[]) if (m.nodeName === 'w:ins' || m.nodeName === 'w:del') e.removeChild(m);
    // Comments.
    for (const tag of ['w:commentRangeStart', 'w:commentRangeEnd']) for (const e of els(doc, tag)) e.parentNode?.removeChild(e);
    for (const e of els(doc, 'w:commentReference')) {
      const run = ancestor(e, 'w:r');
      (run ?? e).parentNode?.removeChild(run ?? e);
    }
    if (files['word/comments.xml']) {
      const cd = parseXml(strFromU8(files['word/comments.xml']));
      for (const c of els(cd, 'w:comment')) c.parentNode?.removeChild(c);
      files['word/comments.xml'] = strToU8(new XMLSerializer().serializeToString(cd));
    }
    // Word shouldn't reopen with "Track Changes" on.
    if (files['word/settings.xml']) {
      const sd = parseXml(strFromU8(files['word/settings.xml']));
      for (const e of els(sd, 'w:trackRevisions')) e.parentNode?.removeChild(e);
      files['word/settings.xml'] = strToU8(new XMLSerializer().serializeToString(sd));
    }
  }
  files['word/document.xml'] = strToU8(new XMLSerializer().serializeToString(doc));
  return zipSync(files, { level: 6 });
}

/** The first heading-like line of a document (to name it), else null. */
export function titleOf(p: ParsedDoc): string | null {
  const first = p.paragraphs.find((x) => norm(accepted(x)));
  return first ? norm(accepted(first)).slice(0, 120) : null;
}

export { W as WORD_NS_PREFIX };

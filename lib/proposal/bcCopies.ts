/**
 * Business-case sections copied onto other pages ("any section on any page"). A copy is live: it shows the same
 * figures as its original, keeps the original's wording until edited, and then has its own (stored under its own
 * key prefix). Copies are listed per page (the page's sections id, or an added page's id), each naming its source
 * as "<sections page>:<section id>".
 */
import type { ProposalLayout } from './layout';

export interface BcCopy {
  /** The original: "<sections page>:<section id>". */
  src: string;
  /** Short and unique within the business case: names the copy's section ("c-<key>") and its wording ("bc.cp.<key>."). */
  key: string;
}

export const COPY_KEY = /^[a-z0-9]{4,12}$/;
export const COPY_SRC = /^[a-z0-9][a-z0-9_.-]{0,59}:[a-z0-9][a-z0-9_.-]{0,59}$/i;
/** At most this many copies on one page. */
export const MAX_COPIES_PER_PAGE = 12;

/** The section id a copy has on its page. */
export const copyBlockId = (key: string) => `c-${key}`;
/** The prefix of a copy's own wording, figure and table keys (kept by templates like any "bc." wording). */
export const copyScope = (key: string) => `bc.cp.${key}.`;
/** A key inside a copy's scope (the key itself outside any copy). */
export const scoped = (scope: string, k: string) => (scope ? `${scope}${k}`.slice(0, 80) : k);
/** A table id inside a copy's scope: "<key>-<id>" (table ids carry no dots: their row and column keys are "<table>.<…>"). */
export const scopedTable = (scope: string, id: string) => (scope ? `${scope.slice(6, -1)}-${id}`.slice(0, 60) : id);

export const newCopyKey = () => Math.random().toString(36).slice(2, 10).padEnd(6, '0');

/** Every copy key in use. */
export const copyKeys = (l: Pick<ProposalLayout, 'bcCopies'>) => new Set(Object.values(l.bcCopies ?? {}).flatMap((cs) => cs.map((c) => c.key)));

/** Whether the section `src` is already on `page` as a copy. */
export const hasCopy = (l: Pick<ProposalLayout, 'bcCopies'>, page: string, src: string) => (l.bcCopies?.[page] ?? []).some((c) => c.src === src);

/** A copy of `src` added to `page` (unchanged when it's already there, or the page is full). */
export function addCopy<L extends Pick<ProposalLayout, 'bcCopies'>>(l: L, page: string, src: string, key = newCopyKey()): L {
  const list = l.bcCopies?.[page] ?? [];
  if (!COPY_SRC.test(src) || !COPY_KEY.test(key) || hasCopy(l, page, src) || list.length >= MAX_COPIES_PER_PAGE || copyKeys(l).has(key)) return l;
  return { ...l, bcCopies: { ...(l.bcCopies ?? {}), [page]: [...list, { src, key }] } };
}

/** A copy taken off its page. */
export function removeCopy<L extends Pick<ProposalLayout, 'bcCopies'>>(l: L, page: string, key: string): L {
  const list = (l.bcCopies?.[page] ?? []).filter((c) => c.key !== key);
  const all = { ...(l.bcCopies ?? {}) };
  if (list.length) all[page] = list;
  else delete all[page];
  return { ...l, bcCopies: Object.keys(all).length ? all : undefined };
}

/** The copies of one page dropped (an added page deleted, a page reset). */
export function dropCopies<L extends Pick<ProposalLayout, 'bcCopies'>>(l: L, pages: (page: string) => boolean): L {
  if (!l.bcCopies) return l;
  const all = Object.fromEntries(Object.entries(l.bcCopies).filter(([p]) => !pages(p)));
  return { ...l, bcCopies: Object.keys(all).length ? all : undefined };
}

/** Stored copies, checked: bad entries, repeats and repeated keys dropped. */
export function sanitizeCopies(v: unknown, isPage: (id: string) => boolean): Record<string, BcCopy[]> | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const out: Record<string, BcCopy[]> = {};
  const keys = new Set<string>();
  for (const [page, list] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    if (!isPage(page) || !Array.isArray(list)) continue;
    const mine: BcCopy[] = [];
    for (const x of list.slice(0, MAX_COPIES_PER_PAGE)) {
      const c = x as Partial<BcCopy> | null;
      if (!c || typeof c.src !== 'string' || typeof c.key !== 'string' || !COPY_SRC.test(c.src) || !COPY_KEY.test(c.key) || keys.has(c.key) || mine.some((m) => m.src === c.src)) continue;
      keys.add(c.key);
      mine.push({ src: c.src, key: c.key });
    }
    if (mine.length) out[page] = mine;
  }
  return Object.keys(out).length ? out : undefined;
}

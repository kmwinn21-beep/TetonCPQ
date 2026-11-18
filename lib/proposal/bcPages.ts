/**
 * The business-case format's page list: which pages show, in what order. Until
 * the rep changes it, it follows the standard sections kept (a removed section
 * drops its page); after that the list is the rep's own.
 */
import { BC_PAGES, isBcCustomId, type ProposalLayout } from './layout';

export type BcPageId = (typeof BC_PAGES)[number] | `bcpage-${string}`;

export const BC_PAGE_TITLES: Record<(typeof BC_PAGES)[number], string> = {
  cover: 'Cover',
  execsum: 'Executive summary',
  contents: 'Contents',
  sitescope: 'Scope',
  pilot: 'The pilot',
  scope: 'The investment',
  roi: 'What the program returns',
  summary: 'Year 1 financial summary',
  cashflow: 'Cash flow summary',
  implementation: 'Implementation',
  resources: 'Your team',
  roledesc: 'Role descriptions',
  terms: 'Terms',
  assumptions: 'Assumptions',
};

/** The standard page set for a layout, following the standard sections it keeps. */
export function defaultBcPages(l: Pick<ProposalLayout, 'hiddenSections'>): string[] {
  const hidden = new Set(l.hiddenSections);
  return BC_PAGES.filter((id) => {
    if (id === 'cover') return true;
    if (id === 'cashflow') return !hidden.has('summary');

    if (id === 'roledesc') return !hidden.has('resources');
    return !hidden.has(id);
  });
}

export const bcPagesOf = (l: ProposalLayout): string[] => l.bcPages ?? defaultBcPages(l);

/** Move a page one place earlier (-1) or later (+1) among the pages shown. */
export function moveBcPage(pages: string[], id: string, dir: -1 | 1, shown: string[] = pages): string[] {
  const vis = shown.filter((p) => pages.includes(p));
  const i = vis.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= vis.length) return pages;
  const other = vis[j];
  return pages.map((p) => (p === id ? other : p === other ? id : p));
}

export const removeBcPage = (pages: string[], id: string) => pages.filter((p) => p !== id);

/** Put a built-in page back where it normally goes: after the nearest standard page before it that's present. */
export function addBackBcPage(pages: string[], id: string): string[] {
  if (pages.includes(id)) return pages;
  const k = (BC_PAGES as readonly string[]).indexOf(id);
  for (let i = k - 1; i >= 0; i--) {
    const at = pages.indexOf(BC_PAGES[i]);
    if (at >= 0) return [...pages.slice(0, at + 1), id, ...pages.slice(at + 1)];
  }
  return [id, ...pages];
}

/** Insert an added page before position `at` (an index into `pages`). */
export const insertBcPage = (pages: string[], at: number, id: string) => [...pages.slice(0, at), id, ...pages.slice(at)];

/** Built-in pages not in the list (to add back). Added pages are deleted when removed, so never listed. */
export const removedBcPages = (pages: string[]) => BC_PAGES.filter((id) => !pages.includes(id));

export { isBcCustomId };

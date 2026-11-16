/**
 * Printed pages of a proposal. With no plan (`pageStarts` null) the browser
 * breaks pages itself; a plan lists the sections that start a new page, so a
 * rep can say "these two sections on this page". Section heights come from
 * the proposal as it is laid out on screen (the same width and type size as
 * print), so page fill is an estimate.
 */

/** Letter, 0.55in margins (see @page in globals.css), at 96 CSS px per inch. */
export const PAGE_HEIGHT_PX = (11 - 2 * 0.55) * 96;
/** Space between sections (mb-8). */
export const SECTION_GAP_PX = 32;

export interface SectionSize {
  id: string;
  height: number;
  /** The browser may split it across pages (automatic mode). */
  splittable?: boolean;
  /** Always starts a page and is followed by a new page (automatic mode: Implementation). */
  ownPage?: boolean;
}

/** Group the visible sections into pages at the plan's page starts. */
export function groupPages(visible: string[], pageStarts: string[]): string[][] {
  const starts = new Set(pageStarts);
  const pages: string[][] = [];
  visible.forEach((id, i) => {
    if (i === 0 || starts.has(id)) pages.push([id]);
    else pages[pages.length - 1].push(id);
  });
  return pages;
}

/** The sections that start pages 2, 3, … of a page grouping. */
export const startsOf = (pages: string[][]) => pages.slice(1).filter((p) => p.length).map((p) => p[0]);

/**
 * Put a page grouping back into the full section order: the visible sections
 * take the grouping's order, hidden ones keep their slots.
 */
export function orderFromPages(order: string[], visible: string[], pages: string[][]): string[] {
  const seq = pages.flat();
  const vis = new Set(visible);
  let k = 0;
  return order.map((id) => (vis.has(id) ? seq[k++] : id));
}

/** Move a section to a page (an index past the last page makes a new page), at a position within it. */
export function moveSection(pages: string[][], id: string, toPage: number, index: number): string[][] {
  const from = pages.findIndex((p) => p.includes(id));
  if (from < 0) return pages;
  const next = pages.map((p) => [...p]);
  const pos = next[from].indexOf(id);
  next[from].splice(pos, 1);
  if (toPage >= next.length) next.push([]);
  const target = next[toPage];
  const at = from === toPage && index > pos ? index - 1 : index;
  target.splice(Math.max(0, Math.min(at, target.length)), 0, id);
  return next.filter((p) => p.length);
}

/** Height a page's sections take, including the gaps between them (and the cover header on page 1). */
export function pageHeight(ids: string[], heights: Record<string, number>, header = 0): number {
  return header + ids.reduce((s, id, i) => s + (heights[id] ?? 0) + (i ? SECTION_GAP_PX : 0), 0);
}

export const fillPct = (h: number) => Math.round((h / PAGE_HEIGHT_PX) * 100);

/** Fewest pages in the current order: start a new page only when the next section won't fit. */
export function autoFit(visible: string[], heights: Record<string, number>, header = 0): string[][] {
  const pages: string[][] = [[]];
  let used = header;
  for (const id of visible) {
    const h = heights[id] ?? 0;
    const page = pages[pages.length - 1];
    const gap = page.length || used > 0 ? SECTION_GAP_PX : 0;
    if (!page.length || used + gap + h <= PAGE_HEIGHT_PX) {
      page.push(id);
      used += gap + h;
    } else {
      pages.push([id]);
      used = h;
    }
  }
  return pages.filter((p) => p.length);
}

/**
 * Where the browser will break pages with no plan: whole sections move to the
 * next page when they don't fit, splittable ones continue across, and
 * own-page sections sit alone. Returns the page each section starts on.
 */
export function estimateAutomatic(sizes: SectionSize[], header = 0): string[][] {
  const pages: string[][] = [[]];
  let used = header;
  const newPage = () => {
    pages.push([]);
    used = 0;
  };
  for (const s of sizes) {
    const cur = pages[pages.length - 1];
    if (s.ownPage && (cur.length || used > 0)) newPage();
    const page = pages[pages.length - 1];
    const gap = page.length || used > 0 ? SECTION_GAP_PX : 0;
    if (used + gap + s.height <= PAGE_HEIGHT_PX) {
      page.push(s.id);
      used += gap + s.height;
    } else if (s.splittable && PAGE_HEIGHT_PX - used - gap >= Math.min(s.height * 0.6, 450)) {
      // Starts here and continues at the top of the next page; the next section follows the continuation.
      // (With little room left, its first unbreakable block won't fit either, so it moves whole.)
      page.push(s.id);
      const over = used + gap + s.height - PAGE_HEIGHT_PX;
      newPage();
      used = over % PAGE_HEIGHT_PX;
    } else {
      newPage();
      pages[pages.length - 1].push(s.id);
      used = s.height % PAGE_HEIGHT_PX;
    }
    if (s.ownPage) newPage();
  }
  return pages.filter((p) => p.length);
}

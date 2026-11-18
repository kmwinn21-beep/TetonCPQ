/**
 * Splitting a long list across printed pages: items go on the current page
 * until its height budget is used, then a new page starts. Heights are
 * estimates (from text length), so the budgets leave a margin.
 */
export function paginate<T>(items: T[], height: (item: T) => number, firstBudget: number, nextBudget: number): T[][] {
  const pages: T[][] = [[]];
  let left = firstBudget;
  for (const item of items) {
    const h = height(item);
    if (pages[pages.length - 1].length && h > left) {
      pages.push([]);
      left = nextBudget;
    }
    pages[pages.length - 1].push(item);
    left -= h;
  }
  return pages;
}

/** Estimated height in px of a text cell: lines at a width of `chars` characters, plus row padding. */
export const textRowHeight = (text: string, chars: number, lineHeight = 19, padding = 26, minLines = 1) =>
  Math.max(minLines, Math.ceil((text || '').length / chars)) * lineHeight + padding;

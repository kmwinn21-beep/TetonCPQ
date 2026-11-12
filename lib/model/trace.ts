/**
 * Traceability. Every headline number the engine produces can be asked
 * "where does that come from?" and answers with a Trace: its formula in plain
 * words, and the inputs that went into it — each of which may itself be a
 * Trace, down to the assumptions a rep entered.
 */

export type Unit = 'usd' | 'count' | 'ratio' | 'percent' | 'months' | 'multiple' | 'usd_per_month';

export interface Trace {
  id: string;
  label: string;
  value: number | null;
  unit: Unit;
  /** The formula with named inputs, e.g. "Occupied units × Falls per resident per year". */
  formula: string;
  /** Where the equivalent number lives in the workbook, for reconciliation. */
  workbookRef?: string;
  inputs: Trace[];
}

/** A leaf: an assumption or entered value with nothing behind it. */
export function input(id: string, label: string, value: number | null, unit: Unit, workbookRef?: string): Trace {
  return { id, label, value, unit, formula: 'Input', workbookRef, inputs: [] };
}

export function derived(
  id: string,
  label: string,
  value: number | null,
  unit: Unit,
  formula: string,
  inputs: Trace[],
  workbookRef?: string,
): Trace {
  return { id, label, value, unit, formula, workbookRef, inputs };
}

/** Depth-first lookup by id. */
export function findTrace(root: Trace, id: string): Trace | undefined {
  if (root.id === id) return root;
  for (const child of root.inputs) {
    const hit = findTrace(child, id);
    if (hit) return hit;
  }
  return undefined;
}

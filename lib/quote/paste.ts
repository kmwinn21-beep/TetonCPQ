/**
 * Turn rows pasted from a spreadsheet into communities, working out which
 * column is which instead of assuming an order.
 *
 * Handles the layouts reps actually paste:
 *   - the workbook's NIC tab:     #  Community Name  Market  Total Units  Serviceable Units  City/State
 *   - the Assumptions tab:        #  Community       Market  Unit Count  Pilot Unit Count  Pilot?
 *   - Teton ROI / cash flow tabs: Bldg #  Name  Market  Units/Beds  Occupied Units
 *   - plain lists:                Name  Market  Units  [SNF beds]
 * with or without a header row, tab- or comma-separated, Excel quoting included.
 *
 * Columns are found from the header when there is one, otherwise from the data:
 * the name is the longest mostly-text column; the market is a column of state
 * codes or "City, ST"; units are the first whole-number column after the name
 * that isn't a 1, 2, 3… row counter.
 */

export interface PastedCommunity {
  name: string;
  market: string;
  beds: number;
  snfBeds: number;
}

export interface ColumnMap {
  name: number | null;
  market: number | null;
  units: number | null;
  snf: number | null;
}

export interface PasteResult {
  communities: PastedCommunity[];
  columns: ColumnMap;
  /** Column captions for choosing a column by hand: header text, or a sample value. */
  columnLabels: string[];
  hasHeader: boolean;
  /** Data rows that couldn't be used (no name, or no units > 0). */
  skipped: number;
}

/** Split TSV (Excel's clipboard format) or CSV, honoring quoted cells. */
export function splitRows(text: string): string[][] {
  const delim = text.includes('\t') ? '\t' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows
    .map((r) => r.map((c) => c.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()))
    .filter((r) => r.some((c) => c !== ''));
}

const toNumber = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = s.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
};
const isStateCode = (s: string) => /^[A-Z]{2}$/.test(s);
const isCityState = (s: string) => /^[A-Za-z .'-]+,\s*[A-Z]{2}(\s+\d{5})?$/.test(s);

const HEADER_WORDS = /community|name|property|facility|market|state|city|unit|bed|snf|skilled|count|#/i;

function looksLikeHeader(row: string[]): boolean {
  const filled = row.filter((c) => c !== '');
  return filled.length > 0 && filled.some((c) => HEADER_WORDS.test(c)) && !filled.some((c) => (toNumber(c) ?? 0) >= 1);
}

function fromHeader(header: string[]): ColumnMap {
  const find = (include: RegExp, exclude?: RegExp) => {
    const i = header.findIndex((h) => include.test(h) && !(exclude && exclude.test(h)));
    return i === -1 ? null : i;
  };
  return {
    name: find(/community|property|facility|name|building/i, /#|number|^no\.?$|count|units?/i),
    market: find(/market|state/i) ?? find(/city/i),
    units: find(/total units|unit count|units\s*\/\s*beds|^units$|^beds$|^# of (units|beds)|^total beds/i, /occupied|serviceable|pilot|available|snf|skilled/i)
      ?? find(/units|beds/i, /occupied|serviceable|pilot|available|snf|skilled/i),
    snf: find(/snf|skilled/i),
  };
}

/** A 1, 2, 3… row counter, which must never be read as units. */
function isCounter(values: Array<number | null>): boolean {
  const nums = values.filter((v): v is number => v != null);
  return nums.length >= 2 && nums.every((v, i) => v === nums[0] + i);
}

function inferColumns(rows: string[][], known: ColumnMap): ColumnMap {
  const width = Math.max(...rows.map((r) => r.length));
  const stats = Array.from({ length: width }, (_, c) => {
    const vals = rows.map((r) => r[c] ?? '');
    const filled = vals.filter((v) => v !== '');
    const nums = vals.map(toNumber);
    const n = filled.length || 1;
    return {
      c,
      filledFrac: filled.length / rows.length,
      numericFrac: nums.filter((v) => v != null).length / n,
      wholeAtLeastOneFrac: nums.filter((v) => v != null && v >= 1 && Number.isInteger(v)).length / n,
      avgLen: filled.reduce((s, v) => s + v.length, 0) / n,
      marketFrac: filled.filter((v) => isStateCode(v) || isCityState(v)).length / n,
      counter: isCounter(nums),
    };
  });

  const market =
    known.market ??
    stats
      .filter((s) => s.marketFrac >= 0.6 && s.c !== known.name)
      .sort((a, b) => b.marketFrac - a.marketFrac || a.avgLen - b.avgLen)[0]?.c ??
    null;

  const name =
    known.name ??
    stats
      .filter((s) => s.numericFrac < 0.5 && s.filledFrac >= 0.5 && s.c !== market && !(s.marketFrac >= 0.6 && s.avgLen <= 3))
      .sort((a, b) => b.avgLen - a.avgLen)[0]?.c ??
    null;

  const unitCandidates = stats.filter((s) => s.c !== name && s.c !== market && s.c !== known.snf && s.wholeAtLeastOneFrac >= 0.8 && !s.counter);
  const units = known.units ?? (unitCandidates.find((s) => name == null || s.c > name) ?? unitCandidates[0])?.c ?? null;

  return { name, market, units, snf: known.snf };
}

const IGNORED_NAMES = /^(total|totals|subtotal|grand total)$/i;

export function parsePaste(text: string, overrides: Partial<ColumnMap> = {}): PasteResult {
  const all = splitRows(text);
  if (!all.length) return { communities: [], columns: { name: null, market: null, units: null, snf: null }, columnLabels: [], hasHeader: false, skipped: 0 };

  const hasHeader = looksLikeHeader(all[0]);
  const header = hasHeader ? all[0] : null;
  const rows = hasHeader ? all.slice(1) : all;
  const fromHead = header ? fromHeader(header) : { name: null, market: null, units: null, snf: null };
  const inferred = inferColumns(rows.length ? rows : all, { ...fromHead, ...overrides });
  const columns: ColumnMap = { ...inferred, ...overrides };

  const width = Math.max(...all.map((r) => r.length));
  const columnLabels = Array.from({ length: width }, (_, c) => {
    const h = header?.[c];
    const sample = rows.find((r) => r[c])?.[c] ?? '';
    return h ? h : sample ? `“${sample.length > 24 ? sample.slice(0, 23) + '…' : sample}”` : `Column ${c + 1}`;
  });

  const communities: PastedCommunity[] = [];
  let skipped = 0;
  for (const r of rows) {
    const name = columns.name != null ? (r[columns.name] ?? '') : '';
    const units = columns.units != null ? toNumber(r[columns.units]) : null;
    if (!name || IGNORED_NAMES.test(name) || !units || units <= 0) {
      skipped++;
      continue;
    }
    communities.push({
      name,
      market: columns.market != null ? (r[columns.market] ?? '') : '',
      beds: Math.round(units),
      snfBeds: columns.snf != null ? Math.max(0, Math.round(toNumber(r[columns.snf]) ?? 0)) : 0,
    });
  }
  return { communities, columns, columnLabels, hasHeader, skipped };
}

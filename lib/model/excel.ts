/**
 * Excel semantics the workbook depends on. Kept separate so each is tested on
 * its own and the model code reads like the spreadsheet formulas.
 */

/**
 * Excel ROUND: half away from zero, applied to the value as Excel displays it
 * (15 significant digits), so 2.675 rounds to 2.68 as it does in Excel rather
 * than 2.67 as the binary float would suggest.
 */
export function excelRound(value: number, digits = 0): number {
  if (!Number.isFinite(value)) return value;
  const clean = Number(value.toPrecision(15));
  const factor = 10 ** digits;
  const scaled = Number((Math.abs(clean) * factor).toPrecision(15));
  return (Math.sign(clean) * Math.floor(scaled + 0.5)) / factor;
}

/** Parse an ISO date (yyyy-mm-dd) as a UTC calendar date. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Excel EDATE for a first-of-month date. */
export function addMonths(iso: string, months: number): string {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())));
}

/** First day of the month containing `iso`. Excel DATE(YEAR(x), MONTH(x), 1). */
export function firstOfMonth(iso: string): string {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)));
}

/** Excel WORKDAY(start, days) with no holidays: weekends are skipped. */
export function workday(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  const step = days < 0 ? -1 : 1;
  let remaining = Math.trunc(Math.abs(days));
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return toIsoDate(d);
}

const usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function usd(n: number | null | undefined, opts: { cents?: boolean; compact?: boolean } = {}): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (opts.compact && a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`;
  if (opts.compact && a >= 10_000) return `${sign}$${(a / 1_000).toFixed(0)}K`;
  return sign + (opts.cents ? usd2 : usd0).format(a);
}

export function count(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : int.format(n);
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Number((n * 100).toFixed(digits))}%`;
}

export function multiple(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : `$${n.toFixed(2)}`;
}

/** Dates from SQLite ("2026-11-12 14:03:00", UTC) or ISO date strings. */
export function dateLabel(s: string | null | undefined): string {
  if (!s) return '—';
  const iso = s.length <= 10 ? `${s}T00:00:00Z` : `${s.replace(' ', 'T')}${/Z|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'}`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** "Mar 2027" for model month m (1-based) counted from a first-of-month start date. */
export function monthName(startDate: string, m: number): string {
  const [y, mo] = startDate.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + (m - 1), 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

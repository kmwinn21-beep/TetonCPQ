/**
 * Quarterly waterfall of discounted net benefit: each bar is one quarter's net
 * (benefit after Teton fees and install, discounted at the customer's rate),
 * floating from where the previous quarter ended; the last bar is the running
 * total. Each bar is labeled with the months it covers (1–3, 4–6, …).
 * While the running total is still below $0, a quarter's bar instead hangs
 * from $0 down to that total, in red, labeled with the net cost so far
 * (−$622K, then −$541K, …); once the total is above $0 the bars show each
 * quarter's gain again.
 *
 * `cumulative`: a plain bar graph instead. Each bar stands from $0 to where the
 * program is at the end of that quarter (red behind, green ahead), with no total
 * bar: the last bar is the total. `stacked` splits each such bar: the pale part is
 * where the program stood before the quarter, the solid part is the quarter's own
 * (90-day) net.
 * Estimated payback is marked and labeled; the end of the pilot is a dashed
 * line (named in the legend). Plain SVG so it prints crisply and
 * renders on the server.
 *
 * Colors validated with the dataviz checker: green #66C995 / red #FC6845 pass
 * CVD separation; both are below 3:1 on white, so every bar carries a value
 * label (the relief the checker asks for). Bar direction is a second cue.
 */
import { monthName } from '@/lib/format';

const GREEN = '#66C995';
const RED = '#FC6845';
const TOTAL = '#303035';
// Stacked bars: the part of the running total from before the quarter, in a pale tint of its sign's colour.
const PALE_GREEN = '#BFE9D1';
const PALE_RED = '#FDC9BC';
const GRID = '#E7E8E9';
const AXIS = '#656E77';
const LABEL = '#394147';
const INK = '#1E1E1E';

function money(v: number, sign = false): string {
  const a = Math.abs(v);
  if (a < 0.5) return '$0';
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}K` : `$${Math.round(a)}`;
  return sign ? `${v >= 0 ? '+' : '−'}${s}` : `${v < 0 ? '−' : ''}${s}`;
}

function niceStep(range: number): number {
  const raw = range / 5;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

export function QuarterlyWaterfall({
  discountedNet,
  startDate,
  paybackMonth,
  pilotEndMonth = null,
  cumulative = false,
  stacked = false,
  labels = {},
}: {
  discountedNet: number[];
  startDate: string;
  paybackMonth: number | null;
  /** Last month of the pilot (model month), if the deal has one. */
  pilotEndMonth?: number | null;
  /** Bars of the running total from $0, and no total bar. */
  cumulative?: boolean;
  /** With `cumulative`: split each bar into the total before the quarter and the quarter's own net. */
  stacked?: boolean;
  /** Legend wording (e.g. editable text on the business case). */
  labels?: { gain?: React.ReactNode; cost?: React.ReactNode; gainQ?: React.ReactNode; costQ?: React.ReactNode };
}) {
  const quarters: Array<{ label: string; delta: number; from: number; to: number }> = [];
  let cum = 0;
  for (let q = 0; q * 3 < discountedNet.length; q++) {
    const delta = discountedNet.slice(q * 3, q * 3 + 3).reduce((s, v) => s + v, 0);
    // Labeled by the months each bar covers: 1–3, 4–6, …
    const first = q * 3 + 1;
    const last = Math.min(q * 3 + 3, discountedNet.length);
    quarters.push({ label: first === last ? `${first}` : `${first}–${last}`, delta, from: cum, to: cum + delta });
    cum += delta;
  }
  const months = discountedNet.length;
  const bars = cumulative ? quarters : [...quarters, { label: `${months} mo`, delta: cum, from: 0, to: cum }];

  const W = 680;
  const H = 270;
  const left = 54;
  const right = 8;
  const top = 26;
  const bottom = 30;
  const lo0 = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi0 = Math.max(0, ...bars.map((b) => Math.max(b.from, b.to)));
  const step = niceStep(hi0 - lo0 || 1);
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil((hi0 * 1.06) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (H - top - bottom);
  const slot = (W - left - right) / bars.length;
  const bw = Math.min(34, slot * 0.62);
  const paybackX = paybackMonth ? left + slot * (paybackMonth / 3) : null;
  const pilotX = pilotEndMonth ? left + slot * (pilotEndMonth / 3) : null;
  // Pilot label sits on the side away from the payback label so they don't collide.
  const axisY = H - bottom;

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto' }} role="img" aria-label={`Quarterly net benefit, discounted, building to ${money(cum)} by month ${months}${pilotEndMonth ? `; pilot ends month ${pilotEndMonth}` : ''}${paybackMonth ? `; payback in month ${paybackMonth}` : ''}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS}>
              {t === 0 ? '$0' : money(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const isTotal = !cumulative && i === bars.length - 1;
          const cx = left + slot * (i + 0.5);
          const x = cx - bw / 2;
          // Still under water: show the net cost so far, from $0 down to the running total.
          const under = !isTotal && b.to < 0;
          const start = under || cumulative ? 0 : b.from;
          const y0 = Math.min(y(start), y(b.to));
          const y1 = Math.max(y(start), y(b.to));
          const fill = isTotal ? TOTAL : cumulative ? (b.to < 0 ? RED : GREEN) : under ? RED : b.delta >= 0 ? GREEN : RED;
          const text = isTotal ? money(b.delta) : under || cumulative ? money(b.to) : money(b.delta, true);
          const labelY = cumulative ? (b.to < 0 ? y1 + 13 : y0 - 6) : under || b.delta < 0 ? y1 + 13 : y0 - 6;
          if (cumulative && stacked) {
            const prev = b.from;
            const to = b.to;
            const segs: Array<[number, number, string]> =
              prev >= 0 && to >= prev ? [[0, prev, PALE_GREEN], [prev, to, GREEN]]
              : prev >= 0 ? (to >= 0 ? [[0, to, PALE_GREEN], [to, prev, RED]] : [[0, prev, RED], [0, to, RED]])
              : to > 0 ? [[prev, to, GREEN]]
              : b.delta >= 0 ? [[0, to, PALE_RED], [to, prev, GREEN]]
              : [[0, prev, PALE_RED], [prev, to, RED]];
            const lo1 = Math.min(0, prev, to);
            const hi1 = Math.max(0, prev, to);
            return (
              <g key={b.label}>
                <title>{`${b.label}: ${to < 0 ? 'net cost' : 'net gain'} to date ${money(to)}; this quarter ${money(b.delta, true)}`}</title>
                {segs.map(([a, c, col], k) => {
                  const ya = Math.min(y(a), y(c));
                  const h = Math.abs(y(a) - y(c));
                  return h < 0.5 ? null : <rect key={k} x={x} y={ya} width={bw} height={h} fill={col} />;
                })}
                <text x={cx} y={to < 0 ? y(lo1) + 13 : y(hi1) - 6} textAnchor="middle" fontSize={10.5} fontWeight={500} fill={INK}>
                  {money(to)}
                </text>
                <text x={cx} y={axisY + 17} textAnchor="middle" fontSize={10.5} fill={LABEL}>
                  {b.label}
                </text>
              </g>
            );
          }
          return (
            <g key={b.label}>
              <rect x={x} y={y0} width={bw} height={Math.max(y1 - y0, 1.5)} rx={3} fill={fill}>
                <title>{under ? `${b.label}: net cost so far ${money(b.to)} (this quarter ${money(b.delta, true)})` : `${b.label}: ${text}`}</title>
              </rect>
              {!isTotal && !cumulative && (
                <line x1={x + bw} x2={left + slot * (i + 1.5) - bw / 2} y1={y(b.to)} y2={y(b.to)} stroke={AXIS} strokeWidth={1} opacity={0.45} />
              )}
              <text x={cx} y={labelY} textAnchor="middle" fontSize={10.5} fontWeight={isTotal ? 600 : 500} fill={INK}>
                {text}
              </text>
              <text x={cx} y={axisY + 17} textAnchor="middle" fontSize={10.5} fontWeight={isTotal ? 600 : 400} fill={LABEL}>
                {b.label}
              </text>
            </g>
          );
        })}
        {pilotX != null && pilotEndMonth && (
          <g>
            <line x1={pilotX} x2={pilotX} y1={top - 14} y2={axisY} stroke={AXIS} strokeWidth={1} strokeDasharray="4 3" />
          </g>
        )}
        {paybackX != null && paybackMonth && (
          <g>
            <line x1={paybackX} x2={paybackX} y1={top - 14} y2={axisY} stroke={INK} strokeWidth={1} />
            <text x={paybackX + 5} y={top - 4} fontSize={11} fill={INK}>{`Est. Payback · Month ${paybackMonth}`}</text>
          </g>
        )}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-teton-dark-gray mt-1">
        {(cumulative && stacked
          ? ([
              [PALE_GREEN, labels.gain ?? 'Net Gain to Date'],
              [GREEN, labels.gainQ ?? '90-day Net Gain'],
              [PALE_RED, labels.cost ?? 'Net Cost to Date'],
              [RED, labels.costQ ?? '90-Day Net Cost'],
            ] as const)
          : ([
              [GREEN, labels.gain ?? (cumulative ? 'Net Gain to date' : 'Net Gain')],
              [RED, labels.cost ?? (cumulative ? 'Net Cost to date' : 'Net Cost')],
            ] as const)
        ).map(([color, text], i) => (
          <span key={i} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />{text}</span>
        ))}
        {!cumulative && <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TOTAL }} />Total at month {months}</span>}
        {pilotEndMonth ? (
          <span className="flex items-center gap-1.5">
            <svg width="10" height="12" aria-hidden="true"><line x1="5" x2="5" y1="0" y2="12" stroke={AXIS} strokeDasharray="3 2" /></svg>
            End of pilot
          </span>
        ) : null}
        <span>Month 1 = {monthName(startDate, 1)}</span>
      </figcaption>
    </figure>
  );
}

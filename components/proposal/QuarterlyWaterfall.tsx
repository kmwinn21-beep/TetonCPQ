/**
 * Quarterly waterfall of discounted net benefit: each bar is one quarter's net
 * (benefit after Teton fees and install, discounted at the customer's rate),
 * floating from where the previous quarter ended; the last bar is the running
 * total. Payback is marked at its month. Plain SVG so it prints crisply and
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

export function QuarterlyWaterfall({ discountedNet, startDate, paybackMonth }: { discountedNet: number[]; startDate: string; paybackMonth: number | null }) {
  const quarters: Array<{ label: string; delta: number; from: number; to: number }> = [];
  let cum = 0;
  for (let q = 0; q * 3 < discountedNet.length; q++) {
    const delta = discountedNet.slice(q * 3, q * 3 + 3).reduce((s, v) => s + v, 0);
    quarters.push({ label: `Q${q + 1}`, delta, from: cum, to: cum + delta });
    cum += delta;
  }
  const months = discountedNet.length;
  const bars = [...quarters, { label: `${months} mo`, delta: cum, from: 0, to: cum }];

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

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto' }} role="img" aria-label={`Quarterly net benefit, discounted, building to ${money(cum)} by month ${months}${paybackMonth ? `; payback in month ${paybackMonth}` : ''}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill={AXIS}>
              {t === 0 ? '$0' : money(t)}
            </text>
          </g>
        ))}
        {bars.map((b, i) => {
          const isTotal = i === bars.length - 1;
          const cx = left + slot * (i + 0.5);
          const x = cx - bw / 2;
          const y0 = Math.min(y(b.from), y(b.to));
          const y1 = Math.max(y(b.from), y(b.to));
          const fill = isTotal ? TOTAL : b.delta >= 0 ? GREEN : RED;
          const labelY = b.delta >= 0 ? y0 - 6 : y1 + 13;
          return (
            <g key={b.label}>
              <rect x={x} y={y0} width={bw} height={Math.max(y1 - y0, 1.5)} rx={3} fill={fill}>
                <title>{`${b.label}: ${isTotal ? money(b.delta) : money(b.delta, true)}`}</title>
              </rect>
              {!isTotal && (
                <line x1={x + bw} x2={left + slot * (i + 1.5) - bw / 2} y1={y(b.to)} y2={y(b.to)} stroke={AXIS} strokeWidth={1} opacity={0.45} />
              )}
              <text x={cx} y={labelY} textAnchor="middle" fontSize={10.5} fontWeight={isTotal ? 600 : 500} fill={INK}>
                {isTotal ? money(b.delta) : money(b.delta, true)}
              </text>
              <text x={cx} y={H - bottom + 17} textAnchor="middle" fontSize={10.5} fontWeight={isTotal ? 600 : 400} fill={LABEL}>
                {b.label}
              </text>
            </g>
          );
        })}
        {paybackX != null && paybackMonth && (
          <g>
            <line x1={paybackX} x2={paybackX} y1={top - 14} y2={H - bottom} stroke={INK} strokeWidth={1} />
            <text x={paybackX + 5} y={top - 4} fontSize={11} fill={INK}>{`Payback · month ${paybackMonth}`}</text>
          </g>
        )}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-teton-dark-gray mt-1">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GREEN }} />Quarter adds value</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: RED }} />Quarter costs more than it returns</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: TOTAL }} />Total at month {months}</span>
        <span>Q1 = {monthName(startDate, 1)}–{monthName(startDate, 3)}</span>
      </figcaption>
    </figure>
  );
}

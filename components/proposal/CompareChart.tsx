/**
 * Subscription (OpEx) and equipment purchase (CapEx) cash flows on one chart,
 * for a proposal that shows both: where each option stands at the end of every
 * quarter (discounted running total), as paired bars or as two lines. Each
 * option runs over its own span (OpEx: pilot + service term; CapEx: pilot +
 * the hardware's useful life). Plain SVG so it prints crisply.
 */
const OP = '#66C995';
const OP_INK = '#2E8A5C';
const CX = '#FC6845';
const CX_INK = '#D9472B';
const GRID = '#E7E8E9';
const AXIS = '#656E77';
const LABEL = '#394147';

const quarters = (monthly: number[]) => {
  const out: number[] = [];
  let cum = 0;
  for (let q = 0; q * 3 < monthly.length; q++) {
    cum += monthly.slice(q * 3, q * 3 + 3).reduce((s, v) => s + v, 0);
    out.push(cum);
  }
  return out;
};

function money(v: number): string {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2)}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}K` : `$${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}${s}`;
}

/** Axis labels: one decimal for millions ($2.5M), whole thousands below. */
const tick = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : `$${Math.round(a / 1e3)}K`;
  return `${v < 0 ? '−' : ''}${s}`;
};

function niceStep(range: number): number {
  const raw = range / 5;
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

export function CompareChart({
  opex,
  capex,
  opexPayback,
  capexPayback,
  kind,
  startLabel,
  labels,
}: {
  /** Discounted net benefit by month, each over its own span. */
  opex: number[];
  capex: number[];
  opexPayback: number | null;
  capexPayback: number | null;
  kind: 'bar' | 'line';
  startLabel: string;
  labels: { opex: React.ReactNode; capex: React.ReactNode; note: React.ReactNode };
}) {
  const op = quarters(opex);
  const cx = quarters(capex);
  const n = Math.max(op.length, cx.length, 1);
  const W = 680;
  const H = 236;
  const left = 54;
  const right = kind === 'line' ? 52 : 10;
  const top = 34;
  const bottom = 28;
  const all = [...op, ...cx, 0];
  const lo0 = Math.min(...all);
  const hi0 = Math.max(...all);
  const step = niceStep(hi0 - lo0 || 1);
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil((hi0 * 1.08) / step) * step;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(t);
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * (H - top - bottom);
  const slot = (W - left - right) / n;
  const bw = Math.min(14, slot * 0.36);
  const cxAt = (i: number) => left + slot * (i + 0.5);
  const mark = (m: number | null, color: string, text: string, dy: number) => {
    if (!m) return null;
    const x = left + slot * (m / 3);
    return (
      <g>
        <line x1={x} x2={x} y1={top - 18 + dy} y2={H - bottom} stroke={color} strokeDasharray="4 3" />
        <text x={x + 4} y={top - 8 + dy} fontSize={10} fontWeight={600} fill={color}>{text}</text>
      </g>
    );
  };
  const series = [
    { data: op, fill: OP, ink: OP_INK, k: 0 },
    { data: cx, fill: CX, ink: CX_INK, k: 1 },
  ];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto' }} role="img" aria-label={`Subscription reaches ${money(op[op.length - 1] ?? 0)}, equipment purchase reaches ${money(cx[cx.length - 1] ?? 0)}, discounted.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke={t === 0 ? AXIS : GRID} />
            <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={10.5} fill={AXIS}>{t === 0 ? '$0' : tick(t)}</text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) => (
          <text key={i} x={cxAt(i)} y={H - bottom + 16} textAnchor="middle" fontSize={9.5} fill={LABEL}>{`${i * 3 + 1}–${i * 3 + 3}`}</text>
        ))}
        {kind === 'bar'
          ? series.map((s) =>
              s.data.map((v, i) => {
                const x = cxAt(i) - bw - 1 + s.k * (bw + 2);
                const a = Math.min(y(0), y(v));
                const h = Math.max(Math.abs(y(v) - y(0)), 1.2);
                return <rect key={`${s.k}-${i}`} x={x} y={a} width={bw} height={h} rx={2} fill={s.fill} stroke={s.ink} strokeWidth={1} strokeDasharray={v < 0 ? '3 2' : undefined} fillOpacity={v < 0 ? 0.45 : 1} />;
              }),
            )
          : series.map((s) => {
              if (!s.data.length) return null;
              const pts = s.data.map((v, i) => `${cxAt(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
              const area = `${cxAt(0).toFixed(1)},${y(0).toFixed(1)} ${pts} ${cxAt(s.data.length - 1).toFixed(1)},${y(0).toFixed(1)}`;
              return (
                <g key={s.k}>
                  <polygon points={area} fill={s.fill} opacity={0.16} />
                  <polyline points={pts} fill="none" stroke={s.ink} strokeWidth={2.4} strokeLinejoin="round" />
                  {s.data.map((v, i) => <circle key={i} cx={cxAt(i)} cy={y(v)} r={2.5} fill={s.ink} />)}
                </g>
              );
            })}
        {series.map((s) => {
          const e = s.data.length - 1;
          if (e < 0) return null;
          const x = kind === 'bar' ? cxAt(e) - bw - 1 + s.k * (bw + 2) + bw / 2 : cxAt(e) + (s.k ? 6 : -6);
          const anchor = kind === 'bar' ? 'middle' : s.k ? 'start' : 'end';
          const yy = kind === 'bar' ? y(Math.max(0, s.data[e])) - 5 : y(s.data[e]) + (s.k ? 4 : -9);
          return <text key={s.k} x={x} y={yy} textAnchor={anchor} fontSize={10.5} fontWeight={700} fill={s.ink}>{money(s.data[e])}</text>;
        })}
        {mark(opexPayback, OP_INK, `OpEx payback · month ${opexPayback}`, 0)}
        {mark(capexPayback, CX_INK, `CapEx payback · month ${capexPayback}`, 13)}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-teton-dark-gray mt-1">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: OP, border: `1px solid ${OP_INK}` }} />{labels.opex}</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: CX, border: `1px solid ${CX_INK}` }} />{labels.capex}</span>
        <span>{labels.note}</span>
        <span>Month 1 = {startLabel}</span>
      </figcaption>
    </figure>
  );
}

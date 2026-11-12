'use client';

/**
 * Two charts, one y-axis each (never a dual axis):
 *  1. Monthly gross benefit vs Teton cost (grouped columns).
 *  2. Cumulative discounted net benefit, with the payback month marked.
 * Palette validated with the dataviz checker: benefit #66C995, cost #3F8CEA.
 * Green is below 3:1 on white, so the monthly table below is the relief.
 */
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import { usd } from '@/lib/format';

const BENEFIT = '#66C995';
const COST = '#3F8CEA';
const GRID = '#E7E8E9';
const AXIS = '#656E77';

export interface MonthPoint {
  month: number;
  label: string;
  gross: number;
  cost: number;
  cumulativeDiscounted: number;
}

const compact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M` : a >= 1_000 ? `${Math.round(a / 1_000)}K` : `${Math.round(a)}`;
  return `${v < 0 ? '−' : ''}$${s}`;
};

function Tip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-teton-off-white shadow-md rounded-lg px-3 py-2 text-xs">
      <p className="text-teton-ui-gray mb-1">{payload[0].payload.label} · month {label}</p>
      {payload.map((p) => (
        <p key={p.dataKey as string} className="flex items-center gap-2">
          <span className="inline-block w-3 h-0.5 rounded" style={{ background: p.color }} />
          <span className="font-semibold tabular-nums">{usd(p.value as number)}</span>
          <span className="text-teton-dark-gray">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

function Legend({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-teton-dark-gray mb-2">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function MonthlyBenefitCostChart({ data }: { data: MonthPoint[] }) {
  const barSize = Math.max(3, Math.min(12, Math.floor(560 / data.length / 2.5)));
  return (
    <div>
      <Legend items={[['Gross benefit', BENEFIT], ['Teton cost (fees + install − reimbursement)', COST]]} />
      <div className="h-64" role="img" aria-label="Monthly gross benefit compared with Teton cost; values are in the monthly table below.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={2} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval={data.length > 24 ? 5 : data.length > 12 ? 2 : 0} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<Tip />} cursor={{ fill: '#F2F4F4' }} />
            <Bar isAnimationActive={false} dataKey="gross" name="Gross benefit" fill={BENEFIT} barSize={barSize} radius={[4, 4, 0, 0]} />
            <Bar isAnimationActive={false} dataKey="cost" name="Teton cost" fill={COST} barSize={barSize} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function CumulativeChart({ data, paybackMonth }: { data: MonthPoint[]; paybackMonth: number | null }) {
  return (
    <div>
      <p className="text-xs text-teton-dark-gray mb-2">
        Running total of net benefit, discounted at the customer’s rate.{' '}
        {paybackMonth ? `It goes positive and stays there from month ${paybackMonth}.` : 'It does not stay positive within the horizon.'}
      </p>
      <div className="h-64" role="img" aria-label={`Cumulative discounted net benefit by month${paybackMonth ? `; payback in month ${paybackMonth}` : ''}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval={data.length > 24 ? 5 : data.length > 12 ? 2 : 0} />
            <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={56} />
            <Tooltip content={<Tip />} />
            <ReferenceLine y={0} stroke={AXIS} strokeWidth={1} />
            {paybackMonth && (
              <ReferenceLine x={paybackMonth} stroke="#1E1E1E" strokeWidth={1} label={{ value: `Payback · month ${paybackMonth}`, position: 'insideTopLeft', fontSize: 11, fill: '#1E1E1E' }} />
            )}
            <Area isAnimationActive={false} type="monotone" dataKey="cumulativeDiscounted" name="Cumulative discounted net" stroke={COST} strokeWidth={2} fill={COST} fillOpacity={0.1} dot={false} activeDot={{ r: 4, stroke: '#fff', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

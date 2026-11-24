'use client';

/**
 * Pricing check: the first section on View Results. Every total, the formula behind it with this deal's values,
 * and the inputs that went in, to compare line by line with the company's pricing workbooks. Collapsed by default
 * (the header shows the self-check results); downloads as a workbook with live formulas.
 */
import { useMemo, useState } from 'react';
import { Collapse } from '@/components/form/fields';
import { SegGroup } from '@/components/form/SegGroup';
import type { CheckGroup, CheckRow, PricingCheck as Check, Piece } from '@/lib/quote/pricingCheck';
import { pricingCheckXlsx } from '@/lib/quote/pricingCheckXlsx';
import { count, usd } from '@/lib/format';

type ProductView = 'all' | 'subscription' | 'ecall' | 'capex';
const PRODUCT_LABEL: Record<ProductView, string> = { all: 'All products', subscription: 'Subscription', ecall: 'E-Call', capex: 'Equipment purchase' };
const GROUP_PILL: Record<CheckGroup['key'], string> = {
  subscription: 'bg-[#E5EEFC] text-[#1F5FB5]',
  ecall: 'bg-[#FDE6DF] text-[#B4442C]',
  capex: 'bg-teton-pale-purple text-[#6B3FA6]',
  results: 'bg-teton-off-white text-teton-dark-gray',
};
const GROUP_TAG: Record<CheckGroup['key'], string> = { subscription: 'Subscription', ecall: 'E-Call', capex: 'Equipment purchase', results: 'Results' };

const resultText = (r: CheckRow) => (r.unit === 'count' ? count(r.result) : r.unit === 'usd_mo' ? `${usd(r.result)} / mo` : usd(r.result));
const pieceText = (ps: Piece[]) => ps.map((p) => (typeof p === 'string' ? p : p.v)).join('');

function Formula({ pieces }: { pieces: Piece[] }) {
  return (
    <span className="font-mono text-[11.5px] leading-5 text-teton-ink">
      {pieces.map((p, i) =>
        typeof p === 'string' ? (
          <span key={i}>{p}</span>
        ) : (
          <span key={i} className="rounded bg-[#EEF4FD] px-1 text-[#1F4F96] whitespace-nowrap">{p.v}</span>
        ),
      )}
    </span>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void }) {
  return (
    <SegGroup label={label} className="inline-flex flex-wrap rounded-lg border border-teton-pale-gray bg-white p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors duration-200 ${value === v ? 'text-white' : 'text-teton-dark-gray hover:bg-teton-off-white'}`}
        >
          {l}
        </button>
      ))}
    </SegGroup>
  );
}

export function PricingCheck({ check, dealName, showing }: { check: Check; dealName: string; showing: string }) {
  const [open, setOpen] = useState(false);
  const [product, setProduct] = useState<ProductView>('all');
  const [community, setCommunity] = useState('');
  const [view, setView] = useState<'formulas' | 'inputs'>('formulas');
  const [copied, setCopied] = useState(false);

  const products = useMemo(() => {
    const has = new Set(check.groups.map((g) => g.key));
    return (['all', 'subscription', 'ecall', 'capex'] as ProductView[]).filter((p) => p === 'all' || has.has(p));
  }, [check.groups]);

  const inputs = check.inputs.filter((r) => product === 'all' || r.product === product || r.product === 'terms');
  const scope = check.scope.filter((s) => !community || s.name === community);
  const groups = check.groups
    .filter((g) => (product === 'all' ? true : g.key === product))
    .map((g) => ({ ...g, rows: g.rows.filter((r) => (community ? r.community === community : r.community == null)) }))
    .filter((g) => g.rows.length);
  const careCols = (['il', 'al', 'mc', 'snf'] as const).filter((k) => check.scope.some((s) => s.beds[k] > 0));
  const hasEcall = check.scope.some((s) => s.devices > 0);
  const hasPilot = check.scope.some((s) => s.pilot);
  const perRoom = check.ecallBilling === 'room';
  const failed = check.checks.filter((c) => !c.ok && !c.warn).length;
  const warned = check.checks.filter((c) => c.warn).length;

  const copy = async () => {
    const lines = [['Product', 'Community', 'Line', 'Formula', 'Result'].join('\t')];
    for (const g of groups) for (const r of g.rows) lines.push([GROUP_TAG[g.key], r.community ?? 'All', r.label, pieceText(r.formula), String(Math.round(r.result * 100) / 100)].join('\t'));
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };
  const download = () => {
    const bytes = pricingCheckXlsx(check, { deal: dealName, showing });
    const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(dealName || 'deal').replace(/[^\w\- ]+/g, '').trim() || 'deal'} - pricing check.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="card" aria-labelledby="pcheck-h">
      <div>
        <button type="button" className="w-full text-left group" aria-expanded={open} aria-controls="pcheck-body" onClick={() => setOpen((o) => !o)}>
          <h2 id="pcheck-h" className="text-base font-semibold flex flex-wrap items-center gap-x-2 gap-y-1">
            <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`}><path d="M7 5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Pricing check
            <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${failed ? 'bg-teton-red/30 text-[#9B1C1C]' : warned ? 'bg-teton-pale-yellow text-[#8A5A00]' : 'bg-[#E8F4EC] text-[#2E7D52]'}`}>
              {failed ? `${failed} ${failed === 1 ? 'check fails' : 'checks fail'}` : warned ? `Checks pass · ${check.checks.find((c) => c.warn)?.label.toLowerCase()}` : 'All checks pass'}
            </span>
          </h2>
          <p className="text-sm text-teton-ui-gray mt-1 pl-6">Every total, the formula behind it with this deal’s values, and the inputs that went in, to compare line by line with the pricing workbooks.</p>
        </button>
      </div>

      <Collapse open={open} id="pcheck-body">
        <div className="pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {products.length > 2 && <Seg label="Product" value={product} options={products.map((p) => [p, PRODUCT_LABEL[p]])} onChange={setProduct} />}
            {check.communities.length > 1 && (
              <select aria-label="Community" className="input-field w-auto py-1.5 text-sm" value={community} onChange={(e) => setCommunity(e.target.value)}>
                <option value="">All communities</option>
                {check.communities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            <Seg label="Show" value={view} options={[['formulas', 'Formulas'], ['inputs', 'Inputs only']]} onChange={setView} />
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <button type="button" className="btn-secondary text-xs" onClick={copy}>{copied ? 'Copied' : 'Copy table'}</button>
              <button type="button" className="btn-primary text-xs" onClick={download}>Download workbook (.xlsx)</button>
            </div>
          </div>

          <ul className="flex flex-wrap gap-2 mt-3" aria-label="Self-checks">
            {check.checks.map((c) => (
              <li key={c.key} title={c.detail} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.ok ? 'bg-[#E8F4EC] text-[#2E7D52]' : c.warn ? 'bg-teton-pale-yellow text-[#8A5A00]' : 'bg-teton-red/30 text-[#9B1C1C]'}`}>
                <span aria-hidden="true">{c.ok ? '✓' : '!'}</span>
                {c.label}
                {!c.ok && <span className="font-normal">· {c.detail}</span>}
              </li>
            ))}
          </ul>

          <div className="grid gap-4 mt-4 lg:grid-cols-2">
            <div className="rounded-lg border border-teton-off-white overflow-hidden">
              <h3 className="flex justify-between gap-2 bg-teton-almost-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-teton-dark-gray border-b border-teton-off-white">
                Pricing inputs <span className="normal-case tracking-normal font-normal text-teton-ui-gray">this deal vs the price book</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[420px]">
                  <thead><tr className="text-[10.5px] uppercase tracking-wide text-teton-ui-gray"><th className="text-left font-semibold px-3 py-2">Input</th><th className="text-right font-semibold px-3 py-2">This deal</th><th className="text-right font-semibold px-3 py-2">Price book</th></tr></thead>
                  <tbody className="tabular-nums">
                    {inputs.map((r) => (
                      <tr key={r.key} className="border-t border-teton-off-white">
                        <td className="px-3 py-1.5 font-medium">{r.label}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{r.differs ? <span className="rounded bg-teton-pale-yellow px-1.5 font-semibold text-[#8A5A00]" title="Differs from the price book">{r.deal}</span> : r.deal}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap text-teton-ui-gray text-xs">{r.book ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-lg border border-teton-off-white overflow-hidden self-start">
              <h3 className="flex justify-between gap-2 bg-teton-almost-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-teton-dark-gray border-b border-teton-off-white">
                Scope inputs <span className="normal-case tracking-normal font-normal text-teton-ui-gray">communities and room types</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[420px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-teton-ui-gray">
                      <th className="text-left font-semibold px-3 py-2">Community</th>
                      {careCols.map((c) => <th key={c} className="text-right font-semibold px-2 py-2">{c}</th>)}
                      <th className="text-right font-semibold px-2 py-2">Billed</th>
                      <th className="text-right font-semibold px-2 py-2">Sensors</th>
                      {hasEcall && <th className="text-right font-semibold px-2 py-2">Devices</th>}
                      {hasEcall && perRoom && <th className="text-right font-semibold px-2 py-2">Rooms billed</th>}
                      {hasEcall && <th className="text-right font-semibold px-3 py-2">Areas</th>}
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {scope.map((s) => (
                      <tr key={s.name} className="border-t border-teton-off-white">
                        <td className="px-3 py-1.5 font-medium">
                          {s.name}
                          {s.pilot && <span className="badge-green ml-1.5">pilot · {count(s.pilotUnits)}</span>}
                          {s.ecallOnly && <span className="ml-1.5 rounded-full bg-[#FDE6DF] px-1.5 text-[10px] font-semibold text-[#B4442C]">E-Call only</span>}
                        </td>
                        {careCols.map((c) => <td key={c} className="px-2 py-1.5 text-right">{count(s.beds[c])}</td>)}
                        <td className="px-2 py-1.5 text-right">{count(s.billedBeds)}</td>
                        <td className="px-2 py-1.5 text-right">{s.sensors ? count(s.sensors) : '—'}</td>
                        {hasEcall && <td className="px-2 py-1.5 text-right whitespace-nowrap">{count(s.devices)}{s.contingency > 0 && <span className="text-teton-ui-gray text-xs"> +{count(s.contingency)}</span>}</td>}
                        {hasEcall && perRoom && <td className="px-2 py-1.5 text-right whitespace-nowrap">{count(s.ecallUnits)}{s.extraDevices > 0 && <span className="text-teton-ui-gray text-xs" title="Additional devices, one-time"> · {count(s.extraDevices)} extra</span>}</td>}
                        {hasEcall && <td className="px-3 py-1.5 text-right">{count(s.areas)}</td>}
                      </tr>
                    ))}
                    {scope.length > 1 && (
                      <tr className="border-t-2 border-teton-ink font-semibold">
                        <td className="px-3 py-1.5">Total</td>
                        {careCols.map((c) => <td key={c} className="px-2 py-1.5 text-right">{count(scope.reduce((n, s) => n + s.beds[c], 0))}</td>)}
                        <td className="px-2 py-1.5 text-right">{count(scope.reduce((n, s) => n + s.billedBeds, 0))}</td>
                        <td className="px-2 py-1.5 text-right">{count(scope.reduce((n, s) => n + s.sensors, 0))}</td>
                        {hasEcall && <td className="px-2 py-1.5 text-right">{count(scope.reduce((n, s) => n + s.devices, 0))}</td>}
                        {hasEcall && perRoom && <td className="px-2 py-1.5 text-right">{count(scope.reduce((n, s) => n + s.ecallUnits, 0))}</td>}
                        {hasEcall && <td className="px-3 py-1.5 text-right">{count(scope.reduce((n, s) => n + s.areas, 0))}</td>}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="px-3 py-2 text-xs text-teton-ui-gray border-t border-teton-off-white">
                Billed: beds priced per bed{hasPilot ? '; pilot beds billed at the pilot rate during the pilot' : ''}. Sensors: additional sensors.
                {hasEcall &&
                  (perRoom
                    ? ' Devices: pendants / pull-cords in rooms and common areas; the contingency (+n) is not billed. Rooms billed: rooms with E-Call + common areas with devices (billed monthly); devices beyond them are one-time extras.'
                    : ' Devices: pendants / pull-cords in rooms and common areas, billed monthly; the contingency (+n) is not billed.')}
              </p>
            </div>
          </div>

          <Collapse open={view === 'formulas'}>
            <div className="rounded-lg border border-teton-off-white overflow-hidden mt-4">
              <h3 className="flex justify-between gap-2 bg-teton-almost-white px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-teton-dark-gray border-b border-teton-off-white">
                Calculations <span className="normal-case tracking-normal font-normal text-teton-ui-gray">formula with this deal’s values · result</span>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px] min-w-[720px]">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-teton-ui-gray">
                      <th className="text-left font-semibold px-3 py-2 w-[26%]">Line</th>
                      <th className="text-left font-semibold px-3 py-2">Formula, with this deal’s values</th>
                      <th className="text-right font-semibold px-3 py-2 w-[14%]">Result</th>
                      <th className="text-left font-semibold px-3 py-2 w-[13%]">Also shown on</th>
                    </tr>
                  </thead>
                  {groups.map((g) => (
                    <tbody key={g.key}>
                      <tr className="bg-teton-almost-white">
                        <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-teton-dark-gray">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] mr-2 ${GROUP_PILL[g.key]}`}>{GROUP_TAG[g.key]}</span>
                          {g.title}
                          <span className="ml-2 normal-case tracking-normal font-normal text-teton-ui-gray">{g.note}</span>
                        </td>
                      </tr>
                      {g.rows.map((r) => (
                        <tr key={r.key} className={r.total ? 'border-t-[1.5px] border-teton-ink font-semibold' : 'border-t border-teton-off-white'}>
                          <td className="px-3 py-1.5 align-top">{r.label}</td>
                          <td className="px-3 py-1.5 align-top"><Formula pieces={r.formula} /></td>
                          <td className="px-3 py-1.5 align-top text-right tabular-nums font-semibold whitespace-nowrap">{resultText(r)}</td>
                          <td className={`px-3 py-1.5 align-top text-xs ${r.total ? 'text-teton-ink' : 'text-teton-ui-gray'}`}>{r.alsoOn ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                  {!groups.length && (
                    <tbody><tr><td colSpan={4} className="px-3 py-4 text-sm text-teton-ui-gray">Nothing for this product{community ? ' at this community' : ''}.</td></tr></tbody>
                  )}
                </table>
              </div>
              {community && <p className="px-3 py-2 text-xs text-teton-ui-gray border-t border-teton-off-white">Deal-wide rows (software &amp; services, cost of ownership, results) show with All communities.</p>}
            </div>
          </Collapse>
        </div>
      </Collapse>
    </section>
  );
}

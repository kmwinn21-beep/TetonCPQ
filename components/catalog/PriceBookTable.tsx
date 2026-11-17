'use client';

/**
 * The price book's product list. Admins can change each list price in place
 * (saved when the box loses focus or on Enter) and put it back to the standard
 * price; everyone else sees it read-only.
 */
import { useState } from 'react';
import { NumInput } from '@/components/form/NumInput';
import type { PriceBookRow } from '@/lib/data/priceBook';
import { productGroup } from '@/lib/pricing/catalog';

const MODEL_LABEL: Record<string, string> = {
  per_bed_month: 'per bed / month',
  per_bed_once: 'per bed, one-time',
  per_unit_once: 'each, one-time',
  per_unit_month: 'each / month',
  multiplier: '× rooms-only price',
};

const fmt = (r: Pick<PriceBookRow, 'pricingModel'>, v: number) =>
  r.pricingModel === 'multiplier' ? `${v}×` : `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

const when = (s: string) => {
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function PriceBookTable({ rows: initial, canEdit }: { rows: PriceBookRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial);
  const [typed, setTyped] = useState<Record<string, number | null>>({});
  const [state, setState] = useState<Record<string, { busy?: boolean; error?: string; saved?: boolean }>>({});

  const save = async (r: PriceBookRow, list: number | null | 'default') => {
    if (list !== 'default' && list === r.list) {
      setTyped(({ [r.sku]: _drop, ...rest }) => rest);
      return;
    }
    setState((s) => ({ ...s, [r.sku]: { busy: true } }));
    try {
      const res = await fetch(`/api/catalog/${encodeURIComponent(r.sku)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ list }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not save');
      setRows((rs) => rs.map((x) => (x.sku === r.sku ? (body as PriceBookRow) : x)));
      setTyped(({ [r.sku]: _drop, ...rest }) => rest);
      setState((s) => ({ ...s, [r.sku]: { saved: true } }));
      setTimeout(() => setState((s) => (s[r.sku]?.saved ? { ...s, [r.sku]: {} } : s)), 2000);
    } catch (e) {
      setState((s) => ({ ...s, [r.sku]: { error: e instanceof Error ? e.message : 'Could not save' } }));
    }
  };

  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-teton-almost-white text-left text-xs text-teton-dark-gray">
          <tr>
            <th className="px-4 py-2.5 font-medium">Product</th>
            <th className="px-4 py-2.5 font-medium text-right">List</th>
            <th className="px-4 py-2.5 font-medium">Unit</th>
            <th className="px-4 py-2.5 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => {
            const st = state[r.sku] ?? {};
            const group = productGroup(r.sku);
            const header =
              ri === 0 || productGroup(rows[ri - 1].sku) !== group ? (
                <tr key={`${group}-h`} className="border-t border-teton-off-white bg-teton-almost-white/60">
                  <td colSpan={4} className="px-4 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-teton-dark-gray">{group === 'capex' ? 'Equipment purchase (CapEx)' : group === 'finish' ? 'Installation finish' : 'Recurring subscription'}</span>
                    <span className="ml-2 text-xs text-teton-ui-gray">{group === 'capex' ? 'Title passes at install; perpetual embedded license; no separate installation charge or license fee.' : group === 'finish' ? 'Standard (raceway) installation is included. Concealed cabling is an add-on range per room, pending the site survey; the standard value is credited.' : 'No title transfer.'}</span>
                  </td>
                </tr>
              ) : null;
            const changed = r.defaultList != null && r.list !== r.defaultList;
            const value = r.sku in typed ? typed[r.sku] : r.list;
            return [
              header,
              <tr key={r.sku} className="border-t border-teton-off-white align-top">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {canEdit ? (
                    <div className="ml-auto w-32">
                      <NumInput
                        value={value}
                        onChange={(v) => setTyped((t) => ({ ...t, [r.sku]: v }))}
                        onBlur={() => r.sku in typed && save(r, typed[r.sku])}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        prefix={r.pricingModel === 'multiplier' ? undefined : '$'}
                        suffix={r.pricingModel === 'multiplier' ? '×' : undefined}
                        min={r.pricingModel === 'multiplier' ? 1 : 0}
                        disabled={st.busy}
                        invalid={!!st.error}
                        aria-label={`${r.name} list price`}
                        className="text-right"
                      />
                    </div>
                  ) : (
                    fmt(r, r.list)
                  )}
                  {st.error && <p className="text-xs mt-1 text-left rounded bg-teton-red/30 px-2 py-0.5">{st.error}</p>}
                  {st.saved && <p className="text-xs mt-1 text-teton-ui-gray">Saved</p>}
                  {changed && (
                    <p className="text-xs mt-1 text-teton-ui-gray whitespace-nowrap">
                      Default {fmt(r, r.defaultList!)}
                      {canEdit && (
                        <>
                          {' · '}
                          <button type="button" className="underline hover:text-teton-ink" onClick={() => save(r, 'default')} disabled={st.busy}>
                            Reset
                          </button>
                        </>
                      )}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-teton-ui-gray">{MODEL_LABEL[r.pricingModel]}</td>
                <td className="px-4 py-3 text-teton-dark-gray">
                  {r.description}
                  {changed && r.updatedByName && (
                    <span className="block text-xs text-teton-ui-gray mt-1">
                      Changed {when(r.updatedAt)} by {r.updatedByName}
                    </span>
                  )}
                </td>
              </tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

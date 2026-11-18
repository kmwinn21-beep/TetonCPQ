'use client';

/**
 * What changed between the version on screen and another one: the inputs that
 * moved, and what that did to the headline numbers.
 */
import { capexFor } from '@/lib/quote/outputs';
import type { StoredOutputs, VersionSummary } from '@/lib/data/quotes';
import type { QuoteDraft } from '@/lib/quote/draft';
import { diffDrafts } from '@/lib/quote/diff';
import { year1Figures } from '@/lib/quote/year1';
import { dateLabel, multiple, usd } from '@/lib/format';

export interface CompareTarget {
  id: number;
  versionNo: number;
  savedAt: string | null;
  inputs: QuoteDraft;
  outputs: StoredOutputs;
}

interface Props {
  currentLabel: string;
  current: { inputs: QuoteDraft; outputs: Omit<StoredOutputs, 'capex'> & { capex?: StoredOutputs['capex'] } };
  compare: CompareTarget | null;
  options: VersionSummary[];
  onPick: (id: number) => void;
}

export function VersionCompare({ currentLabel, current, compare, options, onPick }: Props) {
  if (!options.length) {
    return (
      <section className="card">
        <h2 className="text-base font-semibold">Changes between versions</h2>
        <p className="text-sm text-teton-ui-gray mt-1">Nothing to compare yet — save a version first.</p>
      </section>
    );
  }
  const changes = compare ? diffDrafts(compare.inputs, current.inputs) : [];
  // Each version's Year 1 figures follow what its own proposal shows (equipment purchase or subscription).
  const a = compare ? year1Figures(compare.inputs, compare.outputs) : null;
  const b = year1Figures(current.inputs, current.outputs);
  const payback = (m: number | null | undefined, h: number) => (m ? `Month ${m}` : `> ${h} mo`);
  const rows: Array<[string, string, string, number | null]> = a
    ? [
        ['Total Investment — Year 1', usd(a.investment), usd(b.investment), b.investment - a.investment],
        ['Net Benefit — Year 1', usd(a.net), usd(b.net), b.net - a.net],
        ['Gross Return per $1 Invested (Year 1)', multiple(a.gross), multiple(b.gross), null],
        ['Discounted Payback', payback(a.payback, a.horizon), payback(b.payback, b.horizon), null],
        ['Run-Rate Annual Net Benefit', usd(a.runRate), usd(b.runRate), b.runRate - a.runRate],
        ...(compare
          ? (() => {
              const ca = capexFor(compare.outputs, compare.inputs).equipment;
              const cb = capexFor(current.outputs, current.inputs).equipment;
              return [['Equipment purchase (one-time)', usd(ca), usd(cb), cb - ca] as [string, string, string, number]];
            })()
          : []),
      ]
    : [];
  const groups = Array.from(new Set(changes.map((c) => c.group)));

  return (
    <section className="card">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold">Changes between versions</h2>
          <p className="text-sm text-teton-ui-gray">From the version on the left to {currentLabel}.</p>
        </div>
        <div>
          <label htmlFor="compare" className="label">Compare with</label>
          <select id="compare" className="input-field w-64" value={compare?.id ?? ''} onChange={(e) => onPick(Number(e.target.value))}>
            {options.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.versionNo} · {dateLabel(v.savedAt)}{v.changeNote ? ` · ${v.changeNote}` : ''}
              </option>
            ))}
          </select>
        </div>
      </div>
      {compare && (
        <div className="grid gap-6 lg:grid-cols-2">
          <table className="w-full text-sm">
            <thead className="text-xs text-teton-dark-gray text-left">
              <tr>
                <th className="font-medium py-1.5" />
                <th className="font-medium py-1.5 text-right">v{compare.versionNo}</th>
                <th className="font-medium py-1.5 text-right">{currentLabel}</th>
                <th className="font-medium py-1.5 text-right">Change</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map(([label, from, to, delta]) => (
                <tr key={label} className="border-t border-teton-off-white">
                  <td className="py-2">{label}</td>
                  <td className="py-2 text-right">{from}</td>
                  <td className="py-2 text-right font-medium">{to}</td>
                  <td className="py-2 text-right text-teton-dark-gray">{delta == null || Math.abs(delta) < 0.5 ? (from === to ? '—' : '') : `${delta > 0 ? '+' : '−'}${usd(Math.abs(delta))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            {changes.length === 0 ? (
              <p className="text-sm text-teton-ui-gray">No input changes.</p>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g}>
                    <p className="text-xs font-medium text-teton-dark-gray mb-1">{g}</p>
                    <ul className="text-sm space-y-0.5">
                      {changes.filter((c) => c.group === g).map((c, i) => (
                        <li key={i} className="flex flex-wrap gap-x-2">
                          <span>{c.label}:</span>
                          <span className="text-teton-ui-gray line-through">{c.from}</span>
                          <span aria-hidden="true">→</span>
                          <span className="font-medium">{c.to}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

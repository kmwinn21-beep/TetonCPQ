'use client';

/**
 * The business case's "All four cases" block (returns page, added by the rep): the outcome cases side by side, as a
 * table (default) or four cards. The deal's modeled case is highlighted and tagged; the rep can take cases out.
 * Same numbers as the results page's matrix: every unit at its post-pilot price plus full installation.
 */
import type { ModelResult } from '@/lib/model';
import type { RoiCase } from '@/lib/model/types';
import { multiple, usd } from '@/lib/format';
import { T } from './EditableText';
import { V } from './ProposalSections';

export const CASES: RoiCase[] = ['stretch', 'target', 'base', 'underperforming'];
export const CASE_LABEL: Record<RoiCase, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };

type Row = { key: string; label: string; sub?: string; fmt: (rc: RoiCase) => string; neg: (rc: RoiCase) => boolean };

export function caseRows(outputs: Pick<ModelResult, 'annual'>, capRate: string): Row[] {
  const t = (rc: RoiCase) => outputs.annual[rc].totals;
  const money = (n: number) => usd(n, { compact: Math.abs(n) >= 10_000 });
  return [
    { key: 'roi', label: 'Annual ROI', sub: 'Benefit per year, every community live', fmt: (rc) => money(t(rc).annualRoi), neg: (rc) => t(rc).annualRoi < 0 },
    { key: 'return', label: 'Return on cost', sub: 'Benefit ÷ the cost of Teton', fmt: (rc) => multiple(t(rc).returnOnCost, 1), neg: (rc) => t(rc).returnOnCost < 0 },
    { key: 'breakeven', label: 'Breakeven', fmt: (rc) => `${t(rc).breakevenMonths.toFixed(1)} mo`, neg: () => false },
    { key: 'revpor', label: 'Net RevPOR', sub: 'Per occupied room, per year', fmt: (rc) => usd(t(rc).netRevpor), neg: (rc) => t(rc).netRevpor < 0 },
    { key: 'noi', label: 'Annual net NOI impact', fmt: (rc) => money(t(rc).annualNetNoiImpact), neg: (rc) => t(rc).annualNetNoiImpact < 0 },
    { key: 'value', label: 'Asset value added', sub: `At a ${capRate} cap rate`, fmt: (rc) => money(t(rc).valuationImpact), neg: (rc) => t(rc).valuationImpact < 0 },
  ];
}

export function FourCases({
  outputs,
  capRate,
  cards,
  hidden,
  editable,
  onHide,
}: {
  outputs: Pick<ModelResult, 'annual' | 'roiCase'>;
  capRate: string;
  cards: boolean;
  hidden: RoiCase[];
  editable: boolean;
  /** Take a case out (at least one stays). */
  onHide: (rc: RoiCase) => void;
}) {
  const shown = CASES.filter((rc) => !hidden.includes(rc));
  const rows = caseRows(outputs, capRate);
  const modeled = outputs.roiCase;
  const hideBtn = (rc: RoiCase) =>
    editable && shown.length > 1 ? (
      <button type="button" data-edit-ui className="no-print bc-cases-x" onClick={() => onHide(rc)} aria-label={`Take ${CASE_LABEL[rc]} out`} title={`Take ${CASE_LABEL[rc]} out`}>
        ✕
      </button>
    ) : null;
  const note = <p className="bc-note bc-cases-note"><T k="bc.cases.note" d="Every unit at its post-pilot price plus full installation. Each case applies higher or lower outcome assumptions to the same deal." /></p>;

  if (cards) {
    const main = rows[0];
    return (
      <>
        <div className="bc-cases-tiles" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
          {shown.map((rc) => (
            <div key={rc} className={`bc-cases-tile ${rc === modeled ? 'bc-on' : ''}`}>
              {hideBtn(rc)}
              <h5>
                <T k={`bc.cases.${rc}`} d={CASE_LABEL[rc]} />
                {rc === modeled && <> · <T k="bc.cases.modeled" d="Modeled" /></>}
              </h5>
              <b className={main.neg(rc) ? 'bc-neg' : ''}><V k={`bc.cases.${rc}.roi`} label={`${CASE_LABEL[rc]} annual ROI`}>{main.fmt(rc)}</V></b>
              <span className="bc-cases-s"><T k="bc.cases.roiShort" d="annual ROI" /></span>
              <dl>
                {rows.filter((r) => r.key !== 'roi' && r.key !== 'revpor').map((r) => (
                  <div key={r.key}>
                    <dt><T k={`bc.cases.r.${r.key}.short`} d={r.key === 'return' ? 'Return' : r.key === 'noi' ? 'Net NOI' : r.key === 'value' ? 'Asset value' : r.label} /></dt>
                    <dd className={r.neg(rc) ? 'bc-neg' : ''}><V k={`bc.cases.${rc}.${r.key}`} label={`${CASE_LABEL[rc]} ${r.label}`}>{r.fmt(rc)}</V></dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        {note}
      </>
    );
  }
  return (
    <>
      <div className="bc-card bc-tbl bc-cases-tbl">
        <table>
          <thead>
            <tr>
              <th><T k="bc.cases.head" d="Outcome case" /></th>
              {shown.map((rc) => (
                <th key={rc} className={`bc-r ${rc === modeled ? 'bc-hl' : ''}`}>
                  {hideBtn(rc)}
                  <T k={`bc.cases.${rc}`} d={CASE_LABEL[rc]} />
                  {rc === modeled && <span className="bc-cases-tag"><T k="bc.cases.modeled" d="Modeled" /></span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="bc-m">
                  <T k={`bc.cases.r.${r.key}`} d={r.label} />
                  {r.sub && <small><T k={`bc.cases.r.${r.key}.sub`} d={r.sub} /></small>}
                </td>
                {shown.map((rc) => (
                  <td key={rc} className={`bc-r ${rc === modeled ? 'bc-hl' : ''} ${r.neg(rc) ? 'bc-neg' : ''}`}>
                    <V k={`bc.cases.${rc}.${r.key}`} label={`${CASE_LABEL[rc]} ${r.label}`}>{r.fmt(rc)}</V>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note}
    </>
  );
}

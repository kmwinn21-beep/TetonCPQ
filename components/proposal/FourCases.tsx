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

/**
 * How the cases are costed. Subscription: the yearly cost is the fees once every community is live (`annualCost`).
 * Equipment purchase: the yearly cost of ownership (`annualCost`), year 1 is the equipment plus a year of software
 * (`year1`), and the running cost is the software and renewals (`running`): the equipment is capital, kept out of NOI.
 */
export type CaseBasis =
  | { kind: 'subscription'; annualCost: number }
  | { kind: 'capex'; annualCost: number; year1: number; running: number; occupied: number; capRate: number };

/** The rows, per case: annual ROI, stabilized return on cost, breakeven, net RevPOR, net NOI, asset value. */
export function caseRows(outputs: Pick<ModelResult, 'annual'>, capRate: string, basis: CaseBasis = { kind: 'subscription', annualCost: 0 }): Row[] {
  const t = (rc: RoiCase) => outputs.annual[rc].totals;
  const money = (n: number) => usd(n, { compact: Math.abs(n) >= 10_000 });
  // Subscription without a yearly cost given (tests, older callers): the fees at post-pilot prices.
  const cost = (rc: RoiCase) => (basis.annualCost > 0 ? basis.annualCost : t(rc).annualRecurringCost);
  const ret = (rc: RoiCase) => (cost(rc) > 0 ? t(rc).annualRoi / cost(rc) : 0);
  const cx = basis.kind === 'capex' ? basis : null;
  const breakeven = (rc: RoiCase) => (cx ? (t(rc).annualRoi > 0 ? cx.year1 / (t(rc).annualRoi / 12) : 0) : t(rc).breakevenMonths);
  const noi = (rc: RoiCase) => (cx ? t(rc).annualNetNoiImpact + t(rc).annualRecurringCost - cx.running : t(rc).annualNetNoiImpact);
  const revpor = (rc: RoiCase) => (cx ? (cx.occupied > 0 ? (t(rc).annualRoi - cx.running) / cx.occupied : 0) : t(rc).netRevpor);
  const value = (rc: RoiCase) => (cx ? (cx.capRate > 0 ? noi(rc) / cx.capRate : 0) : t(rc).valuationImpact);
  return [
    { key: 'roi', label: 'Annual ROI', sub: 'Benefit per year, every community live', fmt: (rc) => money(t(rc).annualRoi), neg: (rc) => t(rc).annualRoi < 0 },
    { key: 'return', label: 'Stabilized return on cost', sub: cx ? 'Benefit ÷ the yearly cost of ownership' : 'Benefit ÷ the yearly subscription', fmt: (rc) => multiple(ret(rc), 1), neg: (rc) => ret(rc) < 0 },
    { key: 'breakeven', label: 'Breakeven', sub: cx ? 'Equipment and the first year of software' : undefined, fmt: (rc) => `${breakeven(rc).toFixed(1)} mo`, neg: () => false },
    { key: 'revpor', label: 'Net RevPOR', sub: 'Per occupied room, per year', fmt: (rc) => usd(revpor(rc)), neg: (rc) => revpor(rc) < 0 },
    { key: 'noi', label: 'Annual net NOI impact', sub: cx ? 'The equipment is capital, not an operating cost' : undefined, fmt: (rc) => money(noi(rc)), neg: (rc) => noi(rc) < 0 },
    { key: 'value', label: 'Asset value added', sub: `At a ${capRate} cap rate`, fmt: (rc) => money(value(rc)), neg: (rc) => value(rc) < 0 },
  ];
}

export function FourCases({
  outputs,
  capRate,
  cards,
  hidden,
  editable,
  onHide,
  basis,
}: {
  outputs: Pick<ModelResult, 'annual' | 'roiCase'>;
  capRate: string;
  basis: CaseBasis;
  cards: boolean;
  hidden: RoiCase[];
  editable: boolean;
  /** Take a case out (at least one stays). */
  onHide: (rc: RoiCase) => void;
}) {
  const shown = CASES.filter((rc) => !hidden.includes(rc));
  const rows = caseRows(outputs, capRate, basis);
  const modeled = outputs.roiCase;
  const hideBtn = (rc: RoiCase) =>
    editable && shown.length > 1 ? (
      <button type="button" data-edit-ui className="no-print bc-cases-x" onClick={() => onHide(rc)} aria-label={`Take ${CASE_LABEL[rc]} out`} title={`Take ${CASE_LABEL[rc]} out`}>
        ✕
      </button>
    ) : null;
  const note = (
    <p className="bc-note bc-cases-note">
      {basis.kind === 'capex' ? (
        <T k="bc.cases.note.capex" d="Equipment purchase: the yearly cost of ownership over the hardware’s useful life; breakeven counts the equipment and the first year of software. Each case applies higher or lower outcome assumptions to the same deal." />
      ) : (
        <T k="bc.cases.note" d="Subscription: the yearly fees once every community is live; breakeven counts installation and the first year of fees. Each case applies higher or lower outcome assumptions to the same deal." />
      )}
    </p>
  );

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
                  <T k={`bc.cases.r.${r.key}${basis.kind === 'capex' ? '.cx' : ''}`} d={r.label} />
                  {r.sub && <small><T k={`bc.cases.r.${r.key}.sub${basis.kind === 'capex' ? '.cx' : ''}`} d={r.sub} /></small>}
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

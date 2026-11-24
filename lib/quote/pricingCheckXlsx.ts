/**
 * The pricing check as a workbook: Inputs, Scope, Calculations (quantity × price × months as live formulas,
 * subtotals as SUMs) and the same rows by community, so it can sit next to the company models.
 */
import { buildXlsx, colName, type Cell, type Sheet } from '@/lib/xlsx/write';
import type { CheckRow, PricingCheck } from './pricingCheck';

const TAG = { subscription: 'Subscription', ecall: 'E-Call', capex: 'Equipment purchase', results: 'Results' } as const;
const pieceText = (r: CheckRow) => r.formula.map((p) => (typeof p === 'string' ? p : p.v)).join('');

function calcSheet(name: string, check: PricingCheck, byCommunity: boolean): Sheet {
  const head: Cell[] = ['Product', ...(byCommunity ? ['Community'] : []), 'Line', 'Quantity', 'Unit price', 'Months', 'Result', 'Formula (as shown)', 'Also shown on'].map((v) => ({ v, s: 'head' as const }));
  const rows: Sheet['rows'] = [head];
  const off = byCommunity ? 1 : 0;
  const Q = colName(2 + off), U = colName(3 + off), M = colName(4 + off), R = colName(5 + off);
  for (const g of check.groups) {
    const items = g.rows.filter((r) => (byCommunity ? r.community != null : r.community == null));
    if (!items.length) continue;
    // With every community, a group's rows come per community; order them by community.
    const ordered = byCommunity ? check.communities.flatMap((c) => items.filter((r) => r.community === c)) : items;
    const calcRefs: string[] = [];
    const calcByCommunity = new Map<string, string[]>();
    for (const r of ordered) {
      const n = rows.length + 1;
      const first: Cell[] = [{ v: TAG[g.key], s: 'muted' }, ...(byCommunity ? [{ v: r.community ?? '' }] : [])];
      if (r.calc) {
        calcRefs.push(`${R}${n}`);
        if (r.community) calcByCommunity.set(r.community, [...(calcByCommunity.get(r.community) ?? []), `${R}${n}`]);
        rows.push([
          ...first,
          { v: r.label },
          { v: r.calc.qty, s: 'count' },
          { v: r.calc.unit, s: 'usd' },
          r.calc.months != null ? { v: r.calc.months, s: 'count' } : null,
          { f: r.calc.months != null ? `${Q}${n}*${U}${n}*${M}${n}` : `${Q}${n}*${U}${n}`, v: r.result, s: 'usd' },
          { v: pieceText(r), s: 'muted' },
          { v: r.alsoOn ?? '' },
        ]);
        continue;
      }
      // Subtotals over a group's price lines (sub / E-Call) and equipment rows become SUMs of the rows above.
      const refs = r.total && (g.key === 'subscription' || g.key === 'ecall' || r.key === 'cx.equipment') ? (r.community ? calcByCommunity.get(r.community) : calcRefs) : undefined;
      const isCount = r.unit === 'count';
      rows.push([
        ...first,
        { v: r.label + (r.unit === 'usd_mo' ? ' (per month)' : ''), s: r.total ? 'bold' : undefined },
        null,
        null,
        null,
        refs?.length ? { f: refs.length > 30 ? `SUM(${refs[0]}:${refs[refs.length - 1]})` : `SUM(${refs.join(',')})`, v: r.result, s: 'usdBold' } : { v: r.result, s: isCount ? 'count' : r.total ? 'usdBold' : 'usd' },
        { v: pieceText(r), s: 'muted' },
        { v: r.alsoOn ?? '' },
      ]);
    }
    rows.push([]);
  }
  return { name, widths: [18, ...(byCommunity ? [26] : []), 44, 11, 13, 9, 16, 70, 18], rows };
}

export function pricingCheckSheets(check: PricingCheck, meta: { deal: string; showing: string }): Sheet[] {
  const inputs: Sheet = {
    name: 'Inputs',
    widths: [52, 22, 22, 12],
    rows: [
      [{ v: 'Input', s: 'head' }, { v: 'This deal', s: 'head' }, { v: 'Price book', s: 'head' }, { v: 'Differs', s: 'head' }],
      ...check.inputs.map((r) => [r.label, r.deal, r.book ?? '', r.differs ? 'Yes' : '']),
      [],
      [{ v: `${meta.deal} · ${meta.showing}`, s: 'muted' }],
    ],
  };
  const scope: Sheet = {
    name: 'Scope',
    widths: [30, 10, 8, 8, 8, 8, 12, 10, 10, 13, 8],
    rows: [
      ['Community', 'Pilot beds', 'IL', 'AL', 'MC', 'SNF', 'Beds billed', 'Sensors', 'Devices', 'Contingency', 'Areas'].map((v) => ({ v, s: 'head' as const })),
      ...check.scope.map((s) => [s.name + (s.ecallOnly ? ' (E-Call only)' : ''), s.pilot ? s.pilotUnits : '', s.beds.il, s.beds.al, s.beds.mc, s.beds.snf, s.billedBeds, s.sensors, s.devices, s.contingency, s.areas]),
      [
        { v: 'Total', s: 'bold' },
        ...['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].map((c) => ({ f: `SUM(${c}2:${c}${check.scope.length + 1})`, s: 'bold' as const })),
      ],
    ],
  };
  const checks: Sheet = {
    name: 'Checks',
    widths: [56, 10, 70],
    rows: [
      [{ v: 'Check', s: 'head' }, { v: 'Result', s: 'head' }, { v: 'Detail', s: 'head' }],
      ...check.checks.map((c) => [c.label, c.ok ? 'OK' : c.warn ? 'Review' : 'Mismatch', c.detail]),
    ],
  };
  return [inputs, scope, calcSheet('Calculations', check, false), ...(check.communities.length > 1 ? [calcSheet('By community', check, true)] : []), checks];
}

export const pricingCheckXlsx = (check: PricingCheck, meta: { deal: string; showing: string }) => buildXlsx(pricingCheckSheets(check, meta));

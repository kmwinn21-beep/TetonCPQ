/**
 * The engine must reproduce the workbook. Each fixture in tests/fixtures was
 * produced by tools/oracle/build_fixtures.py: the workbook with a scenario's
 * edits applied, recalculated, and every output read back out. A failure here
 * means the engine and the spreadsheet disagree — fix before shipping.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runModel, runVendorView, ROI_CASES, type ModelInputs, type VendorCostAssumptions } from '@/lib/model';

const DIR = path.join(__dirname, 'fixtures');
const fixtures = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(path.join(DIR, f), 'utf8')));

/** Equal to 1e-9 relative (float summation order differs from Excel's). */
function close(actual: unknown, expected: unknown, where: string) {
  if (expected === null || expected === undefined || expected === '') {
    expect(actual === null || actual === 0 || actual === undefined, `${where}: expected empty, got ${actual}`).toBe(true);
    return;
  }
  const a = Number(actual);
  const e = Number(expected);
  const ok = Math.abs(a - e) <= 1e-9 * Math.max(1, Math.abs(e));
  expect(ok, `${where}: engine ${a} vs workbook ${e}`).toBe(true);
}

function closeArray(actual: number[], expected: unknown[], where: string) {
  expect(actual.length, `${where} length`).toBe(expected.length);
  expected.forEach((e, i) => close(actual[i], e, `${where}[${i}]`));
}

describe.each(fixtures)('workbook scenario: $scenario', (fx) => {
  const inputs = fx.inputs as ModelInputs;
  const exp = fx.expected;
  const result = runModel(inputs);
  const n = inputs.communities.length;

  it('occupied units per community', () => {
    const occ = result.cashFlow.communities.map((_, i) => result.annual.target.drivers[i].totalFalls / inputs.client.fallsPerResidentYear);
    closeArray(occ, exp.occupiedUnits, 'occupiedUnits');
  });

  for (const rc of ROI_CASES) {
    it(`drivers and annual ROI by community — ${rc}`, () => {
      for (let i = 0; i < n; i++) {
        for (const [k, v] of Object.entries(exp.drivers[rc][i])) close((result.annual[rc].drivers[i] as any)[k], v, `${rc}.drivers[${i}].${k}`);
        for (const [k, v] of Object.entries(exp.annual[rc][i])) close((result.annual[rc].communities[i] as any)[k], v, `${rc}.annual[${i}].${k}`);
      }
    });
    it(`annual totals, return on cost, NOI, valuation, breakeven — ${rc}`, () => {
      for (const [k, v] of Object.entries(exp.annualTotals[rc])) close((result.annual[rc].totals as any)[k], v, `${rc}.totals.${k}`);
    });
  }

  it('12-month cash flow by community', () => {
    const cf = result.cashFlow;
    for (let i = 0; i < n; i++) {
      const c = cf.communities[i];
      close(c.goLiveMonth, exp.cashflow.goLiveMonth[i], `goLive[${i}]`);
      close(c.installCost, exp.cashflow.installByCommunity[i], `install[${i}]`);
      close(c.roiStartMonth, exp.cashflow.roiStartMonth[i], `roiStart[${i}]`);
      close(c.fullRoiMonth, exp.cashflow.fullRoiMonth[i], `fullRoi[${i}]`);
      close(c.monthlyReimbursement, exp.cashflow.reimbursementByCommunity[i], `reimb[${i}]`);
      closeArray(c.fees, exp.cashflow.feesByCommunity[i], `fees[${i}]`);
      closeArray(c.gross, exp.cashflow.grossByCommunity[i], `gross[${i}]`);
    }
  });

  it('12-month cash flow totals', () => {
    const cf = result.cashFlow;
    for (const k of ['recurringFees', 'install', 'reimbursement', 'totalCost', 'grossBenefit', 'netBenefit', 'cumulativeNet', 'discountedNet', 'cumulativeDiscountedNet'] as const) {
      closeArray(cf[k], exp.cashflow[k === 'grossBenefit' ? 'grossBenefit' : k], k);
    }
  });

  it('KPI cards', () => {
    for (const [k, v] of Object.entries(exp.kpis)) {
      if (k === 'discountedPaybackLabel') {
        const m = result.kpis.discountedPaybackMonth;
        expect(m === null ? 'Beyond Month 12' : `Month ${m}`).toBe(v);
        continue;
      }
      close((result.kpis as any)[k], v, `kpis.${k}`);
    }
  });

  it('implementation timeline', () => {
    close(result.implementation.totalImplementationWeeks, exp.implementation.totalImplementationWeeks, 'weeks');
    expect(result.implementation.latestKickoffDate).toBe(exp.implementation.latestKickoffDate);
  });

  it('Teton vendor view (36 months)', () => {
    const v = runVendorView(inputs, exp.vendor.costAssumptions as VendorCostAssumptions);
    for (const k of ['billedUnits', 'pilotFees', 'postPilotFees', 'oneTimeFees', 'revenue', 'hardware', 'installLabor', 'sensors', 'cloudHosting', 'support', 'maintenanceReserve', 'costToServe', 'grossMargin', 'cac', 'netCashFlow', 'discountedNetCashFlow', 'cumulativeDiscountedNetCashFlow'] as const) {
      closeArray(v[k], exp.vendor[k], `vendor.${k}`);
    }
    for (const k of ['totalRevenue36', 'grossMarginPct36', 'netMarginPct36', 'peakCashOutlay', 'npv36'] as const) close(v.summary[k], exp.vendor.summary[k], `vendor.${k}`);
    const label = (m: number | null) => (m === 0 ? 'Immediate' : m === null ? '> 36 months' : `Month ${m}`);
    if (exp.vendor.summary.paybackLabel) expect(label(v.summary.paybackMonth)).toBe(exp.vendor.summary.paybackLabel);
    if (exp.vendor.summary.discountedPaybackLabel) expect(label(v.summary.discountedPaybackMonth)).toBe(exp.vendor.summary.discountedPaybackLabel);
  });
});

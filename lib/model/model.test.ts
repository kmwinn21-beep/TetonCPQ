import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findTrace, runModel, type ModelInputs, type Trace } from './index';
import { defaultInputs, STANDARD_CASE_METRICS, uniformCaseMetrics, DEFAULT_CLIENT } from './defaults';

const saved = JSON.parse(readFileSync(path.join(__dirname, '../../tests/fixtures/workbook_as_saved.json'), 'utf8'));
const inputs = saved.inputs as ModelInputs;

function walk(t: Trace, f: (t: Trace) => void) {
  f(t);
  t.inputs.forEach((c) => walk(c, f));
}

describe('traces', () => {
  const r = runModel(inputs);

  it('every KPI card has a trace whose value equals the KPI', () => {
    for (const k of ['totalInvestment12', 'netBenefit12', 'grossReturnPerDollar12', 'discountedPaybackMonth', 'runRateAnnualNetBenefit', 'netBenefitPerOccupiedUnitMonth', 'netBenefitPerUnitMonth'] as const) {
      expect(r.traces[`kpi.${k}`]?.value, k).toBe(r.kpis[k]);
    }
  });

  it('"sum over communities" traces add up to their parent', () => {
    for (const t of Object.values(r.traces)) {
      walk(t, (node) => {
        if (node.formula !== 'Sum over communities') return;
        const s = node.inputs.reduce((a, c) => a + (c.value ?? 0), 0);
        expect(Math.abs(s - (node.value ?? 0)), node.id).toBeLessThan(1e-6 * Math.max(1, Math.abs(node.value ?? 0)));
      });
    }
  });

  it('drills from a portfolio figure down to entered assumptions', () => {
    const fall = r.traces['annual.fallCostAvoidance'];
    expect(fall.value).toBe(r.annual.target.totals.fallCostAvoidance);
    const occupancy = findTrace(fall, 'in.occupancy');
    expect(occupancy?.value).toBe(0.9);
    expect(occupancy?.workbookRef).toBe('Assumptions!C29');
    // every leaf is an input
    walk(fall, (n) => {
      if (n.inputs.length === 0) expect(n.formula).toBe('Input');
    });
  });

  it('total investment trace decomposes into fees + install + reimbursement', () => {
    const t = r.traces['kpi.totalInvestment12'];
    expect(t.inputs.map((c) => c.id)).toEqual(['cf.recurring12', 'cf.install12', 'cf.reimbursement12']);
    expect(t.inputs.reduce((s, c) => s + (c.value ?? 0), 0)).toBeCloseTo(r.kpis.totalInvestment12, 6);
  });
});

describe('36-month horizon', () => {
  const r12 = runModel(inputs);
  const r36 = runModel({ ...inputs, schedule: { ...inputs.schedule, horizonMonths: 36 } });

  it('first 12 months are identical to the 12-month model', () => {
    expect(r36.cashFlow.netBenefit.slice(0, 12)).toEqual(r12.cashFlow.netBenefit);
    expect(r36.kpis.totalInvestment12).toBe(r12.kpis.totalInvestment12);
    expect(r36.kpis.netBenefit12).toBe(r12.kpis.netBenefit12);
  });

  it('run-rate uses the final month of the horizon, when every site is live and ramped', () => {
    const fullMonthly = r36.annual.target.totals.annualRoi / 12;
    const units = inputs.communities.reduce((s, c) => s + c.units, 0);
    expect(r36.kpis.runRateAnnualNetBenefit).toBeCloseTo((fullMonthly - units * inputs.pricing.postPilotFeePerBedMonth) * 12, 4);
  });

  it('payback is searched across all 36 months', () => {
    expect(r36.kpis.discountedPaybackMonth).not.toBeNull();
    expect(r36.cashFlow.cumulativeDiscountedNet.slice((r36.kpis.discountedPaybackMonth as number) - 1).every((v) => v > 0)).toBe(true);
  });
});

describe('defaults', () => {
  it('match the standard case metrics from the brief', () => {
    expect(STANDARD_CASE_METRICS.target).toMatchObject({ moveInUplift: 0.1, staffingAlignment: 0.1, techReplacement: 0.95 });
    expect(STANDARD_CASE_METRICS.underperforming).toMatchObject({ moveInUplift: 0.03, staffingAlignment: 0, techReplacement: 0 });
  });
  it('uniform mode derives staffing from the night ratios (1 − 9/10)', () => {
    expect(uniformCaseMetrics(DEFAULT_CLIENT).base.staffingAlignment).toBeCloseTo(0.1, 12);
  });
  it('a default deal runs end to end', () => {
    const d = defaultInputs('2027-03-01');
    d.communities = [{ name: 'A', market: 'CO', units: 100, pilot: true, pilotUnits: null, occupancy: null, goLiveMonth: null, roiDelayMonths: null, additionalSensors: 0 }];
    d.cfo.portfolioUnits = 100;
    const r = runModel(d);
    expect(r.cashFlow.months).toHaveLength(36);
    // $75 pilot for 3 months, then $99
    expect(r.cashFlow.recurringFees.slice(0, 4)).toEqual([7500, 7500, 7500, 9900]);
    // no benefit during the pilot
    expect(r.cashFlow.grossBenefit.slice(0, 3)).toEqual([0, 0, 0]);
    expect(r.cashFlow.grossBenefit[3]).toBeGreaterThan(0);
  });
});

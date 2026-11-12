/**
 * Teton ROI / cost-benefit engine. Pure functions only: no React, no database,
 * no clock. Same inputs always give the same outputs, so a saved quote version
 * can be re-run and must reproduce what was sent.
 */
import { annualAllCases, totalOccupiedUnits, type AnnualCaseResult } from './annual';
import { buildCashFlow, type CashFlow } from './cashflow';
import { implementationTimeline, type ImplementationTimeline } from './implementation';
import { computeKpis, type Kpis } from './kpis';
import { buildTraces } from './traces';
import type { Trace } from './trace';
import type { ModelInputs, RoiCase, VendorCostAssumptions } from './types';
import { vendorView, type VendorView } from './vendor';

/** Bump whenever a change could alter any output. Stored on every quote version. */
export const ENGINE_VERSION = '1.2.0';

export interface ModelResult {
  engineVersion: string;
  roiCase: RoiCase;
  /** Steady-state annual ROI for every case (the breakeven table compares all four). */
  annual: Record<RoiCase, AnnualCaseResult>;
  cashFlow: CashFlow;
  kpis: Kpis;
  implementation: ImplementationTimeline;
  traces: Record<string, Trace>;
}

export function runModel(inputs: ModelInputs): ModelResult {
  const annual = annualAllCases(inputs);
  const selected = annual[inputs.roiCase];
  const cashFlow = buildCashFlow(inputs, selected);
  const kpis = computeKpis(inputs, selected, cashFlow, totalOccupiedUnits(inputs));
  return {
    engineVersion: ENGINE_VERSION,
    roiCase: inputs.roiCase,
    annual,
    cashFlow,
    kpis,
    implementation: implementationTimeline(inputs.implementation),
    traces: buildTraces(inputs, selected, cashFlow, kpis),
  };
}

/** Teton's internal margin view. Kept out of runModel so it can never leak into a proposal by accident. */
export function runVendorView(inputs: ModelInputs, costs?: VendorCostAssumptions): VendorView {
  return vendorView(inputs, annualAllCases(inputs)[inputs.roiCase], costs);
}

export * from './types';
export * from './defaults';
export type { Trace } from './trace';
export { computeCapex, type CapexResult } from './capex';
export { findTrace } from './trace';

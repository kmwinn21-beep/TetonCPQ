/**
 * The totals the business case shows, for the inputs page's live preview: the
 * investment table (equipment purchase and/or subscription, every row, even
 * ones removed from a proposal), the scope (Edge units and sensors) and the
 * pilot page's cost table.
 */
import type { ModelInputs, ModelResult } from '@/lib/model';
import type { PriceBook } from '@/lib/pricing/catalog';
import { buildPriceLines, lineTotal, type PriceLine } from '@/lib/pricing/lines';
import { computeCapex, grossBaseRows, grossSensorRow } from '@/lib/pricing/capex';
import { computeFinish } from '@/lib/pricing/finish';
import { installMath, sensorMath } from '@/lib/proposal/costMath';
import { scopeOf, type QuoteDraft } from './draft';

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export interface PreviewTotals {
  scope: { edgeUnits: number; sensors: number; additionalSensors: number };
  capex: null | { basePackages: number; ecallUnits: number; sensors: number; equipment: number; softwareMonthly: number; renewals: number; ownership: number; years: number };
  opex: null | { install: number; sensors: number; monthly: number; year1: number };
  pilot: null | { install: number; sensors: number; fees: number; total: number; months: number };
  finish: null | { low: number; high: number };
}

export function previewTotals(draft: QuoteDraft, inputs: ModelInputs, result: ModelResult, book: PriceBook): PreviewTotals {
  const lines = buildPriceLines(draft, inputs, book);
  // Edge units and sensors are resident monitoring hardware: only monitored beds get them.
  const monitored = draft.communities.filter((c) => scopeOf(c).monitored > 0);
  const beds = sum(monitored.map((c) => scopeOf(c).monitored));
  const additional = sum(monitored.map((c) => Math.max(0, Number(c.additionalSensors) || 0)));
  const showCapex = draft.presentation !== 'opex';
  const showOpex = draft.presentation !== 'capex';

  let capex: PreviewTotals['capex'] = null;
  if (showCapex) {
    const c = computeCapex(draft);
    capex = {
      basePackages: sum(grossBaseRows(c).filter((r) => r.key !== 'ecallonly').map((r) => r.total)),
      ecallUnits: sum(grossBaseRows(c).filter((r) => r.key === 'ecallonly').map((r) => r.total)),
      sensors: grossSensorRow(c)?.total ?? 0,
      equipment: c.equipment,
      softwareMonthly: c.softwareMonthly,
      renewals: c.renewals,
      ownership: c.ownershipTotal,
      years: c.ownershipMonths / 12,
    };
  }

  let opex: PreviewTotals['opex'] = null;
  if (showOpex) {
    const ins = installMath(lines);
    opex = {
      install: ins.gross - ins.credit,
      sensors: sensorMath(lines).total,
      monthly: sum(lines.filter((l) => l.billing === 'monthly' && !l.description.includes('pilot') && !l.description.includes('introductory')).map((l) => l.qty * l.unitNet)),
      year1: result.kpis.totalInvestment12,
    };
  }

  // The pilot page: pilot sites' installation, sensors and pilot fees.
  let pilot: PreviewTotals['pilot'] = null;
  const pilotPos = new Set(result.cashFlow.communities.map((c, i) => (c.inPilot ? i : -1)).filter((i) => i >= 0));
  if (pilotPos.size) {
    const site = lines.filter((l: PriceLine) => l.communityPosition != null && pilotPos.has(l.communityPosition));
    const fees = sum(site.filter((l) => l.billing === 'monthly' && l.description.includes('— pilot')).map(lineTotal));
    const ins = installMath(site);
    const sen = sensorMath(site, (pos) => pos != null && pilotPos.has(pos));
    const install = ins.gross - ins.credit;
    pilot = { install, sensors: sen.total, fees, total: fees + install + sen.total, months: inputs.schedule.pilotLengthMonths };
  }

  const f = computeFinish(draft);
  return {
    scope: { edgeUnits: beds, sensors: beds + additional, additionalSensors: additional },
    capex,
    opex,
    pilot,
    finish: f.concealed ? { low: f.totalLow, high: f.totalHigh } : null,
  };
}

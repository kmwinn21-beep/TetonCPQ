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
import { installMath, commonAreaColumns, sensorMath } from '@/lib/proposal/costMath';
import { scopeOf, type QuoteDraft } from './draft';
import { pendantScope } from './roomTypes';
import { itemsOn } from '@/lib/pricing/items';

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export interface PreviewTotals {
  /** pendants: E-Call pendants / pull-cords (rooms, common areas and contingency); 0 without E-Call. */
  scope: { edgeUnits: number; sensors: number; additionalSensors: number; pendants: number };
  capex: null | { basePackages: number; ecallUnits: number; sensors: number; equipment: number; softwareMonthly: number; softwareUpfront: number; renewals: number; ownership: number; years: number; /** Generic items: one-time (in equipment), monthly, and their renewals. */ items: Array<{ sku: string; name: string; total: number; billing: 'monthly' | 'once' | 'years' }>; itemsMonthly: number; itemsRenewals: number };
  opex: null | { install: number; sensors: number; /** Generic items' one-time charges (after credits, renewals included). */ items: number; monthly: number; year1: number; /** One-time charges, pilot fees and 36 months after the pilot. */ contract: number; /** Pilot length + the 36-month term. */ termMonths: number };
  pilot: null | { install: number; sensors: number; /** Generic items' one-time charges at pilot sites. */ items: number; fees: number; total: number; months: number };
  finish: null | { low: number; high: number };
}

/** The service term after the pilot. */
export const TERM_MONTHS = 36;

export function previewTotals(draft: QuoteDraft, inputs: ModelInputs, result: ModelResult, book: PriceBook): PreviewTotals {
  const lines = buildPriceLines(draft, inputs, book);
  // Generic items (lib/pricing/items) on the subscription: their one-time lines count on their own.
  const genericSkus = new Set(itemsOn(draft, 'subscription').map((x) => x.sku));
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
      softwareUpfront: c.softwareUpfront,
      renewals: c.renewals,
      ownership: c.ownershipTotal,
      years: c.ownershipMonths / 12,
      items: (c.items ?? []).map((x) => ({ sku: x.sku, name: x.name, total: x.total, billing: x.billing })),
      itemsMonthly: c.itemsMonthly ?? 0,
      itemsRenewals: c.itemsRenewals ?? 0,
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
    // Installation and common-area setup, each less its own pilot credit.
    const install = ins.gross - ins.credit + commonAreaColumns(site).total;
    const items = sum(site.filter((l) => genericSkus.has(l.sku) && l.billing === 'one_time').map(lineTotal));
    pilot = { install, sensors: sen.total, items, fees, total: fees + install + sen.total + items, months: inputs.schedule.pilotLengthMonths };
  }

  let opex: PreviewTotals['opex'] = null;
  if (showOpex) {
    const ins = installMath(lines);
    opex = {
      install: ins.gross - ins.credit + commonAreaColumns(lines).total,
      sensors: sensorMath(lines).total,
      items: sum(lines.filter((l) => genericSkus.has(l.sku) && l.billing === 'one_time').map(lineTotal)),
      monthly: sum(lines.filter((l) => l.billing === 'monthly' && !l.description.includes('pilot') && !l.description.includes('introductory')).map((l) => l.qty * l.unitNet)),
      year1: result.kpis.totalInvestment12,
      contract: 0,
      termMonths: (pilot ? inputs.schedule.pilotLengthMonths : 0) + TERM_MONTHS,
    };
    opex.contract = opex.install + opex.sensors + opex.items + (pilot?.fees ?? 0) + opex.monthly * TERM_MONTHS;
  }

  const f = computeFinish(draft);
  return {
    scope: { edgeUnits: beds, sensors: beds + additional, additionalSensors: additional, pendants: draft.communities.reduce((n, c) => n + pendantScope(c, draft.commercial.ecall !== 'none').total, 0) },
    capex,
    opex,
    pilot,
    finish: f.concealed ? { low: f.totalLow, high: f.totalHigh } : null,
  };
}

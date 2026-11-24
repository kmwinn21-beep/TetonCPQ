/**
 * One pagers: budgetary quote pages for the business case, off until the rep adds one (from Removed → One Pagers).
 * Three per product scope (Resident Monitoring only, E-Call only, both), each showing purchase and subscription,
 * subscription only, or purchase only. Pages that include E-Call price both systems (Bluetooth and Inovonics): the
 * deal's system at its own rates, the other at its comparison rate (or list).
 *
 * The pricing is the scope's standard pricing (no pilot credits: a pilot's costs show in its own bar).
 */
import { buildPriceLines, type PriceLine } from '@/lib/pricing/lines';
import { computeCapex, partsOf } from '@/lib/pricing/capex';
import { SEED_PRODUCTS, SKU } from '@/lib/pricing/catalog';
import { toModelInputs } from '@/lib/quote/toModelInputs';
import { monitors, scopeOf, type QuoteDraft } from '@/lib/quote/draft';
import { pendantScope } from '@/lib/quote/roomTypes';
import { ONE_PAGERS } from './layout';

export const OP_SCOPES = ['rm', 'ec', 'both'] as const;
export const OP_MODES = ['both', 'opex', 'capex'] as const;
export type OpScope = (typeof OP_SCOPES)[number];
export type OpMode = (typeof OP_MODES)[number];
export type OpSys = 'ble' | 'inov';

export { ONE_PAGERS };
export type OnePagerId = (typeof ONE_PAGERS)[number];

export const isOnePager = (id: string): id is OnePagerId => (ONE_PAGERS as readonly string[]).includes(id);
export const onePagerId = (scope: OpScope, mode: OpMode) => `op-${scope}-${mode}` as OnePagerId;
export const onePagerParts = (id: OnePagerId) => {
  const [, scope, mode] = id.split('-');
  return { scope: scope as OpScope, mode: mode as OpMode };
};

const SCOPE_NAME: Record<OpScope, string> = { rm: 'Resident Monitoring', ec: 'E-Call', both: 'Resident Monitoring + E-Call' };
const MODE_NAME: Record<OpMode, string> = { both: 'purchase or subscription', opex: 'subscription', capex: 'purchase' };
/** "One pager · Resident Monitoring, subscription" */
export const onePagerTitle = (id: OnePagerId) => {
  const { scope, mode } = onePagerParts(id);
  return `One pager · ${SCOPE_NAME[scope]}, ${MODE_NAME[mode]}`;
};

/** What the deal's scope covers: Resident Monitoring, E-Call, or both (null with neither). */
export function onePagerScope(draft: Pick<QuoteDraft, 'commercial' | 'communities'>): OpScope | null {
  const ecallOn = draft.commercial.ecall !== 'none';
  const hasMon = draft.communities.some((c) => monitors(c));
  const hasEc = draft.communities.some((c) => pendantScope(c, ecallOn).total > 0);
  return hasEc ? (hasMon ? 'both' : 'ec') : hasMon ? 'rm' : null;
}

/** For the Removed list: the deal's scope, and whether it has a pilot (the pilot table can be added then). */
export interface OnePagerInfo {
  scope: OpScope | null;
  pilot: boolean;
}
export const onePagerInfo = (draft: QuoteDraft): OnePagerInfo => ({
  scope: onePagerScope(draft),
  pilot: !!draft.schedule?.withPilot && draft.communities.some((c) => c.pilot),
});

const listEcall = (sys: OpSys) => SEED_PRODUCTS.find((x) => x.sku === (sys === 'ble' ? SKU.ecallBle : SKU.ecallInovonics))?.list ?? (sys === 'ble' ? 10 : 15);
export const chosenSys = (draft: Pick<QuoteDraft, 'commercial'>): OpSys => (draft.commercial.ecall === 'inovonics' ? 'inov' : 'ble');

/** The deal priced with this E-Call system: its own rate if it's the deal's, else the comparison rate (or list). */
export function draftForSystem(draft: QuoteDraft, sys: OpSys): QuoteDraft {
  const own = chosenSys(draft) === sys && draft.commercial.ecall !== 'none';
  return {
    ...draft,
    commercial: {
      ...draft.commercial,
      ecall: sys === 'ble' ? 'ble' : 'inovonics',
      ecallRate: own ? draft.commercial.ecallRate : draft.commercial.ecallCompareRate ?? listEcall(sys),
    },
  };
}

/** A row of a pricing table. `min`/`max`: the price per unit (a range where communities differ). */
export interface OpRow {
  key: string;
  label: string;
  qty: number | null;
  min: number;
  max: number;
  total: number;
  kind: 'once' | 'monthly' | 'total';
}
export interface OpTable {
  rows: OpRow[];
  /** One-time, and per month. */
  upfront: number;
  monthly: number;
}

const finish = (rows: OpRow[], totalRow: boolean): OpTable => {
  const upfront = rows.filter((r) => r.kind === 'once').reduce((s, r) => s + r.total, 0);
  const monthly = rows.filter((r) => r.kind === 'monthly').reduce((s, r) => s + r.total, 0);
  const out = rows.filter((r) => r.qty !== 0 && r.total !== 0);
  if (totalRow) {
    const at = out.findIndex((r) => r.kind === 'monthly');
    const tot: OpRow = { key: 'total', label: 'Total upfront', qty: null, min: 0, max: 0, total: upfront, kind: 'total' };
    out.splice(at < 0 ? out.length : at, 0, tot);
  }
  return { rows: out, upfront, monthly };
};

/** Group price lines into one row: units, the price range per unit, and the total (one-time, or per month). */
function group(key: string, label: string, ls: PriceLine[], kind: 'once' | 'monthly'): OpRow {
  const qty = ls.reduce((s, l) => s + l.qty, 0);
  const total = ls.reduce((s, l) => s + l.qty * l.unitNet, 0);
  const per = ls.map((l) => l.unitNet);
  return { key, label, qty, min: per.length ? Math.min(...per) : 0, max: per.length ? Math.max(...per) : 0, total, kind };
}

/** Subscription: monthly fees after any pilot (standard rates, not introductory) and the one-time charges, before credits. */
export function subscriptionTable(draft: QuoteDraft, sys: OpSys | null): OpTable {
  const d = sys ? draftForSystem(draft, sys) : draft;
  const lines = buildPriceLines(d, toModelInputs(d), {});
  const pilotish = (l: PriceLine) => l.description.includes('pilot') || l.description.includes('introductory');
  const monthly = lines.filter((l) => l.billing === 'monthly' && !pilotish(l));
  const once = lines.filter((l) => l.billing === 'one_time' && l.unitNet > 0);
  const isEc = (l: PriceLine) => l.sku === SKU.ecallBle || l.sku === SKU.ecallInovonics;
  const perRoom = d.commercial.ecallBilling !== 'device';
  const areas = d.communities.reduce((s, c) => s + pendantScope(c, d.commercial.ecall !== 'none').areas, 0);
  const ecWhat = perRoom ? `per room${areas ? ` (incl. ${areas} common area${areas === 1 ? '' : 's'})` : ''}` : 'per device';
  return finish(
    [
      group('sub', 'Resident Monitoring subscription, per bed', monthly.filter((l) => l.sku === SKU.platform), 'monthly'),
      group('ecall', `E-Call, ${ecWhat}`, monthly.filter(isEc), 'monthly'),
      group('install', 'Installation, per bed', once.filter((l) => l.sku === SKU.install && l.description !== 'E-Call installation'), 'once'),
      group('ecinstall', 'E-Call installation, per bed', once.filter((l) => l.description === 'E-Call installation'), 'once'),
      group('sensors', 'Additional sensors', once.filter((l) => l.sku === SKU.sensor), 'once'),
      group('devices', perRoom ? 'Additional E-Call devices' : 'E-Call devices', once.filter((l) => l.sku === SKU.ecallBleButton || l.sku === SKU.ecallInoPullcord), 'once'),
    ],
    false,
  );
}

/** Purchase: the equipment (list prices, before any conversion credit), then software and services per month. */
export function purchaseTable(draft: QuoteDraft, sys: OpSys | null): OpTable {
  const d = sys ? draftForSystem(draft, sys) : draft;
  const c = computeCapex(d);
  const parts = c.communities.flatMap(partsOf).filter((p) => p.beds > 0);
  const pkg = (key: string, label: string, ps: typeof parts): OpRow => {
    const qty = ps.reduce((s, p) => s + p.beds, 0);
    const per = ps.map((p) => p.listPerBed);
    return { key, label, qty, min: per.length ? Math.min(...per) : 0, max: per.length ? Math.max(...per) : 0, total: ps.reduce((s, p) => s + p.beds * p.listPerBed, 0), kind: 'once' };
  };
  const sensors = c.communities.reduce((s, x) => s + x.sensors, 0);
  const sensorPrice = c.pricing.sensorPrice;
  const ecallOn = d.commercial.ecall !== 'none';
  const monBeds = d.communities.reduce((s, x) => s + scopeOf(x, ecallOn).monitored, 0);
  const ecOnly = d.communities.reduce((s, x) => s + scopeOf(x, ecallOn).ecallOnly, 0);
  const ecSw = Math.max(0, Number(c.pricing.ecallSoftware ?? 5));
  return finish(
    [
      pkg('base', 'Base package (edge unit + sensor), per bed', parts.filter((p) => p.monitoring && p.ecall === 'none')),
      pkg('baseec', 'Base package + E-Call, per bed', parts.filter((p) => p.monitoring && p.ecall !== 'none')),
      pkg('ecunit', 'E-Call infrastructure and installation, per bed', parts.filter((p) => !p.monitoring)),
      { key: 'sensors', label: 'Additional sensors', qty: sensors, min: sensorPrice, max: sensorPrice, total: sensors * sensorPrice, kind: 'once' },
      { key: 'software', label: 'Plus software & services, per bed', qty: monBeds, min: c.pricing.softwareRate, max: c.pricing.softwareRate, total: monBeds * c.pricing.softwareRate, kind: 'monthly' },
      { key: 'ecsoftware', label: 'Plus E-Call software, per bed', qty: ecOnly, min: ecSw, max: ecSw, total: ecOnly * ecSw, kind: 'monthly' },
    ],
    true,
  );
}

/** The scope in numbers: residents (priced beds), sensors and Edge units (monitored), E-Call devices. */
export function onePagerCounts(draft: QuoteDraft) {
  const ecallOn = draft.commercial.ecall !== 'none';
  let beds = 0;
  let edges = 0;
  let sensors = 0;
  let devices = 0;
  let areas = 0;
  for (const c of draft.communities) {
    const sc = scopeOf(c, ecallOn);
    beds += sc.priced;
    edges += sc.monitored;
    if (monitors(c)) sensors += sc.monitored + Math.max(0, Number(c.additionalSensors) || 0);
    const ps = pendantScope(c, ecallOn);
    devices += ps.total;
    areas += ps.areas;
  }
  return { beds, edges, sensors, devices, areas };
}

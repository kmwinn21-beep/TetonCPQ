/**
 * "What drives this figure?" on the proposal: which deal inputs feed each
 * calculated figure, so a rep can change them right there and see the
 * proposal update before saving a new version.
 *
 * Inputs are deal-level fields (the ones on the deal page). Figures backed by
 * a calculation trace list the inputs found in that trace; price-based
 * figures list the pricing inputs.
 */
import type { RoiCase, Trace } from '@/lib/model';
import type { QuoteDraft } from '@/lib/quote/draft';
import { normalizePlan, planChanges, weeksToGoLive, type ImplementationPlan } from '@/lib/quote/implementationPlan';
import { normalizeTerms, termsChanges, type TermsSetting } from '@/lib/quote/terms';
import { normalizeResources, resourcesChanges, type Resources } from '@/lib/quote/resources';

export type FieldKind = 'usd' | 'usd2' | 'pct' | 'num' | 'months' | 'weeks' | 'mult' | 'toggle' | 'plan' | 'terms' | 'resources';

export interface WhatIfField {
  /** Dotted path into the QuoteDraft. */
  path: string;
  label: string;
  /** Group heading, and where the field lives on the deal page. */
  group: string;
  where: string;
  kind: FieldKind;
  /** Blank means "use the default" (shown as the placeholder). */
  nullable?: boolean;
  min?: number;
  max?: number;
}

const F = (path: string, label: string, group: string, where: string, kind: FieldKind, extra: Partial<WhatIfField> = {}): WhatIfField => ({ path, label, group, where, kind, min: 0, ...extra });

const BENEFITS = 'Benefits included';
const BENEFITS_AT = 'Case setup';
const PRICING = 'Pricing';
const PRICING_AT = 'Pricing & products';
const CLIENT = 'Client';
const CLIENT_AT = 'Assumptions · Client';
const TIMELINE = 'Timeline';
const CFO = 'CFO';
const CFO_AT = 'Assumptions · CFO inputs';
const VAL = 'Valuation';
const VAL_AT = 'Assumptions · Valuation & margin';
const METRICS = 'Improvement metrics';
const METRICS_AT = 'Assumptions · Improvement metrics';
const IMPL = 'Implementation';
const IMPL_AT = 'Implementation';

/** Every deal input the proposal can change, in the order the panel lists them. */
export const FIELDS: WhatIfField[] = [
  // The same on/off switches as Case setup: turning one off drops that benefit from the ROI.
  F('components.careRevenueRecapture', 'Care Revenue Recapture', BENEFITS, BENEFITS_AT, 'toggle'),
  F('components.fallsHospitalization', 'Falls → Hospitalization', BENEFITS, BENEFITS_AT, 'toggle'),
  F('components.fallsDischarge', 'Falls → Discharge', BENEFITS, BENEFITS_AT, 'toggle'),
  F('components.staffingAlignment', 'Staffing Alignment', BENEFITS, BENEFITS_AT, 'toggle'),
  F('components.moveInImpact', 'Move-in Impact', BENEFITS, BENEFITS_AT, 'toggle'),
  F('components.techReplacement', 'Tech Replacement', BENEFITS, BENEFITS_AT, 'toggle'),

  F('commercial.platformRate', 'Platform rate / bed / mo', PRICING, PRICING_AT, 'usd2'),
  F('commercial.pilotRate', 'Pilot rate / bed / mo', PRICING, PRICING_AT, 'usd2'),
  F('commercial.ecallRate', 'E-Call rate / bed / mo', PRICING, PRICING_AT, 'usd2'),
  F('commercial.ecallPilotRate', 'E-Call during pilot / bed / mo', PRICING, PRICING_AT, 'usd2'),
  F('commercial.installRate', 'Install / bed', PRICING, PRICING_AT, 'usd'),
  F('commercial.installCreditPct', 'Install credit on pilot sites', PRICING, PRICING_AT, 'pct', { max: 1 }),
  F('commercial.fullFacilityMultiplier', 'Full-facility multiplier', PRICING, PRICING_AT, 'mult'),
  F('commercial.specialRate', 'Intro rate / bed / mo', PRICING, PRICING_AT, 'usd2', { nullable: true }),
  F('commercial.specialTermMonths', 'Intro term', PRICING, PRICING_AT, 'months'),
  F('commercial.capexDiscountRate', 'Upfront price discount rate', PRICING, PRICING_AT, 'pct', { max: 1 }),

  F('client.occupancy', 'Occupancy', CLIENT, CLIENT_AT, 'pct', { max: 1 }),
  F('client.avgRent', 'Average rent / resident / mo', CLIENT, CLIENT_AT, 'usd'),
  F('client.careRevenuePerResident', 'Care revenue / resident / mo', CLIENT, CLIENT_AT, 'usd'),
  F('client.locGapUpliftPerTierStep', 'Care uplift per level-of-care step', CLIENT, CLIENT_AT, 'usd'),
  F('client.moveInRatePerMonth', 'Move-ins per month (share of occupied)', CLIENT, CLIENT_AT, 'pct', { max: 1 }),
  F('client.yr1RevenueMonthsPerMoveIn', 'Revenue months per move-in', CLIENT, CLIENT_AT, 'months'),
  F('client.avgRevenuePerResidentOverride', 'Revenue / resident / mo (override)', CLIENT, CLIENT_AT, 'usd', { nullable: true }),
  F('client.fallsPerResidentYear', 'Falls per resident per year', CLIENT, CLIENT_AT, 'num'),
  F('client.pctFallsHospitalization', 'Falls leading to hospitalization', CLIENT, CLIENT_AT, 'pct', { max: 1 }),
  F('client.costPerHospitalization', 'Cost per hospitalization', CLIENT, CLIENT_AT, 'usd'),
  F('client.pctFallsDischarge', 'Falls leading to discharge', CLIENT, CLIENT_AT, 'pct', { max: 1 }),
  F('client.losIncreaseMonths', 'Length of stay protected per discharge', CLIENT, CLIENT_AT, 'months'),
  F('client.nightResidentToStaffRatio', 'Residents per night staff', CLIENT, CLIENT_AT, 'num'),
  F('client.nightShiftHours', 'Night shift hours', CLIENT, CLIENT_AT, 'num'),
  F('client.nightHourlyWage', 'Night staff hourly wage', CLIENT, CLIENT_AT, 'usd2'),
  F('client.supportiveTechSpendPerResident', 'Supportive tech spend / resident / yr', CLIENT, CLIENT_AT, 'usd'),

  F('schedule.roiStartDelayMonths', 'ROI start delay', TIMELINE, TIMELINE, 'months'),
  F('schedule.rampMonths', 'Time to full ROI', TIMELINE, TIMELINE, 'months', { min: 1 }),

  F('cfo.annualDiscountRate', 'Discount rate (cost of money)', CFO, CFO_AT, 'pct', { max: 1 }),
  F('cfo.portfolioUnitsOverride', 'Total portfolio units (override)', CFO, CFO_AT, 'num', { nullable: true }),
  F('cfo.reimbursementPerOccupiedUnitMonth', 'Reimbursement / occupied unit / mo', CFO, CFO_AT, 'usd2'),

  F('valuation.capRate', 'Cap rate', VAL, VAL_AT, 'pct', { max: 1 }),
  F('valuation.operatingMargin', 'Operating margin', VAL, VAL_AT, 'pct', { max: 1 }),
  F('monthsUntilCocNoticed', 'Months until change of condition noticed', VAL, VAL_AT, 'months'),

  // The whole stage list: lengths, overlaps, order, removed and custom stages.
  F('implementationPlan', 'Implementation stages', IMPL, IMPL_AT, 'plan'),

  // The Terms / Notes bullet list (reworded, removed and added terms).
  F('terms', 'Terms / Notes', 'Terms / Notes', 'Terms / Notes', 'terms'),

  // The customer's roles, stages and hours (Estimated Resource Allocation).
  F('resources', 'Estimated resource allocation', 'Resource allocation', 'Estimated Resource Allocation', 'resources'),

];

const METRIC_FIELDS: Array<[keyof QuoteDraft['caseMetrics'][RoiCase], string]> = [
  ['fallReduction', 'Fall reduction'],
  ['locGapIdentifiedPerMonth', 'Care-level gaps found / mo'],
  ['moveInUplift', 'Move-in uplift'],
  ['staffingAlignment', 'Staffing alignment'],
  ['techReplacement', 'Tech replacement'],
];
const CASE_LABEL: Record<RoiCase, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };

/** Improvement metrics for the deal's case: only the ones the model reads for this draft. */
export function metricFields(draft: QuoteDraft): WhatIfField[] {
  const rc = draft.roiCase;
  // Without custom metrics, move-in, staffing and tech use fixed values (see uniformCaseMetrics).
  const editable = draft.customizeCaseMetrics ? METRIC_FIELDS : METRIC_FIELDS.slice(0, 2);
  return editable.map(([k, label]) => F(`caseMetrics.${rc}.${k}`, `${label} (${CASE_LABEL[rc]})`, METRICS, METRICS_AT, 'pct', { max: 1 }));
}

export function allFields(draft: QuoteDraft): WhatIfField[] {
  return [...FIELDS, ...metricFields(draft)];
}

export function fieldByPath(draft: QuoteDraft, path: string): WhatIfField | undefined {
  return allFields(draft).find((f) => f.path === path);
}

/** Trace input ids → deal fields. Community-level inputs (c0.units …) aren't editable here. */
const TRACE_INPUT: Record<string, string[]> = {
  'in.occupancy': ['client.occupancy'],
  'in.fallsPerResidentYear': ['client.fallsPerResidentYear'],
  'in.pctFallsHospitalization': ['client.pctFallsHospitalization'],
  'in.pctFallsDischarge': ['client.pctFallsDischarge'],
  'in.costPerHospitalization': ['client.costPerHospitalization'],
  'in.monthsUntilCocNoticed': ['monthsUntilCocNoticed'],
  'in.locGapUplift': ['client.locGapUpliftPerTierStep'],
  'in.losIncreaseMonths': ['client.losIncreaseMonths'],
  'in.avgRent': ['client.avgRent'],
  'in.nightRatio': ['client.nightResidentToStaffRatio'],
  'in.nightWage': ['client.nightHourlyWage'],
  'in.nightHours': ['client.nightShiftHours'],
  'in.moveInRate': ['client.moveInRatePerMonth'],
  'in.avgRevPerRes': ['client.avgRent', 'client.careRevenuePerResident', 'client.avgRevenuePerResidentOverride'],
  'in.yr1Months': ['client.yr1RevenueMonthsPerMoveIn'],
  'in.techSpend': ['client.supportiveTechSpendPerResident'],
  'in.reimbursement': ['cfo.reimbursementPerOccupiedUnitMonth'],
  'in.ramp': ['schedule.rampMonths'],
  'in.discountRate': ['cfo.annualDiscountRate'],
  'in.portfolioUnits': ['cfo.portfolioUnitsOverride'],
  'in.operatingMargin': ['valuation.operatingMargin'],
  'in.capRate': ['valuation.capRate'],
  'in.price.specialTerm': ['commercial.specialTermMonths'],
};
const PRICE_FIELDS = ['commercial.platformRate', 'commercial.pilotRate', 'commercial.ecallRate', 'commercial.ecallPilotRate', 'commercial.fullFacilityMultiplier', 'commercial.specialRate'];
const INSTALL_FIELDS = ['commercial.installRate', 'commercial.installCreditPct', 'commercial.fullFacilityMultiplier'];
const ALL_TOGGLES = ['components.careRevenueRecapture', 'components.fallsHospitalization', 'components.fallsDischarge', 'components.staffingAlignment', 'components.moveInImpact', 'components.techReplacement'];
const METRIC_TRACE: Record<string, string> = { fallReduction: 'fallReduction', locGap: 'locGapIdentifiedPerMonth', moveIn: 'moveInUplift', staffing: 'staffingAlignment', tech: 'techReplacement' };

/** Deal fields found anywhere in a trace, in catalog order. */
export function traceFields(trace: Trace, draft: QuoteDraft): string[] {
  const found = new Set<string>();
  const walk = (t: Trace) => {
    const id = t.id;
    if (id in TRACE_INPUT) TRACE_INPUT[id].forEach((p) => found.add(p));
    else if (id.startsWith('in.price.')) PRICE_FIELDS.forEach((p) => found.add(p));
    else if (/^c\d+\.roiDelay$/.test(id)) found.add('schedule.roiStartDelayMonths');
    else {
      const m = /^in\.case\.(\w+)\.(\w+)$/.exec(id);
      if (m && METRIC_TRACE[m[2]]) found.add(`caseMetrics.${m[1]}.${METRIC_TRACE[m[2]]}`);
    }
    t.inputs.forEach(walk);
  };
  walk(trace);
  // Install isn't a separate trace input; anything that counts installation depends on it.
  if (/install/i.test(JSON.stringify(trace, ['id', 'label', 'formula', 'inputs']))) INSTALL_FIELDS.forEach((p) => found.add(p));
  const order = allFields(draft).map((f) => f.path);
  return order.filter((p) => found.has(p));
}

/** What a clickable figure on the proposal is, and how to find its inputs. */
export interface FigureSpec {
  /** Trace id for formula + inputs, when the engine traces this figure. */
  trace?: string;
  /** Formula text for figures without a trace. */
  formula?: string;
  /** Inputs for figures without a trace (or added to the trace's). */
  fields?: string[];
}

const pricing = (formula: string, extra: string[] = []): FigureSpec => ({ formula, fields: [...PRICE_FIELDS, ...INSTALL_FIELDS, 'commercial.specialTermMonths', ...extra] });

/** Figure keys (the V keys in ProposalDocument) → their inputs. */
export function figureSpec(key: string): FigureSpec | null {
  const k = key.replace(/\.value$/, '');
  const kpi: Record<string, string> = {
    'card.investment': 'kpi.totalInvestment12',
    'card.net': 'kpi.netBenefit12',
    'card.gross': 'kpi.grossReturnPerDollar12',
    'card.payback': 'kpi.discountedPaybackMonth',
    'card.runRate': 'kpi.runRateAnnualNetBenefit',
    'card.perUnit': 'kpi.netBenefitPerOccupiedUnitMonth',
    'roi.benefit.care': 'annual.recapturedCareRevenue',
    'roi.benefit.falls': 'annual.fallCostAvoidance',
    'roi.benefit.los': 'annual.revenueFromLosIncrease',
    'roi.benefit.staffing': 'annual.nightShiftSavings',
    'roi.benefit.moveIn': 'annual.moveInImpact',
    'roi.benefit.tech': 'annual.techReplacement',
    'roi.total': 'annual.annualRoi',
    'roi.outcome.realigned': 'annual.residentsRealigned',
    'roi.outcome.falls': 'annual.costlyFallsPrevented',
    'roi.outcome.noi': 'annual.annualNetNoiImpact',
    'roi.outcome.valuation': 'annual.valuationImpact',
  };
  // ROI line items come with their Case setup switch (and the total with all of them), so a benefit can be turned off.
  const toggle: Record<string, string[]> = {
    'roi.benefit.care': ['components.careRevenueRecapture'],
    'roi.benefit.falls': ['components.fallsHospitalization'],
    'roi.benefit.los': ['components.fallsDischarge'],
    'roi.benefit.staffing': ['components.staffingAlignment'],
    'roi.benefit.moveIn': ['components.moveInImpact'],
    'roi.benefit.tech': ['components.techReplacement'],
    'roi.outcome.realigned': ['components.careRevenueRecapture'],
    'roi.outcome.falls': ['components.fallsHospitalization', 'components.fallsDischarge'],
    'roi.total': ALL_TOGGLES,
    'roi.outcome.noi': ALL_TOGGLES,
    'roi.outcome.valuation': ALL_TOGGLES,
  };
  if (kpi[k]) return { trace: kpi[k], fields: [...(toggle[k] ?? []), ...(k.startsWith('card.') ? INSTALL_FIELDS : [])] };
  if (k === 'scope.oneTime') return { formula: 'Installation for every bed, at the install rate (× full-facility multiplier where it applies), less the pilot install credit', fields: INSTALL_FIELDS };
  if (k === 'scope.pilotMonthly') return { formula: 'Pilot beds × (pilot rate + E-Call during pilot)', fields: ['commercial.pilotRate', 'commercial.ecallPilotRate', 'commercial.fullFacilityMultiplier'] };
  if (k === 'scope.serviceMonthly') return { formula: 'All beds × (platform rate + E-Call rate), × full-facility multiplier where it applies', fields: ['commercial.platformRate', 'commercial.ecallRate', 'commercial.fullFacilityMultiplier'] };
  if (k === 'scope.total') return pricing('Installation + pilot fees + monthly fees over the service term');
  if (k.startsWith('rate.')) return pricing('The rate per bed, from Pricing & products');
  if (k.startsWith('capex.')) return pricing('The service term paid in one payment at its present value, plus installation', ['commercial.capexDiscountRate']);
  const assume: Record<string, string[]> = {
    'assume.occupancy': ['client.occupancy'],
    'assume.rent': ['client.avgRent'],
    'assume.care': ['client.careRevenuePerResident'],
    'assume.locUplift': ['client.locGapUpliftPerTierStep'],
    'assume.falls': ['client.fallsPerResidentYear'],
    'assume.hospitalization': ['client.pctFallsHospitalization'],
    'assume.hospitalCost': ['client.costPerHospitalization'],
    'assume.discharge': ['client.pctFallsDischarge'],
    'assume.los': ['client.losIncreaseMonths'],
    'assume.moveIns': ['client.moveInRatePerMonth'],
    'assume.nightRatio': ['client.nightResidentToStaffRatio'],
    'assume.wage': ['client.nightHourlyWage'],
    'assume.discountRate': ['cfo.annualDiscountRate'],
    'assume.benefitStart': ['schedule.roiStartDelayMonths', 'schedule.rampMonths'],
  };
  if (assume[k]) return { formula: 'An assumption entered on the deal', fields: assume[k] };
  if (key === 'resources.edit' || key.startsWith('resources.')) return { formula: 'Your team’s estimated hours by role and implementation stage', fields: ['resources'] };
  if (/^impl\.[\w-]+\.weeks$/.test(key) || key === 'impl.plan') return { formula: 'Stages and lengths from the implementation timeline, worked back from each pilot go-live', fields: ['implementationPlan'] };
  return null;
}

/* ------------------------------------------------------------------ */
/* Reading and changing draft values by path.                          */
/* ------------------------------------------------------------------ */

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

/** A copy of the draft with the given path set (intermediate objects copied, never mutated). */
export function setPath<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const src = (obj ?? {}) as Record<string, unknown>;
  return { ...src, [head]: rest.length ? setPath(src[head], rest.join('.'), value) : value } as T;
}

export type ChangeValue = number | boolean | null | ImplementationPlan | TermsSetting | Resources;
export type Changes = Record<string, ChangeValue>;

/** Apply changes (only to known fields) to a draft. */
export function applyChanges(draft: QuoteDraft, changes: Changes): QuoteDraft {
  const known = new Set(allFields(draft).map((f) => f.path));
  let out = draft;
  for (const [path, v] of Object.entries(changes)) {
    if (!known.has(path)) throw new Error(`Can't change ${path} from the proposal`);
    const f = fieldByPath(draft, path)!;
    if (f.kind === 'resources') {
      if (!Array.isArray(v)) throw new Error(`${f.label} must be a list of roles`);
      out = setPath(out, path, normalizeResources(v));
      continue;
    }
    if (f.kind === 'terms') {
      if (v !== null && (typeof v !== 'object' || Array.isArray(v))) throw new Error(`${f.label} must be a list of terms`);
      out = setPath(out, path, normalizeTerms(v));
      continue;
    }
    if (f.kind === 'plan') {
      if (!v || typeof v !== 'object') throw new Error(`${f.label} must be a list of stages`);
      out = setPath(out, path, normalizePlan(v));
      continue;
    }
    if (f.kind === 'toggle') {
      if (typeof v !== 'boolean') throw new Error(`${f.label} must be on or off`);
    } else if (v == null) {
      if (!f.nullable) throw new Error(`${f.label} needs a value`);
    } else if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${f.label} must be a number`);
    else if ((f.min != null && v < f.min) || (f.max != null && v > f.max)) throw new Error(`${f.label} is out of range`);
    out = setPath(out, path, v);
  }
  return out;
}

/** Changes that actually differ from the draft they're based on. */
/** Whether a change equals the saved value (plans compared by content). */
export function sameValue(saved: unknown, v: unknown): boolean {
  if (v && typeof v === 'object') {
    // Implementation plans have stages; anything else object-valued is a terms setting.
    if (Array.isArray(v)) return JSON.stringify(normalizeResources(saved)) === JSON.stringify(normalizeResources(v));
    if ('stages' in v) return JSON.stringify(normalizePlan(saved)) === JSON.stringify(normalizePlan(v));
    return JSON.stringify(normalizeTerms(saved)) === JSON.stringify(normalizeTerms(v));
  }
  return JSON.stringify(saved ?? null) === JSON.stringify(v ?? null);
}

/** One change, as readable lines: a list of what changed (stages, terms) or saved → new. */
export interface ChangeDetail {
  path: string;
  label: string;
  lines: Array<{ text: string } | { from: string; to: string }>;
}

export function changeDetails(draft: QuoteDraft, changes: Changes): ChangeDetail[] {
  return Object.entries(changes).flatMap(([p, v]): ChangeDetail[] => {
    const f = fieldByPath(draft, p);
    if (!f) return [];
    if (f.kind === 'plan') return [{ path: p, label: 'Implementation', lines: planChanges(normalizePlan(getPath(draft, p)), normalizePlan(v)).map((text) => ({ text })) }];
    if (f.kind === 'resources')
      return [{ path: p, label: 'Resource allocation', lines: resourcesChanges(normalizeResources(getPath(draft, p)), normalizeResources(v), draft.implementationPlan).map((text) => ({ text })) }];
    if (f.kind === 'terms') return [{ path: p, label: 'Terms / Notes', lines: termsChanges(draft, { ...draft, terms: normalizeTerms(v) }).map((text) => ({ text })) }];
    return [{ path: p, label: f.label, lines: [{ from: formatField(f, getPath(draft, p)), to: formatField(f, v) }] }];
  });
}

export function effectiveChanges(draft: QuoteDraft, changes: Changes): Changes {
  return Object.fromEntries(Object.entries(changes).filter(([p, v]) => !sameValue(getPath(draft, p), v)));
}

/** Display a field value: "$99", "90%", "3 mo", "1.3×". */
export function formatField(f: WhatIfField, v: unknown): string {
  if (f.kind === 'toggle') return v ? 'On' : 'Off';
  if (f.kind === 'terms') return v == null ? 'standard terms' : 'customized terms';
  if (f.kind === 'resources') {
    const rs = normalizeResources(v);
    return `${rs.length} ${rs.length === 1 ? 'role' : 'roles'}`;
  }
  if (f.kind === 'plan') {
    const p = normalizePlan(v);
    return `${p.order.length} stages, ${weeksToGoLive(p)} wk`;
  }
  if (v == null || v === '') return f.nullable ? 'default' : '—';
  const n = Number(v);
  switch (f.kind) {
    case 'usd':
      return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
    case 'usd2':
      return `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
    case 'pct':
      return `${Number((n * 100).toFixed(2))}%`;
    case 'months':
      return `${n} mo`;
    case 'weeks':
      return `${n} wk`;
    case 'mult':
      return `${n}×`;
    default:
      return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
}

/** "Platform rate / bed / mo $99 → $89; Occupancy 90% → 92%" for a version note. */
export function describeChanges(draft: QuoteDraft, changes: Changes): string {
  return changeDetails(draft, changes)
    .map((d) => `${d.label}${d.lines.map((l, i) => ('text' in l ? `${i ? ',' : ':'} ${l.text}` : ` ${l.from} → ${l.to}`)).join('')}`)
    .join('; ');
}

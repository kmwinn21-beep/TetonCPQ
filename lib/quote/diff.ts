/**
 * What changed between two quote versions, in words a rep can read out:
 * "Platform rate: $99 → $89", "Added community: Riverside (120 beds)".
 * Pure; works on any two QuoteDrafts.
 */
import { planChanges } from './implementationPlan';
import { normalizeTerms, termsChanges } from './terms';
import { bedsOf, type DraftCommunity, type QuoteDraft } from './draft';

export type Fmt = 'usd' | 'pct' | 'num' | 'bool' | 'text' | 'mult';

export interface Change {
  group: string;
  label: string;
  from: string;
  to: string;
}

type Field = { label: string; fmt: Fmt };

/** Labels for every draft field worth reporting. Anything not listed is reported by its path. */
const FIELDS: Record<string, Field> = {
  customerName: { label: 'Customer name', fmt: 'text' },
  roiCase: { label: 'ROI case', fmt: 'text' },
  presentation: { label: 'Proposal shows', fmt: 'text' },
  customizeCaseMetrics: { label: 'Customize case metrics', fmt: 'bool' },
  'components.careRevenueRecapture': { label: 'Care Revenue Recapture', fmt: 'bool' },
  'components.fallsHospitalization': { label: 'Falls → Hospitalization', fmt: 'bool' },
  'components.fallsDischarge': { label: 'Falls → Discharge', fmt: 'bool' },
  'components.staffingAlignment': { label: 'Staffing Alignment', fmt: 'bool' },
  'components.moveInImpact': { label: 'Move-in Impact', fmt: 'bool' },
  'components.techReplacement': { label: 'Tech Replacement', fmt: 'bool' },
  'valuation.capRate': { label: 'Cap rate', fmt: 'pct' },
  'valuation.operatingMargin': { label: 'Operating margin', fmt: 'pct' },
  monthsUntilCocNoticed: { label: 'Months until change of condition noticed', fmt: 'num' },
  'client.occupancy': { label: 'Occupancy', fmt: 'pct' },
  'client.avgRent': { label: 'Avg rent', fmt: 'usd' },
  'client.careRevenuePerResident': { label: 'Care revenue / resident / mo', fmt: 'usd' },
  'client.locGapUpliftPerTierStep': { label: 'LOC gap uplift per tier step', fmt: 'usd' },
  'client.moveInRatePerMonth': { label: 'Move-ins per month', fmt: 'pct' },
  'client.yr1RevenueMonthsPerMoveIn': { label: 'Yr-1 revenue months per move-in', fmt: 'num' },
  'client.avgRevenuePerResidentOverride': { label: 'Avg revenue / resident (override)', fmt: 'usd' },
  'client.fallsPerResidentYear': { label: 'Falls per resident per year', fmt: 'num' },
  'client.pctFallsHospitalization': { label: '% falls → hospitalization', fmt: 'pct' },
  'client.costPerHospitalization': { label: 'Cost per hospitalization', fmt: 'usd' },
  'client.pctFallsDischarge': { label: '% falls → discharge', fmt: 'pct' },
  'client.losIncreaseMonths': { label: 'LOS increase (months)', fmt: 'num' },
  'client.nightResidentToStaffRatio': { label: 'Residents per night staff', fmt: 'num' },
  'client.nightShiftHours': { label: 'Night shift hours', fmt: 'num' },
  'client.nightHourlyWage': { label: 'Night staff hourly wage', fmt: 'usd' },
  'client.newNightResidentToStaffRatio': { label: 'New night staffing ratio', fmt: 'num' },
  'client.supportiveTechSpendPerResident': { label: 'Supportive tech spend / resident', fmt: 'usd' },
  'cfo.annualDiscountRate': { label: 'Annual discount rate', fmt: 'pct' },
  'cfo.portfolioUnitsOverride': { label: 'Total portfolio units', fmt: 'num' },
  'cfo.reimbursementPerOccupiedUnitMonth': { label: 'Reimbursement per occupied unit', fmt: 'usd' },
  'schedule.withPilot': { label: 'Start with a pilot', fmt: 'bool' },
  'schedule.pilotLengthMonths': { label: 'Pilot length (months)', fmt: 'num' },
  'schedule.roiStartDelayMonths': { label: 'ROI start delay (months)', fmt: 'num' },
  'schedule.rampMonths': { label: 'Time to full ROI (months)', fmt: 'num' },
  'schedule.horizonMonths': { label: 'Model horizon (months)', fmt: 'num' },
  'schedule.includeReimbursement': { label: 'Include reimbursement', fmt: 'bool' },
  'implementation.desiredGoLive': { label: 'Desired go-live', fmt: 'text' },
  'implementation.communicationWeeks': { label: 'Communication (weeks)', fmt: 'num' },
  'implementation.installationWeeks': { label: 'Installation (weeks)', fmt: 'num' },
  'implementation.baselineWeeks': { label: 'Baseline (weeks)', fmt: 'num' },
  'implementation.onboardingDays': { label: 'Onboarding (days)', fmt: 'num' },
  'commercial.platformRate': { label: 'Platform rate / bed / mo', fmt: 'usd' },
  'commercial.pilotRate': { label: 'Pilot rate / bed / mo', fmt: 'usd' },
  'commercial.ecall': { label: 'E-Call', fmt: 'text' },
  'commercial.ecallRate': { label: 'E-Call rate / bed / mo', fmt: 'usd' },
  'commercial.ecallPilotRate': { label: 'E-Call during pilot', fmt: 'usd' },
  'commercial.installRate': { label: 'Install / bed', fmt: 'usd' },
  'commercial.installCreditPct': { label: 'Install credit on pilot sites', fmt: 'pct' },
  'commercial.installClawback': { label: 'Install credit clawback', fmt: 'bool' },
  'commercial.specialRate': { label: 'Intro rate / bed / mo', fmt: 'usd' },
  'commercial.specialTermMonths': { label: 'Intro term (months)', fmt: 'num' },
  'commercial.fullFacilityMultiplier': { label: 'Full-facility multiplier', fmt: 'mult' },
  'commercial.sensorPrice': { label: 'Additional sensor price', fmt: 'usd' },
  'commercial.capexDiscountRate': { label: 'Capex discount rate', fmt: 'pct' },
};

const GROUP: Record<string, string> = {
  commercial: 'Pricing',
  presentation: 'Pricing',
  schedule: 'Timeline',
  implementation: 'Timeline',
  implementationPlan: 'Implementation',
  client: 'Client assumptions',
  cfo: 'CFO inputs',
  valuation: 'Valuation',
  components: 'Case setup',
  roiCase: 'Case setup',
  customizeCaseMetrics: 'Improvement metrics',
  caseMetrics: 'Improvement metrics',
  monthsUntilCocNoticed: 'Valuation',
  customerName: 'Deal',
};

const COMMUNITY_FIELDS: Record<keyof Omit<DraftCommunity, 'id' | 'beds'>, Field> = {
  name: { label: 'Name', fmt: 'text' },
  market: { label: 'Market', fmt: 'text' },
  ilBeds: { label: 'IL beds', fmt: 'num' },
  alBeds: { label: 'AL beds', fmt: 'num' },
  mcBeds: { label: 'MC beds', fmt: 'num' },
  snfBeds: { label: 'SNF beds', fmt: 'num' },
  coverage: { label: 'Coverage', fmt: 'text' },
  ecall: { label: 'E-Call', fmt: 'bool' },
  pilot: { label: 'Pilot', fmt: 'bool' },
  pilotUnits: { label: 'Pilot units', fmt: 'num' },
  occupancy: { label: 'Occupancy', fmt: 'pct' },
  goLiveMonth: { label: 'Go-live month', fmt: 'text' },
  roiDelayMonths: { label: 'ROI delay (months)', fmt: 'num' },
  additionalSensors: { label: 'Additional sensors', fmt: 'num' },
};

const TEXT: Record<string, string> = {
  rooms_only: 'Rooms only',
  full_facility: 'Full facility',
  none: 'None',
  ble: 'Bluetooth',
  inovonics: 'Inovonics',
  opex: 'Subscription',
  capex: 'Upfront',
  both: 'Both',
  stretch: 'Stretch',
  target: 'Target',
  base: 'Base',
  underperforming: 'Underperforming',
};

export function fmtValue(v: unknown, fmt: Fmt): string {
  if (v === null || v === undefined || v === '') return fmt === 'bool' ? 'No' : '—';
  switch (fmt) {
    case 'usd':
      return `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    case 'pct':
      return `${Number((Number(v) * 100).toFixed(2))}%`;
    case 'bool':
      return v ? 'Yes' : 'No';
    case 'mult':
      return `${v}×`;
    case 'num':
      return Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    default:
      return TEXT[String(v)] ?? String(v);
  }
}

function leaves(obj: unknown, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, leaves(v, p));
      else out[p] = v;
    }
  }
  return out;
}

const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9);

const CASE_LABEL: Record<string, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };
const METRIC_LABEL: Record<string, string> = {
  fallReduction: 'fall reduction',
  locGapIdentifiedPerMonth: 'LOC gaps identified / mo',
  moveInUplift: 'move-in uplift',
  staffingAlignment: 'staffing alignment',
  techReplacement: 'tech replacement',
};

/** Changes from `before` to `after`. Communities are matched by their id, so a rename is a change, not a remove + add. */
export function diffDrafts(before: QuoteDraft, after: QuoteDraft): Change[] {
  const changes: Change[] = [];
  const { communities: ca, implementationPlan: pa, terms: _ta, ...ra } = before;
  const { communities: cb, implementationPlan: pb, terms: _tb, ...rb } = after;

  // Implementation stages are compared as a plan (stages can be added, removed and reordered).

  const la = leaves(ra);
  const lb = leaves(rb);
  for (const path of Array.from(new Set([...Object.keys(la), ...Object.keys(lb)]))) {
    if (same(la[path], lb[path])) continue;
    const top = path.split('.')[0];
    let label: string;
    let fmt: Fmt;
    if (top === 'caseMetrics') {
      const [, c, m] = path.split('.');
      label = `${CASE_LABEL[c] ?? c} ${METRIC_LABEL[m] ?? m}`;
      fmt = 'pct';
    } else {
      const f = FIELDS[path] ?? { label: path, fmt: 'text' as Fmt };
      label = f.label;
      fmt = f.fmt;
    }
    changes.push({ group: GROUP[top] ?? 'Other', label, from: fmtValue(la[path], fmt), to: fmtValue(lb[path], fmt) });
  }

  const byId = (cs: DraftCommunity[]) => new Map(cs.map((c) => [c.id, c]));
  const ma = byId(ca ?? []);
  const mb = byId(cb ?? []);
  const units = (c: DraftCommunity) => bedsOf(c);
  for (const c of ca ?? []) {
    if (!mb.has(c.id)) changes.push({ group: 'Communities', label: `Removed ${c.name || 'community'}`, from: `${units(c)} beds`, to: '—' });
  }
  for (const c of cb ?? []) {
    const prev = ma.get(c.id);
    if (!prev) {
      changes.push({ group: 'Communities', label: `Added ${c.name || 'community'}`, from: '—', to: `${units(c)} beds${c.pilot ? ', pilot' : ''}` });
      continue;
    }
    for (const [k, f] of Object.entries(COMMUNITY_FIELDS) as Array<[keyof typeof COMMUNITY_FIELDS, Field]>) {
      if (!same(prev[k], c[k])) changes.push({ group: 'Communities', label: `${c.name || prev.name}: ${f.label}`, from: fmtValue(prev[k], f.fmt), to: fmtValue(c[k], f.fmt) });
    }
  }
  // Stages and terms are lists: described item by item.
  for (const c of planChanges(pa, pb)) changes.push({ group: 'Implementation', label: 'Implementation stages', from: '', to: c });
  // Only edits to the terms themselves (a pricing change that adds a standard term isn't one).
  if (JSON.stringify(normalizeTerms(_ta)) !== JSON.stringify(normalizeTerms(_tb)))
    for (const c of termsChanges(before, after)) changes.push({ group: 'Terms / Notes', label: 'Terms / Notes', from: '', to: c });
  const order = ['Deal', 'Pricing', 'Communities', 'Implementation', 'Timeline', 'Terms / Notes', 'Case setup', 'Improvement metrics', 'Client assumptions', 'CFO inputs', 'Valuation', 'Other'];
  return changes.sort((x, y) => order.indexOf(x.group) - order.indexOf(y.group));
}

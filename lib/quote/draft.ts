/**
 * QuoteDraft — everything a rep edits for one quote. This is what the form
 * holds, what a quote version stores (inputs_json), and what toModelInputs()
 * turns into engine inputs. Rates are fractions; money is dollars.
 */
import { STANDARD_CASE_METRICS, DEFAULT_CLIENT, type CaseMetrics, type ClientAssumptions, type ComponentToggles, type RoiCase } from '@/lib/model';
import { POLICY, SKU, type PriceBook } from '@/lib/pricing/catalog';
import { defaultPlan, normalizePlan, type ImplementationPlan } from './implementationPlan';
import { normalizeTerms, type TermsSetting } from './terms';
import { normalizeResources, type Resources } from './resources';

export type EcallOption = 'none' | 'ble' | 'inovonics';
export type Coverage = 'rooms_only' | 'full_facility';

export interface DraftCommunity {
  id: string;
  name: string;
  market: string;
  /** Beds by care type. Every bed is priced the same; the split is for scope and reporting. */
  ilBeds: number;
  alBeds: number;
  mcBeds: number;
  /** Skilled nursing beds. */
  snfBeds: number;
  /** @deprecated single bed count from before the IL/AL/MC split; normalizeDraft moves it to alBeds. */
  beds?: number;
  coverage: Coverage;
  /** Takes the deal's e-call add-on. */
  ecall: boolean;
  pilot: boolean;
  /** null = whole community is in the pilot. */
  pilotUnits: number | null;
  /** null = deal occupancy. */
  occupancy: number | null;
  /** 'yyyy-mm'; null = default (month 1, or right after the pilot for non-pilot sites). */
  goLiveMonth: string | null;
  /** null = deal ROI start delay. */
  roiDelayMonths: number | null;
  additionalSensors: number;
}

export interface Commercial {
  /** Post-pilot platform rate per bed per month. List $99. */
  platformRate: number;
  /** Pilot platform rate per bed per month. Standard $75. */
  pilotRate: number;
  ecall: EcallOption;
  ecallRate: number;
  ecallPilotRate: number;
  /** Install per bed before credits. List $400. */
  installRate: number;
  /** Install credit on pilot communities, 0–1. */
  installCreditPct: number;
  /** Credit is clawed back if the customer doesn't convert. */
  installClawback: boolean;
  /** Optional introductory platform rate for the first months of the service term. */
  specialRate: number | null;
  specialTermMonths: number;
  fullFacilityMultiplier: number;
  sensorPrice: number;
  /** Annual rate used to discount the service-term subscription into an upfront capex price. */
  capexDiscountRate: number;
}

/** How the investment is presented to the customer. */
export type Presentation = 'opex' | 'capex' | 'both';

export interface QuoteDraft {
  customerName: string;
  roiCase: RoiCase;
  components: ComponentToggles;
  /** false = the workbook's uniform metrics (one value for every case). */
  customizeCaseMetrics: boolean;
  caseMetrics: Record<RoiCase, CaseMetrics>;
  valuation: { capRate: number; operatingMargin: number };
  monthsUntilCocNoticed: number;
  client: Omit<ClientAssumptions, 'avgRevenuePerResident'> & { avgRevenuePerResidentOverride: number | null };
  cfo: { annualDiscountRate: number; portfolioUnitsOverride: number | null; reimbursementPerOccupiedUnitMonth: number };
  schedule: {
    withPilot: boolean;
    pilotLengthMonths: number;
    roiStartDelayMonths: number;
    rampMonths: number;
    horizonMonths: number;
    includeReimbursement: boolean;
  };
  implementation: {
    /** Also month 1 of the cash flow. */
    desiredGoLive: string;
    communicationWeeks: number;
    installationWeeks: number;
    baselineWeeks: number;
    onboardingDays: number;
  };
  /** Stage lengths from contract to go-live, worked back from pilot go-live dates. */
  implementationPlan: ImplementationPlan;
  /** Terms / Notes on the proposal. null = the standard terms for this deal. */
  terms: TermsSetting | null;
  /** The customer's estimated hours by role and implementation stage. */
  resources: Resources;
  commercial: Commercial;
  presentation: Presentation;
  communities: DraftCommunity[];
}

const { avgRevenuePerResident: _derived, ...clientDefaults } = DEFAULT_CLIENT;

export function newCommunity(i: number): DraftCommunity {
  return {
    id: `c${Date.now().toString(36)}${i}`,
    name: '',
    market: '',
    ilBeds: 0,
    alBeds: 0,
    mcBeds: 0,
    snfBeds: 0,
    coverage: 'rooms_only',
    ecall: true,
    pilot: false,
    pilotUnits: null,
    occupancy: null,
    goLiveMonth: null,
    roiDelayMonths: null,
    additionalSensors: 0,
  };
}

export function defaultDraft(customerName: string, book: PriceBook, today = new Date()): QuoteDraft {
  // Default go-live: first of the month, three months out.
  const goLive = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 1)).toISOString().slice(0, 10);
  return {
    customerName,
    roiCase: 'target',
    components: {
      careRevenueRecapture: true,
      fallsHospitalization: true,
      fallsDischarge: true,
      staffingAlignment: true,
      moveInImpact: true,
      techReplacement: true,
    },
    customizeCaseMetrics: true,
    caseMetrics: structuredClone(STANDARD_CASE_METRICS),
    valuation: { capRate: 0.09, operatingMargin: 0.35 },
    monthsUntilCocNoticed: 6,
    client: { ...clientDefaults, avgRevenuePerResidentOverride: null },
    cfo: { annualDiscountRate: 0.08, portfolioUnitsOverride: null, reimbursementPerOccupiedUnitMonth: 86 },
    schedule: { withPilot: true, pilotLengthMonths: POLICY.standardPilotMonths, roiStartDelayMonths: 3, rampMonths: 3, horizonMonths: 36, includeReimbursement: false },
    implementation: { desiredGoLive: goLive, communicationWeeks: 3, installationWeeks: 1, baselineWeeks: 4, onboardingDays: 3 },
    implementationPlan: defaultPlan(),
    terms: null,
    resources: [],
    commercial: {
      platformRate: book[SKU.platform]?.list ?? 99,
      pilotRate: POLICY.standardPilotRate,
      ecall: 'ble',
      ecallRate: book[SKU.ecallBle]?.list ?? 10,
      ecallPilotRate: 0, // E-Call is free during the pilot
      installRate: book[SKU.install]?.list ?? 400,
      installCreditPct: 0,
      installClawback: false,
      specialRate: null,
      specialTermMonths: 0,
      fullFacilityMultiplier: book[SKU.fullFacility]?.list ?? 1.3,
      sensorPrice: book[SKU.sensor]?.list ?? 300,
      capexDiscountRate: 0.04,
    },
    presentation: 'opex',
    communities: [{ ...newCommunity(0), pilot: true }],
  };
}

/**
 * Fill fields added after a draft was saved, so older drafts and versions
 * still load. Only adds what's missing; never changes a value that's there.
 */
export function normalizeDraft(d: QuoteDraft): QuoteDraft {
  return {
    ...d,
    presentation: d.presentation ?? 'opex',
    implementationPlan: normalizePlan(d.implementationPlan),
    terms: normalizeTerms(d.terms),
    resources: normalizeResources(d.resources),
    commercial: { ...d.commercial, capexDiscountRate: d.commercial.capexDiscountRate ?? 0.04 },
    communities: (d.communities ?? []).map(normalizeCommunity),
  };
}

/** Communities saved before the IL/AL/MC split had one bed count: it becomes AL. */
export function normalizeCommunity(c: DraftCommunity): DraftCommunity {
  if (c.ilBeds != null || c.alBeds != null || c.mcBeds != null) {
    const { beds: _legacy, ...rest } = c;
    return { ...rest, ilBeds: Number(c.ilBeds) || 0, alBeds: Number(c.alBeds) || 0, mcBeds: Number(c.mcBeds) || 0, snfBeds: Number(c.snfBeds) || 0 };
  }
  const { beds, ...rest } = c;
  return { ...rest, ilBeds: 0, alBeds: Number(beds) || 0, mcBeds: 0, snfBeds: Number(c.snfBeds) || 0 };
}

/** Total beds (IL + AL + MC + SNF). Tolerates un-normalized legacy communities. */
export function bedsOf(c: Partial<DraftCommunity> | undefined | null): number {
  if (!c) return 0;
  const split = c.ilBeds != null || c.alBeds != null || c.mcBeds != null;
  const nonSnf = split ? (Number(c.ilBeds) || 0) + (Number(c.alBeds) || 0) + (Number(c.mcBeds) || 0) : Number(c.beds) || 0;
  return nonSnf + (Number(c.snfBeds) || 0);
}

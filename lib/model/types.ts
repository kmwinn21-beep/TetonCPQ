/**
 * Engine inputs and outputs.
 *
 * Every field maps to a cell in the cost-benefit workbook
 * (KW_CostBenefit_With_12moCF). The cell is named in the comment so a number
 * can always be traced back to where it came from in Excel.
 *
 * Rates are fractions (0.09, not 9). Money is in dollars (floating point) —
 * the engine reproduces the workbook's arithmetic exactly, including where it
 * rounds and where it does not. Rounding to cents happens only at display time.
 */

export const ROI_CASES = ['stretch', 'target', 'base', 'underperforming'] as const;
export type RoiCase = (typeof ROI_CASES)[number];

export interface ComponentToggles {
  careRevenueRecapture: boolean; // Assumptions C12
  fallsHospitalization: boolean; // C13
  fallsDischarge: boolean; // C14
  staffingAlignment: boolean; // C15
  moveInImpact: boolean; // C16
  techReplacement: boolean; // C17
}

/** Performance assumptions for one ROI case. */
export interface CaseMetrics {
  /** Share of falls Teton prevents. Teton ROI J17/T17/AD17/AN17. */
  fallReduction: number;
  /** Share of occupied residents with a level-of-care gap identified each month. Teton ROI K17/U17/AE17/AO17. */
  locGapIdentifiedPerMonth: number;
  /** Uplift on move-ins. Assumptions E19:E22 (effective). */
  moveInUplift: number;
  /** Night staffing cost reduction. Assumptions F19:F22 (effective). */
  staffingAlignment: number;
  /** Share of existing supportive-tech spend Teton replaces. Assumptions G19:G22 (effective). */
  techReplacement: number;
}

export interface ClientAssumptions {
  occupancy: number; // C29
  avgRent: number; // C30 ($/resident/month)
  careRevenuePerResident: number; // C31 ($/resident/month)
  locGapUpliftPerTierStep: number; // C32 ($/resident/month)
  moveInRatePerMonth: number; // C34 (fraction of occupied units)
  yr1RevenueMonthsPerMoveIn: number; // C35
  avgRevenuePerResident: number; // C36 (= rent + care revenue in the workbook)
  fallsPerResidentYear: number; // E29
  pctFallsHospitalization: number; // E31
  costPerHospitalization: number; // E33
  pctFallsDischarge: number; // E34
  losIncreaseMonths: number; // E35
  nightResidentToStaffRatio: number; // G29
  nightShiftHours: number; // G30
  nightHourlyWage: number; // G31
  newNightResidentToStaffRatio: number; // G32 (only feeds the standard staffing metric)
  supportiveTechSpendPerResident: number; // G33 ($/occupied unit/year)
}

export interface CfoInputs {
  annualDiscountRate: number; // C40
  /** All units in the customer's portfolio, including communities not in this deal. C41. */
  portfolioUnits: number;
  reimbursementPerOccupiedUnitMonth: number; // C42
}

/**
 * Per-bed prices the cash flow bills. In the CPQ these come from the quote's
 * line items (platform + per-bed add-ons such as e-call), not from a setting.
 */
export interface Pricing {
  pilotFeePerBedMonth: number; // 12 Mo CF H3 (= platform + add-ons during pilot)
  postPilotFeePerBedMonth: number; // 12 Mo CF K2
  pilotInstallPerBed: number; // H4
  postPilotInstallPerBed: number; // K3
  pilotSensorPrice: number; // Assumptions P14
  postPilotSensorPrice: number; // Assumptions P22
  /** Post-pilot price for the first `specialTermMonths` of service, if any. 12 Mo CF K6. */
  specialFeePerBedMonth: number | null;
  specialTermMonths: number; // K7
}

export interface Schedule {
  /** "With Pilot" scenario. When false, pilot communities are billed and modeled as regular ones. 12 Mo CF D2. */
  withPilot: boolean;
  pilotLengthMonths: number; // Assumptions O9
  /** Months after go-live before benefits are counted. 12 Mo CF D4. */
  roiStartDelayMonths: number;
  /** Months over which benefits ramp linearly to full. 12 Mo CF D5. */
  rampMonths: number;
  /** First day of month 1 (ISO date). 12 Mo CF D6. */
  startDate: string;
  /** Length of the monthly cash flow. The workbook's client view is 12; the CPQ default is 36. */
  horizonMonths: number;
  includeReimbursement: boolean; // 12 Mo CF D7
}

export interface ImplementationInputs {
  desiredGoLive: string; // Assumptions I29 (ISO date)
  communicationWeeks: number; // I31
  installationWeeks: number; // I32
  baselineWeeks: number; // I33
  onboardingDays: number; // I34
}

export interface Community {
  name: string;
  market: string;
  /** Units / beds. Assumptions N. */
  units: number;
  pilot: boolean; // Assumptions P
  /** Units in the pilot; null = all units. Assumptions O. */
  pilotUnits: number | null;
  /** Community-specific occupancy; null = portfolio occupancy. Assumptions Q (when O27 = YES). */
  occupancy: number | null;
  /** Go-live month (1 = first month of the cash flow); null = default. 12 Mo CF H / Assumptions R. */
  goLiveMonth: number | null;
  /** Community-specific ROI start delay; null = schedule default. Assumptions S. */
  roiDelayMonths: number | null;
  additionalSensors: number; // Assumptions T
}

export interface VendorCostAssumptions {
  hardwarePerBed: number;
  installLaborPerBed: number;
  sensorCost: number;
  cacPerBed: number;
  cloudPerBilledBedMonth: number;
  supportPerBilledBedMonth: number;
  maintenancePerBilledBedMonth: number;
}

export interface ModelInputs {
  roiCase: RoiCase;
  components: ComponentToggles;
  caseMetrics: Record<RoiCase, CaseMetrics>;
  valuation: { capRate: number; operatingMargin: number }; // E9, G9
  monthsUntilCocNoticed: number; // C21
  client: ClientAssumptions;
  cfo: CfoInputs;
  pricing: Pricing;
  schedule: Schedule;
  implementation: ImplementationInputs;
  communities: Community[];
}

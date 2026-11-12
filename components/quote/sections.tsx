'use client';

import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { ROI_CASES, STANDARD_CASE_METRICS, uniformCaseMetrics, type CaseMetrics, type ModelInputs, type ModelResult, type RoiCase } from '@/lib/model';
import { POLICY, SKU, type PriceBook } from '@/lib/pricing/catalog';
import type { QuoteDraft } from '@/lib/quote/draft';
import { communityRates } from '@/lib/quote/toModelInputs';
import { count, dateLabel, pct, usd } from '@/lib/format';
import { DerivedField, Grid, MoneyField, NumberField, PercentField, Section, SegmentedField, ToggleField } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';

export interface SectionProps {
  inputs: ModelInputs | null;
  result: ModelResult | null;
  book: PriceBook;
}

const CASE_LABEL: Record<RoiCase, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };

export function CaseSetupSection() {
  return (
    <Section id="case" title="Case setup" description="Which ROI case to present, and which benefits to count.">
      <div className="space-y-5">
        <SegmentedField name="roiCase" label="ROI case" options={ROI_CASES.map((c) => ({ value: c, label: CASE_LABEL[c] }))} />
        <div>
          <span className="label">ROI components included</span>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-2">
            <ToggleField name="components.careRevenueRecapture" label="Care Revenue Recapture" hint="Level-of-care gaps billed correctly" />
            <ToggleField name="components.fallsHospitalization" label="Falls → Hospitalization" hint="Hospital costs avoided" />
            <ToggleField name="components.fallsDischarge" label="Falls → Discharge" hint="Length of stay protected" />
            <ToggleField name="components.staffingAlignment" label="Staffing Alignment" hint="Night shift cost" />
            <ToggleField name="components.moveInImpact" label="Move-in Impact" hint="Incremental move-ins" />
            <ToggleField name="components.techReplacement" label="Tech Replacement" hint="Supportive tech retired" />
          </div>
        </div>
      </div>
    </Section>
  );
}

export function PricingSection({ book }: SectionProps) {
  const { control, setValue } = useFormContext<QuoteDraft>();
  const d = useWatch({ control }) as QuoteDraft;
  const k = d.commercial;
  const listPlatform = book[SKU.platform]?.list ?? 99;
  const listInstall = book[SKU.install]?.list ?? 400;
  const ecallList = (o: QuoteDraft['commercial']['ecall']) => (o === 'ble' ? book[SKU.ecallBle]?.list ?? 10 : o === 'inovonics' ? book[SKU.ecallInovonics]?.list ?? 15 : 0);
  const sample = (coverage: 'rooms_only' | 'full_facility') => communityRates(d, { coverage, ecall: true } as never);
  const rooms = sample('rooms_only');
  const full = sample('full_facility');
  const usesFull = d.communities?.some((c) => c.coverage === 'full_facility');

  return (
    <Section id="pricing" title="Pricing & products" description={`US rate card: $${listPlatform}/bed/month, $${listInstall}/bed install. Guardrails update on the right as you type.`}>
      <div className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold mb-3">Teton subscription</h3>
          <Grid cols={4}>
            <MoneyField name="commercial.platformRate" label="Rate per bed / month" suffix="/bed" hint={`List $${listPlatform} · floor $${POLICY.postPilotFloor}`} min={0} />
            <ToggleField name="schedule.withPilot" label="Start with a pilot" hint="Pilot sites are marked per community" />
            <MoneyField name="commercial.pilotRate" label="Pilot rate per bed / month" suffix="/bed" hint={`Standard $${POLICY.standardPilotRate}`} disabled={!d.schedule?.withPilot} min={0} />
            <NumberField name="schedule.pilotLengthMonths" label="Pilot length" suffix="months" hint={`Standard ${POLICY.standardPilotMonths}, then 36-month term`} disabled={!d.schedule?.withPilot} min={1} />
          </Grid>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Installation</h3>
          <Grid cols={4}>
            <MoneyField name="commercial.installRate" label="Install per bed (one-time)" hint={`List $${listInstall}`} min={0} />
            <Controller
              control={control}
              name="commercial.installCreditPct"
              render={({ field }) => (
                <div>
                  <label className="label" htmlFor="install-credit">Install credit on pilot sites</label>
                  <select id="install-credit" className="input-field" value={String(field.value)} onChange={(e) => field.onChange(Number(e.target.value))}>
                    <option value="0">None — paid upfront</option>
                    <option value="0.5">50% credit</option>
                    <option value="1">100% credit</option>
                  </select>
                </div>
              )}
            />
            <ToggleField name="commercial.installClawback" label="Clawback if they don’t convert" disabled={!k.installCreditPct} />
            <MoneyField name="commercial.sensorPrice" label="Additional sensor (each)" min={0} />
          </Grid>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Add-ons & coverage</h3>
          <Grid cols={4}>
            <Controller
              control={control}
              name="commercial.ecall"
              render={({ field }) => (
                <div>
                  <label className="label" htmlFor="ecall">E-Call</label>
                  <select
                    id="ecall"
                    className="input-field"
                    value={field.value}
                    onChange={(e) => {
                      const v = e.target.value as QuoteDraft['commercial']['ecall'];
                      field.onChange(v);
                      // Re-price at the new product's list price.
                      setValue('commercial.ecallRate', ecallList(v), { shouldDirty: true });
                      setValue('commercial.ecallPilotRate', 0, { shouldDirty: true }); // free during the pilot
                    }}
                  >
                    <option value="none">None</option>
                    <option value="ble">Bluetooth (${book[SKU.ecallBle]?.list ?? 10})</option>
                    <option value="inovonics">Inovonics (${book[SKU.ecallInovonics]?.list ?? 15})</option>
                  </select>
                  <p className="hint">Per site: tick E-Call in the communities table</p>
                </div>
              )}
            />
            <MoneyField name="commercial.ecallRate" label="E-Call per bed / month" disabled={k.ecall === 'none'} min={0} />
            <MoneyField name="commercial.ecallPilotRate" label="E-Call during pilot" hint="Standard: free" disabled={k.ecall === 'none' || !d.schedule?.withPilot} min={0} />
            <NumberField name="commercial.fullFacilityMultiplier" label="Full-facility multiplier" suffix="×" hint="Common areas & hallways; usually 1.2–1.4×. Applies to subscription and install." min={1} />
          </Grid>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">How the investment is presented</h3>
          <div className="flex flex-wrap items-end gap-4">
            <SegmentedField
              name="presentation"
              label="Proposal shows"
              options={[
                { value: 'opex', label: 'Subscription (opex)' },
                { value: 'capex', label: 'Upfront (capex)' },
                { value: 'both', label: 'Both' },
              ]}
            />
            <div className="w-48">
              <PercentField name="commercial.capexDiscountRate" label="Capex discount rate" hint="Annual; prices the term upfront" min={0} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-3">Introductory pricing (optional)</h3>
          <Grid cols={4}>
            <MoneyField name="commercial.specialRate" label="Intro rate per bed / month" nullable placeholder="None" hint="Platform rate for the first months after the pilot" min={0} />
            <NumberField name="commercial.specialTermMonths" label="Intro term" suffix="months" disabled={k.specialRate == null} min={0} />
          </Grid>
        </div>

        <div className="rounded-lg bg-teton-almost-white border border-teton-off-white p-3 overflow-x-auto">
          <table className="text-sm w-full min-w-[480px]">
            <caption className="text-left text-xs font-medium text-teton-dark-gray pb-2">Effective per-bed rates (platform × coverage + e-call)</caption>
            <thead className="text-xs text-teton-ui-gray text-left">
              <tr>
                <th className="font-medium py-1">Coverage</th>
                <th className="font-medium py-1 text-right">Pilot / mo</th>
                <th className="font-medium py-1 text-right">Post-pilot / mo</th>
                <th className="font-medium py-1 text-right">Install, pilot site</th>
                <th className="font-medium py-1 text-right">Install, other sites</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[['Rooms only', rooms] as const, ...(usesFull ? [['Full facility', full] as const] : [])].map(([label, r]) => (
                <tr key={label} className="border-t border-teton-off-white">
                  <td className="py-1.5">{label}</td>
                  <td className="py-1.5 text-right">{d.schedule?.withPilot ? usd(r.pilotFeePerBedMonth, { cents: true }) : '—'}</td>
                  <td className="py-1.5 text-right">{usd(r.postPilotFeePerBedMonth, { cents: true })}</td>
                  <td className="py-1.5 text-right">{usd(r.pilotInstallPerBed, { cents: true })}</td>
                  <td className="py-1.5 text-right">{usd(r.postPilotInstallPerBed, { cents: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

export function ScheduleSection({ result }: SectionProps) {
  const { register } = useFormContext<QuoteDraft>();
  const impl = result?.implementation;
  return (
    <Section id="schedule" title="Timeline & implementation" description="Month 1 of the cash flow is the desired go-live month. Each community can go live later.">
      <div className="space-y-5">
        <Grid cols={4}>
          <div>
            <label className="label" htmlFor="golive">Desired go-live date</label>
            <input id="golive" type="date" className="input-field" {...register('implementation.desiredGoLive', { required: 'Required' })} />
          </div>
          <NumberField name="schedule.roiStartDelayMonths" label="ROI start delay" suffix="months" hint="After go-live, before benefits count" min={0} />
          <NumberField name="schedule.rampMonths" label="Time to full ROI" suffix="months" hint="Benefits ramp linearly" min={1} />
          <Controller
            name="schedule.horizonMonths"
            render={({ field }) => (
              <div>
                <label className="label" htmlFor="horizon">Model horizon</label>
                <select id="horizon" className="input-field" value={String(field.value)} onChange={(e) => field.onChange(Number(e.target.value))}>
                  {[12, 24, 36, 48, 60].map((m) => (
                    <option key={m} value={m}>{m} months</option>
                  ))}
                </select>
              </div>
            )}
          />
        </Grid>
        <Grid cols={4}>
          <NumberField name="implementation.communicationWeeks" label="Communication" suffix="weeks" min={0} />
          <NumberField name="implementation.installationWeeks" label="Installation" suffix="weeks" min={0} />
          <NumberField name="implementation.baselineWeeks" label="Baseline" suffix="weeks" min={0} />
          <NumberField name="implementation.onboardingDays" label="Onboarding" suffix="days" min={0} />
        </Grid>
        <Grid cols={4}>
          <DerivedField label="Total implementation time" value={impl ? `${Number(impl.totalImplementationWeeks.toFixed(1))} weeks` : '—'} formula="Communication + Installation + Baseline weeks + Onboarding days ÷ 5" />
          <DerivedField label="Latest kickoff date" value={impl ? dateLabel(impl.latestKickoffDate) : '—'} formula="Go-live date − implementation time in working days" />
        </Grid>
      </div>
    </Section>
  );
}

export function ValuationSection() {
  return (
    <Section id="valuation" title="Valuation & margin">
      <Grid cols={3}>
        <PercentField name="valuation.capRate" label="Cap rate" cell="Assumptions!E9" min={0.0001} />
        <PercentField name="valuation.operatingMargin" label="Operating margin" cell="Assumptions!G9" />
        <NumberField name="monthsUntilCocNoticed" label="Months until change of condition noticed" suffix="months" cell="Assumptions!C21" hint="Without Teton" min={0} />
      </Grid>
    </Section>
  );
}

const METRICS: Array<{ key: keyof CaseMetrics; label: string }> = [
  { key: 'fallReduction', label: 'Fall reduction' },
  { key: 'locGapIdentifiedPerMonth', label: 'LOC gaps identified / mo' },
  { key: 'moveInUplift', label: 'Move-in uplift' },
  { key: 'staffingAlignment', label: 'Staffing alignment' },
  { key: 'techReplacement', label: 'Tech replacement' },
];

export function MetricsSection({ inputs }: SectionProps) {
  const { control, setValue } = useFormContext<QuoteDraft>();
  const customize = useWatch({ control, name: 'customizeCaseMetrics' });
  const roiCase = useWatch({ control, name: 'roiCase' });
  const uniform = inputs ? uniformCaseMetrics(inputs.client, inputs.caseMetrics) : null;
  return (
    <Section
      id="metrics"
      title="Teton improvement metrics"
      description="How well Teton performs in each case. The selected case drives the proposal; all four feed the comparison."
      aside={
        <button type="button" className="btn-ghost" onClick={() => setValue('caseMetrics', structuredClone(STANDARD_CASE_METRICS), { shouldDirty: true })}>
          Reset to standard
        </button>
      }
    >
      <div className="mb-4">
        <ToggleField
          name="customizeCaseMetrics"
          label="Customize case metrics?"
          hint="Off = the workbook’s uniform values: 10% move-in uplift, 100% tech replacement and staffing derived from the night ratios, for every case."
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-xs text-teton-dark-gray text-left">
              <th className="font-medium py-1.5 pr-3">Case</th>
              {METRICS.map((m) => (
                <th key={m.key} className="font-medium py-1.5 px-1">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROI_CASES.map((c) => (
              <tr key={c} className={c === roiCase ? 'bg-teton-pale-purple/60' : ''}>
                <td className="py-1.5 pr-3 font-medium whitespace-nowrap">
                  {CASE_LABEL[c]}
                  {c === roiCase && <span className="badge-purple ml-2">selected</span>}
                </td>
                {METRICS.map((m) => {
                  const locked = !customize && (m.key === 'moveInUplift' || m.key === 'staffingAlignment' || m.key === 'techReplacement');
                  return (
                    <td key={m.key} className="py-1 px-1">
                      {locked ? (
                        <div className="derived" title="Uniform value (customize is off)">{pct(uniform?.[c][m.key] ?? null)}</div>
                      ) : (
                        <Controller
                          control={control}
                          name={`caseMetrics.${c}.${m.key}`}
                          render={({ field }) => (
                            <NumInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} scale={100} suffix="%" aria-label={`${CASE_LABEL[c]} ${m.label}`} min={0} />
                          )}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function ClientSection({ inputs, result }: SectionProps) {
  const { control } = useFormContext<QuoteDraft>();
  const client = useWatch({ control, name: 'client' });
  const occTotal = result?.kpis.totalOccupiedUnits ?? 0;
  const derivedStaffing = client ? 1 - client.nightResidentToStaffRatio / client.newNightResidentToStaffRatio : null;
  return (
    <>
      <Section id="revenue" title="Client — revenue">
        <Grid cols={4}>
          <PercentField name="client.occupancy" label="Occupancy" cell="Assumptions!C29" min={0} max={1} hint="Communities can override" />
          <MoneyField name="client.avgRent" label="Avg rent / resident / mo" cell="Assumptions!C30" min={0} />
          <MoneyField name="client.careRevenuePerResident" label="Care revenue / resident / mo" cell="Assumptions!C31" min={0} />
          <MoneyField name="client.locGapUpliftPerTierStep" label="LOC gap uplift per tier step" suffix="/res/mo" cell="Assumptions!C32" min={0} />
        </Grid>
      </Section>
      <Section id="movein" title="Client — move-in impact">
        <Grid cols={4}>
          <PercentField name="client.moveInRatePerMonth" label="Move-ins per month (% of occupied)" cell="Assumptions!C34" min={0} />
          <NumberField name="client.yr1RevenueMonthsPerMoveIn" label="Yr-1 revenue months per move-in" suffix="months" cell="Assumptions!C35" min={0} />
          <MoneyField
            name="client.avgRevenuePerResidentOverride"
            label="Avg revenue / resident / mo"
            nullable
            placeholder={inputs ? String(inputs.client.avgRent + inputs.client.careRevenuePerResident) : ''}
            hint="Blank = rent + care revenue"
            cell="Assumptions!C36"
            min={0}
          />
        </Grid>
      </Section>
      <Section id="falls" title="Client — falls">
        <Grid cols={4}>
          <NumberField name="client.fallsPerResidentYear" label="Falls per resident per year" cell="Assumptions!E29" min={0} />
          <PercentField name="client.pctFallsHospitalization" label="% of falls → hospitalization" cell="Assumptions!E31" min={0} max={1} />
          <MoneyField name="client.costPerHospitalization" label="Cost per hospitalization" cell="Assumptions!E33" min={0} />
          <PercentField name="client.pctFallsDischarge" label="% of falls → discharge" cell="Assumptions!E34" min={0} max={1} />
          <NumberField name="client.losIncreaseMonths" label="LOS increase" suffix="months" cell="Assumptions!E35" min={0} />
          <DerivedField
            label="Total falls per year"
            value={client ? count(occTotal * client.fallsPerResidentYear) : '—'}
            formula={`Occupied units (${count(occTotal)}) × falls per resident per year`}
          />
        </Grid>
      </Section>
      <Section id="staffing" title="Client — night staffing">
        <Grid cols={4}>
          <NumberField name="client.nightResidentToStaffRatio" label="Residents per staff (night)" cell="Assumptions!G29" min={1} />
          <NumberField name="client.nightShiftHours" label="Night shift hours" suffix="hours" cell="Assumptions!G30" min={0} />
          <MoneyField name="client.nightHourlyWage" label="Hourly wage, night staff" cell="Assumptions!G31" min={0} />
          <NumberField name="client.newNightResidentToStaffRatio" label="New residents per staff ratio" cell="Assumptions!G32" min={1} />
          <MoneyField name="client.supportiveTechSpendPerResident" label="Supportive tech spend / resident / yr" cell="Assumptions!G33" min={0} />
          <DerivedField label="Night staff savings %" value={pct(derivedStaffing)} formula="1 − current ratio ÷ new ratio (used when case metrics aren’t customized)" />
        </Grid>
      </Section>
    </>
  );
}

export function CfoSection({ inputs }: SectionProps) {
  return (
    <Section id="cfo" title="CFO inputs">
      <Grid cols={3}>
        <PercentField name="cfo.annualDiscountRate" label="Annual discount rate" cell="Assumptions!C40" hint="The customer’s cost of money" min={0} />
        <NumberField
          name="cfo.portfolioUnitsOverride"
          label="Total portfolio units"
          nullable
          placeholder={inputs ? String(inputs.communities.reduce((s, c) => s + c.units, 0)) : ''}
          hint="Blank = units in this deal. Include communities outside the deal for a per-door view."
          cell="Assumptions!C41"
          min={1}
        />
        <MoneyField name="cfo.reimbursementPerOccupiedUnitMonth" label="Reimbursement per occupied unit / mo" cell="Assumptions!C42" min={0} />
        <ToggleField name="schedule.includeReimbursement" label="Include reimbursement" hint="Offsets fees once each site is post-pilot" />
      </Grid>
    </Section>
  );
}

'use client';

import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { ROI_CASES, STANDARD_CASE_METRICS, uniformCaseMetrics, type CaseMetrics, type ModelInputs, type ModelResult, type RoiCase } from '@/lib/model';
import { POLICY, SKU, type PriceBook } from '@/lib/pricing/catalog';
import { pricedBedsOf, type QuoteDraft } from '@/lib/quote/draft';
import { communityRates } from '@/lib/quote/toModelInputs';
import { count, dateLabel, pct, usd } from '@/lib/format';
import { DerivedField, Grid, MoneyField, NumberField, PercentField, Section, SegmentedField, ToggleField } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import { SegGroup } from '@/components/form/SegGroup';

export interface SectionProps {
  inputs: ModelInputs | null;
  result: ModelResult | null;
  book: PriceBook;
}

const CASE_LABEL: Record<RoiCase, string> = { stretch: 'Stretch', target: 'Target', base: 'Base', underperforming: 'Underperforming' };

/** The whole draft, live — used for the one-line summaries shown on collapsed sections. */
function useDraft(): QuoteDraft {
  const { control } = useFormContext<QuoteDraft>();
  return useWatch({ control }) as QuoteDraft;
}
const money = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const dot = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' · ');

export function CaseSetupSection() {
  const d = useDraft();
  const on = Object.values(d.components ?? {}).filter(Boolean).length;
  const total = Object.keys(d.components ?? {}).length;
  return (
    <Section id="case" title="ROI Case Setup" description="Which ROI case to present, and which benefits to count." summary={dot(`${CASE_LABEL[d.roiCase] ?? d.roiCase} case`, `${on} of ${total} benefits included`)}>
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

/** Install credit on pilot sites: None, 50%, 100% or a custom percentage typed beside the buttons (required once Custom is chosen). */
function InstallCreditChoice() {
  const { control, setValue } = useFormContext<QuoteDraft>();
  const k = useWatch({ control, name: 'commercial' }) as QuoteDraft['commercial'];
  const custom = !!k.installCreditCustom;
  const pick = (v: number | 'custom') => {
    if (v === 'custom') {
      setValue('commercial.installCreditCustom', true, { shouldDirty: true });
      setValue('commercial.installCreditPct', k.installCreditCustomPct ?? 0, { shouldDirty: true });
    } else {
      setValue('commercial.installCreditCustom', false, { shouldDirty: true });
      setValue('commercial.installCreditPct', v, { shouldDirty: true });
    }
  };
  const opts: Array<[number | 'custom', string]> = [[0, 'None'], [0.5, '50%'], [1, '100%'], ['custom', 'Custom']];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SegGroup label="Install credit on pilot sites" className="inline-flex rounded-lg bg-teton-off-white p-0.5">
        {opts.map(([v, text]) => {
          const on = v === 'custom' ? custom : !custom && k.installCreditPct === v;
          return (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => pick(v)}
              className={`px-3 py-1.5 sm:px-2.5 sm:py-1 text-[13px] rounded-md whitespace-nowrap transition-colors duration-200 ${on ? 'text-white font-medium' : 'text-teton-dark-gray hover:bg-white/70'}`}
            >
              {text}
            </button>
          );
        })}
      </SegGroup>
      {custom && (
        <Controller
          control={control}
          name="commercial.installCreditCustomPct"
          rules={{ validate: (v) => (v != null && Number.isFinite(v as number)) || 'Enter the custom credit' }}
          render={({ field, fieldState }) => (
            <div className="w-[5.5rem] drawer-in">
              <NumInput
                value={field.value as number | null | undefined}
                onChange={(v) => {
                  const pct = v == null ? null : Math.min(1, Math.max(0, v));
                  field.onChange(pct);
                  setValue('commercial.installCreditPct', pct ?? 0, { shouldDirty: true });
                }}
                onBlur={field.onBlur}
                scale={100}
                nullable
                suffix="%"
                min={0}
                max={100}
                placeholder="25"
                invalid={!!fieldState.error}
                aria-label="Custom install credit"
              />
            </div>
          )}
        />
      )}
    </div>
  );
}

/* ---------- Pricing section pieces ---------- */

/** One row of the Deal setup panel: the setting's name and note on the left, its control on the right. */
function SetupRow({ label, hint, sub, disabled, stack, children }: { label: string; hint?: string; sub?: boolean; disabled?: boolean; /** Phones: put the control under the name (button groups). */ stack?: boolean; children: React.ReactNode }) {
  return (
    // Phones: the control sits under its name so button groups keep their full width.
    <div className={`flex ${stack ? 'flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4' : 'items-center gap-4'} justify-between py-2.5 border-t border-teton-off-white first-of-type:border-t-0 ${sub ? 'pl-4' : ''} ${disabled ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <p className={`text-sm text-teton-ink ${sub ? '' : 'font-medium'}`}>{label}</p>
        {hint && <p className="text-xs text-teton-ui-gray mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0 max-w-full overflow-x-auto">{children}</div>
    </div>
  );
}

function SwitchButton({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent disabled:cursor-not-allowed ${on ? 'bg-brand-secondary' : 'bg-teton-pale-gray'}`}
    >
      <span className={`inline-block h-4 w-4 mt-0.5 rounded-full bg-white shadow transition-transform duration-200 ease-out ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

type FieldName = Parameters<typeof Controller<QuoteDraft>>[0]['name'];

function Switch({ name, label, disabled }: { name: FieldName; label: string; disabled?: boolean }) {
  const { control } = useFormContext<QuoteDraft>();
  return <Controller control={control} name={name} render={({ field }) => <SwitchButton label={label} on={!!field.value} onChange={field.onChange} disabled={disabled} />} />;
}

/** One-click choice between a few options. */
function Seg<V extends string | number>({ name, label, options, onPick }: { name: FieldName; label: string; options: Array<readonly [V, string]>; onPick?: (v: V) => void }) {
  const { control } = useFormContext<QuoteDraft>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <SegGroup label={label} className="inline-flex rounded-lg bg-teton-off-white p-0.5">
          {options.map(([v, text]) => {
            const on = field.value === v;
            return (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  field.onChange(v);
                  onPick?.(v);
                }}
                className={`px-3 py-1.5 sm:px-2.5 sm:py-1 text-[13px] rounded-md whitespace-nowrap transition-colors duration-200 ${on ? 'text-white font-medium' : 'text-teton-dark-gray hover:bg-white/70'}`}
              >
                {text}
              </button>
            );
          })}
        </SegGroup>
      )}
    />
  );
}

/** A group of prices, shown only when it applies to the deal. */
function PriceGroup({ title, tag, tone, note, children }: { title: string; tag?: string; tone?: 'op' | 'cx' | 'pl'; note?: string; children: React.ReactNode }) {
  const tones = { op: 'bg-[#EEF0FF] text-[#3B4BB8]', cx: 'bg-[#FFEDE8] text-[#B5432A]', pl: 'bg-teton-pale-green text-[#256B41]' };
  return (
    <div>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        {title}
        {tag && tone && <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${tones[tone]}`}>{tag}</span>}
      </h3>
      {note && <p className="hint mt-0.5 mb-3">{note}</p>}
      <Grid cols={3}>{children}</Grid>
    </div>
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
  const roomCount = (d.communities ?? []).reduce((n, c) => n + pricedBedsOf(c, k.ecall !== 'none'), 0);
  const pilot = !!d.schedule?.withPilot;
  const opex = d.presentation !== 'capex';
  const capex = d.presentation !== 'opex';
  const ecallOn = k.ecall !== 'none';

  return (
    <Section
      id="pricing"
      title="Pricing & products"
      description={`US rate card: $${listPlatform}/bed/month, $${listInstall}/bed install. Guardrails update on the right as you type.`}
      summary={dot(
        `${money(k.platformRate)}/bed`,
        d.schedule?.withPilot ? `pilot ${money(k.pilotRate)} for ${d.schedule.pilotLengthMonths} mo` : 'no pilot',
        k.ecall === 'none' ? 'no E-Call' : `E-Call ${k.ecall === 'ble' ? 'Bluetooth' : 'Inovonics'} ${money(k.ecallRate)}`,
        `install ${money(k.installRate)}${k.installCreditPct ? ` (${Math.round(k.installCreditPct * 100)}% credit)` : ''}`,
        d.presentation === 'capex' ? 'equipment purchase' : d.presentation === 'both' ? 'subscription + equipment purchase' : false,
        k.finish?.concealed ? 'concealed finish offered' : false,
      )}
    >
      <div className="space-y-6">
        {/* Every switch and choice for the deal, in one place; the prices below follow from them. */}
        <div className="rounded-xl border border-teton-off-white bg-teton-almost-white px-4 py-1" role="group" aria-label="Deal setup">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-teton-ui-gray pt-3 pb-1">Deal setup</p>
          <SetupRow stack label="Pricing structure" hint="What the proposal shows">
            <Seg name="presentation" label="Pricing structure" options={[['opex', 'OpEx'], ['capex', 'CapEx'], ['both', 'Both']]} />
          </SetupRow>
          <SetupRow label="Start with a pilot" hint="Pilot sites are marked per community">
            <Switch name="schedule.withPilot" label="Start with a pilot" />
          </SetupRow>
          {pilot && (
            <>
              <SetupRow stack sub label="Install credit on pilot sites">
                <InstallCreditChoice />
              </SetupRow>
              <SetupRow sub label="Clawback if they don’t convert" disabled={!k.installCreditPct}>
                <Switch name="commercial.installClawback" label="Clawback if they don’t convert" disabled={!k.installCreditPct} />
              </SetupRow>
              <SetupRow
                sub
                label="Credit additional sensors too"
                hint="Pilot sites only. OpEx: they never pay for those sensors. CapEx: credited during the pilot, charged on conversion."
                disabled={!k.installCreditPct}
              >
                <Switch name="commercial.sensorCredit" label="Credit additional sensors too" disabled={!k.installCreditPct} />
              </SetupRow>
            </>
          )}
          <SetupRow stack label="E-Call" hint="Per site: tick E-Call in the communities table">
            <Seg
              name="commercial.ecall"
              label="E-Call"
              options={[['none', 'None'], ['ble', 'Bluetooth'], ['inovonics', 'Inovonics']]}
              onPick={(v) => {
                // Re-price at the new product's list price, free during the pilot.
                setValue('commercial.ecallRate', ecallList(v as QuoteDraft['commercial']['ecall']), { shouldDirty: true });
                setValue('commercial.ecallPilotRate', 0, { shouldDirty: true });
              }}
            />
          </SetupRow>
          <SetupRow label="Concealed finish" hint="Optional add-on, quoted per room pending the site survey">
            <Switch name="commercial.finish.concealed" label="Concealed finish" />
          </SetupRow>
          <SetupRow label="Introductory rate" hint="A lower rate for the first months after the pilot">
            <Controller
              control={control}
              name="commercial.specialRate"
              render={({ field }) => (
                <SwitchButton
                  label="Introductory rate"
                  on={field.value != null}
                  onChange={(on) => {
                    field.onChange(on ? k.platformRate : null);
                    if (on && !k.specialTermMonths) setValue('commercial.specialTermMonths', 6, { shouldDirty: true });
                  }}
                />
              )}
            />
          </SetupRow>
        </div>

        {opex && (
          <PriceGroup title="Subscription" tag="OpEx" tone="op" note="Monthly fees and the one-time installation.">
            <MoneyField name="commercial.platformRate" label="Rate per bed / month" suffix="/bed" hint={`List $${listPlatform} · floor $${POLICY.postPilotFloor}`} min={0} />
            <MoneyField name="commercial.installRate" label="Install per bed" hint={`List $${listInstall} · one-time`} min={0} />
            <MoneyField name="commercial.sensorPrice" label="Additional sensor" hint="Each, one-time" min={0} />
            {ecallOn && <MoneyField name="commercial.ecallRate" label="E-Call per bed / month" suffix="/bed" hint={`List $${ecallList(k.ecall)}`} min={0} />}
            {ecallOn && <MoneyField name="commercial.ecallInstallRate" label="E-Call installation per bed" hint="One-time, on beds with E-Call only" min={0} nullable placeholder="0" />}
            <NumberField name="commercial.fullFacilityMultiplier" label="Full-facility multiplier" suffix="×" hint="Common areas & hallways; usually 1.2–1.4×" min={1} />
          </PriceGroup>
        )}

        {capex && (
          <PriceGroup title="Equipment purchase" tag="CapEx" tone="cx" note="Title passes at install. No install charge or license fee.">
            <MoneyField name="commercial.capex.basePrice" label="Base package per bed" hint="Edge unit + sensor, installed" min={0} />
            {k.ecall === 'ble' && <MoneyField name="commercial.capex.bleBasePrice" label="With E-Call per bed" hint="Replaces the base price" min={0} />}
            {k.ecall === 'inovonics' && <MoneyField name="commercial.capex.inovonicsBasePrice" label="With Inovonics E-Call per bed" hint="Replaces the base price" min={0} />}
            <MoneyField name="commercial.capex.sensorPrice" label="Additional sensor" hint="One-time" min={0} />
            <MoneyField name="commercial.capex.softwareRate" label="Software & services" suffix="/bed/mo" min={0} />
            {ecallOn && <MoneyField name="commercial.capex.ecallOnlyPrice" label="E-Call only per bed" hint="Beds with E-Call only: 48 months of E-Call up front" min={0} nullable placeholder="480" />}
            {k.ecall === 'ble' && <MoneyField name="commercial.capex.bleRenewal" label="E-Call renewal per bed" hint="Every 4 years" min={0} />}
            {k.ecall === 'inovonics' && <MoneyField name="commercial.capex.inovonicsRenewal" label="Inovonics renewal per bed" hint="Every 3 years" min={0} />}
            {pilot && <MoneyField name="commercial.capex.conversionCredit" label="Conversion credit" hint="Off each base package & sensor at pilot sites" min={0} nullable placeholder="0" />}
          </PriceGroup>
        )}

        {pilot && (
          <PriceGroup title="Pilot" tag="Pilot" tone="pl" note="Applies to the communities marked as pilot sites.">
            <MoneyField name="commercial.pilotRate" label="Pilot rate per bed / month" suffix="/bed" hint={`Standard $${POLICY.standardPilotRate}`} min={0} />
            <NumberField name="schedule.pilotLengthMonths" label="Pilot length" suffix="months" hint={`Standard ${POLICY.standardPilotMonths}, then 36-month term`} min={1} />
            {ecallOn && <MoneyField name="commercial.ecallPilotRate" label="E-Call during pilot" suffix="/bed" hint="Standard: free" min={0} />}
          </PriceGroup>
        )}

        {k.finish?.concealed && (
          <PriceGroup title="Concealed finish" note="Range per room, pending the site survey, after the standard installation value is credited. Painting not included.">
            <MoneyField name="commercial.finish.low" label="Low / room" min={0} />
            <MoneyField name="commercial.finish.high" label="High / room" min={0} />
            <MoneyField name="commercial.finish.credit" label="Standard credit / room" hint="Value of the standard install" min={0} />
            <DerivedField
              label="Add-on for the deal"
              value={`${money(roomCount * Math.max(0, (k.finish.low ?? 0) - (k.finish.credit ?? 0)))} to ${money(roomCount * Math.max(0, (k.finish.high ?? 0) - (k.finish.credit ?? 0)))}`}
              formula={`${roomCount} rooms × (concealed price − standard credit)`}
            />
          </PriceGroup>
        )}

        {k.specialRate != null && (
          <PriceGroup title="Introductory rate" note="Replaces the subscription rate for the first months after the pilot.">
            <MoneyField name="commercial.specialRate" label="Intro rate per bed / month" suffix="/bed" min={0} />
            <NumberField name="commercial.specialTermMonths" label="Intro term" suffix="months" min={0} />
          </PriceGroup>
        )}

        {opex && (
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
        )}
      </div>
    </Section>
  );
}

export function ScheduleSection(_props: SectionProps) {
  const { register, formState } = useFormContext<QuoteDraft>();
  const d = useDraft();
  return (
    <Section
      id="schedule"
      title="ROI Timeline / Ramp"
      description="Month 1 of the cash flow is the desired go-live month, or an earlier community go-live if one is set. Each community can go live later."
      summary={dot(
        d.implementation?.desiredGoLive && `Go-live ${dateLabel(d.implementation.desiredGoLive)}`,
        `ROI after ${d.schedule?.roiStartDelayMonths} mo, ramp ${d.schedule?.rampMonths} mo`,
        `${d.schedule?.horizonMonths}-month model`,

      )}
    >
      <div className="space-y-5">
        <Grid cols={4}>
          <div>
            <label className="label" htmlFor="golive">Desired go-live date</label>
            <input id="golive" type="date" className="input-field" aria-invalid={formState.errors.implementation?.desiredGoLive ? true : undefined} {...register('implementation.desiredGoLive', { required: 'Required' })} />
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
      </div>
    </Section>
  );
}

export function ValuationSection() {
  const d = useDraft();
  return (
    <Section id="valuation" title="Valuation & margin" summary={dot(`${pct(d.valuation?.capRate)} cap rate`, `${pct(d.valuation?.operatingMargin)} operating margin`, `change of condition noticed after ${d.monthsUntilCocNoticed} mo`)}>
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
      summary={(() => {
        const m = (customize ? inputs?.caseMetrics : uniform)?.[roiCase];
        return dot(
          customize ? 'Customized per case' : 'Uniform (workbook default)',
          m && `${CASE_LABEL[roiCase]}: falls −${pct(m.fallReduction, 0)}, move-ins +${pct(m.moveInUplift, 0)}, staffing ${pct(m.staffingAlignment, 0)}, tech ${pct(m.techReplacement, 0)}`,
        );
      })()}
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
      <Section id="revenue" title="Client — revenue" summary={client && dot(`${pct(client.occupancy)} occupancy`, `${money(client.avgRent)} rent`, `${money(client.careRevenuePerResident)} care`, `${money(client.locGapUpliftPerTierStep)} LOC uplift`)}>
        <Grid cols={4}>
          <PercentField name="client.occupancy" label="Occupancy" cell="Assumptions!C29" min={0} max={1} hint="Communities can override" />
          <MoneyField name="client.avgRent" label="Avg rent / resident / mo" cell="Assumptions!C30" min={0} />
          <MoneyField name="client.careRevenuePerResident" label="Care revenue / resident / mo" cell="Assumptions!C31" min={0} />
          <MoneyField name="client.locGapUpliftPerTierStep" label="LOC gap uplift per tier step" suffix="/res/mo" cell="Assumptions!C32" min={0} />
        </Grid>
      </Section>
      <Section
        id="movein"
        title="Client — move-in impact"
        summary={client && dot(`${pct(client.moveInRatePerMonth)} of occupied move in each month`, `${client.yr1RevenueMonthsPerMoveIn} revenue months per move-in`)}
      >
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
      <Section
        id="falls"
        title="Client — falls"
        summary={client && dot(`${client.fallsPerResidentYear} per resident / yr`, `${pct(client.pctFallsHospitalization)} hospitalized at ${money(client.costPerHospitalization)}`, `${pct(client.pctFallsDischarge)} discharged`)}
      >
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
      <Section
        id="staffing"
        title="Client — night staffing"
        summary={client && dot(`1 staff : ${client.nightResidentToStaffRatio} residents → 1 : ${client.newNightResidentToStaffRatio}`, `${money(client.nightHourlyWage)}/hr`, `${client.nightShiftHours}-hr shift`)}
      >
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
  const d = useDraft();
  return (
    <Section
      id="cfo"
      title="CFO inputs"
      summary={dot(
        `${pct(d.cfo?.annualDiscountRate)} discount rate`,
        `${(d.cfo?.portfolioUnitsOverride ?? inputs?.cfo.portfolioUnits ?? 0).toLocaleString('en-US')} portfolio units`,
        d.schedule?.includeReimbursement ? `reimbursement ${money(d.cfo?.reimbursementPerOccupiedUnitMonth)}/occupied unit` : 'no reimbursement',
      )}
    >
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

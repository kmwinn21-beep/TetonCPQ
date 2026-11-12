'use client';

import { useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { newCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { monthLabel } from '@/lib/quote/toModelInputs';
import { count } from '@/lib/format';
import { Section } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import type { SectionProps } from './sections';
import { PasteDialog } from './PasteDialog';
import { StaggerDialog } from './StaggerDialog';

export function CommunitiesSection({ inputs, result }: SectionProps) {
  const { control, register, formState, setValue, getValues } = useFormContext<QuoteDraft>();
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'communities', keyName: '_key' });
  const rows = useWatch({ control, name: 'communities' }) ?? [];
  const ecallOn = useWatch({ control, name: 'commercial.ecall' }) !== 'none';
  const withPilot = useWatch({ control, name: 'schedule.withPilot' });
  const [pasting, setPasting] = useState(false);
  const [staggering, setStaggering] = useState(false);
  const desiredGoLive = useWatch({ control, name: 'implementation.desiredGoLive' });
  const horizon = useWatch({ control, name: 'schedule.horizonMonths' });

  const start = inputs?.schedule.startDate;
  const totalBeds = rows.reduce((s, c) => s + (Number(c?.beds) || 0) + (Number(c?.snfBeds) || 0), 0);
  const errors = formState.errors.communities;

  return (
    <Section
      id="communities"
      title="Communities"
      description="Each community has its own bed count, go-live month and pilot flag. Benefits start per community after go-live plus the ROI start delay."
      summary={
        fields.length === 0
          ? 'None yet'
          : [
              `${fields.length} ${fields.length === 1 ? 'community' : 'communities'}`,
              `${count(totalBeds)} beds`,
              withPilot && rows.some((r) => r?.pilot) && `${rows.filter((r) => r?.pilot).length} pilot`,
              rows.some((r) => r?.coverage === 'full_facility') && `${rows.filter((r) => r?.coverage === 'full_facility').length} full facility`,
            ]
              .filter(Boolean)
              .join(' · ')
      }
      aside={
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setStaggering(true)} disabled={fields.length === 0}>
            Stagger go-live dates
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPasting(true)}>
            Paste communities
          </button>
          <button type="button" className="btn-primary" onClick={() => append(newCommunity(fields.length))}>
            Add community
          </button>
        </div>
      }
    >
      <PasteDialog
        open={pasting}
        onClose={() => setPasting(false)}
        existingNames={rows.map((r) => r?.name ?? '')}
        onConfirm={(pasted, mode) => {
          const onlyEmptyStarter = rows.length === 1 && !rows[0]?.name && !Number(rows[0]?.beds);
          if (mode === 'replace' || onlyEmptyStarter) {
            // Replacing keeps each existing community's own settings (go-live date, pilot, coverage,
            // e-call, overrides) when the same community comes back in the paste, matched by name.
            const current = getValues('communities') ?? [];
            const byName = new Map(current.filter((c) => c?.name).map((c) => [c.name.trim().toLowerCase(), c]));
            replace(pasted.map((p, k) => ({ ...(byName.get(p.name.trim().toLowerCase()) ?? newCommunity(k)), ...p })));
          } else {
            append(pasted.map((p, k) => ({ ...newCommunity(fields.length + k), ...p })));
          }
          setPasting(false);
        }}
      />
      <StaggerDialog
        open={staggering}
        onClose={() => setStaggering(false)}
        communities={rows.map((r) => ({ name: r?.name ?? '', pilot: !!withPilot && !!r?.pilot, goLiveMonth: r?.goLiveMonth ?? null }))}
        defaultFirstMonth={(desiredGoLive ?? '').slice(0, 7)}
        horizonMonths={Number(horizon) || 36}
        onApply={(months) => {
          months.forEach((m, i) => setValue(`communities.${i}.goLiveMonth`, m, { shouldDirty: true }));
          setStaggering(false);
        }}
      />

      <div className="hidden md:grid grid-cols-[1.5rem_minmax(10rem,1fr)_5.5rem_5rem_8rem_3.5rem_3.5rem_2rem] gap-2 text-xs font-medium text-teton-dark-gray pb-1.5 border-b border-teton-off-white">
        <span>#</span>
        <span>Community</span>
        <span>Beds</span>
        <span>SNF beds</span>
        <span>Coverage</span>
        <span className="text-center">E-Call</span>
        <span className="text-center">Pilot</span>
        <span />
      </div>
      <ul>
        {fields.map((f, i) => {
          const row = rows[i];
          const cf = result?.cashFlow.communities[i];
          const rowErr = errors?.[i];
          const isPilot = !!row?.pilot && withPilot;
          return (
            <li key={f._key} className={`py-2.5 border-b border-teton-off-white ${isPilot ? 'bg-teton-pale-green -mx-2 px-2 rounded-lg' : ''}`}>
              <div className="grid grid-cols-2 md:grid-cols-[1.5rem_minmax(10rem,1fr)_5.5rem_5rem_8rem_3.5rem_3.5rem_2rem] gap-2 items-start">
                <span className="hidden md:block pt-2 text-teton-ui-gray tabular-nums text-sm">{i + 1}</span>
                <div className="col-span-2 md:col-span-1">
                  <input
                    className={`input-field ${rowErr?.name ? 'ring-2 ring-teton-red border-transparent' : ''}`}
                    placeholder="Community name"
                    aria-label={`Community ${i + 1} name`}
                    aria-invalid={rowErr?.name ? true : undefined}
                    {...register(`communities.${i}.name`, { required: 'Name required' })}
                  />
                  {rowErr?.name && <p className="text-xs mt-0.5">{rowErr.name.message}</p>}
                </div>
                <Controller
                  control={control}
                  name={`communities.${i}.beds`}
                  rules={{ validate: (v, all) => (Number(v) || 0) + (Number(all.communities[i]?.snfBeds) || 0) > 0 || 'Beds required' }}
                  render={({ field, fieldState }) => (
                    <div>
                      <NumInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} min={0} invalid={!!fieldState.error} aria-label={`Community ${i + 1} beds`} />
                      {fieldState.error && <p className="text-xs mt-0.5">{fieldState.error.message}</p>}
                    </div>
                  )}
                />
                <Controller control={control} name={`communities.${i}.snfBeds`} render={({ field }) => <NumInput value={field.value} onChange={field.onChange} min={0} aria-label={`Community ${i + 1} SNF beds`} />} />
                <select className="input-field" aria-label={`Community ${i + 1} coverage`} {...register(`communities.${i}.coverage`)}>
                  <option value="rooms_only">Rooms only</option>
                  <option value="full_facility">Full facility</option>
                </select>
                <label className="flex md:justify-center items-center gap-2 pt-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-teton-near-black" disabled={!ecallOn} aria-label={`Community ${i + 1} e-call`} {...register(`communities.${i}.ecall`)} />
                  <span className="md:hidden">E-Call</span>
                </label>
                <label className="flex md:justify-center items-center gap-2 pt-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-teton-near-black" disabled={!withPilot} aria-label={`Community ${i + 1} pilot`} {...register(`communities.${i}.pilot`)} />
                  <span className="md:hidden">Pilot</span>
                </label>
                <button type="button" className="btn-ghost text-teton-ui-gray justify-self-end" onClick={() => remove(i)} aria-label={`Remove community ${i + 1}`} title="Remove">
                  ✕
                </button>
              </div>
              <div className="md:pl-8 mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 items-center">
                <input className="input-field" placeholder="Market (e.g. CO)" aria-label={`Community ${i + 1} market`} {...register(`communities.${i}.market`)} />
                <input
                  type="month"
                  className="input-field px-2"
                  title="Go-live month (blank = default)"
                  aria-label={`Community ${i + 1} go-live month`}
                  {...register(`communities.${i}.goLiveMonth`, { setValueAs: (v) => (v ? v : null) })}
                />
                {isPilot ? (
                  <Controller
                    control={control}
                    name={`communities.${i}.pilotUnits`}
                    render={({ field }) => <NumInput value={field.value} onChange={field.onChange} nullable placeholder="All beds" suffix="pilot" min={1} aria-label={`Community ${i + 1} pilot units`} />}
                  />
                ) : (
                  <span className="text-xs text-teton-dark-gray leading-tight">
                    <span aria-hidden="true">← </span>Set Community Go-Live Date
                  </span>
                )}
                <Controller
                  control={control}
                  name={`communities.${i}.occupancy`}
                  render={({ field }) => (
                    <NumInput value={field.value} onChange={field.onChange} nullable scale={100} suffix="% occ." placeholder={inputs ? String(Number((inputs.client.occupancy * 100).toFixed(4))) : ''} min={0} max={1} aria-label={`Community ${i + 1} occupancy`} />
                  )}
                />
                <Controller
                  control={control}
                  name={`communities.${i}.roiDelayMonths`}
                  render={({ field }) => (
                    <NumInput value={field.value} onChange={field.onChange} nullable placeholder={inputs ? String(inputs.schedule.roiStartDelayMonths) : ''} suffix="mo delay" min={0} aria-label={`Community ${i + 1} ROI delay`} />
                  )}
                />
                <Controller
                  control={control}
                  name={`communities.${i}.additionalSensors`}
                  render={({ field }) => <NumInput value={field.value} onChange={field.onChange} suffix="sensors" min={0} aria-label={`Community ${i + 1} sensors`} />}
                />
                {cf && start && (
                  <p className="text-xs text-teton-ui-gray col-span-2 sm:col-span-3">
                    Live month {cf.goLiveMonth}
                    {!row?.goLiveMonth ? ` (default · ${monthLabel(start, cf.goLiveMonth)})` : ''} · {cf.inPilot ? `pilot to month ${cf.firstPostPilotMonth - 1} · ` : ''}ROI from month {cf.roiStartMonth}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap justify-between gap-2 pt-3 text-sm">
        <span className="font-medium">
          {fields.length} {fields.length === 1 ? 'community' : 'communities'} · {count(totalBeds)} beds
        </span>
        <span className="text-teton-ui-gray">{result ? `${count(result.kpis.totalOccupiedUnits)} occupied units at modeled occupancy` : ''}</span>
      </div>
      <p className="hint">Second line per community: market, go-live month (blank = month 1, or right after the pilot for non-pilot sites), pilot units, occupancy and ROI delay (blank = deal values), extra sensors. Pilot sites are shaded green.</p>
      {fields.length === 0 && <p className="text-sm text-teton-ui-gray mt-3">Add at least one community.</p>}
    </Section>
  );
}

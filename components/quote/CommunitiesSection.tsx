'use client';

import { useState } from 'react';
import { Controller, useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { bedsOf, newCommunity, type QuoteDraft } from '@/lib/quote/draft';
import { monthLabel } from '@/lib/quote/toModelInputs';
import { count } from '@/lib/format';
import { Section } from '@/components/form/fields';
import { NumInput } from '@/components/form/NumInput';
import type { SectionProps } from './sections';
import { PasteDialog } from './PasteDialog';
import { StaggerDialog } from './StaggerDialog';

export function CommunitiesSection({ inputs, result }: SectionProps) {
  const { control, register, formState, setValue, getValues, trigger } = useFormContext<QuoteDraft>();
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'communities', keyName: '_key' });
  const rows = useWatch({ control, name: 'communities' }) ?? [];
  const ecallOn = useWatch({ control, name: 'commercial.ecall' }) !== 'none';
  const withPilot = useWatch({ control, name: 'schedule.withPilot' });
  const [pasting, setPasting] = useState(false);
  const [staggering, setStaggering] = useState(false);
  const desiredGoLive = useWatch({ control, name: 'implementation.desiredGoLive' });
  const horizon = useWatch({ control, name: 'schedule.horizonMonths' });

  const start = inputs?.schedule.startDate;
  const totalBeds = rows.reduce((s, c) => s + bedsOf(c), 0);
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
          const onlyEmptyStarter = rows.length === 1 && !rows[0]?.name && bedsOf(rows[0]) === 0;
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

      <ul className="space-y-2">
        {fields.map((f, i) => {
          const row = rows[i];
          const cf = result?.cashFlow.communities[i];
          const rowErr = errors?.[i];
          const isPilot = !!row?.pilot && withPilot;
          const id = (k: string) => `c-${f._key}-${k}`;
          const bedError = rowErr?.alBeds?.message;
          return (
            <li key={f._key} className={`rounded-lg border px-3 py-3 ${isPilot ? 'bg-teton-pale-green border-teton-green/40' : 'border-teton-off-white'}`}>
              {/* Row 1: name and beds by care type */}
              <div className="grid grid-cols-4 md:grid-cols-[1.5rem_minmax(8rem,1fr)_repeat(4,4.25rem)_2rem] gap-x-2 gap-y-2 items-end">
                <span className="hidden md:block pb-2.5 text-teton-ui-gray tabular-nums text-sm">{i + 1}</span>
                <div className="col-span-4 md:col-span-1 min-w-0">
                  <label className="eyebrow" htmlFor={id('name')}>Community</label>
                  <input
                    id={id('name')}
                    className={`input-field ${rowErr?.name ? 'ring-2 ring-teton-red border-transparent' : ''}`}
                    placeholder="Community name"
                    aria-label={`Community ${i + 1} name`}
                    aria-invalid={rowErr?.name ? true : undefined}
                    {...register(`communities.${i}.name`, { required: 'Name required' })}
                  />
                </div>
                {(
                  [
                    ['ilBeds', 'IL'],
                    ['alBeds', 'AL'],
                    ['mcBeds', 'MC'],
                    ['snfBeds', 'SNF'],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k}>
                    <label className="eyebrow" htmlFor={id(k)}>{label} beds</label>
                    <Controller
                      control={control}
                      name={`communities.${i}.${k}`}
                      rules={
                        k === 'alBeds'
                          ? { validate: (_v, all) => bedsOf(all.communities[i]) > 0 || 'Enter at least one bed' }
                          : undefined
                      }
                      render={({ field }) => (
                        <NumInput
                          id={id(k)}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v);
                            if (bedError) void trigger(`communities.${i}.alBeds`);
                          }}
                          onBlur={field.onBlur}
                          min={0}
                          invalid={!!bedError}
                          aria-label={`Community ${i + 1} ${label} beds`}
                        />
                      )}
                    />
                  </div>
                ))}
                <button type="button" className="btn-ghost text-teton-ui-gray justify-self-end mb-1 hidden md:block" onClick={() => remove(i)} aria-label={`Remove community ${i + 1}`} title="Remove">
                  ✕
                </button>
              </div>
              {(rowErr?.name || bedError) && (
                <p className="text-xs mt-1 md:pl-8">{[rowErr?.name?.message, bedError].filter(Boolean).join(' · ')}</p>
              )}

              {/* Row 2: state, go-live, occupancy, ROI delay, sensors */}
              <div className="md:pl-8 mt-2 grid grid-cols-2 sm:grid-cols-[4.5rem_minmax(9rem,1fr)_5rem_5rem_5rem] gap-x-2 gap-y-2 items-end">
                <div>
                  <label className="eyebrow" htmlFor={id('market')}>State</label>
                  <input id={id('market')} className="input-field" placeholder="CO" aria-label={`Community ${i + 1} market`} {...register(`communities.${i}.market`)} />
                </div>
                <div>
                  <label className="eyebrow" htmlFor={id('golive')}>Go-live date</label>
                  <input
                    id={id('golive')}
                    type="month"
                    className="input-field px-2"
                    title="Blank = month 1, or right after the pilot for non-pilot sites"
                    aria-label={`Community ${i + 1} go-live month`}
                    {...register(`communities.${i}.goLiveMonth`, { setValueAs: (v) => (v ? v : null) })}
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor={id('occ')}>% Occ</label>
                  <Controller
                    control={control}
                    name={`communities.${i}.occupancy`}
                    render={({ field }) => (
                      <NumInput id={id('occ')} value={field.value} onChange={field.onChange} nullable scale={100} suffix="%" placeholder={inputs ? String(Number((inputs.client.occupancy * 100).toFixed(4))) : ''} min={0} max={1} aria-label={`Community ${i + 1} occupancy`} />
                    )}
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor={id('delay')}>Mo delay</label>
                  <Controller
                    control={control}
                    name={`communities.${i}.roiDelayMonths`}
                    render={({ field }) => (
                      <NumInput id={id('delay')} value={field.value} onChange={field.onChange} nullable placeholder={inputs ? String(inputs.schedule.roiStartDelayMonths) : ''} min={0} aria-label={`Community ${i + 1} ROI delay`} />
                    )}
                  />
                </div>
                <div>
                  <label className="eyebrow" htmlFor={id('sensors')}>Sensors</label>
                  <Controller
                    control={control}
                    name={`communities.${i}.additionalSensors`}
                    render={({ field }) => <NumInput id={id('sensors')} value={field.value} onChange={field.onChange} min={0} aria-label={`Community ${i + 1} sensors`} />}
                  />
                </div>
              </div>

              {/* Row 3: coverage, e-call, pilot */}
              <div className="md:pl-8 mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                <div className="w-36">
                  <label className="eyebrow" htmlFor={id('coverage')}>Coverage</label>
                  <select id={id('coverage')} className="input-field" aria-label={`Community ${i + 1} coverage`} {...register(`communities.${i}.coverage`)}>
                    <option value="rooms_only">Rooms only</option>
                    <option value="full_facility">Full facility</option>
                  </select>
                </div>
                <div>
                  <span className="eyebrow">E-Call</span>
                  <label className="flex items-center gap-2 h-[38px] text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-teton-near-black" disabled={!ecallOn} aria-label={`Community ${i + 1} e-call`} {...register(`communities.${i}.ecall`)} />
                    Included
                  </label>
                </div>
                <div>
                  <span className="eyebrow">Pilot</span>
                  <label className="flex items-center gap-2 h-[38px] text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-teton-near-black" disabled={!withPilot} aria-label={`Community ${i + 1} pilot`} {...register(`communities.${i}.pilot`)} />
                    Pilot site
                  </label>
                </div>
                {isPilot && (
                  <div className="w-28">
                    <label className="eyebrow" htmlFor={id('pilotbeds')}>Pilot beds</label>
                    <Controller
                      control={control}
                      name={`communities.${i}.pilotUnits`}
                      render={({ field }) => <NumInput id={id('pilotbeds')} value={field.value} onChange={field.onChange} nullable placeholder="All" min={1} aria-label={`Community ${i + 1} pilot units`} />}
                    />
                  </div>
                )}
                <button type="button" className="btn-ghost text-teton-ui-gray ml-auto md:hidden" onClick={() => remove(i)} aria-label={`Remove community ${i + 1} (mobile)`}>
                  Remove
                </button>
              </div>

              {cf && start && (
                <p className="text-xs text-teton-dark-gray mt-2 md:pl-8">
                  {count(bedsOf(row))} beds · live month {cf.goLiveMonth}
                  {!row?.goLiveMonth ? ` (default · ${monthLabel(start, cf.goLiveMonth)})` : ''} · {cf.inPilot ? `pilot to month ${cf.firstPostPilotMonth - 1} · ` : ''}ROI from month {cf.roiStartMonth}
                </p>
              )}
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
      <p className="hint">Blank go-live = month 1, or right after the pilot for non-pilot sites. Blank occupancy and delay use the deal values. Pilot sites are shaded green.</p>
      {fields.length === 0 && <p className="text-sm text-teton-ui-gray mt-3">Add at least one community.</p>}
    </Section>
  );
}
